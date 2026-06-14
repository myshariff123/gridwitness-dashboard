'use client'

import { useEffect, useState } from 'react'
import { Shield, CheckCircle, Clock, AlertCircle, Lock } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

interface Attestation {
  AttestationID:   string
  TenantID:        string
  ReportType:      string
  ReportID:        string
  AttesterEmail:   string
  AttesterName:    string
  AttesterTitle:   string
  OrgName:         string
  Summary:         string
  Status:          string
  RequestedAt:     string
  SealHash?:       string
  SealedAt?:       string
}

export default function AttestPage() {
  const [token, setToken]             = useState<string>('')
  const [attest, setAttest]           = useState<Attestation | null>(null)
  const [alreadySealed, setAlreadySealed] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [sealing, setSealing]         = useState(false)
  const [sealed, setSealed]           = useState<{hash: string; at: string} | null>(null)
  const [err, setErr]                 = useState<string>('')
  const [confirmed, setConfirmed]     = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = new URLSearchParams(window.location.search).get('token') || ''
    setToken(t)
    if (!t) { setErr('No attestation token provided.'); setLoading(false); return }
    fetch(`${API_BASE}/api/attestations/${t}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErr(data.error); return }
        setAttest(data.attestation)
        setAlreadySealed(data.already_sealed)
        if (data.already_sealed && data.attestation?.SealHash) {
          setSealed({ hash: data.attestation.SealHash, at: data.attestation.SealedAt || '' })
        }
      })
      .catch(() => setErr('Unable to load attestation. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSeal = async () => {
    if (!token || !confirmed) return
    setSealing(true)
    setErr('')
    try {
      const r = await fetch(`${API_BASE}/api/attestations/${token}/seal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      })
      const data = await r.json()
      if (!r.ok || data.error) { setErr(data.error || 'Seal failed.'); return }
      setSealed({ hash: data.seal_hash, at: data.sealed_at })
      if (attest) setAttest({ ...attest, Status: 'SEALED' })
    } catch {
      setErr('Network error. Please try again.')
    } finally {
      setSealing(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gw-dark flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-gw-green border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gw-dark flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <div className="flex items-center gap-3 mb-10">
        <Shield className="w-8 h-8 text-gw-green" />
        <div>
          <div className="text-xl font-bold text-white">GridWitness</div>
          <div className="text-xs text-gw-muted">Regulatory Compliance Platform</div>
        </div>
      </div>

      <div className="w-full max-w-lg">

        {/* Error state */}
        {err && !attest && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 font-medium">{err}</p>
            <p className="text-gw-muted text-sm mt-2">
              This link may have expired or is invalid. Contact your compliance team.
            </p>
          </div>
        )}

        {/* Attestation card */}
        {attest && !sealed && !alreadySealed && (
          <div className="bg-gw-panel border border-gw-border rounded-xl overflow-hidden">
            {/* Top band */}
            <div className="bg-gw-green/10 border-b border-gw-border px-6 py-4 flex items-center gap-3">
              <Clock className="w-5 h-5 text-gw-green" />
              <div>
                <div className="text-sm font-semibold text-white">Board Attestation Request</div>
                <div className="text-xs text-gw-muted">{attest.AttestationID}</div>
              </div>
              <span className="ml-auto text-xs font-mono bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded">
                PENDING
              </span>
            </div>

            <div className="px-6 py-5 space-y-4">
              <Row label="Organization"  value={attest.OrgName} />
              <Row label="Report Type"   value={attest.ReportType} />
              {attest.ReportID && <Row label="Report ID" value={attest.ReportID} />}
              <Row label="Attester"      value={`${attest.AttesterName}${attest.AttesterTitle ? ` — ${attest.AttesterTitle}` : ''}`} />
              <Row label="Requested"     value={new Date(attest.RequestedAt).toLocaleString()} />
              {attest.Summary && (
                <div>
                  <div className="text-xs text-gw-muted uppercase tracking-wide mb-1">Summary</div>
                  <p className="text-sm text-gw-text leading-relaxed">{attest.Summary}</p>
                </div>
              )}
            </div>

            {/* Legal notice */}
            <div className="mx-6 mb-5 bg-gw-dark/60 border border-gw-border rounded-lg p-4 text-xs text-gw-muted leading-relaxed">
              By clicking <strong className="text-white">I Attest</strong>, you confirm that the information
              contained in the {attest.ReportType} disclosure is, to the best of your knowledge, accurate and
              complete. A cryptographic seal (SHA-256) will be generated and stored immutably under
              AWS S3 Object Lock COMPLIANCE mode with 7-year retention, satisfying OSFI Guideline B-15
              §5.3 governance requirements. This action cannot be undone.
            </div>

            {/* Confirm checkbox */}
            <div className="px-6 pb-4 flex items-start gap-3">
              <input
                id="confirm"
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-gw-green w-4 h-4"
              />
              <label htmlFor="confirm" className="text-sm text-gw-text cursor-pointer">
                I have reviewed the disclosure and confirm the information is accurate.
              </label>
            </div>

            {err && (
              <div className="mx-6 mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                {err}
              </div>
            )}

            {/* Action */}
            <div className="px-6 pb-6">
              <button
                onClick={handleSeal}
                disabled={!confirmed || sealing}
                className="w-full py-3 rounded-lg font-semibold text-sm transition-all
                  bg-gw-green text-black hover:bg-gw-green/90
                  disabled:opacity-40 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {sealing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Generating Seal…
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    I Attest
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Success — freshly sealed */}
        {sealed && (
          <div className="bg-gw-panel border border-gw-green/30 rounded-xl overflow-hidden">
            <div className="bg-gw-green/10 border-b border-gw-green/20 px-6 py-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-gw-green" />
              <div>
                <div className="text-sm font-semibold text-white">Attestation Sealed</div>
                <div className="text-xs text-gw-muted">Cryptographic seal recorded</div>
              </div>
              <span className="ml-auto text-xs font-mono bg-gw-green/20 text-gw-green border border-gw-green/30 px-2 py-0.5 rounded">
                SEALED
              </span>
            </div>
            <div className="px-6 py-6 space-y-4">
              {attest && (
                <>
                  <Row label="Organization"  value={attest.OrgName} />
                  <Row label="Report Type"   value={attest.ReportType} />
                  <Row label="Attester"      value={attest.AttesterName} />
                  <Row label="Sealed At"     value={new Date(sealed.at).toLocaleString()} />
                </>
              )}
              <div>
                <div className="text-xs text-gw-muted uppercase tracking-wide mb-1">Seal Hash (SHA-256)</div>
                <div className="font-mono text-xs text-gw-green bg-gw-dark rounded px-3 py-2 break-all">
                  {sealed.hash}
                </div>
              </div>
              <div className="text-xs text-gw-muted bg-gw-dark/60 border border-gw-border rounded-lg p-3 leading-relaxed">
                This seal is stored in the GridWitness compliance vault under AWS S3 Object Lock
                (COMPLIANCE mode, 7-year retention). It cannot be modified or deleted. Retain this
                hash as proof of attestation for regulatory filings.
              </div>
            </div>
          </div>
        )}

        {/* Already sealed */}
        {alreadySealed && attest && !sealed && (
          <div className="bg-gw-panel border border-gw-border rounded-xl overflow-hidden">
            <div className="bg-gw-dark border-b border-gw-border px-6 py-4 flex items-center gap-3">
              <Lock className="w-5 h-5 text-gw-muted" />
              <div>
                <div className="text-sm font-semibold text-white">Already Sealed</div>
                <div className="text-xs text-gw-muted">{attest.AttestationID}</div>
              </div>
              <span className="ml-auto text-xs font-mono bg-gw-green/20 text-gw-green border border-gw-green/30 px-2 py-0.5 rounded">
                SEALED
              </span>
            </div>
            <div className="px-6 py-5 space-y-3">
              <Row label="Organization"  value={attest.OrgName} />
              <Row label="Report Type"   value={attest.ReportType} />
              <Row label="Attester"      value={attest.AttesterName} />
              {attest.SealedAt && <Row label="Sealed At" value={new Date(attest.SealedAt).toLocaleString()} />}
              {attest.SealHash && (
                <div>
                  <div className="text-xs text-gw-muted uppercase tracking-wide mb-1">Seal Hash (SHA-256)</div>
                  <div className="font-mono text-xs text-gw-green bg-gw-dark rounded px-3 py-2 break-all">
                    {attest.SealHash}
                  </div>
                </div>
              )}
              <p className="text-xs text-gw-muted pt-1">
                This attestation has already been sealed and is immutably recorded.
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gw-muted mt-8">
          GridWitness · Regulatory Compliance Platform · OSFI B-15 / TCFD / IFRS S2
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gw-muted uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm text-white">{value || '—'}</div>
    </div>
  )
}
