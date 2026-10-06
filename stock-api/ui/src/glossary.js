// Kamus istilah — sumber tunggal untuk tooltip <Term> dan halaman Kamus.
// Tulis untuk orang awam: 1–2 kalimat, tanpa jargon baru di dalam penjelasan.

export const CATEGORIES = ['Dasar', 'Rencana trading', 'Tren & struktur', 'Indikator', 'Pasar IDX']

export const GLOSSARY = {
  // ── Dasar ──
  ihsg:      { istilah: 'IHSG', kategori: 'Dasar', arti: 'Indeks Harga Saham Gabungan — angka yang mewakili naik-turunnya seluruh saham di Bursa Efek Indonesia. Patokan "cuaca" pasar.' },
  ma50:      { istilah: 'MA50 (rata-rata 50 hari)', kategori: 'Dasar', arti: 'Rata-rata harga penutupan 50 hari bursa terakhir. Harga di atasnya = cenderung naik; di bawahnya = cenderung turun.' },
  ma:        { istilah: 'MA / SMA / EMA', kategori: 'Indikator', arti: 'Moving Average — rata-rata harga N hari yang "berjalan" tiap hari. EMA memberi bobot lebih ke harga terbaru sehingga lebih cepat bereaksi.' },
  regime:    { istilah: 'Regime pasar', kategori: 'Dasar', arti: 'Kondisi besar pasar saat ini. Di aplikasi ini: "up" kalau IHSG di atas MA50, "down" kalau di bawahnya. Sinyal beli lebih sering berhasil saat regime up.' },
  sinyal:    { istilah: 'Sinyal (BUY / WAIT / SELL)', kategori: 'Dasar', arti: 'Kesimpulan mesin keputusan: BUY = layak dipertimbangkan beli, WAIT = belum jelas, tunggu, SELL = kondisi jelek, hindari / kurangi. STRONG = keyakinannya lebih tinggi.' },
  skor:      { istilah: 'Skor', kategori: 'Dasar', arti: 'Nilai 0–100 gabungan banyak faktor (tren, volume, struktur harga, dll). Makin tinggi makin bagus untuk beli.' },
  confidence:{ istilah: 'Confidence / keyakinan', kategori: 'Dasar', arti: 'Seberapa kompak faktor-faktornya sepakat. Skor tinggi tapi confidence rendah = sinyalnya masih ragu-ragu.' },
  volume:    { istilah: 'Volume', kategori: 'Dasar', arti: 'Jumlah saham yang berpindah tangan dalam sehari. Harga naik dengan volume besar lebih meyakinkan daripada naik saat sepi.' },
  volratio:  { istilah: 'Vol/Avg', kategori: 'Dasar', arti: 'Volume hari ini dibanding rata-rata 20 hari. 2x = dua kali lebih ramai dari biasanya.' },
  turnover:  { istilah: 'Nilai transaksi (turnover)', kategori: 'Dasar', arti: 'Harga × volume, dalam rupiah. Ukuran likuiditas: makin besar, makin mudah beli/jual tanpa menggeser harga.' },

  // ── Rencana trading ──
  entry:     { istilah: 'Entry', kategori: 'Rencana trading', arti: 'Rentang harga yang disarankan untuk mulai membeli. Di atas zona ini = jangan dikejar, tunggu turun.' },
  stop:      { istilah: 'Stop-loss', kategori: 'Rencana trading', arti: 'Harga batas rugi. Kalau tersentuh, jual — supaya rugi kecil tidak jadi rugi besar.' },
  target:    { istilah: 'Target / TP', kategori: 'Rencana trading', arti: 'Take Profit — harga tujuan untuk ambil untung. TP1 = target pertama (terdekat).' },
  rr:        { istilah: 'R:R (risk-reward)', kategori: 'Rencana trading', arti: 'Perbandingan potensi rugi (ke stop) dan potensi untung (ke target). 1:3 = risiko Rp1 untuk peluang untung Rp3. Umumnya cari minimal 1:2.' },
  winrate:   { istilah: 'Kena target (win rate)', kategori: 'Rencana trading', arti: 'Dari kasus historis yang mirip, berapa persen yang menyentuh target sebelum stop dalam 20 hari bursa. Ini data nyata, bukan ramalan.' },
  avgpnl:    { istilah: 'Rata-rata hasil per trade', kategori: 'Rencana trading', arti: 'Rata-rata untung/rugi (%) dari semua kasus historis serupa. Lebih penting dari win rate: win rate tinggi tapi rata-rata minus tetap rugi.' },
  sampel:    { istilah: 'Sampel (n)', kategori: 'Rencana trading', arti: 'Jumlah kasus historis yang dihitung. Di bawah 30 = angka belum bisa dipercaya.' },
  cutloss:   { istilah: 'Cut loss', kategori: 'Rencana trading', arti: 'Menjual saham yang sedang rugi untuk menghentikan kerugian, biasanya saat stop-loss tersentuh.' },
  avgdown:   { istilah: 'Average down', kategori: 'Rencana trading', arti: 'Membeli lagi saat harga turun supaya harga rata-rata lebih murah. Berbahaya kalau trennya memang turun.' },
  lot:       { istilah: 'Lot', kategori: 'Rencana trading', arti: 'Satuan beli saham di BEI: 1 lot = 100 lembar.' },

  // ── Tren & struktur ──
  trend:     { istilah: 'Tren', kategori: 'Tren & struktur', arti: 'Arah umum harga: Bullish = naik, Bearish = turun, Sideways = mendatar. Dilihat jangka pendek, menengah, dan panjang.' },
  bullish:   { istilah: 'Bullish / Bearish', kategori: 'Tren & struktur', arti: 'Bullish = cenderung naik (banteng menyeruduk ke atas). Bearish = cenderung turun (beruang mencakar ke bawah).' },
  hhhl:      { istilah: 'HH + HL', kategori: 'Tren & struktur', arti: 'Higher High + Higher Low — puncak dan lembah harga makin tinggi. Tanda tren naik yang sehat.' },
  lhll:      { istilah: 'LH + LL', kategori: 'Tren & struktur', arti: 'Lower High + Lower Low — puncak dan lembah harga makin rendah. Tanda tren turun.' },
  support:   { istilah: 'Support / Resistance', kategori: 'Tren & struktur', arti: 'Support = area harga yang sering menahan penurunan (lantai). Resistance = area yang sering menahan kenaikan (atap).' },
  breakout:  { istilah: 'Breakout', kategori: 'Tren & struktur', arti: 'Harga menembus resistance (atau support, untuk breakdown) — sering diikuti gerak lanjutan kalau volumenya besar.' },
  konfluensi:{ istilah: 'Konfluensi', kategori: 'Tren & struktur', arti: 'Beberapa sinyal berbeda menunjuk arah yang sama. Makin banyak yang sepakat, makin kuat sinyalnya.' },
  fvg:       { istilah: 'FVG (Fair Value Gap)', kategori: 'Tren & struktur', arti: 'Celah harga yang terbentuk saat harga bergerak sangat cepat. Harga sering kembali "mengisi" celah ini.' },
  amd:       { istilah: 'AMD (Akumulasi–Manipulasi–Distribusi)', kategori: 'Tren & struktur', arti: 'Siklus pemain besar: diam-diam mengumpulkan (akumulasi), menggoyang harga (manipulasi), lalu menjual ke publik (distribusi).' },

  // ── Indikator ──
  rsi:       { istilah: 'RSI', kategori: 'Indikator', arti: 'Relative Strength Index, skala 0–100. Di atas 70 = sudah naik terlalu kencang (jenuh beli); di bawah 30 = turun terlalu dalam (jenuh jual).' },
  macd:      { istilah: 'MACD', kategori: 'Indikator', arti: 'Selisih dua EMA untuk melihat momentum. Garis MACD memotong ke atas garis sinyal = momentum mulai naik.' },
  bollinger: { istilah: 'Bollinger Bands', kategori: 'Indikator', arti: 'Pita di atas & bawah rata-rata harga. Pita menyempit = pasar tenang, sering menjelang gerak besar.' },
  stochastic:{ istilah: 'Stochastic', kategori: 'Indikator', arti: 'Mirip RSI: posisi harga penutupan dibanding rentang harga beberapa hari terakhir. >80 jenuh beli, <20 jenuh jual.' },
  atr:       { istilah: 'ATR', kategori: 'Indikator', arti: 'Average True Range — rata-rata besar gerak harian. Dipakai untuk menaruh stop-loss yang tidak terlalu mepet.' },
  adx:       { istilah: 'ADX', kategori: 'Indikator', arti: 'Kekuatan tren (bukan arahnya). Di atas 25 = tren kuat; di bawah 20 = pasar tanpa arah.' },
  obv:       { istilah: 'OBV', kategori: 'Indikator', arti: 'On-Balance Volume — menjumlahkan volume hari naik dan mengurangi volume hari turun. Naik terus = uang masuk.' },
  vwap:      { istilah: 'VWAP', kategori: 'Indikator', arti: 'Harga rata-rata tertimbang volume. Harga di atas VWAP = pembeli dominan.' },
  ichimoku:  { istilah: 'Ichimoku', kategori: 'Indikator', arti: 'Indikator Jepang lengkap. "Awan" (kumo) jadi area support/resistance; harga di atas awan = tren naik.' },
  fibonacci: { istilah: 'Fibonacci', kategori: 'Indikator', arti: 'Level-level persentase (38,2%, 50%, 61,8%) dari gerak terakhir, tempat harga sering berhenti saat koreksi.' },
  mfi:       { istilah: 'MFI / CMF', kategori: 'Indikator', arti: 'Indikator aliran uang (harga + volume). Positif/tinggi = uang masuk ke saham itu.' },

  // ── Pasar IDX ──
  asing:     { istilah: 'Net buy / net sell asing', kategori: 'Pasar IDX', arti: 'Selisih beli dan jual investor asing. Net sell besar beberapa hari sering menekan IHSG.' },
  bandar:    { istilah: 'Bandarmologi', kategori: 'Pasar IDX', arti: 'Membaca jejak broker besar ("bandar") dari data transaksi per broker — sedang mengumpulkan atau membuang barang.' },
  syariah:   { istilah: 'Saham syariah (ISSI)', kategori: 'Pasar IDX', arti: 'Saham yang masuk Daftar Efek Syariah OJK — usaha & utangnya memenuhi prinsip syariah.' },
  araarb:    { istilah: 'ARA / ARB', kategori: 'Pasar IDX', arti: 'Auto Rejection Atas/Bawah — batas naik/turun maksimal harian dari bursa. Saham kena ARB tidak bisa turun lebih jauh hari itu.' },
  uma:       { istilah: 'UMA', kategori: 'Pasar IDX', arti: 'Unusual Market Activity — peringatan bursa karena harga/volume bergerak tidak wajar. Bisa diikuti suspensi.' },
  suspensi:  { istilah: 'Suspensi', kategori: 'Pasar IDX', arti: 'Perdagangan saham dihentikan sementara oleh bursa. Selama suspensi, saham tidak bisa dijual.' },
  dividen:   { istilah: 'Dividen', kategori: 'Pasar IDX', arti: 'Bagian laba perusahaan yang dibagikan ke pemegang saham. Harga biasanya turun kira-kira sebesar dividen pada hari ex-date (hari pertama tanpa hak dividen).' },
}

export const tip = (k) => GLOSSARY[k]?.arti
