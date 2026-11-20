"""What can ML predict from local OHLCV? Walk-forward ridge (numpy only), plus the
"rawan gerak besar" forward test — the one target where a model beat ATR alone.

  python research/ml.py probe                 # walk-forward report, test years 2022..now
  python research/ml.py freeze                # freeze top-10% big-move list -> research/frozen/bigmove-<date>.json
  python research/ml.py validate <date>...    # score frozen list(s), pooled, once 20 bars have passed

Needs research/out/jkse.json (written by `go run ./research/blindtest export`). Run from stock-api/.
Big move = |close[t+20]/close[t] - 1| > 2 x vol20 x sqrt(20) (direction ignored).

Validity check 2026-11-03: measured against vol20 the lift is mostly an artifact (a calm stock has
a low threshold and just returns to its normal volatility). So validate also scores a second label,
big_lr = same move vs the stock's 250-day volatility, and the DECISION uses big_lr (rule fixed
2026-11-03, before any frozen list resolved). Historical replay: vol20 label passes ~80%, big_lr
lift per test year 1.0-2.1x.
"""
import json, sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
DATA, OUT, FROZEN = HERE.parent / 'data', HERE / 'out', HERE / 'frozen'
H = 20               # horizon of the forward test
MIN_TURNOVER = 2e9   # liquid only, same as the screener's default
PASS_LIFT = 1.5      # freeze/validate: flagged big-move rate must be >= 1.5x the rate of all stocks
FEAT = ['r1', 'r5', 'r20', 'r60', 'vol5', 'vol20', 'vol60', 'atr', 'rsi', 'ma20', 'ma50', 'ma200', 'vratio',
        'lturn', 'gap', 'range', 'hi52', 'jk_r5', 'jk_r20', 'jk_vol20', 'jk_up']


def bars(rows):
    p = pd.DataFrame(rows)
    p['date'] = pd.to_datetime(p['date'])
    return p.set_index('date').sort_index()[['open', 'high', 'low', 'close', 'volume']].astype(float)


def jkse():
    jk = bars(json.load(open(OUT / 'jkse.json')))
    lr = np.log(jk.close).diff()
    return pd.DataFrame({'jk_r5': jk.close.pct_change(5), 'jk_r20': jk.close.pct_change(20),
                         'jk_vol20': lr.rolling(20).std(),
                         'jk_up': (jk.close > jk.close.rolling(50).mean()).astype(float),
                         'jk_fwd5': jk.close.shift(-5) / jk.close - 1, 'jk_fwd20': jk.close.shift(-20) / jk.close - 1})


def features(p):
    """Point-in-time features (bars <= t) + forward outcomes (bars > t) for one stock."""
    c, lr = p.close, np.log(p.close).diff()
    tr = pd.concat([p.high - p.low, (p.high - c.shift()).abs(), (p.low - c.shift()).abs()], axis=1).max(axis=1)
    d = c.diff(); up = d.clip(lower=0).ewm(alpha=1 / 14).mean(); dn = (-d.clip(upper=0)).ewm(alpha=1 / 14).mean()
    x = pd.DataFrame(index=p.index)
    for n in (1, 5, 20, 60): x[f'r{n}'] = c.pct_change(n)
    for n in (5, 20, 60): x[f'vol{n}'] = lr.rolling(n).std()
    x['vol250'] = lr.rolling(250, min_periods=120).std()   # not a model feature; long-run yardstick for big_lr
    x['atr'] = tr.rolling(14).mean() / c
    x['rsi'] = 100 - 100 / (1 + up / dn)
    for m in (20, 50, 200): x[f'ma{m}'] = c / c.rolling(m).mean() - 1
    x['vratio'] = np.log(p.volume / p.volume.rolling(20).mean())
    x['turnover'] = (c * p.volume).rolling(20).mean()
    x['lturn'] = np.log(x.turnover)
    x['gap'] = p.open / c.shift() - 1
    x['range'] = (p.high - p.low) / c
    x['hi52'] = c / c.rolling(250).max() - 1
    x['close'] = c
    for h in (5, 20):
        x[f'fwd{h}'] = c.shift(-h) / c - 1
        x[f'fvol{h}'] = lr[::-1].rolling(h).std()[::-1].shift(-1)           # realized vol of the next h bars
        x[f'fdd{h}'] = p.low[::-1].rolling(h).min()[::-1].shift(-1) / c - 1   # worst low of the next h bars
        x[f'big{h}'] = (x[f'fwd{h}'].abs() > 2 * x.vol20 * np.sqrt(h)).astype(float).where(x[f'fwd{h}'].notna())
        x[f'big_lr{h}'] = (x[f'fwd{h}'].abs() > 2 * x.vol250 * np.sqrt(h)).astype(float).where(
            x[f'fwd{h}'].notna() & x.vol250.notna())
    return x


def panel(upto=None):
    jk = jkse()
    rows = []
    for f in sorted(DATA.glob('*.json')):
        d = json.load(open(f))
        if 'prices' not in d: continue                    # data/portfolio.json etc.
        p = bars(d['prices'])
        p = p[(p.volume > 0) & p.index.isin(jk.index)]     # drop no-trade days and today's unfinished bar
        if upto is not None: p = p[p.index <= upto]
        if len(p) < 300: continue
        x = features(p)
        x['sym'] = f.stem
        rows.append(x[x.turnover >= MIN_TURNOVER])
    df = pd.concat(rows).join(jk, how='left').replace([np.inf, -np.inf], np.nan).dropna(subset=FEAT)
    df['date'] = df.index
    return df.reset_index(drop=True)


def ridge(X, y, lam=10.0):
    mu, sd = X.mean(0), X.std(0) + 1e-12
    Z = (X - mu) / sd
    w = np.linalg.solve(Z.T @ Z + lam * np.eye(Z.shape[1]), Z.T @ (y - y.mean()))
    return lambda Xn: ((Xn - mu) / sd) @ w + y.mean(), w


def auc(score, label):
    r = pd.Series(score).rank().values; n1 = label.sum(); n0 = len(label) - n1
    return (r[label == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0) if n1 and n0 else np.nan


def daily_ic(d, pred, tgt):
    g = d.assign(_p=pred).groupby('date')
    return g.apply(lambda s: s['_p'].rank().corr(s[tgt].rank()) if len(s) >= 10 else np.nan).dropna().mean()


def top_decile(d, pred):
    return d.assign(_p=pred).groupby('date')['_p'].transform(lambda s: s.rank(pct=True)) >= 0.9


def walk(df, tgt, h, log=False):
    """Train on years < Y (purged by the horizon), test on year Y."""
    for yr in range(2022, df.date.dt.year.max() + 1):
        tr = df[df.date < pd.Timestamp(f'{yr}-01-01') - pd.Timedelta(days=int(h * 1.6))].dropna(subset=[tgt])
        te = df[df.date.dt.year == yr].dropna(subset=[tgt])
        if len(te) < 500: continue
        y = np.log(tr[tgt].values + 1e-6) if log else tr[tgt].values
        yield yr, te, ridge(tr[FEAT].values, y)[0](te[FEAT].values)


def probe():
    df = panel()
    print(f"rows={len(df):,} stocks={df.sym.nunique()} {df.date.min().date()}..{df.date.max().date()}")
    print("\nIC/AUC per test year: model | ATR14 alone   (IC 0 / AUC 0.5 = coin flip)")
    for tgt, h, kind, sign in (('fwd5', 5, 'ic', 1), ('fwd20', 20, 'ic', 1), ('fvol20', 20, 'ic', 1),
                               ('fdd20', 20, 'ic', -1), ('big5', 5, 'auc', 1), ('big20', 20, 'auc', 1)):
        m, a = [], []
        for yr, te, p in walk(df, tgt, h, log=tgt.startswith('fvol')):
            if kind == 'auc':
                y = te[tgt].values.astype(int); m.append(auc(p, y)); a.append(auc(te.atr.values, y))
            else:
                m.append(daily_ic(te, p, tgt)); a.append(daily_ic(te, sign * te.atr.values, tgt))
        print(f"  {tgt:7s} " + "  ".join(f"{x:+.2f}|{y:+.2f}" for x, y in zip(m, a))
              + f"   avg {np.mean(m):+.3f}|{np.mean(a):+.3f}")
    print(f"\nbig{H}: share of stocks that moved big: top-10% flagged vs all (pass >= {PASS_LIFT}x)")
    for yr, te, p in walk(df, f'big{H}', H):
        top = te[top_decile(te, p)]
        print(f"  {yr}: all {te[f'big{H}'].mean()*100:4.1f}%  flagged {top[f'big{H}'].mean()*100:4.1f}%"
              f"  of those up {(top[f'fwd{H}'] > 0)[top[f'big{H}'] == 1].mean()*100:3.0f}%")
    print("\nIHSG direction (time-series): hit rate vs always-guess-majority")
    jj = jkse().dropna(); jj['date'] = jj.index; jj = jj.reset_index(drop=True)
    F = ['jk_r5', 'jk_r20', 'jk_vol20', 'jk_up']
    for yr in range(2022, jj.date.dt.year.max() + 1):
        tr = jj[jj.date < pd.Timestamp(f'{yr}-01-01') - pd.Timedelta(days=32)]; te = jj[jj.date.dt.year == yr]
        if len(te) < 30: continue
        p = ridge(tr[F].values, tr.jk_fwd20.values)[0](te[F].values)
        up = (te.jk_fwd20 > 0).mean()
        print(f"  {yr}: {(np.sign(p) == np.sign(te.jk_fwd20.values)).mean()*100:3.0f}% vs {max(up, 1-up)*100:3.0f}%")


def freeze():
    df = panel()
    asof = df.date.max()
    path = FROZEN / f'bigmove-{asof.date()}.json'
    if path.exists(): sys.exit(f"{path} exists; frozen files are never overwritten")
    train = df[df.date < asof - pd.Timedelta(days=int(H * 1.6))].dropna(subset=[f'big{H}'])
    model, w = ridge(train[FEAT].values, train[f'big{H}'].values)
    now = df[df.date == asof].copy()
    now['score'] = model(now[FEAT].values)
    now = now.sort_values('score', ascending=False)
    n = max(1, round(len(now) * 0.1))
    out = {'asof': str(asof.date()), 'horizon': H, 'pass_lift': PASS_LIFT,
           'rule': f'big move = |close[t+{H}]/close[t]-1| > 2 x vol20 x sqrt({H}); PASS if flagged rate >= {PASS_LIFT}x all',
           'train_rows': len(train), 'weights': {f: round(float(v), 5) for f, v in zip(FEAT, w)},
           'flagged': now.sym.iloc[:n].tolist(),
           'stocks': [{'symbol': r.sym, 'score': round(float(r.score), 4), 'close': r.close,
                       'vol20': round(float(r.vol20), 5)} for r in now.itertuples()]}
    FROZEN.mkdir(exist_ok=True)
    path.write_text(json.dumps(out, indent=1))
    print(f"frozen {path.name}: {len(now)} stocks, flagged {n}: {', '.join(out['flagged'])}")


def validate(*asof):
    """Score one or more frozen lists, pooled. Decision label = big_lr (vs 250-day vol)."""
    df = panel()
    allrows, flags = [], []
    for d in asof:
        fz = json.load(open(FROZEN / f'bigmove-{d}.json'))
        day = df[df.date == pd.Timestamp(d)].set_index('sym')
        rows = day.loc[[s['symbol'] for s in fz['stocks'] if s['symbol'] in day.index]]
        if rows[f'big{H}'].isna().any():
            sys.exit(f"not yet: need {H} bars after {d} (newest bar {df.date.max().date()})")
        print(f"{d}:")
        for s, r in rows.loc[[s for s in fz['flagged'] if s in rows.index]].iterrows():
            print(f"  {s:5s} {r[f'fwd{H}']*100:+6.1f}%  vs vol20 ±{2*r.vol20*np.sqrt(H)*100:.1f}% {'BIG' if r[f'big{H}'] else '-  '}"
                  f"  vs vol250 ±{2*r.vol250*np.sqrt(H)*100:.1f}% {'BIG' if r[f'big_lr{H}'] else '-'}")
        allrows.append(rows); flags.append(rows.loc[[s for s in fz['flagged'] if s in rows.index]])
    rows, flagged = pd.concat(allrows), pd.concat(flags)
    for label, col, decides in (('vol20 (artifact-prone)', f'big{H}', False), ('vol250 (DECISION)', f'big_lr{H}', True)):
        r, f = rows.dropna(subset=[col]), flagged.dropna(subset=[col])
        base, hit = r[col].mean(), f[col].mean()
        lift = hit / base if base else float('inf')
        verdict = ('PASS' if lift >= PASS_LIFT else 'FAIL') if decides else 'info only'
        print(f"{label:24s} all {base*100:4.1f}% ({len(r)})  flagged {hit*100:4.1f}% ({len(f)})  lift {lift:.2f}x  -> {verdict}")
    if len(asof) < 3:
        print(f"(decision needs 3 pooled freezes; have {len(asof)})")


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'probe'
    {'probe': probe, 'freeze': freeze, 'validate': lambda: validate(*sys.argv[2:])}[cmd]()
