package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListSkipsNonTickerFiles(t *testing.T) {
	old := DataDir
	DataDir = t.TempDir()
	defer func() { DataDir = old }()
	for _, f := range []string{"BBCA.json", "portfolio.json", "notes.txt"} {
		os.WriteFile(filepath.Join(DataDir, f), []byte("{}"), 0644)
	}
	os.MkdirAll(filepath.Join(DataDir, "dividends"), 0755)

	got, err := List()
	if err != nil || len(got) != 1 || got[0] != "BBCA" {
		t.Fatalf("want [BBCA], got %v (%v)", got, err)
	}
}
