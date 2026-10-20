package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func TestValidateSymbol(t *testing.T) {
	r := mux.NewRouter()
	r.Use(ValidateSymbol)
	r.HandleFunc("/s/{symbol}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })

	for path, want := range map[string]int{
		"/s/BBCA":            204,
		"/s/bbca.jk":         204,
		"/s/..%5C..%5Cetc":   400, // backslash traversal on Windows
		"/s/BB%2FCA":         404, // slash never even matches the route
		"/s/TOOLONGSYMBOL12": 400,
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != want {
			t.Errorf("%s: got %d want %d", path, w.Code, want)
		}
	}
}
