# Deploy & runbook

Target deploy: **Fly.io**, satu container. Binary Go menyajikan `/api/*` sekaligus UI hasil build dari `./static` — tidak ada proses kedua, tidak ada reverse proxy, tidak ada database.

Semua perintah dijalankan dari `stock-api/`.

---

## Isi image

`Dockerfile` punya 3 stage:

| Stage | Isi |
|---|---|
| `ui` | `node:20-alpine` → `npm install --legacy-peer-deps` → `npm run build`. `vite.config.js` mengarahkan output ke `../static`, jadi bundle mendarat di `/app/static` |
| `build` | `golang:1.24-alpine` → `CGO_ENABLED=0 go build -trimpath` |
| runtime | `alpine:3.20` + `ca-certificates` + `tzdata`. Berisi binary, `./static`, dan snapshot `data/` yang disalin ke `./seed-data` |

Default env di image: `DATA_DIR=/data`, `SEED_DIR=/app/seed-data`, `PORT=8080`, `TZ=Asia/Jakarta`.

`.dockerignore` menahan `.env`, `data/reports/`, `data/portfolio.json`, dan `data/broker/` keluar dari build context — jadi rahasia lokal, PDF pribadi, holdings, dan data broker sintetis tidak pernah ikut terbakar ke dalam snapshot.

---

## Environment variable

| Var | Default | Catatan |
|---|---|---|
| `DATA_DIR` | `./data` | Root untuk OHLCV, `broker/`, `fundamentals/`, `reports/`. **Harus env var sungguhan** — `.env` dibaca di `main()`, setelah paket `storage` selesai inisialisasi |
| `SEED_DIR` | *(kosong)* | Kalau di-set dan `DATA_DIR` belum punya `*.json`, `seedDataDir()` menyalin snapshot image ke dalamnya |
| `PORT` | `1111` | Fly memakai `8080` |
| `AUTH_USER` / `AUTH_PASS` | *(kosong)* | Keduanya terisi ⇒ HTTP basic auth di semua route. Salah satu kosong ⇒ **terbuka** |
| `TZ` | *(OS)* | Image menyetel `Asia/Jakarta` |

`fly.toml` punya blok `[env]` yang menduplikasi keempat nilai pertama. Nilai di `fly.toml` **menang** saat runtime di Fly; nilai `ENV` di Dockerfile berlaku untuk `docker run` biasa. Kalau salah satu diubah, ubah keduanya.

---

## Deploy pertama

```bash
cd stock-api

fly launch --no-deploy                          # fly.toml sudah ada di repo
fly volumes create idx_data --region sin --size 1
fly secrets set AUTH_USER=... AUTH_PASS=...     # JANGAN dilewati — lihat peringatan di bawah
fly deploy
```

Konfigurasi di `fly.toml`: app `idx-analyzer`, region utama `sin`, volume `idx_data` di-mount ke `/data`, `internal_port` 8080, `force_https`, mesin `shared-cpu-1x` / 512 MB, dan `auto_stop_machines`/`auto_start_machines` aktif dengan `min_machines_running = 0` — mesin tidur kalau tidak ada trafik dan bangun saat request pertama masuk (request itu akan terasa lambat).

### Peringatan auth

`basicAuth` **gagal-terbuka**. Kalau `AUTH_USER` atau `AUTH_PASS` kosong, server tetap jalan tanpa autentikasi dan hanya mencetak peringatan kuning saat startup:

```
⚠ AUTH_USER/AUTH_PASS unset — every route is open, including DELETE and report upload
```

Bukan `log.Fatal`. Salah ketik nama secret (`AUTH_PAS=...`) menghasilkan server yang terbuka di hostname publik, di mana siapa pun bisa memanggil `DELETE /api/stocks/{symbol}`, `POST /api/stocks/update-all`, dan `POST /api/stocks/{symbol}/reports`. Verifikasi setelah deploy:

```bash
fly secrets list                                        # harus ada DUA baris
curl -s -o /dev/null -w '%{http_code}\n' https://<app>.fly.dev/api/stocks   # harus 401
```

Dapat `200` tanpa kredensial berarti auth mati.

---

## Seeding volume

Volume Fly yang baru dibuat diformat ext4, jadi **tidak pernah benar-benar kosong** — selalu ada `lost+found`. Karena itu `seedDataDir()` memeriksa keberadaan `*.json` di `DATA_DIR`, bukan "direktori kosong":

```go
existing, err := filepath.Glob(filepath.Join(storage.DataDir, "*.json"))
if err != nil { log.Printf("seed: cannot scan %s: %v", storage.DataDir, err); return }
if len(existing) > 0 { return } // sudah terisi
```

Boot pertama pada volume baru akan mencatat:

```
seeded /data from /app/seed-data
```

Kalau baris itu tidak muncul dan watchlist kosong, cek log untuk `seed: cannot scan` (volume tak terbaca) atau `seed ... failed` (`CopyFS` gagal, misal disk penuh).

Seeding hanya sekali. Untuk memaksa re-seed, kosongkan `*.json` di volume lalu restart mesin.

---

## Verifikasi setelah deploy

```bash
fly status
fly logs                                   # cari baris banner + "seeded" + peringatan auth

U=user:pass
curl -u $U https://<app>.fly.dev/api/stocks | head -c 300     # watchlist terisi?
curl -u $U https://<app>.fly.dev/api/ihsg  | head -c 200      # upstream Yahoo hidup?
curl -u $U https://<app>.fly.dev/api/analysis/BBCA/decision    # engine jalan?
```

Buka `https://<app>.fly.dev` — UI harus tampil. Kalau yang keluar `404 page not found` di root, stage `ui` gagal dan `./static` kosong.

---

## Refresh data

Tidak ada scheduler. Data hanya sesegar "Update All" terakhir:

```bash
curl -u user:pass -X POST https://<app>.fly.dev/api/stocks/update-all
```

Atau tekan **Update All** di sidebar UI. Endpoint ini menarik seluruh watchlist secara berurutan dari Yahoo Finance, jadi bisa berjalan puluhan detik. Kalau butuh otomatis, jalankan curl di atas dari cron eksternal — jangan tambahkan scheduler in-process, karena mesin Fly-nya memang dibiarkan tidur.

---

## Rollback

Deploy sebelumnya masih tersimpan sebagai release Fly:

```bash
fly releases                 # daftar release + image ref
fly deploy --image <image-ref-release-sebelumnya>
```

Kalau cuma perlu mesin disegarkan tanpa deploy ulang:

```bash
fly machine list
fly machine restart <machine-id>
```

Data di volume **tidak** ikut ter-rollback — volume terpisah dari image. Rollback image aman untuk perubahan kode; kalau yang rusak justru isi volume, pulihkan dari snapshot:

```bash
fly volumes list
fly volumes snapshots list <volume-id>
fly volumes create idx_data --snapshot-id <snapshot-id> --region sin --size 1
```

Lalu mount volume baru itu (`fly.toml` → `[mounts].source`) dan deploy ulang. Flyctl berubah cukup sering — cek `fly help <subcommand>` sebelum menjalankan perintah rollback pada insiden nyata.

### Kalau upstream Yahoo yang rusak

Gejalanya: `/api/ihsg` dan `update-all` error, tapi endpoint analisis masih jalan atas data tersimpan. Tidak ada yang bisa di-rollback — aplikasi tetap berguna dalam mode read-only sampai Yahoo pulih. Jangan hapus data apa pun.

---

## Menjalankan image secara lokal

```bash
docker build -t idx-analyzer .
docker run --rm -p 8080:8080 \
  -v "$PWD/data:/data" \
  -e AUTH_USER=dev -e AUTH_PASS=dev \
  idx-analyzer
```

> **Selalu sertakan `-v`.** Kalau `DATA_DIR` menunjuk path yang belum ada, `storage.init()` membuatnya lewat `os.MkdirAll` — di container tanpa volume, itu berarti layer tulis milik container. Aplikasi jalan normal, seeding sukses, saham bisa ditambah — lalu semuanya hilang saat container berhenti, tanpa peringatan apa pun.

---

## Yang disengaja tidak dilakukan di server

- **`openClaudeTerminal()`** (upload PDF → CLI Claude Code) digerbangi `runtime.GOOS == "windows"`, jadi no-op di runtime Alpine. Ini disengaja: `os/exec` yang dipicu upload adalah eksekusi kode remote. Jangan pernah jalankan build Windows-nya dengan port terekspos.
- **Tidak ada generator data broker.** `POST /api/broker/{symbol}/mock` menghasilkan data sintetis tanpa penanda. `data/broker/` di-ignore git dan Docker supaya angka karangan tidak pernah tampil sebagai data pasar di server.
- **Tidak ada scheduler, tidak ada worker, tidak ada cache di luar proses.** Cache IHSG 60 detik ada di memori dan hilang setiap mesin tidur.
