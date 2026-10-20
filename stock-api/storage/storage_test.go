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

func TestWriteJSONAtomicReplace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "x.json")
	if err := WriteJSON(path, map[string]int{"a": 1}); err != nil {
		t.Fatal(err)
	}
	if err := WriteJSON(path, map[string]int{"a": 2}); err != nil { // overwrite existing
		t.Fatal(err)
	}
	b, _ := os.ReadFile(path)
	if string(b) != "{\n  \"a\": 2\n}" {
		t.Fatalf("got %q", b)
	}
	left, _ := filepath.Glob(filepath.Join(filepath.Dir(path), ".tmp-*"))
	if len(left) != 0 {
		t.Fatalf("temp files left behind: %v", left)
	}
}
