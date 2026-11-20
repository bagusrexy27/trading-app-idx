"""Lapis 1 — is the app's indicator math right? Compares research/l1 output with
TA-Lib on the same bars. Run from stock-api/ (needs `pip install ta-lib numpy pandas`):

    go run ./research/l1 BBCA TLKM ADRO > research/out/l1_app.json
    python research/l1_check.py research/out/l1_app.json

Reports, per indicator, the largest absolute difference after a warm-up of
WARMUP bars (EMA-type seeds differ at the start; both converge). Cumulative
series (OBV, A/D) are compared by their day-to-day changes, since their
starting constant is arbitrary. The app rounds what it serves to 2 decimals
(CMF to 4), so PASS = every bar within that rounding plus float slack:
|diff| <= 0.0051 — doubled (0.0101) for OBV/A/D, whose day-to-day change is
the difference of two rounded values.

2026-11-20: all 20 series × BBCA/TLKM/ADRO PASS after fixing the Parabolic
SAR flip-day clamp (1–2 of 1,510 bars were off by one tick before).
"""
import json, sys
import numpy as np, pandas as pd, talib

WARMUP = 150
TOL = 0.0051  # app rounding to 2 decimals (+ float slack)

app = json.load(open(sys.argv[1], encoding='utf-8'))


def ref(p):
    o, h, l, c, v = (p[x].astype(float).values for x in ('open', 'high', 'low', 'close', 'volume'))
    macd, sig, hist = talib.MACD(c, 12, 26, 9)
    up, mid, lo = talib.BBANDS(c, 20, 2, 2, 0)
    k, d = talib.STOCHF(h, l, c, 14, 3, 0)
    tp = (h + l + c) / 3
    mfm = np.where(h > l, ((c - l) - (h - c)) / np.where(h > l, h - l, 1), 0)
    cmf = pd.Series(mfm * v).rolling(20).sum() / pd.Series(v).rolling(20).sum()
    return {
        'SMA20': talib.SMA(c, 20), 'EMA20': talib.EMA(c, 20), 'RSI14': talib.RSI(c, 14), 'ATR14': talib.ATR(h, l, c, 14),
        'MACD': macd, 'MACD_SIGNAL': sig, 'MACD_HIST': hist, 'BB_UPPER': up, 'BB_MIDDLE': mid, 'BB_LOWER': lo,
        'STOCH_K': k, 'STOCH_D': d, 'ADX14': talib.ADX(h, l, c, 14), 'PLUS_DI': talib.PLUS_DI(h, l, c, 14),
        'MINUS_DI': talib.MINUS_DI(h, l, c, 14), 'MFI14': talib.MFI(h, l, c, v, 14), 'SAR': talib.SAR(h, l, 0.02, 0.2),
        'OBV': talib.OBV(c, v), 'ADL': talib.AD(h, l, c, v), 'CMF20': cmf.values,
    }


rows = []
for sym, m in app.items():
    p = pd.DataFrame(m['prices'])
    R = ref(p)
    for name, r in R.items():
        a = pd.Series(m[name]).reindex(p.date).values.astype(float)
        r = np.asarray(r, float)
        if name in ('OBV', 'ADL'):  # arbitrary starting constant → compare changes
            a, r = np.diff(a, prepend=np.nan), np.diff(r, prepend=np.nan)
        ok = ~np.isnan(a) & ~np.isnan(r)
        ok[:WARMUP] = False
        if not ok.any():
            rows.append((sym, name, np.nan, 0, 'NO DATA'))
            continue
        diff = np.abs(a[ok] - r[ok])
        worst = int(np.argmax(diff))
        tol = 2 * TOL if name in ('OBV', 'ADL') else TOL
        rows.append((sym, name, diff.max(), ok.sum(), 'PASS' if diff.max() <= tol else f'FAIL @ {p.date.values[ok][worst]}'))

out = pd.DataFrame(rows, columns=['saham', 'indikator', 'selisih_maks', 'bar', 'hasil'])
pd.set_option('display.width', 160)
print(out.pivot(index='indikator', columns='saham', values='selisih_maks').map(lambda x: f'{x:.2e}').to_string())
print()
bad = out[out.hasil != 'PASS']
print(bad.to_string(index=False) if len(bad) else f'semua PASS ({len(out)} seri)')
