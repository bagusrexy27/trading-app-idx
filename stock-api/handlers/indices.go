package handlers

import (
	"strings"
	"time"
)

// Konstituen IDX30 & LQ45 periode 3 Agu – 30 Okt 2026 (Peng-00148/BEI.POP/07-2026).
// Dicek 20 Okt 2026 ke 2 sumber independen (Kontan/Liputan6 untuk LQ45, Stockwatch untuk IDX30).
// BEI evaluasi tiap 3 bulan (Feb/Mei/Agu/Nov) — EDIT manual saat periode baru,
// lalu rebuild. Sama seperti syariah.go.
// indexValidUntil = hari terakhir periode di atas; lewat dari ini daftar dianggap basi.
const indexValidUntil = "2026-10-30"

var idx30Set = setOf("AADI ADMR ADRO AMRT ANTM ASII BBCA BBNI BBRI BMRI BRPT BUMI CPIN DEWA EMTK GOTO ICBP INCO INDF INKP JPFA KLBF MBMA MDKA MEDC PGAS PGEO TLKM UNTR UNVR")

var lq45Set = setOf("AADI ADMR ADRO AKRA AMMN AMRT ANTM ASII BBCA BBNI BBRI BBTN BMRI BRPT BUMI CPIN CUAN DEWA EMTK ESSA EXCL GOTO HRTA ICBP INCO INDF INDY INKP ISAT ITMG JPFA KLBF MAPI MBMA MDKA MEDC NCKL PGAS PGEO PTBA SCMA TLKM UNTR UNVR WIFI")

func setOf(codes string) map[string]bool {
	m := map[string]bool{}
	for _, c := range strings.Fields(codes) {
		m[c] = true
	}
	return m
}

func isIDX30(symbol string) bool { return idx30Set[symbol] }
func isLQ45(symbol string) bool  { return lq45Set[symbol] }

// validIndex: "" (tanpa filter) atau nama indeks yang dikenal.
func validIndex(name string) bool { return name == "" || name == "idx30" || name == "lq45" }

// indexStale: periode konstituen sudah lewat — saatnya edit daftar di atas.
func indexStale(now time.Time) bool { return now.Format("2006-01-02") > indexValidUntil }
