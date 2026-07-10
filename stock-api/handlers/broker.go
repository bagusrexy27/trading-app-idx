package handlers

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"stock-api/analysis"
	"stock-api/models"
	"stock-api/storage"
)

const brokerDir = "./data/broker"

// BrokerHandler groups all /api/broker/* endpoints.
type BrokerHandler struct{ mu sync.RWMutex }

func NewBroker() *BrokerHandler { return &BrokerHandler{} }

func brokerPath(symbol string) string {
	return filepath.Join(brokerDir, symbol+".json")
}

// ── Storage IO ───────────────────────────────────────────────────────────────

func (h *BrokerHandler) load(symbol string) (*analysis.BrokerData, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	b, err := os.ReadFile(brokerPath(symbol))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var d analysis.BrokerData
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, err
	}
	return &d, nil
}

func (h *BrokerHandler) save(data *analysis.BrokerData) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := os.MkdirAll(brokerDir, 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(brokerPath(data.Symbol), b, 0644)
}

// ── GET /api/broker/{symbol} ─────────────────────────────────────────────────
// Returns full broker daily history.

func (h *BrokerHandler) Get(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	data, err := h.load(symbol)
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if data == nil {
		respond(w, 404, false,
			fmt.Sprintf("broker data untuk %s belum ada — generate dulu via POST /api/broker/%s/mock", symbol, symbol),
			nil)
		return
	}
	respond(w, 200, true, "", data)
}

// ── GET /api/broker/{symbol}/summary?lookback=20&top=5 ───────────────────────
// Returns aggregated metrics for the bandar viewer.

func (h *BrokerHandler) Summary(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	data, err := h.load(symbol)
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if data == nil {
		respond(w, 404, false, fmt.Sprintf("broker data untuk %s belum ada", symbol), nil)
		return
	}

	lookback := intParam(r, "lookback", 20)
	top := intParam(r, "top", 5)

	agg := analysis.AggregateBrokers(data.Days, lookback)
	accum := analysis.TopAccumulators(agg, top)
	distr := analysis.TopDistributors(agg, top)
	flow := analysis.FlowSeries(data.Days)

	// trim flow to lookback if smaller
	if lookback > 0 && lookback < len(flow) {
		flow = flow[len(flow)-lookback:]
	}

	score := analysis.BandarScore(data.Days, lookback)

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":           symbol,
		"lookback":         lookback,
		"days_in_data":     len(data.Days),
		"last_updated":     data.LastUpdated,
		"bandar_score":     score,
		"top_accumulators": accum,
		"top_distributors": distr,
		"flow":             flow,
		"all_brokers":      agg,
	})
}

// ── POST /api/broker/{symbol}/mock?days=30 ───────────────────────────────────
// Dev tool — generates realistic mock broker data aligned to existing OHLCV
// (close prices come from real Yahoo data so the dates match).

func (h *BrokerHandler) Mock(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])

	stockData, err := storage.Load(symbol)
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if stockData == nil || len(stockData.Prices) == 0 {
		respond(w, 404, false,
			fmt.Sprintf("stock %s belum di-track — tambah dulu via POST /api/stocks", symbol),
			nil)
		return
	}

	days := intParam(r, "days", 30)
	if days > len(stockData.Prices) {
		days = len(stockData.Prices)
	}
	prices := stockData.Prices[len(stockData.Prices)-days:]

	mock := generateMockBrokerData(symbol, prices)

	if err := h.save(mock); err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	respond(w, 201, true,
		fmt.Sprintf("generated %d hari mock broker data untuk %s (deterministic per symbol)", len(mock.Days), symbol),
		map[string]interface{}{
			"symbol":       symbol,
			"days_written": len(mock.Days),
			"first_date":   mock.Days[0].Date,
			"last_date":    mock.Days[len(mock.Days)-1].Date,
		})
}

// ── DELETE /api/broker/{symbol} ──────────────────────────────────────────────

func (h *BrokerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	h.mu.Lock()
	defer h.mu.Unlock()
	err := os.Remove(brokerPath(symbol))
	if err != nil && !os.IsNotExist(err) {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	respond(w, 200, true, fmt.Sprintf("broker data untuk %s dihapus", symbol), nil)
}

// ── Mock data generator ──────────────────────────────────────────────────────

type brokerProfile struct {
	Code string
	Name string
	Type string  // "F" or "L"
	Bias float64 // -1..+1, persistent personality. Positive = tends to accumulate.
}

// Representative IDX broker codes. Realistic names — but the numbers are SYNTHETIC.
var mockBrokers = []brokerProfile{
	{"YP", "Mirae Asset Sekuritas Indonesia", "F", +0.55},
	{"KZ", "CLSA Sekuritas Indonesia",         "F", +0.30},
	{"BK", "J.P. Morgan Sekuritas Indonesia",  "F", +0.15},
	{"AK", "UBS Sekuritas Indonesia",          "F", -0.10},
	{"DB", "Deutsche Bank AG",                 "F", +0.05},
	{"CG", "Citigroup Sekuritas Indonesia",    "F", -0.20},
	{"YU", "CGS-CIMB Sekuritas Indonesia",     "F", +0.10},
	{"CC", "Mandiri Sekuritas",                "L", +0.20},
	{"PD", "Indo Premier Sekuritas",           "L", -0.35},
	{"DR", "Valbury Asia Sekuritas",           "L", -0.15},
	{"LG", "Trimegah Sekuritas Indonesia",     "L", +0.10},
	{"ZP", "Maybank Sekuritas Indonesia",      "L", -0.05},
	{"NI", "BNI Sekuritas",                    "L", +0.15},
	{"SS", "Stockbit Sekuritas Digital",       "L", -0.40},
	{"HD", "Henan Putihrai Sekuritas",         "L", +0.05},
}

// generateMockBrokerData — deterministic mock data per symbol.
// Seed = FNV hash of symbol so the same symbol always produces the same data.
func generateMockBrokerData(symbol string, prices []models.StockPrice) *analysis.BrokerData {
	h := fnv.New64a()
	h.Write([]byte(symbol))
	seed := int64(h.Sum64())
	rng := rand.New(rand.NewSource(seed))

	days := make([]analysis.BrokerDay, 0, len(prices))

	for _, p := range prices {
		nActive := 8 + rng.Intn(5) // 8..12 brokers per day
		idxs := rng.Perm(len(mockBrokers))[:nActive]

		entries := make([]analysis.BrokerEntry, 0, nActive)
		for _, i := range idxs {
			b := mockBrokers[i]

			// Activity scaled to price level — larger price → larger IDR notional
			scale := p.Close
			if scale < 100 {
				scale = 100
			}

			// Base volume in lots: 500..15000
			vol := int64(500 + rng.Intn(14500))

			// Net bias: broker.Bias * personality strength + daily noise
			bias := b.Bias + (rng.Float64()*0.6 - 0.3) // ±0.3 daily noise
			if bias > 1 {
				bias = 1
			}
			if bias < -1 {
				bias = -1
			}

			// Split volume into buy/sell based on bias
			ratio := 0.5 + bias*0.4 // 0.1..0.9
			buyLots := int64(float64(vol) * ratio)
			sellLots := vol - buyLots

			// Avg price wobbles slightly around close (within 0.5%)
			buyPx := scale * (1 + (rng.Float64()*0.01 - 0.005))
			sellPx := scale * (1 + (rng.Float64()*0.01 - 0.005))

			buyVal := int64(float64(buyLots) * 100 * buyPx)   // 1 lot = 100 shares
			sellVal := int64(float64(sellLots) * 100 * sellPx)

			entries = append(entries, analysis.BrokerEntry{
				Code:      b.Code,
				Name:      b.Name,
				Type:      b.Type,
				BuyLots:   buyLots,
				BuyValue:  buyVal,
				SellLots:  sellLots,
				SellValue: sellVal,
				NetValue:  buyVal - sellVal,
			})
		}

		days = append(days, analysis.BrokerDay{
			Date:    p.Date,
			Close:   p.Close,
			Summary: entries,
		})
	}

	return &analysis.BrokerData{
		Symbol:      symbol,
		LastUpdated: time.Now().Format("2006-01-02"),
		Days:        days,
	}
}
