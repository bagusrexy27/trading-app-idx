package models

// StockPrice holds OHLCV data for a single trading day.
type StockPrice struct {
	Date   string  `json:"date"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume int64   `json:"volume"`
}

// StockData is the root structure stored per-stock JSON file.
type StockData struct {
	Symbol      string       `json:"symbol"`
	Exchange    string       `json:"exchange"`
	LastUpdated string       `json:"last_updated"`
	Prices      []StockPrice `json:"prices"`
}
