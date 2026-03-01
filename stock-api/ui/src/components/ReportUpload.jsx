import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export default function ReportUpload({ symbol, showToast }) {
  const [reports, setReports]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const fileInputRef = useRef(null)

  const loadReports = async () => {
    setLoading(true)
    try {
      const data = await api.stocks.listReports(symbol)
      setReports(Array.isArray(data) ? data : [])
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReports() }, [symbol])

  const handleUpload = async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Hanya file PDF yang diizinkan', 'error')
      return
    }
    setUploading(true)
    try {
      const meta = await api.stocks.uploadReport(symbol, file)
      setReports(prev => [...prev, meta])
      showToast(`✓ ${meta.filename} berhasil diunggah`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (report) => {
    if (!confirm(`Hapus laporan "${report.filename}"?`)) return
    try {
      await api.stocks.deleteReport(symbol, report.id)
      setReports(prev => prev.filter(r => r.id !== report.id))
      showToast(`✓ ${report.filename} dihapus`)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-tv-text mb-1">📄 Laporan Keuangan</h2>
        <p className="text-[12px] text-tv-muted">
          Upload laporan keuangan PDF (LK Tahunan, LK Triwulan, Prospektus). Data akan digunakan
          AI untuk memperkaya analisa fundamental.
        </p>
      </div>

      {/* ── Upload zone ────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed
          cursor-pointer transition-all select-none
          ${dragOver
            ? 'border-tv-blue bg-tv-blue/10 scale-[1.01]'
            : 'border-tv-border hover:border-tv-blue/50 hover:bg-tv-blue/5'
          }
          ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {uploading ? (
          <>
            <div className="w-8 h-8 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
            <span className="text-sm text-tv-muted">Mengunggah...</span>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-tv-blue/10 border border-tv-blue/20 flex items-center justify-center text-2xl">
              📄
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-tv-text">
                {dragOver ? 'Lepaskan file di sini' : 'Drag & drop PDF atau klik untuk memilih'}
              </p>
              <p className="text-[11px] text-tv-muted mt-0.5">Hanya file .pdf · Maks. 32 MB per file</p>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files?.[0])}
        />
      </div>

      {/* ── Report list ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold text-tv-muted uppercase tracking-wider">
            Laporan Tersimpan
          </span>
          {reports.length > 0 && (
            <span className="text-[11px] text-tv-muted">
              {reports.length} file · AI akan membaca semua laporan saat generate analisa
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-tv-muted text-sm">
            <div className="w-4 h-4 border border-tv-border border-t-tv-blue rounded-full animate-spin" />
            Memuat laporan...
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-tv-muted">
            <span className="text-3xl opacity-30">📭</span>
            <span className="text-sm">Belum ada laporan keuangan untuk {symbol}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-tv-card border border-tv-border
                  hover:border-tv-border/80 transition-colors group"
              >
                {/* PDF icon */}
                <div className="w-8 h-8 rounded bg-tv-red/10 border border-tv-red/20 flex items-center justify-center text-xs font-bold text-tv-red flex-shrink-0">
                  PDF
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-tv-text truncate">{r.filename}</p>
                  <p className="text-[11px] text-tv-muted">
                    {formatBytes(r.size_bytes)} · {formatDate(r.uploaded_at)}
                  </p>
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(r)}
                  className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs text-tv-muted hover:text-tv-red
                    hover:bg-tv-red/10 rounded transition-all"
                  title="Hapus laporan"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Info box ───────────────────────────────────────────────────── */}
      {reports.length > 0 && (
        <div className="flex gap-3 p-4 rounded-lg bg-tv-purple/5 border border-tv-purple/20">
          <span className="text-tv-purple mt-0.5 flex-shrink-0">✦</span>
          <p className="text-[12px] text-tv-muted leading-relaxed">
            AI Analisa untuk <strong className="text-tv-text">{symbol}</strong> akan otomatis membaca
            laporan-laporan di atas dan menambahkan seksi <em>Fundamental</em> pada hasilnya.
            Klik <strong className="text-tv-purple">✦ AI Analisa</strong> di header untuk mencoba.
          </p>
        </div>
      )}
    </div>
  )
}
