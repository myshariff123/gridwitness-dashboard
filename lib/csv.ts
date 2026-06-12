// lib/csv.ts — Client-side CSV export
// Pure browser code. No backend changes.

export function toCsv<T extends object>(
  rows: T[],
  columns: Array<{ key: keyof T; label: string }>,
): string {
  const header = columns.map(c => csvEscape(c.label)).join(',')
  const body = rows.map(r =>
    columns.map(c => csvEscape(formatCell(r[c.key]))).join(',')
  ).join('\n')
  return header + '\n' + body
}

function formatCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v instanceof Date) return v.toISOString()
  try { return JSON.stringify(v) } catch { return String(v) }
}

function csvEscape(s: string): string {
  if (s == null) return ''
  const needsQuoting = /[",\n\r]/.test(s)
  if (!needsQuoting) return s
  return '"' + s.replace(/"/g, '""') + '"'
}

export function downloadCsv(filename: string, csvContent: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Convenience: build a default filename with tenant + timestamp
export function tsFilename(prefix: string, tenantId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  return `${prefix}_${tenantId}_${stamp}.csv`
}
