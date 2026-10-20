package handlers

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadBrokerDaysSkipsMock(t *testing.T) {
	old := brokerDir
	brokerDir = t.TempDir()
	defer func() { brokerDir = old }()
	day := `[{"date":"2026-10-20","close":100,"summary":[]}]`
	os.WriteFile(filepath.Join(brokerDir, "MOCK.json"), []byte(`{"symbol":"MOCK","source":"mock","days":`+day+`}`), 0644)
	os.WriteFile(filepath.Join(brokerDir, "REAL.json"), []byte(`{"symbol":"REAL","days":`+day+`}`), 0644)

	if d := LoadBrokerDays("MOCK"); d != nil {
		t.Errorf("mock broker data must not reach the engine, got %d days", len(d))
	}
	if d := LoadBrokerDays("REAL"); len(d) != 1 {
		t.Errorf("real broker data should load, got %d days", len(d))
	}
}
