package handlers

// Daftar saham syariah IDX (konstituen ISSI — Indeks Saham Syariah Indonesia).
// Sumber: Daftar Efek Syariah (DES) OJK, snapshot pengetahuan per akhir 2025.
// DES di-review ±2× setahun (Mei & November) — EDIT daftar ini manual kalau
// ada saham yang masuk/keluar, lalu rebuild (go build -o stock-api.exe .).
// Simbol yang TIDAK ada di sini dianggap non-syariah / belum terdaftar.
var syariahSet = map[string]bool{
	"AALI": true, "AADI": true, "ACES": true, "ADMR": true, "ADRO": true,
	"AKRA": true, "AMMN": true, "AMRT": true, "ANTM": true, "ASII": true,
	"AUTO": true, "BIRD": true, "BREN": true, "BRIS": true, "BRMS": true,
	"BRPT": true, "BSDE": true, "BTPS": true, "BUKA": true, "CLEO": true,
	"CMRY": true, "CPIN": true, "CTRA": true, "CUAN": true, "DEWA": true,
	"DSNG": true, "ELSA": true, "EMTK": true, "ENRG": true, "ERAA": true,
	"ESSA": true, "EXCL": true, "GOTO": true, "HEAL": true, "HRUM": true,
	"ICBP": true, "INCO": true, "INDF": true, "INKP": true, "INTP": true,
	"ISAT": true, "ITMG": true, "JPFA": true, "JSMR": true, "KAEF": true,
	"KLBF": true, "LSIP": true, "MAPA": true, "MAPI": true, "MBMA": true,
	"MDKA": true, "MEDC": true, "MIKA": true, "MNCN": true, "MTDL": true,
	"MTEL": true, "MYOR": true, "NCKL": true, "PGAS": true, "PGEO": true,
	"PSAB": true, "PTBA": true, "PTPP": true, "PWON": true, "RAJA": true,
	"ROTI": true, "SCMA": true, "SIDO": true, "SILO": true, "SIMP": true,
	"SMDR": true, "SMGR": true, "SMRA": true, "SOCI": true, "SSMS": true,
	"TAPG": true, "TINS": true, "TKIM": true, "TLKM": true, "TMAS": true,
	"TOBA": true, "TOWR": true, "TBIG": true, "TPIA": true, "TSPC": true,
	"ULTJ": true, "UNTR": true, "UNVR": true,
}

// isSyariah reports whether symbol (tanpa .JK) ada di daftar ISSI di atas.
func isSyariah(symbol string) bool { return syariahSet[symbol] }
