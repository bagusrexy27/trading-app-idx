package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/mux"
	ledpdf "github.com/ledongthuc/pdf"
)

const reportsBase = "./data/reports"

// ReportMeta describes an uploaded PDF report.
type ReportMeta struct {
	ID         string `json:"id"`
	Symbol     string `json:"symbol"`
	Filename   string `json:"filename"`
	Size       int64  `json:"size_bytes"`
	UploadedAt string `json:"uploaded_at"`
}

func reportDir(symbol string) string {
	return filepath.Join(reportsBase, strings.ToUpper(symbol))
}

// ── GET /api/stocks/{symbol}/reports ─────────────────────────────────────────

func ListReports(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	dir := reportDir(symbol)

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"message": "",
				"data":    []ReportMeta{},
			})
			return
		}
		respond(w, 500, false, "gagal membaca direktori laporan", nil)
		return
	}

	reports := make([]ReportMeta, 0)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".pdf") {
			continue
		}
		info, _ := e.Info()
		// stored filename: {timestamp}_{originalname}
		originalName := e.Name()
		if idx := strings.Index(e.Name(), "_"); idx != -1 {
			originalName = e.Name()[idx+1:]
		}
		reports = append(reports, ReportMeta{
			ID:         e.Name(),
			Symbol:     symbol,
			Filename:   originalName,
			Size:       info.Size(),
			UploadedAt: info.ModTime().Format(time.RFC3339),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "",
		"data":    reports,
	})
}

// ── POST /api/stocks/{symbol}/reports ────────────────────────────────────────

func UploadReport(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respond(w, 400, false, "gagal parse form: "+err.Error(), nil)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respond(w, 400, false, "tidak ada file yang diunggah", nil)
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".pdf") {
		respond(w, 400, false, "hanya file PDF yang diizinkan", nil)
		return
	}

	dir := reportDir(symbol)
	if err := os.MkdirAll(dir, 0755); err != nil {
		respond(w, 500, false, "gagal membuat direktori", nil)
		return
	}

	ts := time.Now().Format("20060102150405")
	saveName := fmt.Sprintf("%s_%s", ts, header.Filename)
	savePath := filepath.Join(dir, saveName)

	dst, err := os.Create(savePath)
	if err != nil {
		respond(w, 500, false, "gagal menyimpan file", nil)
		return
	}
	defer dst.Close()

	size, err := io.Copy(dst, file)
	if err != nil {
		respond(w, 500, false, "gagal menulis file", nil)
		return
	}

	respond(w, 200, true, "laporan berhasil diunggah", ReportMeta{
		ID:         saveName,
		Symbol:     symbol,
		Filename:   header.Filename,
		Size:       size,
		UploadedAt: time.Now().Format(time.RFC3339),
	})
}

// ── DELETE /api/stocks/{symbol}/reports/{id} ─────────────────────────────────

func DeleteReport(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	id := mux.Vars(r)["id"]

	// Guard against path traversal
	if strings.Contains(id, "/") || strings.Contains(id, "..") || strings.Contains(id, "\\") {
		respond(w, 400, false, "report id tidak valid", nil)
		return
	}

	path := filepath.Join(reportDir(symbol), id)
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			respond(w, 404, false, "laporan tidak ditemukan", nil)
		} else {
			respond(w, 500, false, "gagal menghapus laporan", nil)
		}
		return
	}

	respond(w, 200, true, "laporan berhasil dihapus", nil)
}

// ── PDF text extraction helpers ───────────────────────────────────────────────

// extractPDFText extracts plain text from a PDF file (up to maxChars).
func extractPDFText(path string, maxChars int) (string, error) {
	f, r, err := ledpdf.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	var sb strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			continue
		}
		sb.WriteString(text)
		if sb.Len() >= maxChars {
			break
		}
	}

	result := sb.String()
	if len(result) > maxChars {
		result = result[:maxChars]
	}
	return strings.TrimSpace(result), nil
}

// GetReportsText returns combined text from all PDF reports for a symbol.
// Used by the AI handler to enrich the prompt with fundamental data.
// Total text is capped at ~4000 characters.
func GetReportsText(symbol string) string {
	dir := reportDir(symbol)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}

	var sb strings.Builder
	const totalLimit = 4000

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".pdf") {
			continue
		}
		path := filepath.Join(dir, e.Name())
		remaining := totalLimit - sb.Len()
		if remaining <= 0 {
			break
		}
		text, err := extractPDFText(path, remaining)
		if err != nil || text == "" {
			continue
		}
		// Use original filename (strip timestamp prefix) as label
		label := e.Name()
		if idx := strings.Index(label, "_"); idx != -1 {
			label = label[idx+1:]
		}
		sb.WriteString(fmt.Sprintf("\n\n--- Laporan: %s ---\n%s", label, text))
	}

	return sb.String()
}
