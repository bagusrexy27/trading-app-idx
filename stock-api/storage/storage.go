package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"stock-api/models"
)

// DataDir is the root of all persisted JSON. Override with the DATA_DIR
// environment variable (Fly.io mounts a volume at /data).
// Note: it must be a real env var - .env is loaded from main(), which runs
// after this package is initialised.
var DataDir = EnvOr("DATA_DIR", "./data")

// EnvOr returns the environment variable key, or fallback when it is unset or empty.
func EnvOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

var mu sync.RWMutex

func init() {
	if err := os.MkdirAll(DataDir, 0755); err != nil {
		panic("cannot create data directory: " + err.Error())
	}
}

func filePath(symbol string) string {
	return filepath.Join(DataDir, symbol+".json")
}

// Save writes stock data to its dedicated JSON file.
func Save(data *models.StockData) error {
	mu.Lock()
	defer mu.Unlock()

	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	return os.WriteFile(filePath(data.Symbol), b, 0644)
}

// Load reads a stock's JSON file. Returns nil, nil if not found.
func Load(symbol string) (*models.StockData, error) {
	mu.RLock()
	defer mu.RUnlock()

	b, err := os.ReadFile(filePath(symbol))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read: %w", err)
	}

	var data models.StockData
	if err := json.Unmarshal(b, &data); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &data, nil
}

// Delete removes a stock's JSON file.
func Delete(symbol string) error {
	mu.Lock()
	defer mu.Unlock()
	return os.Remove(filePath(symbol))
}

// List returns all tracked stock symbols by scanning the data directory.
func List() ([]string, error) {
	mu.RLock()
	defer mu.RUnlock()

	files, err := filepath.Glob(filepath.Join(DataDir, "*.json"))
	if err != nil {
		return nil, err
	}

	symbols := make([]string, 0, len(files))
	for _, f := range files {
		base := filepath.Base(f)
		symbols = append(symbols, base[:len(base)-5]) // strip .json
	}
	return symbols, nil
}
