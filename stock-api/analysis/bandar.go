package analysis

import "sort"

// ── Bandarmologi types ───────────────────────────────────────────────────────
//
// Daily broker summary per stock.
//
//   BrokerEntry — one broker's activity on one trading day
//     Type: "F" (foreign / asing) | "L" (local / lokal)
//     NetValue: BuyValue − SellValue. Positive = net buy (accumulation).
//
//   BrokerDay  — all brokers active on one date for one stock
//   BrokerData — root file: symbol + history slice

type BrokerEntry struct {
	Code      string `json:"broker"`     // e.g. "YP"
	Name      string `json:"name"`       // e.g. "Mirae Asset Sekuritas"
	Type      string `json:"type"`       // "F" foreign | "L" local
	BuyLots   int64  `json:"buy_lots"`
	BuyValue  int64  `json:"buy_value"`  // IDR
	SellLots  int64  `json:"sell_lots"`
	SellValue int64  `json:"sell_value"`
	NetValue  int64  `json:"net_value"`  // Buy − Sell
}

type BrokerDay struct {
	Date    string        `json:"date"`
	Close   float64       `json:"close"`
	Summary []BrokerEntry `json:"summary"`
}

type BrokerData struct {
	Symbol      string      `json:"symbol"`
	LastUpdated string      `json:"last_updated"`
	Days        []BrokerDay `json:"days"`
}

// FlowDay — foreign vs local net buy on one date.
type FlowDay struct {
	Date       string `json:"date"`
	ForeignNet int64  `json:"foreign_net"`
	LocalNet   int64  `json:"local_net"`
	TotalNet   int64  `json:"total_net"`
}

// BrokerAggregate — totals per broker over a lookback window.
type BrokerAggregate struct {
	Code     string `json:"broker"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	BuyVal   int64  `json:"buy_value"`
	SellVal  int64  `json:"sell_value"`
	NetVal   int64  `json:"net_value"`
	Days     int    `json:"days_active"`
}

// ── Aggregation ──────────────────────────────────────────────────────────────

// AggregateBrokers sums per-broker activity over the last `lookback` days
// (or all days if lookback ≤ 0 or larger than history).
func AggregateBrokers(days []BrokerDay, lookback int) []BrokerAggregate {
	if len(days) == 0 {
		return nil
	}
	if lookback <= 0 || lookback > len(days) {
		lookback = len(days)
	}
	slice := days[len(days)-lookback:]

	type acc struct {
		name    string
		t       string
		buyVal  int64
		sellVal int64
		netVal  int64
		days    int
	}
	m := make(map[string]*acc)

	for _, d := range slice {
		for _, e := range d.Summary {
			a, ok := m[e.Code]
			if !ok {
				a = &acc{name: e.Name, t: e.Type}
				m[e.Code] = a
			}
			a.buyVal += e.BuyValue
			a.sellVal += e.SellValue
			a.netVal += e.NetValue
			a.days++
		}
	}

	out := make([]BrokerAggregate, 0, len(m))
	for code, a := range m {
		out = append(out, BrokerAggregate{
			Code: code, Name: a.name, Type: a.t,
			BuyVal: a.buyVal, SellVal: a.sellVal, NetVal: a.netVal,
			Days: a.days,
		})
	}

	// Default order: net value descending
	sort.Slice(out, func(i, j int) bool { return out[i].NetVal > out[j].NetVal })
	return out
}

// TopAccumulators returns the top N brokers by net buy (descending).
func TopAccumulators(agg []BrokerAggregate, n int) []BrokerAggregate {
	sorted := make([]BrokerAggregate, len(agg))
	copy(sorted, agg)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].NetVal > sorted[j].NetVal })
	if n > 0 && n < len(sorted) {
		sorted = sorted[:n]
	}
	// Filter to net buyers only
	out := sorted[:0]
	for _, a := range sorted {
		if a.NetVal > 0 {
			out = append(out, a)
		}
	}
	return out
}

// TopDistributors returns the top N brokers by net sell (most negative net).
func TopDistributors(agg []BrokerAggregate, n int) []BrokerAggregate {
	sorted := make([]BrokerAggregate, len(agg))
	copy(sorted, agg)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].NetVal < sorted[j].NetVal })
	if n > 0 && n < len(sorted) {
		sorted = sorted[:n]
	}
	out := sorted[:0]
	for _, a := range sorted {
		if a.NetVal < 0 {
			out = append(out, a)
		}
	}
	return out
}

// FlowSeries computes foreign vs local net flow per day.
func FlowSeries(days []BrokerDay) []FlowDay {
	out := make([]FlowDay, 0, len(days))
	for _, d := range days {
		var foreign, local int64
		for _, e := range d.Summary {
			if e.Type == "F" {
				foreign += e.NetValue
			} else {
				local += e.NetValue
			}
		}
		out = append(out, FlowDay{
			Date:       d.Date,
			ForeignNet: foreign,
			LocalNet:   local,
			TotalNet:   foreign + local,
		})
	}
	return out
}

// BandarScore — composite −100..+100 reading of accumulation/distribution from
// broker flow over `lookback` days. Positive = accumulation, negative = distribution.
//
// Heuristic:
//   60% weight on cumulative foreign net (smart-money proxy)
//   40% weight on top-5 vs bottom-5 broker net imbalance
// Result is normalized against the total absolute flow over the window so the
// score stays in the −100..+100 range.
func BandarScore(days []BrokerDay, lookback int) float64 {
	if len(days) == 0 {
		return 0
	}
	flows := FlowSeries(days)
	if lookback > 0 && lookback < len(flows) {
		flows = flows[len(flows)-lookback:]
	}

	var foreignNet, absFlow int64
	for _, f := range flows {
		foreignNet += f.ForeignNet
		absFlow += abs64(f.ForeignNet) + abs64(f.LocalNet)
	}
	if absFlow == 0 {
		return 0
	}

	// Foreign component (−100..+100)
	foreignScore := float64(foreignNet) / float64(absFlow) * 100

	// Top vs bottom broker imbalance
	agg := AggregateBrokers(days, lookback)
	var topNet, botNet int64
	topN := 5
	if topN > len(agg) {
		topN = len(agg)
	}
	for i := 0; i < topN; i++ {
		topNet += agg[i].NetVal
	}
	for i := len(agg) - topN; i < len(agg); i++ {
		if i < 0 {
			continue
		}
		botNet += agg[i].NetVal
	}
	topBotScore := 0.0
	if topNet-botNet != 0 && absFlow > 0 {
		topBotScore = float64(topNet+botNet) / float64(absFlow) * 100
	}

	score := 0.6*foreignScore + 0.4*topBotScore
	if score > 100 {
		score = 100
	}
	if score < -100 {
		score = -100
	}
	return R2(score)
}

func abs64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
