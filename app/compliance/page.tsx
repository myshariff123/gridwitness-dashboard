'use client'
// app/compliance/page.tsx — Compliance status dashboard + report generation

import { useEffect, useState, useCallback } from 'react'
import Nav from '@/components/Nav'
import {
  FileText, Loader, CheckCircle, AlertCircle,
  Download, RefreshCw, Shield, Calendar, Lock, Send,
  TrendingUp, Clock, AlertTriangle,
} from 'lucide-react'
import { generateReport, getLatestReport } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

const FRAMEWORKS = [
  { id: 'OSFI_B15', label: 'OSFI Guideline B-15', required: true, desc: 'Climate Risk Management' },
  { id: 'BILL_C59', label: 'Bill C-59 (Canada)', required: true, desc: 'Anti-Greenwashing' },
  { id: 'ISO_14064', label: 'ISO 14064-1', required: false, desc: 'GHG Quantification' },
  { id: 'GHG_PROTO', label: 'GHG Protocol', required: false, desc: 'Scope 2 + Scope 3 Cat.11' },
]

// Status tiles shown at the top of the page
const COMPLIANCE_FRAMEWORKS = [
  {
    id: 'OSFI_B15',
    label: 'OSFI B-15',
    fullName: 'OSFI Guideline B-15',
    description: 'Climate Risk Management',
    cadenceDays: 90,
    color: 'blue',
  },
  {
    id: 'TCFD',
    label: 'TCFD',
    fullName: 'Task Force on Climate Disclosures',
    description: 'Annual climate-related financial disclosure',
    cadenceDays: 365,
    color: 'purple',
  },
  {
    id: 'IFRS_S2',
    label: 'IFRS S2',
    fullName: 'IFRS S2 Climate Disclosures',
    description: 'Climate-related risks & opportunities',
    cadenceDays: 365,
    color: 'indigo',
  },
  {
    id: 'BILL_C59',
    label: 'Bill C-59',
    fullName: 'Bill C-59 (Canada)',
    description: 'Anti-greenwashing environmental claims',
    cadenceDays: 180,
    color: 'teal',
  },
]

type Status = 'idle' | 'queueing' | 'queued' | 'polling' | 'ready' | 'error'
type TileStatus = 'compliant' | 'due-soon' | 'overdue' | 'pending'

function getStatusFromReport(downloadUrl: string | null, reportId: string | null, cadenceDays: number): TileStatus {
  if (!downloadUrl) return 'pending'
  // Extract date from reportId if it contains one, otherwise use 'recent'
  if (reportId) {
    const match = reportId.match(/(\d{4}-\d{2}-\d{2})/)
    if (match) {
      const reportDate = new Date(match[1])
      const daysSince = Math.floor((Date.now() - reportDate.getTime()) / 86400000)
      if (daysSince > cadenceDays) return 'overdue'
      if (daysSince > cadenceDays * 0.8) return 'due-soon'
      return 'compliant'
    }
  }
  return 'compliant'
}
type FrameworkDef = {
    id: string
    label: string
    fullName: string
    description: string
    cadenceDays: number
    color: string
}

type StatusTileProps = {
  framework: FrameworkDef
  downloadUrl: string | null
  reportId: string | null
  onGenerate: () => void
}

function StatusTile({ framework, downloadUrl, reportId, onGenerate }: StatusTileProps) {
  const tileStatus = getStatusFromReport(downloadUrl, reportId, framework.cadenceDays)
  const cfg = { compliant: true, overdue: false }[tileStatus] ?? null
  return <div>{framework.label}</div>

}

export default function CompliancePage() {
  return <div>Compliance</div>
}


type AttestResult = { link: string; id: string; emailSent: boolean }

function BoardAttestationSection({ tenantId }: { tenantId: string }) {
  const [list, setList] = useState<AttestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [result, setResult] = useState<AttestResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({
    attester_email: '', attester_name: '', attester_title: '',
    report_type: 'OSFI B-15', report_id: '', summary: '',
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefill = window.sessionStorage.getItem('gw_attest_prefill_type')
    if (prefill) { setForm(f => ({ ...f, report_type: prefill })); setShowForm(true); window.sessionStorage.removeItem('gw_attest_prefill_type') }
  }, [])

  const REPORT_TYPES = ['OSFI B-15','TCFD','IFRS S2','GHG Protocol','ISO 14064','Annual ESG']

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/attestations`)
      if (r.ok) { const d = await r.json(); setList(d.attestations || []) }
    } catch {} finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function request(e: React.FormEvent) {
    e.preventDefault()
    if (!form.attester_email) { setErr('Attester email required'); return }
    setSubmitting(true); setErr('')
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/attestations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
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
            <Lock className="w-4 h-4 text-gw-green" /> Board Attestation
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
              className="px-4 py-1.5 border border-gw-border text-gw-muted rounded text-sm hover:text-white">Cancel</button>
          </div>
        </form>
      )}

      {result && (
        <div className="bg-gw-green/10 border border-gw-green/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-gw-green font-medium text-sm">
            <CheckCircle className="w-4 h-4" />
            Attestation request created{result.emailSent ? ' — email sent' : ' — share link manually'}
          </div>
          <div className="text-xs text-gw-muted">ID: <span className="font-mono text-white">{result.id}</span></div>
          <div className="flex items-center gap-2 bg-gw-dark border border-gw-border rounded px-3 py-2">
            <span className="text-xs font-mono text-gw-muted flex-1 truncate">{result.link}</span>
            <button onClick={() => copyLink(result.link)} className="text-xs text-gw-green hover:underline flex-shrink-0">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={() => { setResult(null); setShowForm(false) }} className="text-xs text-gw-muted hover:text-white">Done</button>
        </div>
      )}

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
                        <button onClick={() => navigator.clipboard.writeText(a.SealHash!)}
                          className="text-[10px] text-gw-muted hover:text-gw-green underline shrink-0">copy</button>
                      </div>
                    ) : a.AttestationLink ? (
                      <button onClick={() => copyLink(a.AttestationLink!)}
                        className="text-xs text-gw-muted hover:text-gw-green underline">Send link</button>
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
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10)
}
