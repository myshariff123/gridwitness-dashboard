'use client'

import Nav from '@/components/Nav'
import { useEffect, useState, useCallback } from 'react'
import {
  FileText, CheckCircle2, AlertCircle, XCircle,
  Download, RefreshCw, Edit3, ChevronDown, ChevronUp,
  BarChart3, Building2, TrendingDown, Target,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

// ── Types ──────────────────────────────────────────────────────────────────
interface Paragraph {
  id: string
  group: string
  title: string
  requirement: string
  status: 'COMPLETE' | 'PARTIAL' | 'NOT_STARTED'
  note: string
}

interface Profile {
  tenant_id: string
  sections: {
    IFRS_CONFIG:        Record<string, any>
    CAPITAL_DEPLOYMENT: Record<string, any>
    SASB_METRICS:       Record<string, any>
  }
  tcfd_sections: Record<string, any>
  paragraphs: Paragraph[]
  compliance: {
    score: number
    complete: number
    partial: number
    not_started: number
    total: number
  }
}

interface Emissions {
  emissions: {
    scope1_kgco2e: number
    scope2_kgco2e: number
    scope3_cat11_kgco2e: number
    ytd_total_tco2e: number
  }
  current_year: { ytd_liability_cad: number; price_per_tco2e_cad: number }
}

// ── Status helpers ─────────────────────────────────────────────────────────
const STATUS = {
  COMPLETE:    { icon: CheckCircle2, cls: 'text-green-400',  bg: 'bg-green-950/50',  border: 'border-green-800/30',  label: 'Complete'     },
  PARTIAL:     { icon: AlertCircle,  cls: 'text-yellow-400', bg: 'bg-yellow-950/50', border: 'border-yellow-800/30', label: 'Partial'      },
  NOT_STARTED: { icon: XCircle,      cls: 'text-gray-600',   bg: 'bg-gray-950/30',   border: 'border-gray-800/20',  label: 'Not Started'  },
}

function ParaRow({ para }: { para: Paragraph }) {
  const [open, setOpen] = useState(false)
  const s = STATUS[para.status]
  const Icon = s.icon
  return (
    <div className={`border rounded-lg ${s.border} ${s.bg} mb-1`}>
      <button className="w-full flex items-center gap-2 p-2.5 text-left"
        onClick={() => setOpen(x => !x)}>
        <Icon className={`w-3.5 h-3.5 shrink-0 ${s.cls}`} />
        <span className="font-mono text-[10px] text-blue-400 shrink-0 w-[44px]">{para.id}</span>
        <span className="text-xs text-white flex-1 truncate">{para.title}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${s.bg} ${s.cls} ${s.border} shrink-0`}>
          {s.label}
        </span>
        {open ? <ChevronUp className="w-3 h-3 text-gray-500 shrink-0" />
               : <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />}
      </button>
      {open && (
        <div className="px-8 pb-3 space-y-1">
          <p className="text-[10px] text-gray-400">{para.requirement}</p>
          <p className={`text-[10px] font-medium ${s.cls}`}>{para.note}</p>
        </div>
      )}
    </div>
  )
}

// ── SASB Edit Modal ────────────────────────────────────────────────────────
function SasbModal({ data, tenantId, onSave, onClose }: {
  data: Record<string, any>; tenantId: string; onSave: () => void; onClose: () => void
}) {
  const [fields, setFields] = useState(data)
  const [saving, setSaving] = useState(false)
  const f = (k: string, label: string, unit: string, type = 'number') => (
    <div key={k}>
      <label className="block text-[10px] text-gray-400 mb-1">{label} <span className="text-gray-600">({unit})</span></label>
      <input type={type} value={fields[k] ?? ''} step="any"
        onChange={e => setFields(p => ({ ...p, [k]: type === 'number' ? +e.target.value : e.target.value }))}
        className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
    </div>
  )
  const save = async () => {
    setSaving(true)
    try {
      await fetch(`${API}/api/tenants/${tenantId}/ifrs-s2/profile/SASB_METRICS`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      onSave(); onClose()
    } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-gray-700 rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-700 flex justify-between">
          <h3 className="font-bold text-white text-sm">Edit SASB TC-SI Metrics</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          {f('TC_SI_130a1_EnergyConsumed_GJ', 'Total energy consumed', 'GJ')}
          {f('TC_SI_130a1_PctRenewable',       '% renewable energy',   '%')}
          {f('TC_SI_130a1_PctGridElectricity', '% grid electricity',   '%')}
          {f('TC_SI_130a2_Scope1_tCO2e',       'Scope 1 emissions',    'tCO₂e')}
          {f('TC_SI_130a2_PctUnderRegulations','% under regs',         '%')}
          {f('TC_SI_230a2_LowCarbonRevenuePct','% low-carbon revenue', '%')}
          {f('DataCenterPUE',                  'Data centre PUE',      'ratio')}
        </div>
        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 rounded">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium rounded disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Capital + Config Edit Modal ────────────────────────────────────────────
function ConfigModal({ section, data, tenantId, onSave, onClose }: {
  section: string; data: Record<string, any>; tenantId: string
  onSave: () => void; onClose: () => void
}) {
  const [fields, setFields] = useState(data)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await fetch(`${API}/api/tenants/${tenantId}/ifrs-s2/profile/${section}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      onSave(); onClose()
    } finally { setSaving(false) }
  }
  const numField = (k: string, label: string, prefix = '') => (
    <div key={k}>
      <label className="block text-[10px] text-gray-400 mb-1">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-xs text-gray-500">{prefix}</span>}
        <input type="number" value={fields[k] ?? 0} step="any"
          onChange={e => setFields(p => ({ ...p, [k]: +e.target.value }))}
          className="flex-1 bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
      </div>
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-gray-700 rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-700 flex justify-between">
          <h3 className="font-bold text-white text-sm">Edit {section.replace('_',' ')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          {section === 'IFRS_CONFIG' && <>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!fields.TransitionPlanAdopted}
                onChange={e => setFields(p => ({...p, TransitionPlanAdopted: e.target.checked}))}
                className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-white">Transition Plan Adopted</span>
            </label>
            {fields.TransitionPlanAdopted && (
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Year adopted</label>
                <input type="number" value={fields.TransitionPlanYear || 2026}
                  onChange={e => setFields(p => ({...p, TransitionPlanYear: +e.target.value}))}
                  className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
              </div>
            )}
            {numField('InternalCarbonPrice', 'Internal Carbon Price (CAD/tCO₂e)', '$')}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!fields.RemunerationLinked}
                onChange={e => setFields(p => ({...p, RemunerationLinked: e.target.checked}))}
                className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-white">Executive remuneration linked to climate</span>
            </label>
            {fields.RemunerationLinked && numField('RemunerationPct', '% of compensation linked', '')}
            {numField('ClimateOpportunityRevenuePct', '% revenue from climate opportunities', '')}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Climate Resilience Narrative</label>
              <textarea rows={3} value={fields.ClimateResilienceNarrative || ''}
                onChange={e => setFields(p => ({...p, ClimateResilienceNarrative: e.target.value}))}
                className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1.5 text-xs text-white resize-none focus:outline-none focus:border-blue-500" />
            </div>
          </>}
          {section === 'CAPITAL_DEPLOYMENT' && <>
            {numField('TotalCapExCAD',           'Total CapEx (CAD)', '$')}
            {numField('CapExClimateAlignedCAD',  'Climate-Aligned CapEx (CAD)', '$')}
            {numField('TotalOpExCAD',            'Total OpEx (CAD)', '$')}
            {numField('OpExClimateAlignedCAD',   'Climate-Aligned OpEx (CAD)', '$')}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">CapEx Narrative</label>
              <textarea rows={3} value={fields.CapExNarrative || ''}
                onChange={e => setFields(p => ({...p, CapExNarrative: e.target.value}))}
                className="w-full bg-[#0a0f1a] border border-gray-700 rounded px-2 py-1.5 text-xs text-white resize-none focus:outline-none focus:border-blue-500" />
            </div>
          </>}
        </div>
        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 rounded">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium rounded disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function IfrsS2Page() {
  const [tenantId, setTenantId] = useState('GW-NIMBL-AEB47A92')
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [emissions,setEmissions] = useState<Emissions | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [generating, setGenerating] = useState(false)
  const [reportUrl,  setReportUrl]  = useState<string | null>(null)
  const [modal, setModal] = useState<string | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Governance')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const tid = new URLSearchParams(window.location.search).get('tenant_id')
             || localStorage.getItem('gw_tenant_id') || 'GW-NIMBL-AEB47A92'
    setTenantId(tid)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profRes, emRes] = await Promise.all([
        fetch(`${API}/api/tenants/${tenantId}/ifrs-s2/profile`),
        fetch(`${API}/api/tenants/${tenantId}/carbon-tax?year=${new Date().getFullYear()}`),
      ])
      if (profRes.ok)  setProfile(await profRes.json())
      if (emRes.ok)    setEmissions(await emRes.json())
    } finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  const generate = async () => {
    setGenerating(true); setReportUrl(null)
    try {
      const r = await fetch(`${API}/api/tenants/${tenantId}/ifrs-s2/report`, { method: 'POST' })
      if (r.ok) {
        const d = await r.json()
        setReportUrl(d.download_url)
        window.open(d.download_url, '_blank')
      }
    } finally { setGenerating(false) }
  }

  const comp = profile?.compliance
  const cfg  = profile?.sections?.IFRS_CONFIG || {}
  const cap  = profile?.sections?.CAPITAL_DEPLOYMENT || {}
  const sasb = profile?.sections?.SASB_METRICS || {}

  // Group paragraphs
  const groups = ['Governance', 'Strategy', 'Risk Management', 'Metrics & Targets']
  const byGroup = groups.reduce((acc, g) => {
    acc[g] = (profile?.paragraphs || []).filter(p => p.group === g)
    return acc
  }, {} as Record<string, Paragraph[]>)

  const groupIcon: Record<string, any> = {
    'Governance': Building2, 'Strategy': TrendingDown,
    'Risk Management': AlertCircle, 'Metrics & Targets': BarChart3,
  }

  const totalTco2 = emissions
    ? (emissions.emissions.scope1_kgco2e + emissions.emissions.scope2_kgco2e
       + emissions.emissions.scope3_cat11_kgco2e) / 1000 : 0

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      <Nav />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-blue-400" />
              <h1 className="text-xl font-bold text-white">IFRS S2 Climate Disclosures</h1>
              <span className="ml-2 text-[10px] bg-blue-950/60 border border-blue-800/40 text-blue-400 px-2 py-0.5 rounded-full font-medium">
                ISSB June 2023
              </span>
              <span className="text-[10px] bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                OSFI B-15 Aligned
              </span>
            </div>
            <p className="text-xs text-gray-400">
              32 paragraph requirements  ·  SASB TC-SI sector metrics  ·  Canada effective Jan 2024
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 text-gray-400 hover:text-white rounded-lg">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button onClick={generate} disabled={generating}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white font-medium rounded-lg disabled:opacity-50">
              <Download className={`w-3.5 h-3.5 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generating PDF…' : 'Generate IFRS S2 Report'}
            </button>
          </div>
        </div>

        {reportUrl && (
          <div className="mb-4 p-3 bg-blue-950/40 border border-blue-800/40 rounded-lg flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-xs text-blue-300">Report generated — </span>
            <a href={reportUrl} target="_blank" rel="noreferrer"
              className="text-xs text-blue-400 underline hover:text-blue-300">Download PDF</a>
            <span className="text-gray-600 text-xs">·</span>
            <a href={`/compliance?tab=attestation&tenant_id=${tenantId}&report_type=IFRS+S2`}
              className="text-xs text-amber-400 underline hover:text-amber-300 flex items-center gap-1">
              Request Board Attestation →
            </a>
          </div>
        )}

        {/* Compliance score bar */}
        {comp && (
          <div className="mb-6 p-4 bg-[#0f2044] border border-blue-900/40 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-blue-300">
                IFRS S2 Paragraph Compliance
              </span>
              <span className={`text-sm font-bold ${
                comp.score >= 80 ? 'text-green-400' : comp.score >= 50 ? 'text-yellow-400' : 'text-red-400'
              }`}>{comp.score}% compliant</span>
            </div>
            <div className="h-2 bg-blue-950 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${comp.score}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3">
              {[
                ['Complete', comp.complete, 'text-green-400'],
                ['Partial',  comp.partial,  'text-yellow-400'],
                ['Not Started', comp.not_started, 'text-gray-500'],
              ].map(([label, val, cls]) => (
                <div key={label as string} className="text-center">
                  <div className={`text-lg font-bold ${cls}`}>{val}</div>
                  <div className="text-[10px] text-gray-500">{label} of {comp.total}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Left: Paragraph compliance tracker */}
          <div className="col-span-2">
            <h2 className="text-sm font-bold text-white mb-3">
              Paragraph-by-Paragraph Compliance Tracker
            </h2>

            {groups.map(group => {
              const paras    = byGroup[group] || []
              const done     = paras.filter(p => p.status === 'COMPLETE').length
              const partial  = paras.filter(p => p.status === 'PARTIAL').length
              const isOpen   = expandedGroup === group
              const Icon     = groupIcon[group]
              return (
                <div key={group} className="mb-3 bg-[#111827] border border-gray-800/40 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-[#0f2044]/20"
                    onClick={() => setExpandedGroup(isOpen ? null : group)}
                  >
                    <Icon className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="font-medium text-sm text-white flex-1">{group}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green-400">{done} complete</span>
                      {partial > 0 && <span className="text-yellow-400">{partial} partial</span>}
                      <span className="text-gray-500">{paras.length} total</span>
                    </div>
                    {/* Mini progress */}
                    <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${paras.length > 0 ? ((done + partial*0.5)/paras.length*100) : 0}%` }} />
                    </div>
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                             : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                  </button>
                  {isOpen && (
                    <div className="p-3 pt-0">
                      {paras.map(p => <ParaRow key={p.id} para={p} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right: IFRS S2 specific panels */}
          <div className="space-y-4">
            {/* CIMC summary */}
            <div className="bg-[#111827] border border-gray-800/40 rounded-xl p-4">
              <h3 className="text-xs font-bold text-blue-400 mb-3">
                Cross-Industry Metric Categories
              </h3>
              <div className="space-y-2">
                {[
                  ['A', 'GHG Emissions', `${totalTco2.toFixed(1)} tCO₂e`],
                  ['B', 'Transition Risks', '7 factors assessed'],
                  ['C', 'Physical Risks', '2 factors assessed'],
                  ['D', 'Opportunities', `${cfg.ClimateOpportunityRevenuePct || 0}% revenue`],
                  ['E', 'Capital Deploy', cap.TotalCapExCAD > 0
                    ? `$${(cap.CapExClimateAlignedCAD||0).toLocaleString()} CAD` : 'Not yet set'],
                  ['F', 'Internal Carbon Price', cfg.InternalCarbonPrice
                    ? `$${cfg.InternalCarbonPrice}/tCO₂e` : 'Not adopted'],
                  ['G', 'Remuneration', cfg.RemunerationLinked
                    ? `${cfg.RemunerationPct || 0}% linked` : 'Not linked'],
                ].map(([cat, label, val]) => (
                  <div key={cat as string} className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-blue-950/60 border border-blue-800/40 text-blue-400 text-[9px] font-bold flex items-center justify-center rounded shrink-0">
                      {cat}
                    </span>
                    <span className="text-[10px] text-gray-400 flex-1">{label}</span>
                    <span className="text-[10px] text-white font-medium text-right max-w-[90px] truncate">{val}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setModal('IFRS_CONFIG')}
                className="mt-3 flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300">
                <Edit3 className="w-3 h-3" /> Edit IFRS Config
              </button>
            </div>

            {/* SASB metrics */}
            <div className="bg-[#111827] border border-gray-800/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-blue-400">
                  SASB Sector Metrics
                </h3>
                <button onClick={() => setModal('SASB_METRICS')}
                  className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300">
                  <Edit3 className="w-2.5 h-2.5" /> Edit
                </button>
              </div>
              <div className="text-[9px] text-gray-500 mb-2 font-medium">
                {sasb.SASBSectorLabel || 'Software & IT Services (TC-SI)'}
              </div>
              <div className="space-y-2">
                {[
                  ['TC-SI-130a.1', 'Energy consumed',       `${(sasb.TC_SI_130a1_EnergyConsumed_GJ||0).toLocaleString()} GJ`],
                  ['TC-SI-130a.1', '% Renewable',           `${sasb.TC_SI_130a1_PctRenewable||0}%`],
                  ['TC-SI-130a.2', 'Scope 1 emissions',     `${(sasb.TC_SI_130a2_Scope1_tCO2e||0).toFixed(1)} tCO₂e`],
                  ['TC-SI-230a.2', 'Low-carbon revenue',    `${sasb.TC_SI_230a2_LowCarbonRevenuePct||0}%`],
                  ['Data Centre',  'PUE (avg)',              sasb.DataCenterPUE > 0 ? (sasb.DataCenterPUE||0).toFixed(2) : '—'],
                ].map(([code, label, val]) => (
                  <div key={code+label} className="flex items-center gap-2 border-b border-gray-800/30 pb-1.5 last:border-0 last:pb-0">
                    <span className="font-mono text-[8px] text-blue-400/60 shrink-0 w-[80px]">{code}</span>
                    <span className="text-[10px] text-gray-400 flex-1">{label}</span>
                    <span className={`text-[10px] font-medium ${
                      String(val).includes('0') && !String(val).includes('100') ? 'text-gray-500' : 'text-white'
                    }`}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Capital Deployment */}
            <div className="bg-[#111827] border border-gray-800/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-blue-400">Capital Deployment [S2.36]</h3>
                <button onClick={() => setModal('CAPITAL_DEPLOYMENT')}
                  className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300">
                  <Edit3 className="w-2.5 h-2.5" /> Edit
                </button>
              </div>
              {cap.TotalCapExCAD > 0 ? (
                <>
                  <div className="space-y-2 text-[10px]">
                    {[
                      ['Total CapEx', `$${(cap.TotalCapExCAD||0).toLocaleString()} CAD`],
                      ['Climate-Aligned CapEx', `$${(cap.CapExClimateAlignedCAD||0).toLocaleString()} CAD`],
                      ['% Climate-Aligned',
                        `${cap.TotalCapExCAD > 0 ? Math.round((cap.CapExClimateAlignedCAD||0)/(cap.TotalCapExCAD||1)*100) : 0}%`],
                    ].map(([l,v]) => (
                      <div key={l} className="flex justify-between">
                        <span className="text-gray-400">{l}</span>
                        <span className="text-white font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                  {/* Climate-aligned CapEx bar */}
                  <div className="mt-2">
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${cap.TotalCapExCAD > 0 ? Math.round((cap.CapExClimateAlignedCAD||0)/(cap.TotalCapExCAD||1)*100) : 0}%` }} />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-gray-500">No CapEx data configured yet.</p>
              )}
            </div>

            {/* Transition Plan */}
            <div className="bg-[#111827] border border-gray-800/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-blue-400">Transition Plan [S2.15]</h3>
                <button onClick={() => setModal('IFRS_CONFIG')}
                  className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300">
                  <Edit3 className="w-2.5 h-2.5" /> Edit
                </button>
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                cfg.TransitionPlanAdopted
                  ? 'bg-green-950/40 border-green-800/40' : 'bg-gray-900/40 border-gray-800/40'
              }`}>
                {cfg.TransitionPlanAdopted
                  ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  : <XCircle      className="w-4 h-4 text-gray-600 shrink-0" />}
                <div>
                  <p className={`text-xs font-medium ${cfg.TransitionPlanAdopted ? 'text-green-300' : 'text-gray-400'}`}>
                    {cfg.TransitionPlanAdopted
                      ? `Adopted (${cfg.TransitionPlanYear || '—'})`
                      : 'Not yet adopted'}
                  </p>
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    {cfg.TransitionPlanAdopted
                      ? 'Satisfies S2.15'
                      : 'Required if entity has adopted a plan — S2.15'}
                  </p>
                </div>
              </div>
            </div>

            {/* Regulatory context */}
            <div className="bg-[#0f2044] border border-blue-900/40 rounded-xl p-4">
              <h3 className="text-xs font-bold text-blue-300 mb-3">Canadian Mandatory Context</h3>
              <div className="space-y-2 text-[10px]">
                {[
                  ['Effective date', 'January 1, 2024', 'text-white'],
                  ['Scope',         'Canadian public companies', 'text-white'],
                  ['OSFI B-15',     'Required for FRFIs', 'text-yellow-400'],
                  ['TCFD overlap',  '~90% shared disclosures', 'text-blue-300'],
                  ['SASB required', 'Industry-based metrics', 'text-blue-300'],
                  ['Assurance',     'Reasonable (later years)', 'text-gray-400'],
                ].map(([l,v,tc]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-gray-500">{l}</span>
                    <span className={`font-medium ${tc}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {modal === 'SASB_METRICS' && (
        <SasbModal data={sasb} tenantId={tenantId} onSave={load} onClose={() => setModal(null)} />
      )}
      {(modal === 'IFRS_CONFIG' || modal === 'CAPITAL_DEPLOYMENT') && (
        <ConfigModal section={modal} data={modal === 'IFRS_CONFIG' ? cfg : cap}
          tenantId={tenantId} onSave={load} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
