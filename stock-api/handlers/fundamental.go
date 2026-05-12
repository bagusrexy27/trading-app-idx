package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gorilla/mux"
)

const fundamentalsDir = "./data/fundamentals"

// GetFundamental reads ./data/fundamentals/{SYMBOL}.json and returns it.
func GetFundamental(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	path := filepath.Join(fundamentalsDir, symbol+".json")

	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			respond(w, 404, false, "not found", nil)
			return
		}
		respond(w, 500, false, err.Error(), nil)
		return
	}

	var data interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		respond(w, 500, false, "invalid json: "+err.Error(), nil)
		return
	}

	respond(w, 200, true, "", data)
}

// SaveFundamental writes a JSON body to ./data/fundamentals/{SYMBOL}.json.
func SaveFundamental(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])

	var body interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond(w, 400, false, "invalid json: "+err.Error(), nil)
		return
	}

	if err := os.MkdirAll(fundamentalsDir, 0755); err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	path := filepath.Join(fundamentalsDir, symbol+".json")
	out, err := json.MarshalIndent(body, "", "  ")
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	if err := os.WriteFile(path, out, 0644); err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	respond(w, 200, true, "saved", nil)
}
