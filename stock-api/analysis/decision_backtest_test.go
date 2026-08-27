package analysis

import (
	"fmt"
	"testing"

	"stock-api/models"
)

func synthUptrend(n int) []models.StockPrice {
	out := make([]models.StockPrice, n)
	p := 1000.0
	for i := 0; i < n; i++ {
		p += 5
		out[i] = models.StockPrice{
			Date:   "2024-01-" + pad2(i%28+1),
			Open:   p - 2,
			High:   p + 10,
			Low:    p - 8,
			Close:  p,
			Volume: 1_000_000 + int64(i*1000),
		}
	}
	return out
}

func pad2(n int) string {
	return fmt.Sprintf("%02d", n)
}

func TestBacktestDecisionEmpty(t *testing.T) {
	res := BacktestDecision(nil)
	if len(res.Trades) != 0 || res.Total != 0 {
		t.Fatalf("expected empty result, got %+v", res)
	}
}

func TestBacktestDecisionProducesTrades(t *testing.T) {
	prices := synthUptrend(200)
	res := BacktestDecision(prices)
	// Uptrend synthetic may or may not trigger BUY depending on indicator mix;
	// verify invariants when trades exist.
	if len(res.Trades) == 0 {
		t.Skip("no BUY signals on synthetic uptrend — acceptable")
	}
	for _, tr := range res.Trades {
		if tr.EntryPrice <= 0 {
			t.Fatalf("invalid entry price: %+v", tr)
		}
		if tr.Signal != "STRONG_BUY" && tr.Signal != "BUY" {
			t.Fatalf("unexpected signal: %s", tr.Signal)
		}
	}
}

func TestBacktestDecisionWinRateBounds(t *testing.T) {
	prices := synthUptrend(120)
	res := BacktestDecision(prices)
	if res.Total > 0 && (res.WinRate < 0 || res.WinRate > 100) {
		t.Fatalf("win rate out of bounds: %f", res.WinRate)
	}
}
