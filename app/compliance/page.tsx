'use client'
// app/compliance/page.tsx — Compliance report generation + download
// Drop-in replacement. Uses lib/api.ts for envelope-aware fetching.

import { useEffect, useState, useCallback } from 'react'
import Nav from '@/components/Nav'
import {
  FileText, Loader, CheckCircle, AlertCircle,
  Download, RefreshCw, Shield, Calendar, Lock, Send,
} from 'lucide-react'
import {
  generateReport, getLatestReport,
} from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

const FRAMEWORKS = [
  { id: 'OSFI_B15',  label: 'OSFI Guideline B-15',  required: true,  desc: 'Climate Risk Management' },
  { id: 'BILL_C59',  label: 'Bill C-59 (Canada)',   required: true,  desc: 'Anti-Greenwashing' },
  { id: 'ISO_14064', label: 'ISO 14064-1',          required: false, desc: 'GHG Quantification' },
  { id: 'GHG_PROTO', label: 'GHG Protocol',         required: false, desc: 'Scope 2 + Scope 3 Cat.11' },
]

type Status = 'idle' | 'queueing' | 'queued' | 'polling' | 'ready' | 'error'

export default function CompliancePage() {
  const [tenantId, setTenantId]       = useState('GW-NIMBL-AEB47A92')
  const [dateFrom, setDateFrom]       = useState(defaultFrom())
  const [dateTo, setDateTo]           = useState(defaultTo())
  const [selected, setSelected]       = useState<string[]>(['OSFI_B15', 'BILL_C59', 'ISO_14064', 'GHG_PROTO'])
  const [status, setStatus]           = useState<Status>('idle')
  const [errMsg, setErrMsg]           = useState<string | null>(null)
  const [reportId, setReportId]       = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [pollTick, setPollTick]       = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URLSearchParams(window.location.search)
    setTenantId(url.get('tenant_id') ||
                window.localStorage.getItem('gw_tenant_id') ||
                'GW-NIMBL-AEB47A92')
    // Store prefill params for BoardAttestationSection
    if (url.get('report_type')) {
      window.sessionStorage.setItem('gw_attest_prefill_type', url.get('report_type') || '')
    }
  }, [])

  // Load latest report on mount
  const loadLatest = useCallback(async () => {
    try {
      const data = await getLatestReport(tenantId)
      if (data?.download_url) {
        setDownloadUrl(data.download_url)
        setReportId(data.report_id || null)
      }
    } catch (e) {
      console.error('Latest report fetch failed:', e)
    }
  }, [tenantId])

  useEffect(() => { loadLatest() }, [loadLatest])

  // Polling effect — while status is 'polling', re-check every 5s
  useEffect(() => {
    if (status !== 'polling') return
    const interval = setInterval(async () => {
      setPollTick(t => t + 1)
      try {
        const data = await getLatestReport(tenantId)
        if (data?.download_url && data.report_id !== reportId) {
          // We got a new report, different from the one we had before
          setDownloadUrl(data.download_url)
          setReportId(data.report_id || null)
          setStatus('ready')
        } else if (data?.download_url && pollTick > 8) {
          // 40 seconds passed; might have been an existing report. Take what we got.
          setDownloadUrl(data.download_url)
          setReportId(data.report_id || null)
          setStatus('ready')
        }
      } catch (e) {
        console.error('Poll error:', e)
      }
      if (pollTick > 24) {  // 2 minutes timeout
        setStatus('error')
        setErrMsg('Report generation timed out. Check the compliance vault directly.')
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [status, pollTick, tenantId, reportId])

  function toggleFramework(id: string) {
    const fw = FRAMEWORKS.find(f => f.id === id)
    if (fw?.required) return  // can't deselect required
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function handleGenerate() {
    setStatus('queueing'); setErrMsg(null); setPollTick(0)
    const prevReportId = reportId
    try {
      const result = await generateReport(tenantId, dateFrom, dateTo, selected)
      if (result.download_url) {
        // Lambda returned synchronously with a pre-signed URL — no polling needed
        setDownloadUrl(result.download_url)
        setReportId(result.report_id || null)
        setStatus('ready')
      } else {
        // Async path — fall back to polling
        setStatus('polling')
        setReportId(prevReportId)
      }
    } catch (e: unknown) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Failed to generate report. Please try again.')
    }
  }

  function downloadReport() {
    if (!downloadUrl) return
    window.open(downloadUrl, '_blank', 'noopener')
  }

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-gw-green" />
            Compliance Reports
          </h1>
          <p className="text-sm text-gw-muted mt-1">
            Generate hardware-anchored, WORM-sealed PDF reports for regulators and auditors.
          </p>
        </div>

        {/* Period selector */}
        <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
          <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-gw-green" />
            Report Period
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm text-white focus:border-gw-green focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm text-white focus:border-gw-green focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* Frameworks */}
        <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Compliance Frameworks</h2>
          <div className="space-y-2">
            {FRAMEWORKS.map(fw => {
              const isSelected = selected.includes(fw.id)
              return (
                <button
                  key={fw.id}
                  onClick={() => toggleFramework(fw.id)}
                  disabled={fw.required}
                  className={`w-full flex items-center justify-between p-3 rounded border transition-colors text-left ${
                    isSelected
                      ? 'bg-gw-green/10 border-gw-green/30'
                      : 'bg-gw-dark border-gw-border hover:border-gw-border/80'
                  } ${fw.required ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      isSelected ? 'bg-gw-green border-gw-green' : 'border-gw-border'
                    }`}>
                      {isSelected && <CheckCircle className="w-3 h-3 text-gw-dark" />}
                    </div>
                    <div>
                      <div className={`text-sm font-medium ${isSelected ? 'text-gw-green' : 'text-white'}`}>
                        {fw.label}
                      </div>
                      <div className="text-xs text-gw-muted">{fw.desc}</div>
                    </div>
                  </div>
                  {fw.required && (
                    <span className="text-xs px-2 py-0.5 bg-gw-green/20 text-gw-green rounded">Required</span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* Generate */}
        <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm text-white font-medium">Generate OSFI B-15 Compliance PDF</div>
              <div className="text-xs text-gw-muted mt-1">
                Cryptographically sealed · 7-year retention · Independently verifiable
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={status === 'queueing' || status === 'polling' || selected.length === 0}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
                status === 'queueing' || status === 'polling'
                  ? 'bg-gw-border text-gw-muted cursor-wait'
                  : 'bg-gw-green text-gw-dark hover:bg-gw-green/90'
              }`}
            >
              {(status === 'queueing' || status === 'polling') ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  {status === 'queueing' ? 'Generating PDF…' : `Polling… (${pollTick * 5}s)`}
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate Report
                </>
              )}
            </button>
          </div>

          {status === 'error' && errMsg && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-red-400 font-medium">Failed</div>
                <div className="text-xs text-red-400/80 mt-1">{errMsg}</div>
                <div className="text-xs text-gw-muted mt-2">
                  If this is persistent, open the browser DevTools Console for the underlying error.
                </div>
              </div>
            </div>
          )}

          {(status === 'polling' || status === 'queued') && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded text-sm">
              <Loader className="w-4 h-4 text-blue-400 animate-spin" />
              <div className="text-blue-400">
                Generating PDF report — this typically takes 60–90 seconds.
                The report will be WORM-sealed and a download link will appear when ready.
              </div>
            </div>
          )}
        </section>

        {/* Latest report */}
        {downloadUrl && (
          <section className="bg-gw-panel border border-gw-green/30 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-gw-green flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Latest Report Available</div>
                  <div className="text-xs text-gw-muted font-mono mt-0.5">{reportId || ''}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadLatest}
                  className="flex items-center gap-1 border border-gw-border text-gw-muted px-3 py-2 rounded text-sm hover:border-gw-green hover:text-gw-green"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
                <button
                  onClick={downloadReport}
                  className="flex items-center gap-2 bg-gw-green text-gw-dark px-4 py-2 rounded font-medium hover:bg-gw-green/90"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Board Attestation */}
        <BoardAttestationSection tenantId={tenantId} />

        {/* Help */}
        <section className="bg-gw-panel border border-gw-border rounded-xl p-5 text-sm text-gw-muted">
          <h3 className="text-white font-semibold mb-2">About the Report</h3>
          <ul className="space-y-1.5 text-xs">
            <li>• Every telemetry record is SHA-256 hashed and linked in an immutable Merkle chain</li>
            <li>• The full chain root appears on the cover page — verifiable at <a href="/verify" className="text-gw-green hover:underline">/verify</a></li>
            <li>• PDFs are stored in AWS S3 with Object Lock COMPLIANCE for 7 years (OSFI B-15 Sec.5.3)</li>
            <li>• Board attestation seal (SHA-256) is stored separately under Object Lock COMPLIANCE</li>
            <li>• Data residency: AWS ca-central-1 (Montreal) — Canadian sovereign region</li>
            <li>• Encryption: AES-256 at rest, TLS 1.3 in transit</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

// ── Board Attestation Section ─────────────────────────────────────────────────
interface AttestRecord {
  AttestationID: string; ReportType: string; ReportID?: string
  AttesterName: string; AttesterEmail: string; AttesterTitle?: string
  Status: string; RequestedAt: string; SealHash?: string; AttestationLink?: string
}

function BoardAttestationSection({ tenantId }: { tenantId: string }) {
  const [list, setList]           = useState<AttestRecord[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [result, setResult]       = useState<{ link: string; id: string; emailSent: boolean } | null>(null)
  const [copied, setCopied]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]             = useState('')

  const [form, setForm] = useState({
    attester_email: '', attester_name: '', attester_title: '',
    report_type: 'OSFI B-15', report_id: '', summary: '',
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefill = window.sessionStorage.getItem('gw_attest_prefill_type')
    if (prefill) {
      setForm(f => ({ ...f, report_type: prefill }))
      setShowForm(true)
      window.sessionStorage.removeItem('gw_attest_prefill_type')
    }
  }, [])

  const REPORT_TYPES = ['OSFI B-15','TCFD','IFRS S2','GHG Protocol','ISO 14064','Annual ESG']

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/attestations`)
      if (r.ok) { const d = await r.json(); setList(d.attestations || []) }
    } catch {}
    finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function request(e: React.FormEvent) {
    e.preventDefault()
    if (!form.attester_email) { setErr('Attester email required'); return }
    setSubmitting(true); setErr('')
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/attestations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setResult({ link: d.attestation_link, id: d.attestation_id, emailSent: d.email_sent })
      setForm({ attester_email: '', attester_name: '', attester_title: '', report_type: 'OSFI B-15', report_id: '', summary: '' })
      load()
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Request failed') }
    finally { setSubmitting(false) }
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Lock className="w-4 h-4 text-gw-green" />
            Board Attestation
          </h2>
          <p className="text-sm text-gw-muted mt-1">
            OSFI B-15 §5.3 governance sign-off. Board member clicks a link → cryptographic SHA-256 seal stored in the compliance vault.
          </p>
        </div>
        <button onClick={() => { setShowForm(s => !s); setResult(null); setErr('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gw-green text-gw-dark rounded text-sm font-medium hover:bg-gw-green/90">
          <Send className="w-3.5 h-3.5" /> Request Attestation
        </button>
      </div>

      {/* Request form */}
      {showForm && !result && (
        <form onSubmit={request} className="bg-gw-dark border border-gw-border rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-white mb-2">New Attestation Request</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gw-muted block mb-1">Attester Email *</label>
              <input type="email" required value={form.attester_email}
                onChange={e => setForm(f => ({ ...f, attester_email: e.target.value }))}
                placeholder="board.member@company.com"
                className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gw-muted block mb-1">Name</label>
              <input type="text" value={form.attester_name}
                onChange={e => setForm(f => ({ ...f, attester_name: e.target.value }))}
                placeholder="Full name"
                className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gw-muted block mb-1">Title</label>
              <input type="text" value={form.attester_title}
                onChange={e => setForm(f => ({ ...f, attester_title: e.target.value }))}
                placeholder="e.g. Chair, Audit Committee"
                className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gw-muted block mb-1">Report Type</label>
              <select value={form.report_type} onChange={e => setForm(f => ({ ...f, report_type: e.target.value }))}
                className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none">
                {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gw-muted block mb-1">Report ID (optional)</label>
            <input type="text" value={form.report_id}
              onChange={e => setForm(f => ({ ...f, report_id: e.target.value }))}
              placeholder="e.g. RPT-OSFI-2025-001"
              className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-gw-muted block mb-1">Summary (shown to attester)</label>
            <textarea rows={2} value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="Brief description of what is being attested to…"
              className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none resize-none" />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gw-green text-gw-dark rounded text-sm font-medium disabled:opacity-50">
              {submitting ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Sending…</> : <><Send className="w-3.5 h-3.5" /> Send Request</>}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-1.5 border border-gw-border text-gw-muted rounded text-sm hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Success */}
      {result && (
        <div className="bg-gw-green/10 border border-gw-green/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-gw-green font-medium text-sm">
            <CheckCircle className="w-4 h-4" />
            Attestation request created
            {result.emailSent ? ' — email sent' : ' — email not configured, share link manually'}
          </div>
          <div className="text-xs text-gw-muted">ID: <span className="font-mono text-white">{result.id}</span></div>
          <div className="flex items-center gap-2 bg-gw-dark border border-gw-border rounded px-3 py-2">
            <span className="text-xs font-mono text-gw-muted flex-1 truncate">{result.link}</span>
            <button onClick={() => copyLink(result.link)}
              className="text-xs text-gw-green hover:underline flex-shrink-0">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={() => { setResult(null); setShowForm(false) }}
            className="text-xs text-gw-muted hover:text-white">
            Done
          </button>
        </div>
      )}

      {/* Past attestations */}
      {loading ? (
        <div className="text-sm text-gw-muted">Loading…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-gw-muted py-4 text-center border border-dashed border-gw-border rounded-lg">
          No attestations yet. Request the first board sign-off above.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gw-border">
              <tr className="text-gw-muted text-left">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Report</th>
                <th className="py-2 pr-3 font-medium">Attester</th>
                <th className="py-2 pr-3 font-medium">Requested</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Seal Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gw-border/40">
              {list.map(a => (
                <tr key={a.AttestationID} className="hover:bg-gw-dark/40">
                  <td className="py-2 pr-3 font-mono text-gw-muted">{a.AttestationID}</td>
                  <td className="py-2 pr-3 text-white">{a.ReportType}</td>
                  <td className="py-2 pr-3">
                    <div className="text-white">{a.AttesterName || a.AttesterEmail}</div>
                    {a.AttesterTitle && <div className="text-gw-muted">{a.AttesterTitle}</div>}
                  </td>
                  <td className="py-2 pr-3 text-gw-muted">{new Date(a.RequestedAt).toLocaleDateString('en-CA')}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${
                      a.Status === 'SEALED'
                        ? 'bg-gw-green/10 border-gw-green/30 text-gw-green'
                        : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                    }`}>{a.Status}</span>
                  </td>
                  <td className="py-2">
                    {a.SealHash ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-gw-green text-xs" title={a.SealHash}>
                          {a.SealHash.slice(0,8)}&hellip;{a.SealHash.slice(-8)}
                        </span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(a.SealHash!); }}
                          className="text-[10px] text-gw-muted hover:text-gw-green underline shrink-0"
                          title="Copy full SHA-256 seal hash">
                          copy
                        </button>
                      </div>
                    ) : a.AttestationLink ? (
                      <button onClick={() => copyLink(a.AttestationLink!)}
                        className="text-xs text-gw-muted hover:text-gw-green underline">
                        Send link
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function defaultFrom(): string {
  const d = new Date()
  d.setDate(1)  // first of current month
  return d.toISOString().slice(0, 10)
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10)
}
