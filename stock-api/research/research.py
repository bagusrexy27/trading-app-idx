"""Pattern research on research/out/panel.pkl (build it with panel.py).

    python research/research.py [ic|factors|buckets|filters|revert|exits|rules|grid|pantulan|all]

Splits: TRAIN 2020–2023 (look for patterns) / VALID 2024–Nov 2025 (check) /
TEST Dec 2025+ (final exam). A pattern only counts if it holds in all three —
pick parameters on TRAIN only, then read VALID/TEST.

Returns: entry next open -> close h bars later, %. 'net' subtracts 0.4% fees.
Averages clip returns to [-40, 60] (corporate actions / gorengan outliers);
medians and win rates are unclipped. Universe = stocks tracked today, so
delisted names are missing (survivorship bias — rebound rules look a bit too good).

Findings (2026-11-02): score rank IC ≈ 0.00–0.02 in every split (negative when
IHSG < MA50); BUY in IHSG < MA50 wins 25–43%; the engine plan (TP1/stop) wins
52–56% yet averages −0.3…−1.1% net; "pantulan" (RSI<35, IHSG ≥10% under its
52w peak, turnover ≥20 M, hold 60 bars) wins 54–64% out-of-sample but failed
as a cluster in 2024 (0%). Rules that won 84–88% on TRAIN dropped to 54–64%
out-of-sample — overfitting, not edge.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

pd.set_option('display.width', 250)
OUT = Path(__file__).resolve().parent / 'out'
P = pd.read_pickle(OUT / 'panel.pkl')
P = P[P.to20 >= 2].copy()  # same liquidity floor as the app (Rp2 M/day)
FEE = 0.4
SPLITS = ['TRAIN', 'VALID', 'TEST']
B = P.score >= 60
UP, DOWN = P.ihsg_up == 1, P.ihsg_up == 0


def stats(df, h):
    x = df[f'f{h}'].dropna()
    if len(x) < 20:
        return {'n': len(x)}
    net = x - FEE
    ex = x - df.loc[x.index, f'i{h}'] if f'i{h}' in df else pd.Series(dtype=float)
    return {'n': len(x), 'months': df.loc[x.index, 'date'].str[:7].nunique(), 'avg': net.clip(-40, 60).mean(),
            'med': net.median(), 'win%': (net > 0).mean() * 100, 'beat_ihsg%': (ex > 0).mean() * 100 if len(ex) else np.nan}


def table(groups, h):
    """groups: name -> mask. Rows = groups, columns = metric × split."""
    rows = []
    for name, m in groups.items():
        for sp in SPLITS:
            s = stats(P[m & (P.split == sp)], h)
            s.update(grp=name, split=sp)
            rows.append(s)
    t = pd.DataFrame(rows).pivot(index='grp', columns='split')
    cols = [c for c in ['n', 'avg', 'med', 'win%', 'beat_ihsg%'] if c in t.columns.get_level_values(0)]
    print(t.reindex(columns=pd.MultiIndex.from_product([cols, SPLITS])).reindex(list(groups)).round(2).to_string())


def by_year(name, m, h):
    rows = []
    for y in sorted(P.year.unique()):
        s = stats(P[m & (P.year == y)], h)
        s['year'] = y
        rows.append(s)
    print(f'--- {name} | tahan {h} hari, per tahun ---')
    print(pd.DataFrame(rows).set_index('year').round(2).to_string())


def rank_ic(x, y, df):
    f = lambda g: np.nan if len(g) < 15 else g[x].rank().corr(g[y].rank())
    return df.groupby('date')[[x, y]].apply(f).dropna()


sec = sys.argv[1] if len(sys.argv) > 1 else 'all'

if sec in ('ic', 'all'):
    print('=== Rank IC skor vs return (korelasi peringkat antar saham per hari, dirata-rata) ===')
    for sp in SPLITS:
        d = P[P.split == sp]
        print(f'{sp:6}' + ''.join(f' | +{h}d {rank_ic("score", f"f{h}", d).mean():+.3f}' for h in (5, 10, 20, 40, 60)))
    for reg, m in (('up', UP), ('down', DOWN)):
        print(f'{reg:6}' + ''.join(f' | +{h}d {rank_ic("score", f"f{h}", P[m]).mean():+.3f}' for h in (5, 10, 20, 40)))

if sec in ('factors', 'all'):
    print('\n=== IC per faktor engine & fitur (+10d / +20d) ===')
    feats = [c for c in P.columns if c.startswith('c_')] + ['rsi', 'dist20', 'dist50', 'ret20p', 'ret60p', 'hi52', 'atrpct', 'volr']
    rows = []
    for c in feats:
        r = {'feature': c}
        for sp in SPLITS:
            d = P[P.split == sp]
            if d[c].notna().sum() >= 1000 and d[c].nunique() >= 3:
                r[f'{sp}_10'], r[f'{sp}_20'] = rank_ic(c, 'f10', d).mean(), rank_ic(c, 'f20', d).mean()
        rows.append(r)
    print(pd.DataFrame(rows).set_index('feature').round(3).to_string())

if sec in ('buckets', 'all'):
    print('\n=== Skor bucket -> return 20 hari ===')
    table({f'{lo}-{lo + 9}': (P.score >= lo) & (P.score < lo + 10) for lo in range(20, 90, 10)}, 20)

if sec in ('filters', 'all'):
    print('\n=== BUY (skor>=60) dipecah per kondisi ===')
    table({'IHSG>=MA50': B & UP, 'IHSG<MA50': B & DOWN}, 20)
    table({'RSI<50': B & (P.rsi < 50), 'RSI 50-70': B & P.rsi.between(50, 70), 'RSI>70': B & (P.rsi > 70), 'RSI>80': B & (P.rsi > 80)}, 10)
    table({'rec>0': B & (P.rec > 0), 'rec<=0': B & (P.rec <= 0)}, 20)
    table({'to 2-10': B & P.to20.between(2, 10), 'to 10-50': B & P.to20.between(10, 50), 'to 50-200': B & P.to20.between(50, 200),
           'to >200': B & (P.to20 > 200)}, 20)

if sec in ('revert', 'all'):
    print('\n=== Saham jenuh jual -> +40 hari ===')
    table({'semua saham': P.score > 0, 'skor<40 & RSI<30': (P.score < 40) & (P.rsi < 30),
           'RSI<30 & IHSG up': (P.rsi < 30) & UP, 'RSI<30 & IHSG down': (P.rsi < 30) & DOWN}, 40)

if sec in ('exits', 'all'):
    print('\n=== BUY: cara keluar ===')
    for col, name in (('plan_pnl', 'rencana engine (TP1/stop, 20h)'), ('br_pnl', 'ATR stop1.5/target3 (20h)')):
        print(f'--- {name} ---')
        P['_x'] = P[col]
        rows = []
        for sp in SPLITS:
            x = P.loc[B & (P.split == sp), '_x'].dropna() - FEE
            rows.append({'split': sp, 'n': len(x), 'avg': x.clip(-40, 60).mean(), 'med': x.median(), 'win%': (x > 0).mean() * 100})
        print(pd.DataFrame(rows).set_index('split').round(2).to_string())
    for h in (5, 10, 20):
        print(f'--- tahan {h} hari ---')
        table({'BUY': B, 'BUY & IHSG up': B & UP}, h)

if sec in ('rules', 'all'):
    print('\n=== Aturan kandidat ===')
    table({'R1 BUY & IHSG up': B & UP, 'R2 BUY & IHSG up & RSI>70': B & UP & (P.rsi > 70)}, 20)
    by_year('R2 momentum', B & UP & (P.rsi > 70), 20)
    table({'R3 RSI<30 & IHSG down': (P.rsi < 30) & DOWN}, 40)
    by_year('R3 pantulan sederhana', (P.rsi < 30) & DOWN, 40)

if sec in ('grid', 'all'):
    print('\n=== Grid pantulan — 12 terbaik menurut TRAIN, lalu lihat VALID/TEST ===')
    conds = {'any': P.score > 0, 'IHSG<MA50': DOWN, 'IHSG d50<-3': P.ihsg_d50 < -3, 'IHSG d50<-5': P.ihsg_d50 < -5,
             'IHSG RSI<35': P.ihsg_rsi < 35, 'IHSG dd<-10': P.ihsg_dd < -10}
    liq = {'to>=2': P.to20 >= 2, 'to>=20': P.to20 >= 20, 'to>=100': P.to20 >= 100}
    rows = []
    for rsi in (20, 25, 30, 35):
        for cn, cm in conds.items():
            for ln, lm in liq.items():
                for h in (20, 40, 60):
                    m = (P.rsi < rsi) & cm & lm
                    for sp in SPLITS:
                        r = stats(P[m & (P.split == sp)], h)
                        r.update(rsi=rsi, ihsg=cn, liq=ln, h=h, split=sp)
                        rows.append(r)
    G = pd.DataFrame(rows)
    keys = ['rsi', 'ihsg', 'liq', 'h']
    T = G[(G.split == 'TRAIN') & (G.n >= 200)].dropna(subset=['win%'])
    top = T.sort_values(['win%', 'med'], ascending=False).head(12)[keys]
    out = top.merge(G, on=keys).pivot_table(index=keys, columns='split', values=['n', 'win%', 'med', 'beat_ihsg%'])
    print(out.reindex(columns=pd.MultiIndex.from_product([['n', 'win%', 'med', 'beat_ihsg%'], SPLITS])).round(1).to_string())

if sec in ('pantulan', 'all'):
    R = (P.rsi < 35) & (P.ihsg_dd < -10) & (P.to20 >= 20)
    print('\n=== PANTULAN: RSI<35 & IHSG >=10% di bawah puncak 52w & turnover >=20 M ===')
    table({'tahan 40': R}, 40)
    table({'tahan 60': R}, 60)
    by_year('PANTULAN', R, 60)
    last = P.date.max()
    cur = P[P.date == last]
    print(f'\nterakhir {last}: IHSG dd {cur.ihsg_dd.iloc[0]:.1f}% · vs MA50 {cur.ihsg_d50.iloc[0]:+.1f}% · RSI {cur.ihsg_rsi.iloc[0]:.1f}'
          f' → aturan {"AKTIF" if cur.ihsg_dd.iloc[0] < -10 else "tidak aktif"}')
    print(cur[(cur.rsi < 35) & (cur.to20 >= 20)].sort_values('rsi')[['sym', 'close', 'rsi', 'score', 'signal', 'to20', 'hi52']].round(1).to_string(index=False))
