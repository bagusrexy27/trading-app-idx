package analysis

import (
	"fmt"
	"testing"
	"time"

	"stock-api/models"
)

// dailyCloses: n weekdays ending 2026-10-21, close = f(i).
func dailyCloses(n int, f func(i int) float64) []models.StockPrice {
	out := make([]models.StockPrice, 0, n)
	d := time.Date(2026, 10, 21, 0, 0, 0, 0, time.UTC)
	for len(out) < n {
		if d.Weekday() != time.Saturday && d.Weekday() != time.Sunday {
			out = append(out, models.StockPrice{Date: d.Format("2006-01-02")})
		}
		d = d.AddDate(0, 0, -1)
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	for i := range out {
		out[i].Close = f(i)
		out[i].Open, out[i].High, out[i].Low = out[i].Close, out[i].Close, out[i].Close
	}
	return out
}

func goodInput() ValuationInput {
	prices := dailyCloses(800, func(i int) float64 { return 1000 + float64(i%40)*10 }) // 1000–1390
	var ni, eq []FinPoint
	for y := 2022; y <= 2025; y++ {
		d := fmt.Sprintf("%d-12-31", y)
		eq = append(eq, FinPoint{d, 1e12})
		ni = append(ni, FinPoint{d, 2e11}) // ROE 20%
	}
	return ValuationInput{
		Prices: prices, Equity: eq, AnnualEquity: eq, NetIncome: ni,
		Shares:     []FinPoint{{"2022-12-31", 2e9}},                     // BVPS 500 for every period
		Dividends:  []FinPoint{{"2026-05-01", 70}, {"2024-05-01", 999}}, // only the last 12m counts
		FirstTrade: "2003-11-10",
	}
}

func TestBuildBandAndEvaluate(t *testing.T) {
	b, ok := BuildBand(goodInput())
	if !ok {
		t.Fatal("band not built")
	}
	if b.BVPS != 500 || b.Div12m != 70 || b.AvgROE != 20 || !b.AllProfit || b.ROEYears != 4 {
		t.Fatalf("band: %+v", b)
	}
	// PBV ranges 2.0–2.78, mean ≈ 2.39
	if b.Mean < 2.3 || b.Mean > 2.5 || b.SD <= 0 {
		t.Fatalf("mean/sd: %+v", b)
	}

	cheap := b.Evaluate(b.BVPS*(b.Mean-1.5*b.SD), "2026-10-21")
	if cheap.Zone != "murah" || !cheap.Quality || !cheap.Undervalue {
		t.Errorf("cheap: zone=%s quality=%v under=%v checks=%+v", cheap.Zone, cheap.Quality, cheap.Undervalue, cheap.Checks)
	}
	if sc, _, ok := scoreValuation(cheap); !ok || sc != 75 {
		t.Errorf("cheap score %d %v", sc, ok)
	}
	rich := b.Evaluate(b.BVPS*(b.Mean+2.5*b.SD), "2026-10-21")
	if rich.Undervalue || rich.Zone != "sangat mahal" {
		t.Errorf("rich: %+v", rich)
	}
}

func TestQualityScreenMustPassAll(t *testing.T) {
	in := goodInput()
	in.NetIncome[1].Value = -1 // one losing year
	b, _ := BuildBand(in)
	v := b.Evaluate(b.BVPS*(b.Mean-2*b.SD), "2026-10-21")
	if v.Quality || v.Undervalue {
		t.Error("a loss year must fail the screen")
	}
	if _, _, ok := scoreValuation(v); ok {
		t.Error("failed quality must leave the factor out")
	}

	in = goodInput()
	in.FirstTrade = "2020-01-02" // listed < 10 years
	b, _ = BuildBand(in)
	if b.Evaluate(b.BVPS*b.Mean*0.5, "2026-10-21").Undervalue {
		t.Error("young listing must fail the screen")
	}
}

func TestBuildBandNeedsHistory(t *testing.T) {
	in := goodInput()
	in.Prices = in.Prices[len(in.Prices)-100:]
	if _, ok := BuildBand(in); ok {
		t.Error("100 days must not build a 3-year band")
	}
	in = goodInput()
	in.Equity = nil
	if _, ok := BuildBand(in); ok {
		t.Error("no book value must not build a band")
	}
}

func TestDecisionValuationFactor(t *testing.T) {
	prices := synthUptrend(200)
	base := DecisionEngine(prices)
	b, _ := BuildBand(goodInput())

	if d := DecisionEngineFull(prices, nil, nil); d.Score != base.Score || len(d.Components) != len(base.Components) {
		t.Error("nil valuation must equal the plain engine")
	}
	cheap := DecisionEngineFull(prices, nil, b.Evaluate(b.BVPS*(b.Mean-2.5*b.SD), "2026-10-21"))
	sum := 0
	for _, c := range cheap.Components {
		sum += c.Weight
	}
	if sum != 100 {
		t.Errorf("weights sum to %d", sum)
	}
	last := cheap.Components[len(cheap.Components)-1]
	if last.Name != "Valuasi" || last.Weight != ValuationWeight || last.Score != 90 || cheap.Valuation == nil {
		t.Errorf("valuation component: %+v", last)
	}
}

func TestBuildBandConvertsReportCurrency(t *testing.T) {
	idr, _ := BuildBand(goodInput())
	in := goodInput()
	in.Equity = []FinPoint{{"2022-12-31", 1e12 / 16000}} // same book value, in USD
	in.FX = dailyCloses(800, func(int) float64 { return 16000 })
	usd, ok := BuildBand(in)
	if !ok || usd.BVPS != idr.BVPS || usd.Mean != idr.Mean {
		t.Errorf("usd band %+v vs idr %+v", usd, idr)
	}
}
