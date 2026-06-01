'use client'
// app/compliance/page.tsx — Compliance report generation + download
// Drop-in replacement. Uses lib/api.ts for envelope-aware fetching.

import { useEffect, useState, useCallback } from 'react'
import Nav from '@/components/Nav'
import {
  FileText, Loader, CheckCircle, AlertCircle,
  Download, RefreshCw, Shield, Calendar,
} from 'lucide-react'
import {
  generateReport, getLatestReport,
} from '@/lib/api'

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
      await generateReport(tenantId, dateFrom, dateTo, selected)
      setStatus('polling')
      // Reset reportId so we detect when a new one arrives
      setReportId(prevReportId)
    } catch (e: unknown) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Failed to queue report. Please try again.')
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
                  {status === 'queueing' ? 'Queueing…' : `Generating… (${pollTick * 5}s)`}
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

        {/* Help */}
        <section className="bg-gw-panel border border-gw-border rounded-xl p-5 text-sm text-gw-muted">
          <h3 className="text-white font-semibold mb-2">About the Report</h3>
          <ul className="space-y-1.5 text-xs">
            <li>• Every telemetry record is SHA-256 hashed and linked in an immutable Merkle chain</li>
            <li>• The full chain root appears on the cover page — verifiable at <code className="text-gw-green">/verify</code></li>
            <li>• PDFs are stored in AWS S3 with Object Lock COMPLIANCE for 7 years (OSFI B-15 §5.3)</li>
            <li>• Data residency: AWS ca-central-1 (Montreal) — Canadian sovereign region</li>
            <li>• Encryption: AES-256 at rest, TLS 1.3 in transit</li>
          </ul>
        </section>
      </div>
    </div>
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
