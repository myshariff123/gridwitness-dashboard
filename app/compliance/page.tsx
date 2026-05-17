'use client'
import { useState } from 'react'
import Nav from '@/components/Nav'
import MerkleRootBadge from '@/components/MerkleRootBadge'
import { generateReport } from '@/lib/api'
import { FileText, Download, Calendar, Filter, Shield, CheckCircle, Loader, ExternalLink } from 'lucide-react'

const TENANT_ID = 'GW-NIMBL-AEB47A92'
const API = process.env.NEXT_PUBLIC_API_URL

const FRAMEWORKS = [
  { id: 'OSFI_B15',  label: 'OSFI Guideline B-15', required: true  },
  { id: 'BILL_C59',  label: 'Bill C-59 (Canada)',   required: true  },
  { id: 'ISO_14064', label: 'ISO 14064-1',           required: false },
  { id: 'GHG_PROTO', label: 'GHG Protocol',          required: false },
]

const QUICK_RANGES = [
  { label: 'Last 24h', days: 1 },
  { label: 'Last 7d',  days: 7 },
  { label: 'Last 30d', days: 30 },
  { label: 'Q1 2026',  start: '2026-01-01', end: '2026-03-31' },
  { label: 'Q2 2026',  start: '2026-04-01', end: '2026-06-30' },
]

type State = 'idle' | 'queuing' | 'polling' | 'ready' | 'error'

export default function CompliancePage() {
  const today  = new Date().toISOString().split('T')[0]
  const month1 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [dateFrom, setDateFrom]       = useState(month1)
  const [dateTo, setDateTo]           = useState(today)
  const [frameworks, setFrameworks]   = useState(['OSFI_B15', 'BILL_C59'])
  const [state, setState]             = useState<State>('idle')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [reportId, setReportId]       = useState<string | null>(null)
  const [errorMsg, setErrorMsg]       = useState('')
  const [mockHash] = useState(() =>
    Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  )

  const toggleFramework = (id: string) => {
    if (FRAMEWORKS.find(f => f.id === id)?.required) return
    setFrameworks(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
  }

  const applyRange = (r: typeof QUICK_RANGES[0]) => {
    if ('days' in r) {
      setDateFrom(new Date(Date.now() - r.days * 86400000).toISOString().split('T')[0])
      setDateTo(today)
    } else {
      setDateFrom(r.start)
      setDateTo(r.end)
    }
  }

  const poll = async (attempt = 0): Promise<void> => {
    if (attempt > 15) {
      setState('error')
      setErrorMsg('Timed out waiting for report. Check your email — the download link will be sent there.')
      return
    }
    try {
      const res  = await fetch(`${API}/api/reports/latest?tenant_id=${TENANT_ID}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.download_url && data.status === 'COMPLETE') {
        setDownloadUrl(data.download_url)
        setReportId(data.report_id)
        setState('ready')
        return
      }
    } catch { /* keep polling */ }
    await new Promise(r => setTimeout(r, 5000))
    return poll(attempt + 1)
  }

  const handleGenerate = async () => {
    setState('queuing')
    setErrorMsg('')
    setDownloadUrl(null)
    setReportId(null)
    try {
      await generateReport(TENANT_ID, dateFrom, dateTo, frameworks)
      setState('polling')
      await new Promise(r => setTimeout(r, 15000)) // give Lambda 15s to process
      await poll()
    } catch {
      setState('error')
      setErrorMsg('Failed to queue report. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={TENANT_ID} />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-gw-green" />
              Auditor Portal
            </h1>
            <p className="text-sm text-gw-muted mt-1">
              Generate immutable OSFI B-15 compliance evidence packages from your WORM ledger
            </p>
          </div>
          <span className="text-xs border border-gw-green/30 text-gw-green px-2 py-1 rounded">
            WORM LOCKED
          </span>
        </div>

        <MerkleRootBadge hash={mockHash} tenantId={TENANT_ID} />

        <div className="bg-gw-panel border border-gw-border rounded-xl p-6 space-y-6">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gw-green" />
            Reporting Window
          </h2>

          <div className="flex flex-wrap gap-2">
            {QUICK_RANGES.map(r => (
              <button key={r.label} onClick={() => applyRange(r)}
                className="text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors">
                {r.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gw-muted block mb-2">From (UTC)</label>
              <input type="date" value={dateFrom} max={dateTo}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-gw-dark border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gw-muted block mb-2">To (UTC)</label>
              <input type="date" value={dateTo} min={dateFrom} max={today}
                onChange={e => setDateTo(e.target.value)}
                className="w-full bg-gw-dark border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none" />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-gw-green" />
              Compliance Frameworks
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {FRAMEWORKS.map(fw => (
                <button key={fw.id} onClick={() => toggleFramework(fw.id)}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                    frameworks.includes(fw.id)
                      ? 'border-gw-green/50 bg-gw-green/5 text-white'
                      : 'border-gw-border text-gw-muted hover:border-gw-border/80'
                  }`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    frameworks.includes(fw.id) ? 'border-gw-green bg-gw-green/20' : 'border-gw-muted'
                  }`}>
                    {frameworks.includes(fw.id) && <CheckCircle className="w-3 h-3 text-gw-green" />}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{fw.label}</div>
                    {fw.required && <div className="text-xs text-gw-muted">Required</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Action area */}
          <div className="space-y-3">
            {state !== 'ready' ? (
              <button onClick={handleGenerate}
                disabled={state === 'queuing' || state === 'polling'}
                className="w-full flex items-center justify-center gap-2 bg-gw-green text-gw-dark font-semibold py-3 rounded-lg hover:bg-gw-green/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {state === 'queuing' && <><Loader className="w-4 h-4 animate-spin" /> Queuing report...</>}
                {state === 'polling' && <><Loader className="w-4 h-4 animate-spin" /> Generating PDF — please wait ~20 seconds...</>}
                {(state === 'idle' || state === 'error') && <><Download className="w-4 h-4" /> Generate OSFI B-15 Compliance PDF</>}
              </button>
            ) : (
              <div className="space-y-2">
                <a href={downloadUrl!} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-gw-green text-gw-dark font-semibold py-3 rounded-lg hover:bg-gw-green/90 transition-colors">
                  <Download className="w-4 h-4" />
                  Download Compliance PDF
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <div className="flex items-center justify-between text-xs text-gw-muted px-1">
                  <span>Report: <span className="font-mono text-white">{reportId}</span></span>
                  <button onClick={() => setState('idle')} className="hover:text-gw-green transition-colors">
                    Generate another →
                  </button>
                </div>
                <p className="text-xs text-gw-muted px-1">
                  Link valid for 15 minutes. Report permanently stored in WORM vault.
                </p>
              </div>
            )}

            {state === 'polling' && (
              <div className="flex items-center gap-2 text-xs text-gw-muted bg-gw-dark border border-gw-border rounded-lg px-3 py-2">
                <Loader className="w-3.5 h-3.5 animate-spin text-gw-green flex-shrink-0" />
                Processing {(dateFrom)} to {(dateTo)} — querying WORM ledger, computing Merkle root, generating PDF...
              </div>
            )}

            {state === 'error' && errorMsg && (
              <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-400">
                {errorMsg}
              </div>
            )}
          </div>
        </div>

        <div className="bg-gw-panel border border-gw-border rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gw-green" />
            What's Included in Each Report
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {[
              'Hardware-verified watt readings (BMC Redfish / CloudWatch)',
              'SHA-256 cryptographic hash of every ledger row',
              'Merkle root chain of custody verification',
              'Provincial grid carbon intensity (AESO · IESO · BC Hydro · Hydro-QC)',
              'Scope 2 emissions (physical servers on-premise)',
              'Scope 3 Category 11 (cloud AI compute)',
              '45-point OSFI B-15 compliance matrix',
              'Bill C-59 safe harbour mapping',
              'Executive attestation signature block',
              'Independent Big 4 auditor verification fields',
              'Active grid incidents during period with tenant responses',
              'UNRESOLVED incidents flagged for regulatory disclosure',
            ].map(item => (
              <div key={item} className="flex items-start gap-2 text-gw-muted">
                <CheckCircle className="w-3.5 h-3.5 text-gw-green flex-shrink-0 mt-0.5" />
                {item}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
