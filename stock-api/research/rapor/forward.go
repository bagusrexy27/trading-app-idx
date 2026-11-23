package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"stock-api/storage"
)

// Forward test (docs/rapor-indikator-plan.md, Fase 6 #1). Every run records
// what each indicator said on trading dates not logged yet — never before the
// first log (2026-11-20), so nothing already seen is back-filled. Each file
// carries the sha256 of the rapor source code and of the previous file, so an
// edited log breaks the chain and the report says so. Outcomes are scored
// later by the same market-neutral rule as the backtest.
var forwardDir = filepath.Join("research", "forward")

type fwdLog struct {
	Date    string              `json:"date"`
	MadeAt  string              `json:"made_at"`
	Code    string              `json:"code"` // sha256 of research/rapor/*.go (tests excluded)
	Prev    string              `json:"prev"` // sha256 of the previous log file's bytes
	Stocks  int                 `json:"stocks"`
	Signals map[string][]string `json:"signals"` // buy signals: indicator → symbols
	High    map[string][]string `json:"high"`    // value indicators: top 20% by raw value
	Low     map[string][]string `json:"low"`     // value indicators: bottom 20% by raw value
	Timing  map[string]bool     `json:"timing"`  // market conditions that held
}

// Forward is a result's forward-test score, attached to the report.
type Forward struct {
	Since  string  `json:"since"`
	N      int     `json:"n"`                 // resolved signals / dates
	Excess float64 `json:"excess"`            // % before costs, same measure as the backtest's netObs: signal = 20d excess per signal · value = best-20% side's 20d excess per date · timing = market deviation on its side
	Hit    float64 `json:"hit_pct,omitempty"` // signals: % beating the market
}

func codeHash() string {
	files, _ := filepath.Glob(filepath.Join("research", "rapor", "*.go"))
	sort.Strings(files)
	h := sha256.New()
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		b, _ := os.ReadFile(f)
		h.Write([]byte(filepath.Base(f)))
		h.Write(b)
	}
	return hex.EncodeToString(h.Sum(nil))
}

func sha(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

// readForward loads every log in date order and checks the hash chain.
// broken lists dates whose prev-hash does not match the file before them.
func readForward() (logs []fwdLog, last []byte, broken []string) {
	files, _ := filepath.Glob(filepath.Join(forwardDir, "*.json"))
	sort.Strings(files)
	prev := ""
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var l fwdLog
		if json.Unmarshal(b, &l) != nil {
			broken = append(broken, filepath.Base(f))
			continue
		}
		if l.Prev != prev {
			broken = append(broken, l.Date)
		}
		prev, last = sha(b), b
		logs = append(logs, l)
	}
	return
}

// barIndex finds bar i for date d in s (−1 when the stock has no bar that day).
func (s *series) barIndex(d string) int {
	i := sort.SearchStrings(s.date, d)
	if i < s.n && s.date[i] == d {
		return i
	}
	return -1
}

// forwardStart is the first date the forward test covers. The signal rules
// were frozen in commit 40e5ed8 (2026-11-20) before any 20-day outcome from
// that date was known, so dates from here on are out-of-sample even when a
// missed evening run logs them later (decided 2026-11-23: the 20 Nov run was
// missed). Never move it earlier — those dates were seen during development.
const forwardStart = "2026-11-20"

// writeForward logs every trading date after the last logged one (from
// forwardStart on the very first run) up to asOf. Existing files are never
// rewritten.
func writeForward(res []stockOut, cat []indicator, conds []timingCond, tradeDays []string, asOf string) (int, error) {
	logs, lastBytes, _ := readForward()
	from := forwardStart
	if len(logs) > 0 {
		from = logs[len(logs)-1].Date
	}
	var dates []string
	for _, d := range tradeDays {
		if (d > from || (len(logs) == 0 && d == forwardStart)) && d <= asOf {
			dates = append(dates, d)
		}
	}
	// only final candles: today's bar counts after the 16:15 WIB close
	wib := time.Now().In(time.FixedZone("WIB", 7*3600))
	today := wib.Format("2006-01-02")
	final := func(d string) bool {
		if d > today || (d == today && wib.Hour()*60+wib.Minute() < 16*60+15) {
			return false
		}
		closed, _ := time.ParseInLocation("2006-01-02 15:04", d+" 16:15", wib.Location())
		for _, o := range res { // a stock whose newest bar is d must have been saved after d's close
			if o.s != nil && o.s.date[o.s.n-1] == d && o.s.written.Before(closed) {
				return false
			}
		}
		return true
	}
	kept := dates[:0]
	for _, d := range dates {
		if final(d) {
			kept = append(kept, d)
		}
	}
	dates = kept
	code, prev := codeHash(), ""
	if lastBytes != nil {
		prev = sha(lastBytes)
	}
	written := 0
	for _, d := range dates {
		l := fwdLog{Date: d, MadeAt: time.Now().Format(time.RFC3339), Code: code, Prev: prev,
			Signals: map[string][]string{}, High: map[string][]string{}, Low: map[string][]string{}, Timing: map[string]bool{}}
		type sv struct {
			sym string
			v   float64
		}
		vals := make([][]sv, len(cat))
		for _, o := range res {
			if o.s == nil {
				continue
			}
			i := o.s.barIndex(d)
			if i < 0 || !o.s.liquid[i] {
				continue
			}
			l.Stocks++
			for j, ind := range cat {
				if ind.sig != nil && o.sigs[j][i] {
					l.Signals[ind.Name] = append(l.Signals[ind.Name], o.s.sym)
				}
				if ind.val != nil {
					if v := o.vals[j][i]; !math.IsNaN(v) && !math.IsInf(v, 0) {
						vals[j] = append(vals[j], sv{o.s.sym, v})
					}
				}
			}
		}
		if l.Stocks == 0 {
			continue // not a trading day for anything we track
		}
		for j, ind := range cat {
			v := vals[j]
			if ind.val == nil || len(v) < minICCross {
				continue
			}
			// ties (integer scores like Piotroski) broken by symbol, same rule as topFrac
			k := len(v) / 5
			sort.Slice(v, func(a, b int) bool { return v[a].v < v[b].v || (v[a].v == v[b].v && v[a].sym < v[b].sym) })
			for q := 0; q < k; q++ {
				l.Low[ind.Name] = append(l.Low[ind.Name], v[q].sym)
			}
			sort.Slice(v, func(a, b int) bool { return v[a].v > v[b].v || (v[a].v == v[b].v && v[a].sym < v[b].sym) })
			for q := 0; q < k; q++ {
				l.High[ind.Name] = append(l.High[ind.Name], v[q].sym)
			}
		}
		for _, c := range conds {
			l.Timing[c.Name] = c.on(d)
		}
		path := filepath.Join(forwardDir, d+".json")
		if _, err := os.Stat(path); err == nil {
			continue // never rewrite a log
		}
		if err := storage.WriteJSON(path, l); err != nil {
			return written, err
		}
		b, _ := os.ReadFile(path)
		prev = sha(b)
		written++
	}
	return written, nil
}

// scoreForward attaches forward-test results to rs using the same excess
// function as the backtest. Only outcomes whose 20 bars have passed count.
func scoreForward(rs []Result, logs []fwdLog, res []stockOut, excess func(*series, int, int) float64, m20 map[string]float64) {
	if len(logs) == 0 {
		return
	}
	bySym := map[string]*series{}
	for _, o := range res {
		if o.s != nil {
			bySym[o.s.sym] = o.s
		}
	}
	since := logs[0].Date
	mAll := []float64{}
	for _, l := range logs {
		if v, ok := m20[l.Date]; ok {
			mAll = append(mAll, v)
		}
	}
	mMean := mean(mAll)
	for k := range rs {
		r := &rs[k]
		var xs []float64
		hit := 0
		last := map[string]int{}
		for _, l := range logs {
			switch r.Kind {
			case "signal":
				for _, sym := range l.Signals[r.Name] {
					s := bySym[sym]
					if s == nil {
						continue
					}
					i := s.barIndex(l.Date)
					if p, ok := last[sym]; i < 0 || (ok && i-p < dedupeBars) {
						continue
					}
					last[sym] = i
					if x := excess(s, 20, i); !math.IsNaN(x) {
						xs = append(xs, x)
						if x > 0 {
							hit++
						}
					}
				}
			case "value": // best 20% side in the backtest direction, per date — same as netObs (topFrac 0.2)
				best := l.High[r.Name]
				if r.Direction == "rendah" {
					best = l.Low[r.Name]
				}
				if b := sideMean(best, l.Date, bySym, excess); !math.IsNaN(b) {
					xs = append(xs, b)
				}
			case "timing":
				if l.Timing[r.Name] {
					if v, ok := m20[l.Date]; ok {
						d := v - mMean
						if r.Direction == "buruk" {
							d = -d
						}
						xs = append(xs, d)
					}
				}
			}
		}
		f := &Forward{Since: since, N: len(xs), Excess: r3(mean(xs))}
		if r.Kind == "signal" && len(xs) > 0 {
			f.Hit = r2(float64(hit) / float64(len(xs)) * 100)
		}
		r.Forward = f
	}
}

func sideMean(syms []string, d string, bySym map[string]*series, excess func(*series, int, int) float64) float64 {
	var xs []float64
	for _, sym := range syms {
		if s := bySym[sym]; s != nil {
			if i := s.barIndex(d); i >= 0 {
				xs = append(xs, excess(s, 20, i))
			}
		}
	}
	return mean(xs)
}
