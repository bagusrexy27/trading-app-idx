"""Build the research panel: one row per (symbol, date) with the engine's output,
point-in-time features (bars <= date only) and forward outcomes (bars > date).

Needs research/out/export.csv + research/out/jkse.json from
`go run ./research/blindtest export` (run from stock-api/). Requires pandas + numpy.
Writes research/out/panel.pkl for research.py.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
DATA, OUT = HERE.parent / 'data', HERE / 'out'
TRAIN_END, VALID_END = '2024-01-01', '2025-11-28'  # TRAIN < 2024 <= VALID <= 2025-11-28 < TEST


def rsi14(c):
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def plan(o, h, l, c, i, stop, tp, horizon=20):
    """Same rules as analysis.planOutcome: enter next open, LOSS on stop (gap ->
    open, same-bar touch = LOSS), WIN at tp, TIMEOUT at close of i+horizon."""
    n = len(c)
    if i + 1 >= n:
        return None, np.nan
    e = o[i + 1] if o[i + 1] > 0 else c[i + 1]
    if not (e > 0 and stop > 0 and tp > e and stop < e):
        return 'INVALID', np.nan
    end = i + horizon
    for j in range(i + 1, end + 1):
        if j >= n:
            return None, np.nan
        if l[j] <= stop:
            return 'LOSS', ((o[j] if o[j] < stop else stop) / e - 1) * 100
        if h[j] >= tp:
            return 'WIN', (tp / e - 1) * 100
    return 'TIMEOUT', (c[end] / e - 1) * 100


# ── IHSG: regime, its own forward returns, RSI and drawdown from the 52w peak ──
jk = pd.DataFrame(json.load(open(OUT / 'jkse.json')))
jk['sma50'] = jk.close.rolling(50).mean()
jk['ihsg_up'] = (jk.close >= jk.sma50).astype(float).where(jk.sma50.notna())
jk['ihsg_d50'] = (jk.close / jk.sma50 - 1) * 100
jk['ihsg_rsi'] = rsi14(jk.close)
jk['ihsg_dd'] = (jk.close / jk.close.rolling(250, min_periods=60).max() - 1) * 100
ient = jk.open.shift(-1).where(jk.open.shift(-1) > 0, jk.close.shift(-1))
for H in (10, 20, 40, 60):
    jk[f'i{H}'] = (jk.close.shift(-H) / ient - 1) * 100
jk['dt'] = pd.to_datetime(jk.date)
jk = jk.drop(columns=['date', 'open', 'high', 'low', 'close', 'volume', 'sma50'])

ex = pd.read_csv(OUT / 'export.csv')
frames = []
for sym, g in ex.groupby('sym'):
    p = pd.DataFrame(json.load(open(DATA / f'{sym}.json'))['prices'])
    c, h, l, o, v = (p[k].astype(float) for k in ('close', 'high', 'low', 'open', 'volume'))
    e20, e50, e200 = (c.ewm(span=n, adjust=False).mean() for n in (20, 50, 200))
    pc = c.shift(1)
    atr = pd.concat([h - l, (h - pc).abs(), (l - pc).abs()], axis=1).max(axis=1).ewm(alpha=1 / 14, adjust=False).mean()
    f = pd.DataFrame({
        'date': p.date, 'close': c,
        'atrpct': atr / c * 100, 'dist20': (c - e20) / atr, 'dist50': (c / e50 - 1) * 100,
        'dist200': (c / e200 - 1) * 100, 'rsi': rsi14(c),
        'ret5p': c.pct_change(5) * 100, 'ret20p': c.pct_change(20) * 100, 'ret60p': c.pct_change(60) * 100,
        'hi52': (c / h.rolling(250, min_periods=60).max() - 1) * 100,
        'to20': (c * v).rolling(20).mean() / 1e9, 'volr': v / v.rolling(20).mean(),
    })
    entry = o.shift(-1).where(o.shift(-1) > 0, c.shift(-1))
    for H in (5, 10, 20, 40, 60):
        f[f'f{H}'] = (c.shift(-H) / entry - 1) * 100
    f = f.merge(g, on='date', how='inner')
    pos = {dt: k for k, dt in enumerate(p.date)}
    O, Hh, L, C, A = o.values, h.values, l.values, c.values, atr.values
    res, pnl, b_res, b_pnl = [], [], [], []
    for dt, st, tp in zip(f.date, f.stop, f.tp1):
        i = pos[dt]
        r, x = plan(O, Hh, L, C, i, st, tp)  # the engine's own plan
        r2, x2 = plan(O, Hh, L, C, i, C[i] - 1.5 * A[i], C[i] + 3 * A[i])  # ATR bracket for comparison
        res.append(r); pnl.append(x); b_res.append(r2); b_pnl.append(x2)
    f['plan'], f['plan_pnl'], f['br'], f['br_pnl'] = res, pnl, b_res, b_pnl
    # point-in-time stock record: mean plan P&L of past score>=60 days whose plan
    # had fully resolved (lag 21 bars), at least 10 cases
    buy_pnl = f.plan_pnl.where((f.score >= 60) & f.plan.isin(['WIN', 'LOSS', 'TIMEOUT']))
    cs, cn = buy_pnl.fillna(0).cumsum().shift(21), buy_pnl.notna().cumsum().shift(21)
    f['rec'] = (cs / cn).where(cn >= 10)
    frames.append(f)

P = pd.concat(frames, ignore_index=True)
P['dt'] = pd.to_datetime(P.date)
P = pd.merge_asof(P.sort_values('dt'), jk.sort_values('dt'), on='dt', direction='backward')
P['breadth'] = P.groupby('date').score.transform(lambda s: (s >= 60).mean() * 100)
P['split'] = np.where(P.date < TRAIN_END, 'TRAIN', np.where(P.date <= VALID_END, 'VALID', 'TEST'))
P['year'] = P.date.str[:4]
P.to_pickle(OUT / 'panel.pkl')
print(P.shape, P.date.min(), P.date.max())
print(P.split.value_counts().to_string())
