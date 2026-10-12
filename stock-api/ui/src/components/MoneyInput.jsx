// Input nominal rupiah dengan separator Indonesia: titik ribuan, koma desimal.
// `value` / `onChange` tetap memakai string angka JS biasa ("10000000", "615.02"),
// jadi pemanggil cukup Number(value) seperti sebelumnya.
//
// ponytail: separator disisipkan ulang tiap ketikan, jadi kursor lompat ke akhir
// kalau mengedit di tengah angka. Simpan posisi kursor kalau ini mengganggu.

// "615.02" → "615,02" ; "10000000" → "10.000.000" ; "615." → "615," (sedang mengetik)
export const formatId = (raw) => {
  const [int, frac] = String(raw ?? '').split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return frac === undefined ? grouped : `${grouped},${frac}`
}

// "1.487,17" → "1487.17" ; desimal dibuang kalau decimals=false
export const parseId = (text, decimals) => {
  const s = text.replace(/\./g, '').replace(/[^\d,]/g, '')
  const i = s.indexOf(',')
  if (i < 0) return s
  return decimals ? `${s.slice(0, i)}.${s.slice(i + 1).replace(/,/g, '').slice(0, 2)}` : s.slice(0, i)
}

export default function MoneyInput({ value, onChange, decimals = false, ...rest }) {
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      value={formatId(value)}
      onChange={e => onChange(parseId(e.target.value, decimals))}
    />
  )
}
