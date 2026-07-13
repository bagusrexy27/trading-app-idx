package analysis

import (
	"testing"

	"stock-api/models"
)

func fvgBar(date string, o, h, l, c float64) models.StockPrice {
	return models.StockPrice{Date: date, Open: o, High: h, Low: l, Close: c, Volume: 1000}
}

// Base 3 candles forming a bullish FVG: low of bar 3 (110) > high of bar 1 (105).
// Zone: Bottom=105, Top=110, Date = middle candle "2024-01-02".
func fvgBullBase() []models.StockPrice {
	return []models.StockPrice{
		fvgBar("2024-01-01", 100, 105, 98, 104),
		fvgBar("2024-01-02", 106, 112, 105, 111),
		fvgBar("2024-01-03", 113, 118, 110, 117),
	}
}

func TestFVGSynthetic(t *testing.T) {
	tests := []struct {
		name       string
		prices     []models.StockPrice
		minGapPct  float64
		wantCount  int
		wantType   string
		wantStatus string
		wantTop    float64
		wantBottom float64
	}{
		{
			name:       "bullish FVG detected, active",
			prices:     fvgBullBase(),
			minGapPct:  0.3,
			wantCount:  1,
			wantType:   "bull",
			wantStatus: "active",
			wantTop:    110,
			wantBottom: 105,
		},
		{
			name: "bullish FVG inverted after close below bottom",
			prices: append(fvgBullBase(),
				fvgBar("2024-01-04", 112, 113, 106, 108), // pulls back, holds above bottom
				fvgBar("2024-01-05", 107, 111, 99, 100),  // closes below 105 → inverted
				fvgBar("2024-01-06", 100, 107, 97, 102),  // stays below top → still inverted
			),
			minGapPct:  0.3,
			wantCount:  1,
			wantType:   "bull",
			wantStatus: "inverted",
			wantTop:    110,
			wantBottom: 105,
		},
		{
			name: "bullish FVG filled by wick without close-through",
			prices: append(fvgBullBase(),
				fvgBar("2024-01-04", 112, 113, 104, 107), // low 104 <= 105, close 107 >= 105 → filled
			),
			minGapPct:  0.3,
			wantCount:  1,
			wantType:   "bull",
			wantStatus: "filled",
			wantTop:    110,
			wantBottom: 105,
		},
		{
			name: "inverted zone spent by close back above top",
			prices: append(fvgBullBase(),
				fvgBar("2024-01-04", 107, 108, 99, 100),  // close < 105 → inverted
				fvgBar("2024-01-05", 101, 115, 100, 114), // closes back above 110 → filled (spent)
			),
			minGapPct:  0.3,
			wantCount:  1,
			wantType:   "bull",
			wantStatus: "filled",
			wantTop:    110,
			wantBottom: 105,
		},
		{
			name: "bearish FVG detected, active",
			prices: []models.StockPrice{
				fvgBar("2024-01-01", 118, 120, 110, 112),
				fvgBar("2024-01-02", 110, 111, 103, 104),
				fvgBar("2024-01-03", 103, 105, 98, 100), // high 105 < low[0] 110 → bear zone 105–110
			},
			minGapPct:  0.3,
			wantCount:  1,
			wantType:   "bear",
			wantStatus: "active",
			wantTop:    110,
			wantBottom: 105,
		},
		{
			name: "gap below minGapPct is filtered out",
			prices: []models.StockPrice{
				fvgBar("2024-01-01", 100, 105, 98, 104),
				fvgBar("2024-01-02", 105, 106, 104, 105.5),
				fvgBar("2024-01-03", 105.5, 107, 105.2, 106), // gap 105→105.2 = ~0.19% of close 105.5
			},
			minGapPct: 0.3,
			wantCount: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			zones := FVG(tc.prices, 0, tc.minGapPct)
			if len(zones) != tc.wantCount {
				t.Fatalf("got %d zones, want %d: %+v", len(zones), tc.wantCount, zones)
			}
			if tc.wantCount == 0 {
				return
			}
			z := zones[0]
			if z.Type != tc.wantType {
				t.Errorf("type = %q, want %q", z.Type, tc.wantType)
			}
			if z.Status != tc.wantStatus {
				t.Errorf("status = %q, want %q", z.Status, tc.wantStatus)
			}
			if z.Top != tc.wantTop || z.Bottom != tc.wantBottom {
				t.Errorf("zone = [%v, %v], want [%v, %v]", z.Bottom, z.Top, tc.wantBottom, tc.wantTop)
			}
			if z.Date != "2024-01-02" {
				t.Errorf("date = %q, want middle candle 2024-01-02", z.Date)
			}
			if z.Status == "inverted" && z.InvertedDate == "" {
				t.Errorf("inverted zone missing inverted_date")
			}
		})
	}
}

// TestFVGRealData smoke-tests FVG over real BBCA data: every zone must have
// Top > Bottom and a valid status.
func TestFVGRealData(t *testing.T) {
	prices := loadFixture(t, "BBCA")
	valid := map[string]bool{"active": true, "inverted": true, "filled": true}
	zones := FVG(prices, 0, 0.3)
	t.Logf("BBCA: %d bars → %d FVG zones", len(prices), len(zones))
	for _, z := range zones {
		if z.Top <= z.Bottom {
			t.Errorf("zone %d (%s): Top %.2f <= Bottom %.2f", z.ID, z.Date, z.Top, z.Bottom)
		}
		if !valid[z.Status] {
			t.Errorf("zone %d: invalid status %q", z.ID, z.Status)
		}
		if z.Type != "bull" && z.Type != "bear" {
			t.Errorf("zone %d: invalid type %q", z.ID, z.Type)
		}
		if z.Status == "inverted" && z.InvertedDate == "" {
			t.Errorf("zone %d: inverted without inverted_date", z.ID)
		}
	}
}
