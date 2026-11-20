package main

import (
	"math/rand"
	"testing"
)

// 12 signals on one day but only 10 slots: 10 trades taken, each 1/10 of
// equity at +10% → equity 1.10; nothing open longer than its trade.
func TestSimulateRespectsSlots(t *testing.T) {
	var tr []ptrade
	for k := 0; k < 12; k++ {
		tr = append(tr, ptrade{"2024-01-02", "2025-01-02", 10})
	}
	p := simulate(tr, rand.New(rand.NewSource(1)))
	if p.Trades != slots {
		t.Fatalf("trades = %d, want %d (slots)", p.Trades, slots)
	}
	if p.CAGR < 9.9 || p.CAGR > 10.1 { // +10% over one year
		t.Fatalf("CAGR = %v, want ~10", p.CAGR)
	}
	if p.WinRate != 100 || p.MaxDD != 0 {
		t.Fatalf("win rate %v, max DD %v", p.WinRate, p.MaxDD)
	}
}

func TestStableNeedsSameSignAndHalfTheEffect(t *testing.T) {
	if s := stable(1.0, []ParamCell{{Excess: 0.8, N: 10}, {Excess: 0.6, N: 10}}); s == nil || !*s {
		t.Fatal("neighbours 0.8 and 0.6 of 1.0 are stable")
	}
	if s := stable(1.0, []ParamCell{{Excess: 0.8, N: 10}, {Excess: 0.3, N: 10}}); s == nil || *s {
		t.Fatal("a neighbour below half the effect is not stable")
	}
	if s := stable(1.0, nil); s != nil {
		t.Fatal("no neighbours = not tested")
	}
}
