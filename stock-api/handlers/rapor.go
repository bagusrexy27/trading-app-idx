package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"

	"stock-api/storage"
)

// raporDir holds the indicator report cards written by `go run ./research/rapor`
// (one JSON per run, named by the last data date). The newest one is served.
var raporDir = storage.EnvOr("RAPOR_DIR", filepath.Join("research", "rapor"))

// GetRapor — GET /api/research/rapor: the latest indicator report card, as-is.
func GetRapor(w http.ResponseWriter, r *http.Request) {
	files, _ := filepath.Glob(filepath.Join(raporDir, "*.json"))
	if len(files) == 0 {
		respond(w, 404, false, "Rapor belum dibuat — jalankan `go run ./research/rapor` dari stock-api/", nil)
		return
	}
	sort.Strings(files) // YYYY-MM-DD names: last = newest
	b, err := os.ReadFile(files[len(files)-1])
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	respond(w, 200, true, "", json.RawMessage(b))
}
