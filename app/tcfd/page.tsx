'use client'

import Nav from '@/components/Nav'
import { useEffect, useState, useCallback } from 'react'
import {
  Shield, TrendingDown, AlertTriangle, BarChart3,
  CheckCircle2, XCircle, Clock, Download, RefreshCw,
  ChevronDown, ChevronUp, Edit3, Zap, Leaf,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

// ── Types ──────────────────────────────────────────────────────────────────
interface RiskEntry {
  label: string
  category: string
  description?: string
  '1.5C_NZE': string
  '2C_SPS': string
  '4C_BAU': string
}

interface TcfdProfile {
  tenant_id: string
  sections: {
    GOVERNANCE:     Record<string, any>
    STRATEGY:       Record<string, any>
    RISK_MGMT:      Record<string, any>
    METRICS_CONFIG: Record<string, any>
  }
  completeness: {
    governance: number
    strategy: number
    risk_mgmt: number
    metrics_config: number
    overall: number
  }
}

interface Emissions {
  emissions: { scope1_kgco2e: number; scope2_kgco2e: number; scope3_cat11_kgco2e: number; ytd_total_tco2e: number }
  current_year: { ytd_liability_cad: number; price_per_tco2e_cad: number }
}

// ── Risk level styling ─────────────────────────────────────────────────────
const RISK_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  LOW:      { bg: 'bg-green-950/60',  text: 'text-green-400',  border: 'border-green-800/40' },
  MEDIUM:   { bg: 'bg-yellow-950/60', text: 'text-yellow-400', border: 'border-yellow-800/40' },
  HIGH:     { bg: 'bg-orange-950/60', text: 'text-orange-400', border: 'border-orange-800/40' },
  CRITICAL: { bg: 'bg-red-950/60',    text: 'text-red-400',    border: 'border-red-800/40' },
}

function RiskBadge({ level }: { level: string }) {
  const s = RISK_STYLE[level] || RISK_STYLE.LOW
  return (
    <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold border ${s.bg} ${s.text} ${s.border} min-w-[70px]`}>
      {level}
    </span>
  )
}

// ── Completeness ring ──────────────────────────────────────────────────────
function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2937" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}

// ── Pillar card ────────────────────────────────────────────────────────────
function PillarCard({
  number, title, icon: Icon, score, children, color = 'green',
}: {
  number: string
  title: string
  icon: any
  score: number
  children: React.ReactNode
  color?: string
}) {
  const colorMap: Record<string, string> = {
    green:  'text-green-400  border-green-800/30',
    blue:   'text-blue-400   border-blue-800/30',
    purple: 'text-purple-400 border-purple-800/30',
    teal:   'text-teal-400   border-teal-800/30',
  }
  const cls = colorMap[color] || colorMap.green
  return (
    <div className={`bg-[#111827] border rounded-xl p-5 ${cls.split(' ')[1]}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">
            Pillar {number}
          </p>
          <div className={`flex items-center gap-2 ${cls.split(' ')[0]}`}>
            <Icon className="w-4 h-4" />
            <h3 className="font-bold text-sm text-white">{title}</h3>
          </div>
        </div>
        <div className="relative flex items-center justify-center">
          <ScoreRing score={score} size={52} />
          <span className="absolute text-[11px] font-bold text-white rotate-90"
            style={{transform:'rotate(90deg)'}}>
            {score}%
          </span>
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Gov check row ──────────────────────────────────────────────────────────
function GovCheck({ label, value }: { label: string; value: boolean | string }) {
  const yes = Boolean(value)
  return (
    <div className="flex items-center gap-2 py-1 border-b border-gray-800/40 last:border-0">
      {yes
        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
        : <XCircle      className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
      <span className={`text-xs ${yes ? 'text-white' : 'text-gray-500'}`}>{label}</span>
    </div>
  )
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function EditModal({
  section, data, onSave, onClose, tenantId,
}: {
  section: string; data: Record<string, any>; onSave: () => void
  onClose: () => void; tenantId: string
}) {
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState<Record<string, any>>(data)

  const save = async () => {
    setSaving(true)
    try {
      await fetch(`${API}/api/tenants/${tenantId}/tcfd/profile/${section}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      onSave()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const BOOL_FIELDS: Record<string, string[]> = {
    GOVERNANCE: ['BoardCommittee','ExecutiveCompensation','CSO','AuditCommitteeScope','ClimateRiskPolicy'],
  }
  const TEXT_FIELDS: Record<string, { key: string; label: string; long?: boolean }[]> = {
    GOVERNANCE: [
      { key: 'BoardCommitteeName', label: 'Board Committee Name' },
      { key: 'CSOName',            label: 'CSO Name' },
      { key: 'GovernanceStatement',label: 'Governance Statement', long: true },
    ],
    RISK_MGMT: [
      { key: 'IdentificationProcess', label: 'Identification Process', long: true },
      { key: 'AssessmentProcess',     label: 'Assessment Process', long: true },
      { key: 'ManagementProcess',     label: 'Management Process', long: true },
      { key: 'MonitoringFrequency',   label: 'Monitoring Frequency' },
      { key: 'IntegrationStatement',  label: 'Integration Statement', long: true },
      { key: 'RiskAppetiteStatement', label: 'Risk Appetite Statement', long: true },
    ],
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-gray-700 rounded-xl w-full max-w-xl max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="font-bold text-white">Edit {section.replace('_',' ')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          {(BOOL_FIELDS[section] || []).map(k => (
            <label key={k} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!fields[k]}
                onChange={e => setFields(p => ({...p, [k]: e.target.checked}))}
                className="w-4 h-4 accent-green-500" />
              <span className="text-sm text-white">{k.replace(/([A-Z])/g,' $1').trim()}</span>
            </label>
          ))}
          {(TEXT_FIELDS[section] || []).map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
              {f.long
                ? <textarea rows={3} value={fields[f.key] || ''}
                    onChange={e => setFields(p => ({...p, [f.key]: e.target.value}))}
                    className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1.5 text-xs text-white resize-none focus:outline-none focus:border-green-500" />
                : <input type="text" value={fields[f.key] || ''}
                    onChange={e => setFields(p => ({...p, [f.key]: e.target.value}))}
                    className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green-500" />}
            </div>
          ))}
          {section === 'METRICS_CONFIG' && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Baseline Year</label>
                <input type="number" value={fields.BaselineYear || 2019}
                  onChange={e => setFields(p => ({...p, BaselineYear: +e.target.value}))}
                  className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Target Year</label>
                <input type="number" value={fields.TargetYear || 2030}
                  onChange={e => setFields(p => ({...p, TargetYear: +e.target.value}))}
                  className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Temperature Alignment</label>
                <select value={fields.TemperatureAlignment || '1.5C'}
                  onChange={e => setFields(p => ({...p, TemperatureAlignment: e.target.value}))}
                  className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green-500">
                  <option value="1.5C">1.5°C</option>
                  <option value="2C">2°C</option>
                  <option value="COMMITTED">Committed (pending)</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 rounded">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white font-medium rounded disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function TcfdPage() {
  const [tenantId, setTenantId] = useState('GW-NIMBL-AEB47A92')
  const [profile,  setProfile]  = useState<TcfdProfile | null>(null)
  const [emissions,setEmissions]= useState<Emissions | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [generating, setGenerating] = useState(false)
  const [reportUrl,  setReportUrl]  = useState<string | null>(null)
  const [editSection, setEditSection] = useState<string | null>(null)
  const [expandScenario, setExpandScenario] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const tid = new URLSearchParams(window.location.search).get('tenant_id')
             || localStorage.getItem('gw_tenant_id')
             || 'GW-NIMBL-AEB47A92'
    setTenantId(tid)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [profileRes, emRes] = await Promise.all([
        fetch(`${API}/api/tenants/${tenantId}/tcfd/profile`),
        fetch(`${API}/api/tenants/${tenantId}/carbon-tax?year=${new Date().getFullYear()}`),
      ])
      if (profileRes.ok)  setProfile(await profileRes.json())
      if (emRes.ok)       setEmissions(await emRes.json())
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { loadData() }, [loadData])

  const generateReport = async () => {
    setGenerating(true)
    setReportUrl(null)
    try {
      const r = await fetch(`${API}/api/tenants/${tenantId}/tcfd/report`, { method: 'POST' })
      if (r.ok) {
        const d = await r.json()
        setReportUrl(d.download_url)
        window.open(d.download_url, '_blank')
      }
    } finally {
      setGenerating(false)
    }
  }

  const comp  = profile?.completeness
  const gov   = profile?.sections?.GOVERNANCE   || {}
  const strat = profile?.sections?.STRATEGY     || {}
  const risk  = profile?.sections?.RISK_MGMT    || {}
  const met   = profile?.sections?.METRICS_CONFIG || {}

  const sa    = strat?.ScenarioAnalysis || {}
  const risks = sa?.risks || {}
  const scens = [
    { id: '1.5C_NZE', label: '1.5°C NZE', sub: 'IEA Net Zero' },
    { id: '2C_SPS',   label: '2°C SPS',   sub: 'Stated Policies' },
    { id: '4C_BAU',   label: '4°C BAU',   sub: 'Business as Usual' },
  ]

  const totalTco2 = emissions
    ? (emissions.emissions.scope1_kgco2e + emissions.emissions.scope2_kgco2e
       + emissions.emissions.scope3_cat11_kgco2e) / 1000
    : 0
  const ytdLiability = emissions?.current_year?.ytd_liability_cad || 0
  const carbonPrice  = emissions?.current_year?.price_per_tco2e_cad || 110

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      <Nav />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-green-400" />
              <h1 className="text-xl font-bold text-white">TCFD Climate Risk Disclosure</h1>
              <span className="ml-2 text-[10px] bg-blue-950/60 border border-blue-800/40 text-blue-400 px-2 py-0.5 rounded-full font-medium tracking-wider">
                TCFD 2017 + 2021
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Four-Pillar Framework  ·  Aligned to OSFI B-15  ·  IFRS S2  ·  CDP Climate
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button onClick={generateReport} disabled={generating}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg disabled:opacity-50">
              <Download className={`w-3.5 h-3.5 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generating PDF…' : 'Generate TCFD Report'}
            </button>
          </div>
        </div>

        {reportUrl && (
          <div className="mb-4 p-3 bg-green-950/40 border border-green-800/40 rounded-lg flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-xs text-green-300">Report generated — </span>
            <a href={reportUrl} target="_blank" rel="noreferrer"
              className="text-xs text-green-400 underline hover:text-green-300">
              Download PDF
            </a>
            <span className="text-gw-muted text-xs">·</span>
            <a href={`/compliance?tab=attestation&tenant_id=${tenantId}&report_type=TCFD`}
              className="text-xs text-amber-400 underline hover:text-amber-300 flex items-center gap-1">
              Request Board Attestation →
            </a>
          </div>
        )}

        {/* Overall completeness bar */}
        {comp && (
          <div className="mb-6 p-4 bg-[#111827] border border-gray-800/40 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-400">TCFD Disclosure Completeness</span>
              <span className={`text-sm font-bold ${comp.overall >= 80 ? 'text-green-400' : comp.overall >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {comp.overall}% complete
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                comp.overall >= 80 ? 'bg-green-500' : comp.overall >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`} style={{ width: `${comp.overall}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-4 mt-3">
              {[
                ['Governance', comp.governance],
                ['Strategy', comp.strategy],
                ['Risk Mgmt', comp.risk_mgmt],
                ['Metrics', comp.metrics_config],
              ].map(([label, val]) => (
                <div key={label as string} className="text-center">
                  <div className={`text-sm font-bold ${
                    (val as number) >= 80 ? 'text-green-400' : (val as number) >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{val}%</div>
                  <div className="text-[10px] text-gray-500">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live metrics strip */}
        {emissions && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Scope 1+2+3', value: `${totalTco2.toFixed(1)} tCO₂e`, sub: `${new Date().getFullYear()} YTD`, icon: Leaf,    color: 'green' },
              { label: 'Carbon Tax Exposure', value: `$${ytdLiability.toLocaleString(undefined,{maximumFractionDigits:0})}`, sub: `@ $${carbonPrice}/tCO₂e CAD`, icon: BarChart3, color: 'yellow' },
              { label: 'Temperature Alignment', value: `${met.TemperatureAlignment || '1.5C'}°C`, sub: 'SBTi pathway', icon: TrendingDown, color: 'blue' },
              { label: 'Baseline Year', value: String(met.BaselineYear || 2019), sub: `Target: ${met.TargetYear || 2030}`, icon: Zap, color: 'purple' },
            ].map(({ label, value, sub, icon: Icon, color }) => {
              const colMap: Record<string,string> = { green:'text-green-400', yellow:'text-yellow-400', blue:'text-blue-400', purple:'text-purple-400' }
              return (
                <div key={label} className="bg-[#111827] border border-gray-800/40 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-3.5 h-3.5 ${colMap[color]}`} />
                    <span className="text-xs text-gray-400">{label}</span>
                  </div>
                  <div className={`text-lg font-bold ${colMap[color]}`}>{value}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Four pillar cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Governance */}
          <PillarCard number="1" title="Governance" icon={Shield}
            score={comp?.governance || 0} color="green">
            <div className="space-y-0.5">
              <GovCheck label="Board Climate Committee"        value={gov.BoardCommittee} />
              <GovCheck label="Climate in Exec Compensation"  value={gov.ExecutiveCompensation} />
              <GovCheck label="Chief Sustainability Officer"  value={gov.CSO} />
              <GovCheck label="Audit Committee Climate Scope" value={gov.AuditCommitteeScope} />
              <GovCheck label="Board Climate Risk Policy"     value={gov.ClimateRiskPolicy} />
            </div>
            {gov.BoardCommitteeName && (
              <p className="mt-2 text-[10px] text-gray-500">Committee: {gov.BoardCommitteeName}</p>
            )}
            <button onClick={() => setEditSection('GOVERNANCE')}
              className="mt-3 flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300">
              <Edit3 className="w-3 h-3" /> Edit Governance Profile
            </button>
          </PillarCard>

          {/* Strategy */}
          <PillarCard number="2" title="Strategy" icon={TrendingDown}
            score={comp?.strategy || 0} color="blue">
            <div className="space-y-2">
              {[
                ['Short', strat.TimeHorizons?.short],
                ['Medium', strat.TimeHorizons?.medium],
                ['Long', strat.TimeHorizons?.long],
              ].map(([h, text]) => text && (
                <div key={h as string}>
                  <p className="text-[9px] font-bold text-blue-400 uppercase">{h} Term</p>
                  <p className="text-[10px] text-gray-400 leading-4 line-clamp-2">{text as string}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-gray-500">
              Scenario analysis: {Object.keys(risks).length} risk factors × 3 pathways
            </p>
          </PillarCard>

          {/* Risk Management */}
          <PillarCard number="3" title="Risk Management" icon={AlertTriangle}
            score={comp?.risk_mgmt || 0} color="purple">
            {[
              ['Identification', risk.IdentificationProcess],
              ['Assessment', risk.AssessmentProcess],
              ['Management', risk.ManagementProcess],
            ].map(([label, text]) => (
              <div key={label as string} className="mb-2">
                <p className="text-[9px] font-bold text-purple-400 uppercase mb-0.5">{label}</p>
                <p className="text-[10px] text-gray-400 leading-4 line-clamp-2">{text as string}</p>
              </div>
            ))}
            <div className="mt-2 p-2 bg-purple-950/30 border border-purple-800/30 rounded">
              <p className="text-[9px] text-purple-300">
                <Clock className="w-2.5 h-2.5 inline mr-1" />
                {risk.MonitoringFrequency || '15-minute automated checks'}
              </p>
            </div>
            <button onClick={() => setEditSection('RISK_MGMT')}
              className="mt-2 flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300">
              <Edit3 className="w-3 h-3" /> Edit Risk Profile
            </button>
          </PillarCard>

          {/* Metrics & Targets */}
          <PillarCard number="4" title="Metrics & Targets" icon={BarChart3}
            score={comp?.metrics_config || 0} color="teal">
            <div className="space-y-1.5 mb-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Baseline year</span>
                <span className="text-white font-medium">{met.BaselineYear || 2019}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Target year</span>
                <span className="text-white font-medium">{met.TargetYear || 2030}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Temperature alignment</span>
                <span className="text-teal-400 font-bold">{met.TemperatureAlignment || '1.5C'}°C</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Intensity metric</span>
                <span className="text-white font-medium font-mono text-[9px]">{met.IntensityMetric || 'kgCO₂e/MWh'}</span>
              </div>
            </div>
            {(met.AdditionalTargets || []).map((t: any) => (
              <div key={t.name} className="flex items-center gap-1.5 py-0.5">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  t.status === 'Achieved' ? 'bg-green-400'
                  : t.status === 'In progress' ? 'bg-yellow-400' : 'bg-gray-500'
                }`} />
                <span className="text-[9px] text-gray-400 truncate">{t.name}</span>
                <span className="ml-auto text-[9px] text-gray-500 shrink-0">{t.target}</span>
              </div>
            ))}
            <button onClick={() => setEditSection('METRICS_CONFIG')}
              className="mt-2 flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300">
              <Edit3 className="w-3 h-3" /> Edit Targets
            </button>
          </PillarCard>
        </div>

        {/* Scenario Analysis Matrix */}
        <div className="bg-[#111827] border border-gray-800/40 rounded-xl p-5 mb-6">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setExpandScenario(x => !x)}
          >
            <div>
              <h2 className="text-sm font-bold text-white">Pillar 2 — Scenario Analysis Matrix</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {Object.keys(risks).length} risk factors across 3 IPCC-aligned warming pathways
              </p>
            </div>
            {expandScenario ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {expandScenario && Object.keys(risks).length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-gray-400 font-medium pb-3 pr-4 w-[35%]">Risk Factor</th>
                    <th className="text-center text-gray-500 font-normal pb-3 px-1 w-[8%] text-[9px]">Category</th>
                    {scens.map(s => (
                      <th key={s.id} className="text-center pb-3 px-2">
                        <div className="text-white font-bold text-[10px]">{s.label}</div>
                        <div className="text-gray-500 text-[9px]">{s.sub}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Group by category */}
                  {['Transition', 'Physical'].map(cat => {
                    const catRisks = Object.entries(risks).filter(([, rv]: any) => rv.category === cat)
                    if (!catRisks.length) return null
                    return [
                      <tr key={`hdr-${cat}`}>
                        <td colSpan={5} className="py-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                            {cat} Risks
                          </span>
                        </td>
                      </tr>,
                      ...catRisks.map(([rk, rv]: any) => (
                        <tr key={rk} className="border-t border-gray-800/30">
                          <td className="py-2 pr-4">
                            <p className="text-white text-[10px] font-medium">{rv.label}</p>
                            {rv.description && (
                              <p className="text-gray-500 text-[9px] leading-3 mt-0.5 line-clamp-1">{rv.description}</p>
                            )}
                          </td>
                          <td className="py-2 px-1 text-center">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                              cat === 'Transition' ? 'bg-blue-950/50 text-blue-400' : 'bg-orange-950/50 text-orange-400'
                            }`}>{cat.slice(0,5)}</span>
                          </td>
                          {scens.map(s => {
                            const level = rv[s.id] || 'LOW'
                            const st = RISK_STYLE[level]
                            return (
                              <td key={s.id} className="py-2 px-2 text-center">
                                <span className={`inline-flex items-center justify-center text-[10px] font-bold px-2 py-1 rounded border ${st.bg} ${st.text} ${st.border} min-w-[60px]`}>
                                  {level}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )),
                    ]
                  })}
                </tbody>
              </table>

              {/* Legend */}
              <div className="mt-4 flex items-center gap-4 pt-3 border-t border-gray-800/40">
                <span className="text-[9px] text-gray-500">Risk Level:</span>
                {['LOW','MEDIUM','HIGH','CRITICAL'].map(level => {
                  const s = RISK_STYLE[level]
                  return (
                    <span key={level} className={`text-[9px] px-2 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
                      {level}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {expandScenario && Object.keys(risks).length === 0 && (
            <p className="mt-4 text-xs text-gray-500 text-center py-4">
              No scenario analysis data loaded yet.
            </p>
          )}
        </div>

        {/* Governance & Risk statements */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#111827] border border-gray-800/40 rounded-xl p-4">
            <h3 className="text-xs font-bold text-green-400 mb-2">Governance Statement</h3>
            <p className="text-[10px] text-gray-300 leading-4">
              {gov.GovernanceStatement || '—'}
            </p>
          </div>
          <div className="bg-[#111827] border border-gray-800/40 rounded-xl p-4">
            <h3 className="text-xs font-bold text-purple-400 mb-2">Risk Appetite Statement</h3>
            <p className="text-[10px] text-gray-300 leading-4">
              {risk.RiskAppetiteStatement || '—'}
            </p>
          </div>
        </div>

        {/* Regulatory alignment footer */}
        <div className="bg-[#111827] border border-gray-800/40 rounded-xl p-4">
          <h3 className="text-xs font-bold text-white mb-3">Regulatory Framework Alignment</h3>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'TCFD 2017', status: 'Full', color: 'green', note: 'All 11 recommended disclosures' },
              { label: 'OSFI B-15', status: 'Aligned', color: 'green', note: 'TCFD-aligned, mandatory for FRFIs' },
              { label: 'IFRS S2',   status: 'Aligned', color: 'blue',  note: 'Mandatory public co. CY2024+' },
              { label: 'CDP Climate', status: 'Aligned', color: 'teal', note: 'Sections A–C covered' },
              { label: 'GGPPA',     status: 'Carbon Levy', color: 'yellow', note: 'Statutory carbon price embedded' },
            ].map(({ label, status, color, note }) => {
              const cm: Record<string,string> = {
                green:'bg-green-950/50 border-green-800/40 text-green-400',
                blue:'bg-blue-950/50 border-blue-800/40 text-blue-400',
                teal:'bg-teal-950/50 border-teal-800/40 text-teal-400',
                yellow:'bg-yellow-950/50 border-yellow-800/40 text-yellow-400',
              }
              return (
                <div key={label} className={`border rounded-lg p-3 ${cm[color]}`}>
                  <div className="font-bold text-[10px] mb-0.5">{label}</div>
                  <div className="text-[9px] opacity-70 font-medium mb-1">{status}</div>
                  <div className="text-[9px] opacity-60 leading-3">{note}</div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Edit modal */}
      {editSection && profile && (
        <EditModal
          section={editSection}
          data={profile.sections[editSection as keyof typeof profile.sections] || {}}
          onSave={loadData}
          onClose={() => setEditSection(null)}
          tenantId={tenantId}
        />
      )}
    </div>
  )
}
