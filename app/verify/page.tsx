'use client'
// app/verify/page.tsx — Public Merkle root verification (no auth)

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Shield, CheckCircle, XCircle, Loader, Search } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
                 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

interface VerifyResult {
  ok: boolean
  verified: boolean
  tenant_id?: string
  report_id?: string
  records?: number
  incidents?: number
  generated_at?: string
  merkle_root: string
  message?: string
}

function VerifyInner() {
  const params = useSearchParams()
  const initial = (params?.get('merkle') || '').toLowerCase()
  const [merkle, setMerkle] = useState(initial)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function check(m: string) {
    if (!m || m.length < 32) {
      setErr('Merkle root must be at least 32 hex characters')
      setResult(null)
      return
    }
    setLoading(true); setErr(null); setResult(null)
    try {
      const r = await fetch(`${API_BASE}/api/verify/${encodeURIComponent(m.toLowerCase())}`)
      const data: VerifyResult = await r.json()
      setResult(data)
      if (!r.ok && r.status !== 404) setErr(`HTTP ${r.status}`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initial && initial.length >= 32) check(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  return (
    <div className="min-h-screen bg-gw-dark text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">

        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-8 h-8 text-gw-green" />
          <div>
            <h1 className="text-2xl font-bold">GridWitness · Public Verification</h1>
            <p className="text-sm text-gw-muted">
              Verify any Merkle root from a GridWitness compliance report
            </p>
          </div>
        </div>

        <div className="bg-gw-panel border border-gw-border rounded-xl p-6">
          <label className="block text-xs uppercase tracking-wider text-gw-muted mb-2">
            Merkle Root (64 hex chars)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={merkle}
              onChange={e => setMerkle(e.target.value.trim())}
              onKeyDown={e => { if (e.key === 'Enter') check(merkle) }}
              placeholder="a3f9c2e1..."
              className="flex-1 bg-gw-dark border border-gw-border rounded px-3 py-2 font-mono text-sm focus:border-gw-green focus:outline-none"
            />
            <button
              onClick={() => check(merkle)}
              disabled={loading}
              className="flex items-center gap-2 bg-gw-green text-gw-dark px-5 py-2 rounded font-medium disabled:opacity-50"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Verify
            </button>
          </div>
          {err && (
            <div className="mt-3 text-sm text-red-400">{err}</div>
          )}
        </div>

        {result && (
          <div className={`rounded-xl border p-6 ${
            result.verified
              ? 'bg-gw-green/10 border-gw-green/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {result.verified ? (
                <>
                  <CheckCircle className="w-8 h-8 text-gw-green" />
                  <div>
                    <div className="text-xl font-bold text-gw-green">VERIFIED</div>
                    <div className="text-sm text-gw-muted">
                      Cryptographic chain of custody is intact
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-8 h-8 text-red-400" />
                  <div>
                    <div className="text-xl font-bold text-red-400">NOT FOUND</div>
                    <div className="text-sm text-gw-muted">
                      {result.message || 'No report matches this Merkle root'}
                    </div>
                  </div>
                </>
              )}
            </div>

            {result.verified && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gw-border/40">
                  <tr>
                    <td className="py-2 text-gw-muted w-1/3">Tenant ID</td>
                    <td className="py-2 font-mono">{result.tenant_id}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gw-muted">Report ID</td>
                    <td className="py-2 font-mono">{result.report_id}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gw-muted">Records Sealed</td>
                    <td className="py-2 font-mono">{result.records?.toLocaleString() || 0}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gw-muted">Incidents</td>
                    <td className="py-2 font-mono">{result.incidents ?? 0}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gw-muted">Generated</td>
                    <td className="py-2 font-mono">
                      {result.generated_at
                        ? new Date(result.generated_at).toLocaleString('en-CA', { hour12: false })
                        : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gw-muted">Merkle Root</td>
                    <td className="py-2 font-mono text-xs break-all">{result.merkle_root}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="bg-gw-panel border border-gw-border rounded-xl p-5 text-sm text-gw-muted">
          <h3 className="text-white font-semibold mb-2">How verification works</h3>
          <p>
            Every GridWitness compliance report contains a Merkle root — a single
            SHA-256 hash that chains together every WORM-sealed telemetry record
            in the report. The root cannot be regenerated without the original
            records in their original order. If the root from your PDF matches the
            one stored at AWS S3 (with Object Lock COMPLIANCE retention), the
            data is provably unmodified since the moment it was sealed.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gw-dark text-white flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-gw-green" />
      </div>
    }>
      <VerifyInner />
    </Suspense>
  )
}
