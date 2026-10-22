package fetcher

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"stock-api/models"
)

// Point is one reported value at a period-end date (YYYY-MM-DD).
type Point struct {
	Date  string
	Value float64
}

// Fundamentals is the slice of Yahoo's fundamentals-timeseries that the
// valuation band needs. Yahoo exposes ~4 annual and ~5 quarterly reports.
type Fundamentals struct {
	AnnualEquity    []Point
	AnnualShares    []Point
	AnnualNetIncome []Point
	QuarterEquity   []Point
	QuarterShares   []Point
	Currency        string // reporting currency of the equity figures, e.g. IDR or USD
}

func getJSON(url string, v any) error {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; idx-stock-api/1.0)")
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("yahoo finance returned HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

// FetchFundamentals returns equity, share count and net income reports.
func FetchFundamentals(symbol string) (Fundamentals, error) {
	types := []string{"annualStockholdersEquity", "annualOrdinarySharesNumber", "annualNetIncome",
		"quarterlyStockholdersEquity", "quarterlyOrdinarySharesNumber"}
	url := fmt.Sprintf(
		"https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/%s?type=%s&period1=%d&period2=%d",
		toYahooSymbol(symbol), strings.Join(types, ","), time.Now().AddDate(-6, 0, 0).Unix(), time.Now().Unix())

	var raw struct {
		Timeseries struct {
			Result []map[string]json.RawMessage `json:"result"`
		} `json:"timeseries"`
	}
	var f Fundamentals
	if err := getJSON(url, &raw); err != nil {
		return f, err
	}
	dst := map[string]*[]Point{
		types[0]: &f.AnnualEquity, types[1]: &f.AnnualShares, types[2]: &f.AnnualNetIncome,
		types[3]: &f.QuarterEquity, types[4]: &f.QuarterShares,
	}
	for _, res := range raw.Timeseries.Result {
		for key, out := range dst {
			body, ok := res[key]
			if !ok {
				continue
			}
			var rows []*struct {
				AsOfDate      string `json:"asOfDate"`
				CurrencyCode  string `json:"currencyCode"`
				ReportedValue struct {
					Raw float64 `json:"raw"`
				} `json:"reportedValue"`
			}
			if err := json.Unmarshal(body, &rows); err != nil {
				return f, fmt.Errorf("decode %s: %w", key, err)
			}
			for _, r := range rows {
				if r != nil { // Yahoo leaves null holes for missing periods
					*out = append(*out, Point{r.AsOfDate, r.ReportedValue.Raw})
					if key == types[0] {
						f.Currency = r.CurrencyCode
					}
				}
			}
			sort.Slice(*out, func(i, j int) bool { return (*out)[i].Date < (*out)[j].Date })
		}
	}
	return f, nil
}

// FetchLongHistory returns ~years of daily bars plus the cash dividends inside
// that window and Yahoo's first trade date for the symbol, in one request.
func FetchLongHistory(symbol string, years int) (prices []models.StockPrice, divs []Point, firstTrade string, err error) {
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=%dy&interval=1d&events=div",
		toYahooSymbol(symbol), years)
	var cr struct {
		Chart struct {
			Result []struct {
				Meta struct {
					FirstTradeDate int64 `json:"firstTradeDate"`
				} `json:"meta"`
				Timestamp []int64 `json:"timestamp"`
				Events    struct {
					Dividends map[string]struct {
						Amount float64 `json:"amount"`
						Date   int64   `json:"date"`
					} `json:"dividends"`
				} `json:"events"`
				Indicators struct {
					Quote []struct {
						Close []*float64 `json:"close"`
					} `json:"quote"`
				} `json:"indicators"`
			} `json:"result"`
		} `json:"chart"`
	}
	if err = getJSON(url, &cr); err != nil {
		return
	}
	if len(cr.Chart.Result) == 0 || len(cr.Chart.Result[0].Indicators.Quote) == 0 {
		return nil, nil, "", fmt.Errorf("no data for %s", symbol)
	}
	r := cr.Chart.Result[0]
	jkt := time.FixedZone("WIB", 7*3600)
	day := func(ts int64) string { return time.Unix(ts, 0).In(jkt).Format("2006-01-02") }
	closes := r.Indicators.Quote[0].Close
	for i, ts := range r.Timestamp {
		if i < len(closes) && closes[i] != nil {
			prices = append(prices, models.StockPrice{Date: day(ts), Close: *closes[i]})
		}
	}
	for _, d := range r.Events.Dividends {
		divs = append(divs, Point{day(d.Date), d.Amount})
	}
	sort.Slice(divs, func(i, j int) bool { return divs[i].Date < divs[j].Date })
	if r.Meta.FirstTradeDate != 0 {
		firstTrade = day(r.Meta.FirstTradeDate)
	}
	return prices, divs, firstTrade, nil
}
