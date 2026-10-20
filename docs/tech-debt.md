# Tech Debt Backlog

Audit 2026-10-20. Skor = (Impact + Risk) × (6 − Effort), skala 1–5. Belum ada yang dikerjakan.
Centang item saat selesai; hapus baris kalau sudah tidak relevan.

## Prioritas

| # | Utang | Kategori | I | R | E | Skor | Bukti / dampak |
|---|---|---|---|---|---|---|---|
| 1 | Broker **mock** (ASII, BNBR, BRIS) ikut skor sinyal asli | Arsitektur | 4 | 5 | 1 | **45** | `LoadBrokerDays` → `DecisionEngineWithBroker` di `handlers/advisor.go:39`, `advisor_screen.go:139`. Bobot 8% (±4 poin) bisa melewati BUY=60 |
| 2 | `data/portfolio.json` dianggap saham | Arsitektur | 3 | 3 | 1 | **30** | `storage.List` glob `data/*.json` → `doUpdate("portfolio")` error tiap update-all & auto-update 15 mnt. File juga ter-commit (data pribadi) |
| 3 | Kalibrasi hardcode `score >= 60` | Kode | 2 | 4 | 1 | **30** | `analysis/calibration.go:238,249` salinan batas BUY `decision.go:526` — ubah threshold = statistik diam-diam salah |
| 4 | Daftar IDX30/LQ45 basi 2026-10-30; ISSI syariah snapshot akhir 2025 | Kode/Data | 3 | 4 | 2 | **28** | `handlers/indices.go:13`, `handlers/syariah.go` (tanpa flag basi) |
| 5 | Auto-update & `/update-all` bisa jalan bersamaan | Arsitektur | 2 | 3 | 1 | **25** | `autoupdate.go` + `handlers.go` `updateAll` tanpa guard/singleflight — tulis saling timpa, Yahoo 2× |
| 6 | Docs bilang "No scheduler" | Dokumentasi | 2 | 3 | 1 | **25** | `CLAUDE.md:168`, `docs/architecture.md`, `docs/api.md`, `docs/deploy.md:111,117` vs `handlers/autoupdate.go` |
| 7 | 16 file Go belum gofmt; fitur dividen + auto-update belum di-commit | Infra | 2 | 3 | 1 | **25** | `gofmt -l .` |
| 8 | Tiga engine vonis berbeda | Kode | 4 | 4 | 3 | **24** | `decision.go:241`, `advisor.go:100`, `calcSignals` (`handlers/analysis.go:295`) dipakai `/ai` & `/backtest` — AI bisa bilang BUY saat Saran WAIT |
| 9 | Tulis file tidak atomik | Arsitektur | 2 | 4 | 2 | **24** | `os.WriteFile` di `storage.go:48`, `fundamental.go:61`, `broker.go:73`, `dividends.go` — crash = JSON rusak, saham hilang diam-diam. Sekalian satukan helper baca/tulis JSON |
| 10 | Server tanpa timeout/body limit; `{symbol}` tak divalidasi; auth opsional | Keamanan | 2 | 4 | 2 | **24** | `main.go` `ListenAndServe`, 0× `MaxBytesReader`, `canonicalSymbol` cuma upper+strip `.JK` |
| 11 | File di-ignore tapi masih ter-track + churn data di git | Infra | 3 | 3 | 2 | **24** | `data/broker/*.json`, `data/portfolio.json`, `dssa_raw.json`, `Codetrading-app-idxdssa_raw.json`, `stock-api/Screenshot*.png`; ~92 file data berubah tiap auto-update |
| 12 | Test bergantung data live | Test | 2 | 3 | 2 | **20** | `TestAdvisorRealData` (`advisor_test.go:28`), `TestFVGRealData` (`fvg_test.go:140`) — data berubah tiap 15 mnt |
| 13 | Tidak ada CI & lint | Infra | 3 | 3 | 3 | **18** | tidak ada `.github/workflows`, golangci, eslint |
| 14 | Engine/route mati | Kode | 2 | 2 | 2 | **16** | Advisor + advisor-backtest (~574 baris) + `handlers/backtest.go` tak dipanggil UI; banyak `api.analysis.*` tak terpakai |
| 15 | Scheduler vs auto-stop Fly | Infra | 2 | 2 | 2 | **16** | tiap cold start → full refresh ~90 call Yahoo; `^JKSE` di-fetch di 3 tempat; cache in-memory hilang saat tidur |
| 16 | Log tanpa timestamp; potensi panic | Infra/Kode | 1 | 2 | 1 | **15** | `log.SetFlags(0)` `main.go`; `reports.go:61` abaikan error `e.Info()` lalu `info.Size()` |
| 17 | 4 loop backtest & 3 detektor pola candle | Kode | 3 | 3 | 4 | **12** | `advisor_backtest.go`, `decision_backtest.go`, `handlers/backtest.go`, `calibration.go:212`; `candlePattern` vs `detectPattern` (aturan Hammer beda) |
| 18 | Tidak ada test frontend | Test | 2 | 3 | 4 | **10** | termasuk hitungan uang Portfolio/RiskCalc |
| 19 | ApexCharts 542 KB untuk 2 file + `--legacy-peer-deps` | Dependensi | 2 | 2 | 4 | **8** | dipakai cuma `Indicators.jsx`, `Practice.jsx` |

Catatan keamanan: `.env` berisi `ANTHROPIC_API_KEY` yang tidak dipakai kode mana pun — hapus; rotate kalau pernah dibagikan.

## Rencana bertahap

**Fase 1 — quick wins (±½–1 hari):** #1, #2, #3, #5, #6, #7, #16 + bereskan `.gitignore` (#11). Mulai dengan commit fitur dividen & auto-update yang masih menggantung.

**Fase 2 — sebelum deploy / di sela fitur (±2–3 hari):** #4, #9, #10, #12, #13 (CI: `gofmt`, `go vet`, `go test`, `npm run build`).

**Fase 3 — sambil jalan fitur yang menyentuh areanya:** #8 + #17 (decision engine satu-satunya sumber vonis, satu loop backtest), #14, #15, #19, #18.
