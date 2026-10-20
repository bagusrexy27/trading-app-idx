package handlers

import (
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"stock-api/fetcher"
)

func TestSaveDividendsValidatesAndSorts(t *testing.T) {
	dividendsPath = filepath.Join(t.TempDir(), "dividends", "calendar.json")

	post := func(body string) int {
		w := httptest.NewRecorder()
		SaveDividends(w, httptest.NewRequest("POST", "/api/dividends", strings.NewReader(body)))
		return w.Code
	}

	bad := []string{
		`[{"id":"1","symbol":"AADI","status":"resmi"}]`,                              // no date
		`[{"id":"1","symbol":"AADI","status":"maybe","cum_date":"2026-11-17"}]`,      // bad status
		`[{"id":"1","symbol":"AADI","status":"resmi","cum_date":"17-11-2026"}]`,      // bad date
		`[{"id":"1","symbol":"AADI","status":"perkiraan","est_month":"2026-11-01"}]`, // bad month
		`[{"id":"","symbol":"AADI","status":"resmi","cum_date":"2026-11-17"}]`,       // no id
	}
	for _, b := range bad {
		if code := post(b); code != 400 {
			t.Errorf("want 400 for %s, got %d", b, code)
		}
	}

	ok := `[
		{"id":"2","symbol":"adro.jk","status":"perkiraan","est_month":"2026-12"},
		{"id":"1","symbol":"AADI","status":"resmi","cum_date":"2026-11-17","amount":536}
	]`
	if code := post(ok); code != 200 {
		t.Fatalf("want 200, got %d", code)
	}
	list, err := loadDividends()
	if err != nil || len(list) != 2 {
		t.Fatalf("load: %v %+v", err, list)
	}
	if list[0].Symbol != "AADI" || list[1].Symbol != "ADRO" {
		t.Fatalf("want sorted AADI, ADRO (canonical), got %s, %s", list[0].Symbol, list[1].Symbol)
	}
}

func TestBuildAutoDividendsProjectsLastYear(t *testing.T) {
	today, _ := time.Parse("2006-01-02", "2026-10-20")
	items := map[string][]fetcher.DividendEvent{
		"AADI": {{Date: "2025-06-10", Amount: 400}, {Date: "2025-11-18", Amount: 538}, {Date: "2026-06-05", Amount: 463}},
		"ADRO": {{Date: "2025-06-13", Amount: 166}, {Date: "2025-11-28", Amount: 1358}, {Date: "2025-12-30", Amount: 145}},
	}
	got := map[string]Dividend{}
	for _, d := range buildAutoDividends(items, today) {
		if d.Status == "perkiraan" {
			got[d.ID] = d
		}
	}
	// 2025-06-10 is >1y old → no projection; the other two AADI rows project +1y.
	if _, ok := got["p-AADI-2026-11-18"]; !ok {
		t.Errorf("missing AADI Nov projection: %v", got)
	}
	if _, ok := got["p-AADI-2027-06-05"]; !ok {
		t.Errorf("missing AADI Jun projection: %v", got)
	}
	// ADRO 1358 is >3× median → special, not projected.
	if _, ok := got["p-ADRO-2026-11-28"]; ok {
		t.Errorf("special dividend should not be projected")
	}
	// Last year's ex 2025-10-25 would project to 2026-10-25, but 2026-10-01 already paid.
	items["BBCA"] = []fetcher.DividendEvent{{Date: "2025-10-25", Amount: 50}, {Date: "2026-10-01", Amount: 55}}
	for _, d := range buildAutoDividends(items, today) {
		if d.ID == "p-BBCA-2026-10-25" {
			t.Errorf("projection should be dropped when this year's dividend already paid")
		}
	}
	if len(got) != 3 {
		t.Errorf("want 3 projections, got %d: %v", len(got), got)
	}
}
