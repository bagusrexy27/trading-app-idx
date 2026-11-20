// Command l1 dumps the app's indicator values for a few stocks so
// research/l1_check.py can compare them with TA-Lib (Fase 6 #4, "lapis 1":
// is the math right?). Run from stock-api/:
//
//	go run ./research/l1 BBCA TLKM ADRO > research/out/l1_app.json
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"stock-api/analysis"
	"stock-api/storage"
)

type series map[string]float64 // date → value

func pts(p []analysis.Point) series {
	out := series{}
	for _, x := range p {
		out[x.Date] = x.Value
	}
	return out
}

func main() {
	out := map[string]map[string]any{}
	for _, sym := range os.Args[1:] {
		d, err := storage.Load(sym)
		if err != nil || d == nil {
			fmt.Fprintf(os.Stderr, "l1: %s: %v\n", sym, err)
			os.Exit(1)
		}
		p := d.Prices
		m := map[string]any{"prices": p}
		m["SMA20"], m["EMA20"], m["RSI14"] = pts(analysis.SMA(p, 20)), pts(analysis.EMA(p, 20)), pts(analysis.RSI(p, 14))
		m["ATR14"], m["OBV"], m["MFI14"] = pts(analysis.ATR(p, 14)), pts(analysis.OBV(p)), pts(analysis.MFI(p, 14))
		m["CMF20"], m["ADL"], m["SAR"] = pts(analysis.CMF(p, 20)), pts(analysis.ADLine(p)), pts(analysis.SAR(p))
		macd, sig, hist, up, mid, lo, k, dd, adx, pdi, mdi := series{}, series{}, series{}, series{}, series{}, series{}, series{}, series{}, series{}, series{}, series{}
		for _, x := range analysis.MACD(p, 12, 26, 9) {
			macd[x.Date], sig[x.Date], hist[x.Date] = x.MACD, x.Signal, x.Histogram
		}
		for _, x := range analysis.Bollinger(p, 20, 2) {
			up[x.Date], mid[x.Date], lo[x.Date] = x.Upper, x.Middle, x.Lower
		}
		for _, x := range analysis.Stochastic(p, 14, 3) {
			k[x.Date], dd[x.Date] = x.K, x.D
		}
		for _, x := range analysis.ADX(p, 14) {
			adx[x.Date], pdi[x.Date], mdi[x.Date] = x.ADX, x.PlusDI, x.MinusDI
		}
		m["MACD"], m["MACD_SIGNAL"], m["MACD_HIST"] = macd, sig, hist
		m["BB_UPPER"], m["BB_MIDDLE"], m["BB_LOWER"] = up, mid, lo
		m["STOCH_K"], m["STOCH_D"] = k, dd
		m["ADX14"], m["PLUS_DI"], m["MINUS_DI"] = adx, pdi, mdi
		out[sym] = m
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
