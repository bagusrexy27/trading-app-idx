package fetcher

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"stock-api/models"
)

// Yahoo Finance v8 chart response structure.
type chartResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Symbol       string `json:"symbol"`
				ExchangeName string `json:"exchangeName"`
			} `json:"meta"`
			Timestamp  []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Open   []*float64 `json:"open"`
					High   []*float64 `json:"high"`
					Low    []*float64 `json:"low"`
					Close  []*float64 `json:"close"`
					Volume []*int64   `json:"volume"`
				} `json:"quote"`
			} `json:"indicators"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}

// toYahooSymbol appends the .JK suffix for IDX stocks.
// Symbols starting with '^' (indices like ^JKSE) or already containing '.'
// (e.g. already suffixed) are returned as-is.
func toYahooSymbol(symbol string) string {
	s := strings.ToUpper(symbol)
	if strings.HasPrefix(s, "^") || strings.Contains(s, ".") {
		return s
	}
	return s + ".JK"
}

// Fetch downloads daily OHLCV data for an IDX stock starting from `from`.
// Returns the slice of prices, the exchange name, and any error.
func Fetch(symbol string, from time.Time) ([]models.StockPrice, string, error) {
	yahooSymbol := toYahooSymbol(symbol)

	url := fmt.Sprintf(
		"https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&period1=%d&period2=%d",
		yahooSymbol,
		from.Unix(),
		time.Now().Unix(),
	)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	// Yahoo Finance blocks requests without a User-Agent header.
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; idx-stock-api/1.0)")

	resp, err := client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("yahoo finance returned HTTP %d for %s", resp.StatusCode, yahooSymbol)
	}

	var cr chartResponse
	if err := json.NewDecoder(resp.Body).Decode(&cr); err != nil {
		return nil, "", fmt.Errorf("decode response: %w", err)
	}

	if cr.Chart.Error != nil {
		return nil, "", fmt.Errorf("yahoo finance error [%s]: %s",
			cr.Chart.Error.Code, cr.Chart.Error.Description)
	}
	if len(cr.Chart.Result) == 0 {
		return nil, "", fmt.Errorf("no data returned for %s — check that the symbol is valid", yahooSymbol)
	}

	result := cr.Chart.Result[0]
	exchange := result.Meta.ExchangeName

	if len(result.Indicators.Quote) == 0 || len(result.Timestamp) == 0 {
		return nil, exchange, nil
	}

	quote := result.Indicators.Quote[0]
	prices := make([]models.StockPrice, 0, len(result.Timestamp))

	for i, ts := range result.Timestamp {
		// Skip entries where core OHLC values are nil (non-trading days, incomplete data).
		if i >= len(quote.Open) || quote.Open[i] == nil {
			continue
		}
		if i >= len(quote.High) || quote.High[i] == nil {
			continue
		}
		if i >= len(quote.Low) || quote.Low[i] == nil {
			continue
		}
		if i >= len(quote.Close) || quote.Close[i] == nil {
			continue
		}

		var vol int64
		if i < len(quote.Volume) && quote.Volume[i] != nil {
			vol = *quote.Volume[i]
		}

		prices = append(prices, models.StockPrice{
			Date:   time.Unix(ts, 0).UTC().Format("2006-01-02"),
			Open:   *quote.Open[i],
			High:   *quote.High[i],
			Low:    *quote.Low[i],
			Close:  *quote.Close[i],
			Volume: vol,
		})
	}

	return prices, exchange, nil
}
