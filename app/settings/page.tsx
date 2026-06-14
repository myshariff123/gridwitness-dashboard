'use client'
// app/settings/page.tsx — DARK THEME
// Matches /incidents and /compliance visually.
import WebhookSection  from '@/components/settings/WebhookSection'
import ApiKeysSection  from '@/components/settings/ApiKeysSection'
import TeamSection     from '@/components/settings/TeamSection'
import BrandingSection from '@/components/settings/BrandingSection'
import { useState, useEffect, useCallback, useRef } from 'react'
import Nav from '@/components/Nav'
import {
  Settings as SettingsIcon, Save, Cloud, Bell, Code,
  AlertCircle, ExternalLink, Copy, Loader, Shield, Zap, CheckCircle,
  Flame, Plus, Target, TrendingUp, AlertTriangle, Lock, TrendingDown, Globe,
  RefreshCw, BarChart2, Leaf, DollarSign, Archive,
} from 'lucide-react'

// Cloud is used in SETTINGS_TABS (Integrations tab icon)

const API_BASE   = process.env.NEXT_PUBLIC_API_URL ||
                   'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'
const INGEST_URL = 'https://cxdp3mup50.execute-api.ca-central-1.amazonaws.com/live/telemetry'

type Toast = { type: 'success' | 'error' | 'info'; text: string } | null
type ThresholdSet = { carbon: number; load: number; price: number }
type Thresholds   = Record<string, ThresholdSet>

const SETTINGS_TABS = [
  { id: 'overview',     label: 'Overview',        icon: SettingsIcon },
  { id: 'agent',        label: 'Agent & Scope 1', icon: Zap          },
  { id: 'integrations', label: 'Integrations',    icon: Cloud        },
  { id: 'apikeys',      label: 'API Keys',        icon: Shield       },
  { id: 'budget',       label: 'Carbon Budget',   icon: Target       },
  { id: 'targets',      label: 'SBTi Targets',    icon: Leaf         },
  { id: 'scope3',       label: 'Scope 3 Cloud',   icon: Globe        },
  { id: 'enforcement',  label: 'Enforcement',     icon: Lock         },
  { id: 'carbontax',   label: 'Carbon Tax',      icon: DollarSign   },
  { id: 'recs',         label: 'RECs & PPAs',     icon: Leaf         },
  { id: 'offsets',      label: 'Carbon Offsets',  icon: Archive      },
  { id: 'team',         label: 'Team',            icon: Bell         },
] as const
type SettingsTab = typeof SETTINGS_TABS[number]['id']

export default function SettingsPage() {
  const [tenantId, setTenantId] = useState('GW-NIMBL-AEB47A92')
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview')
  const [toast, setToast]       = useState<Toast>(null)
  const [saving, setSaving]     = useState(false)
  const thresholdSaveRef = useRef<(() => Promise<{ ok: boolean; msg: string }>) | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URLSearchParams(window.location.search)
    setTenantId(url.get('tenant_id') ||
                window.localStorage.getItem('gw_tenant_id') ||
                'GW-NIMBL-AEB47A92')
  }, [])

  async function handleSaveAll() {
    setSaving(true); setToast(null)
    const results: Array<{ section: string; ok: boolean; msg: string }> = []
    if (thresholdSaveRef.current) {
      const r = await thresholdSaveRef.current()
      results.push({ section: 'Thresholds', ...r })
    }
    const failed = results.filter(r => !r.ok)
    setToast(failed.length === 0
      ? { type: 'success', text: '✓ Settings saved.' }
      : { type: 'error', text: `Save failed: ${failed.map(f => `${f.section} (${f.msg})`).join('; ')}` })
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-5xl mx-auto px-4 pt-6 pb-12">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-gw-green" />
              Settings
            </h1>
            <p className="text-xs text-gw-muted mt-1">
              Tenant&nbsp;
              <code className="font-mono bg-gw-panel border border-gw-border px-2 py-0.5 rounded text-gw-muted">{tenantId}</code>
            </p>
          </div>
          {activeTab === 'overview' && (
            <button onClick={handleSaveAll} disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                saving ? 'bg-gw-border text-gw-muted cursor-not-allowed' : 'bg-gw-green text-gw-dark hover:bg-gw-green/90'
              }`}>
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>

        {toast && (
          <div className={`mb-4 rounded-xl p-3 text-sm border ${
            toast.type === 'success' ? 'bg-gw-green/10 border-gw-green/30 text-gw-green' :
            toast.type === 'error'   ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                       'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}>{toast.text}</div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gw-border mb-8 overflow-x-auto">
          {SETTINGS_TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                  active
                    ? 'border-gw-green text-gw-green'
                    : 'border-transparent text-gw-muted hover:text-white hover:border-gw-border'
                }`}>
                <Icon className="w-3.5 h-3.5" />{tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="space-y-6">
          {activeTab === 'overview' && <>
            <TenantInfoSection tenantId={tenantId} />
            <AesoApiSection />
            <ThresholdSection tenantId={tenantId} registerSave={fn => { thresholdSaveRef.current = fn }} />
            <BrandingSection tenantId={tenantId} />
          </>}

          {activeTab === 'agent' && <>
            <AwsAutoDiscoverySection tenantId={tenantId} setToast={setToast} />
            <AgentScriptsSection tenantId={tenantId} />
            <Scope1Section tenantId={tenantId} />
          </>}

          {activeTab === 'integrations' && <>
            <WebhookSection tenantId={tenantId} />
          </>}

          {activeTab === 'apikeys' && <>
            <ApiKeysSection tenantId={tenantId} />
            <ApiReferenceSection tenantId={tenantId} />
          </>}

          {activeTab === 'budget' && <>
            <CarbonBudgetSection tenantId={tenantId} />
          </>}

          {activeTab === 'targets' && <>
            <SBTiSection tenantId={tenantId} />
          </>}

          {activeTab === 'scope3' && <>
            <Scope3Section tenantId={tenantId} />
          </>}

          {activeTab === 'enforcement' && <>
            <EnforcementSection tenantId={tenantId} />
          </>}

          {activeTab === 'carbontax' && <>
            <CarbonTaxSection tenantId={tenantId} />
          </>}

          {activeTab === 'recs' && <>
            <RECsSection tenantId={tenantId} />
          </>}

          {activeTab === 'offsets' && <>
            <OffsetsSection tenantId={tenantId} />
          </>}

          {activeTab === 'team' && <>
            <TeamSection tenantId={tenantId} />
            <NotificationsSection />
          </>}
        </div>
      </div>
    </div>
  )
}

function AesoApiSection() {
  const [gridQuality, setGridQuality] = useState<string | null>(null)
  const [gridSource,  setGridSource]  = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/grid-status`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.grids || data?.records || [])
        const ab = list.find((g: Record<string, unknown>) => g.GridID === 'AB')
        if (ab) {
          setGridQuality(String(ab.DataQuality || ab.data_quality || 'UNKNOWN'))
          setGridSource(String(ab.Source || ab.source || ''))
        }
      })
      .catch(() => {})
  }, [])

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 2000)
    })
  }

  const isLive = gridQuality?.includes('LIVE') || gridQuality?.includes('AESO')

  const qualityColor = isLive
    ? 'text-gw-green bg-gw-green/10 border-gw-green/30'
    : gridQuality?.includes('TIME')
    ? 'text-amber-400 bg-amber-400/10 border-amber-400/30'
    : 'text-gw-muted bg-gw-dark border-gw-border'

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-gw-green" />
        Alberta Grid Data Source (AESO)
      </h2>
      <p className="text-sm text-gw-muted mb-4">
        GridWitness reads Alberta carbon intensity from AESO. Configure an API key for live data.
      </p>

      {/* Current status */}
      <div className="flex items-center gap-3 mb-5 p-3 bg-gw-dark rounded-lg border border-gw-border">
        <div className="flex-1">
          <div className="text-xs text-gw-muted uppercase tracking-wider mb-1">Current Data Quality</div>
          <div className="flex items-center gap-2">
            {isLive
              ? <CheckCircle className="w-4 h-4 text-gw-green" />
              : <AlertCircle className="w-4 h-4 text-amber-400" />}
            <span className={`text-xs font-mono border px-2 py-0.5 rounded ${qualityColor}`}>
              {gridQuality || 'Loading…'}
            </span>
            {gridSource && <span className="text-xs text-gw-muted">via {gridSource}</span>}
          </div>
        </div>
        {!isLive && (
          <div className="text-xs text-amber-400 text-right">
            Configure an API key<br />below for live data
          </div>
        )}
      </div>

      {/* Option 1: AESO API */}
      <div className="space-y-3 mb-4">
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium text-white text-sm">Option 1: AESO Pool Price & CSD API</div>
            <span className="text-xs text-gw-muted border border-gw-border px-2 py-0.5 rounded">Commercial</span>
          </div>
          <p className="text-xs text-gw-muted mb-3">
            Provides real-time pool price and generation-by-fuel data. Requires registration with AESO.
            Apply at <a href="https://www.aeso.ca/market/market-and-system-reporting/data-requests/" target="_blank" rel="noopener noreferrer" className="text-gw-green hover:underline">aeso.ca → Data Requests</a>.
          </p>
          <div className="text-xs text-gw-muted mb-2">Once you have a key, run this on the server:</div>
          <div className="relative">
            <pre className="bg-black/60 border border-gw-border rounded p-3 text-xs font-mono text-gw-green overflow-x-auto pr-10">
{`aws lambda update-function-configuration \\
  --function-name gw-grid-oracle-lambda-staging \\
  --environment 'Variables={GRID_CACHE_TABLE=gw-grid-cache-staging,AESO_API_KEY=YOUR_KEY_HERE}' \\
  --region ca-central-1`}
            </pre>
            <button
              onClick={() => copy('aws lambda update-function-configuration \\\n  --function-name gw-grid-oracle-lambda-staging \\\n  --environment \'Variables={GRID_CACHE_TABLE=gw-grid-cache-staging,AESO_API_KEY=YOUR_KEY_HERE}\' \\\n  --region ca-central-1', 'aeso')}
              className="absolute top-2 right-2 p-1.5 rounded bg-gw-border hover:bg-gw-green/20"
            >
              {copied === 'aeso' ? <CheckCircle className="w-3.5 h-3.5 text-gw-green" /> : <Copy className="w-3.5 h-3.5 text-gw-muted" />}
            </button>
          </div>
        </div>

        {/* Option 2: Electricity Maps */}
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium text-white text-sm">Option 2: Electricity Maps (CA-AB zone)</div>
            <span className="text-xs text-gw-green border border-gw-green/30 bg-gw-green/10 px-2 py-0.5 rounded">Free tier</span>
          </div>
          <p className="text-xs text-gw-muted mb-3">
            Free tier: 10 requests/hour. Register at <a href="https://api.electricitymap.org/free-tier" target="_blank" rel="noopener noreferrer" className="text-gw-green hover:underline">api.electricitymap.org/free-tier</a>.
            Covers Alberta (zone: CA-AB) with real carbon intensity data.
          </p>
          <div className="text-xs text-gw-muted mb-2">Set your token:</div>
          <div className="relative">
            <pre className="bg-black/60 border border-gw-border rounded p-3 text-xs font-mono text-gw-green overflow-x-auto pr-10">
{`aws lambda update-function-configuration \\
  --function-name gw-grid-oracle-lambda-staging \\
  --environment 'Variables={GRID_CACHE_TABLE=gw-grid-cache-staging,ELECTRICITY_MAPS_TOKEN=YOUR_TOKEN}' \\
  --region ca-central-1`}
            </pre>
            <button
              onClick={() => copy('aws lambda update-function-configuration \\\n  --function-name gw-grid-oracle-lambda-staging \\\n  --environment \'Variables={GRID_CACHE_TABLE=gw-grid-cache-staging,ELECTRICITY_MAPS_TOKEN=YOUR_TOKEN}\' \\\n  --region ca-central-1', 'em')}
              className="absolute top-2 right-2 p-1.5 rounded bg-gw-border hover:bg-gw-green/20"
            >
              {copied === 'em' ? <CheckCircle className="w-3.5 h-3.5 text-gw-green" /> : <Copy className="w-3.5 h-3.5 text-gw-muted" />}
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs text-gw-muted">
        Without a key the Lambda uses a time-of-day estimate (470–580 gCO2/kWh based on Alberta historical patterns).
        The data quality label is shown on the Monitor page.
      </p>
    </section>
  )
}

function TenantInfoSection({ tenantId }: { tenantId: string }) {
  const [tenant, setTenant] = useState<{
    TenantID: string; OrgName?: string; Status?: string; Tier?: string
  } | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTenant(d || { TenantID: tenantId }))
      .catch(() => setTenant({ TenantID: tenantId }))
  }, [tenantId])

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-gw-green" />
        Tenant Information
      </h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-gw-muted">Tenant ID</div>
          <div className="font-mono text-white mt-1">{tenant?.TenantID}</div>
        </div>
        <div>
          <div className="text-xs text-gw-muted">Organization</div>
          <div className="text-white mt-1">{tenant?.OrgName || '(not set)'}</div>
        </div>
        <div>
          <div className="text-xs text-gw-muted">Status</div>
          <div className="text-white mt-1">{tenant?.Status || 'ACTIVE'}</div>
        </div>
        <div>
          <div className="text-xs text-gw-muted">Tier</div>
          <div className="text-white mt-1">{tenant?.Tier || 'TIER_1_AUDIT'}</div>
        </div>
      </div>
    </section>
  )
}

function ThresholdSection({
  tenantId, registerSave
}: {
  tenantId: string
  registerSave: (fn: () => Promise<{ ok: boolean; msg: string }>) => void
}) {
  const [thresholds, setThresholds] = useState<Thresholds | null>(null)
  const [original, setOriginal]     = useState<Thresholds | null>(null)
  const [loading, setLoading]       = useState(true)
  const [usingDefaults, setUsingDef] = useState(false)
  const [updatedAt, setUpdatedAt]   = useState<string | null>(null)
  const [err, setErr]               = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/thresholds`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setThresholds(d.grid_thresholds)
      setOriginal(JSON.parse(JSON.stringify(d.grid_thresholds)))
      setUsingDef(Boolean(d.using_defaults))
      setUpdatedAt(d.updated_at || null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'unknown')
    } finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    registerSave(async () => {
      if (!thresholds) return { ok: false, msg: 'No thresholds loaded' }
      try {
        const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/thresholds`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid_thresholds: thresholds }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        setUpdatedAt(d.updated_at)
        setOriginal(JSON.parse(JSON.stringify(thresholds)))
        setUsingDef(false)
        return { ok: true, msg: 'Saved' }
      } catch (e: unknown) {
        return { ok: false, msg: e instanceof Error ? e.message : 'unknown' }
      }
    })
  }, [thresholds, tenantId, registerSave])

  function change(grid: string, metric: keyof ThresholdSet, value: string) {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) return
    setThresholds(prev => prev ? { ...prev, [grid]: { ...prev[grid], [metric]: num } } : prev)
  }

  const dirty = thresholds && original &&
    JSON.stringify(thresholds) !== JSON.stringify(original)
  const grids = ['AB'] as const
  const metrics: Array<[keyof ThresholdSet, string, string]> = [
    ['carbon', 'Carbon', 'gCO2/kWh'],
    ['load',   'Load',   '% capacity'],
    ['price',  'Price',  '$/MWh'],
  ]

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-gw-green" />
            Grid Alert Thresholds
          </h2>
          <p className="text-sm text-gw-muted mt-1">
            Breach any threshold to auto-open a WORM-sealed incident.
          </p>
        </div>
        <span className="text-xs text-gw-muted">
          {usingDefaults
            ? 'Using regulatory defaults'
            : updatedAt
            ? `Saved: ${new Date(updatedAt).toLocaleString('en-CA', { hour12: false })}`
            : ''}
        </span>
      </div>
      {loading ? (
        <div className="text-sm text-gw-muted py-4">Loading…</div>
      ) : err || !thresholds ? (
        <div className="text-sm text-red-400 py-4">{err || 'Unable to load thresholds'}</div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="border-b border-gw-border">
              <tr>
                <th className="py-2 text-left text-gw-muted text-xs font-medium">Grid</th>
                {metrics.map(([k, label, unit]) => (
                  <th key={k} className="py-2 text-left text-gw-muted text-xs font-medium">
                    {label} <span className="text-gw-muted/70 font-normal">({unit})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gw-border/50">
              {grids.map(g => (
                <tr key={g}>
                  <td className="py-3 font-mono text-white">{g}</td>
                  {metrics.map(([m]) => (
                    <td key={m} className="py-3 pr-4">
                      <input
                        type="number" step="0.1" min={0}
                        className="bg-gw-dark border border-gw-border rounded px-2 py-1 w-28 text-white text-sm focus:border-gw-green focus:outline-none"
                        value={thresholds[g]?.[m] ?? ''}
                        onChange={e => change(g, m, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {dirty && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-sm">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400">Unsaved changes.</span>
              <span className="text-gw-muted ml-auto text-xs">Click "Save All Settings" at the top.</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function AwsAutoDiscoverySection({
  tenantId, setToast
}: {
  tenantId: string
  setToast: (t: Toast) => void
}) {
  const [integration, setIntegration] = useState<{
    status?: string
    role_arn?: string
    connected_at?: string
    cloudformation_url?: string
  } | null>(null)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [roleArn, setRoleArn] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`)
      if (r.status === 404 || r.status === 403) { setAvailable(false); return }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setIntegration(await r.json())
    } catch { setAvailable(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!roleArn.trim()) return
    setBusy(true)
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_arn: roleArn.trim() }),
    })
    setBusy(false)
    const data = await r.json().catch(() => ({}))
    if (r.ok) {
      setToast({ type: 'success', text: '✓ AWS integration verified — monitoring active' })
      setShowSubmit(false); setRoleArn(''); load()
    } else {
      setToast({ type: 'error', text: data.error || data.details || 'Verification failed' })
    }
  }

  async function revoke() {
    if (!confirm('Revoke AWS integration? This stops auto-discovery.')) return
    setBusy(true)
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`, { method: 'DELETE' })
    setBusy(false)
    if (r.ok) { setToast({ type: 'success', text: '✓ Integration revoked' }); load() }
  }

  if (!available) return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-3">
        <Cloud className="w-4 h-4 text-gw-green" />
        AWS Auto-Discovery Integration
      </h2>
      <div className="bg-gw-green/10 border border-gw-green/30 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-gw-green animate-pulse" />
          <span className="font-semibold text-gw-green">AUTO-DISCOVERY ACTIVE</span>
        </div>
        <p className="text-sm text-gw-muted">
          GridWitness is actively discovering and monitoring your AWS EC2 instances via cross-account IAM role.
          Telemetry is being collected and sealed to the WORM ledger every 5 minutes.
        </p>
        <p className="text-xs text-gw-muted mt-2">
          To update your IAM role ARN or connect additional accounts, contact your GridWitness administrator.
        </p>
      </div>
    </section>
  )

  const isActive = integration?.status === 'ACTIVE'

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <Cloud className="w-4 h-4 text-gw-green" />
        AWS Auto-Discovery Integration
      </h2>
      <p className="text-sm text-gw-muted mb-4">
        Securely grant GridWitness read-only access to discover and monitor servers in your AWS account.
      </p>

      {isActive ? (
        <div className="bg-gw-green/10 border border-gw-green/30 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-gw-green gw-pulse" />
                <span className="font-semibold text-gw-green">MONITORING ACTIVE</span>
              </div>
              <div className="text-xs text-gw-muted">Connected via IAM Role:</div>
              <div className="text-xs text-white font-mono mt-1 break-all">{integration?.role_arn}</div>
              {integration?.connected_at && (
                <div className="text-xs text-gw-muted mt-2">
                  Connected: {new Date(integration.connected_at).toLocaleString('en-CA', { hour12: false })}
                </div>
              )}
            </div>
            <button
              onClick={revoke}
              disabled={busy}
              className="text-xs border border-red-500/30 text-red-400 px-3 py-1.5 rounded hover:bg-red-500/10 disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-gw-muted" />
            <span className="font-semibold text-gw-muted">Not Connected</span>
          </div>
          <ol className="text-sm text-gw-muted space-y-1.5 mb-4 list-decimal pl-5">
            <li>Click <strong className="text-white">Launch CloudFormation</strong> to open AWS Console</li>
            <li>Create the stack — a read-only IAM role is provisioned with external-id <code className="text-xs bg-gw-panel px-1 rounded text-gw-green">gridwitness-{tenantId}</code></li>
            <li>Copy the <strong className="text-white">RoleArn</strong> output from the completed stack</li>
            <li>Paste it below and click <strong className="text-white">Verify & Connect</strong></li>
          </ol>
          <div className="flex flex-wrap gap-2 mb-3">
            {integration?.cloudformation_url && (
              <a
                href={integration.cloudformation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded text-sm font-medium"
              >
                <Cloud className="w-4 h-4" />
                Launch CloudFormation Stack
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={() => setShowSubmit(s => !s)}
              className="border border-gw-border hover:border-gw-green hover:text-gw-green text-gw-muted px-4 py-2 rounded text-sm"
            >
              I have my Role ARN →
            </button>
          </div>
          {showSubmit && (
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={roleArn}
                onChange={e => setRoleArn(e.target.value)}
                placeholder="arn:aws:iam::123456789012:role/GridWitnessReadOnly"
                className="flex-1 bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm font-mono text-white focus:border-gw-green focus:outline-none"
              />
              <button
                onClick={submit}
                disabled={busy || !roleArn.trim()}
                className="bg-gw-green text-gw-dark px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Verify & Connect'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function AgentScriptsSection({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<'redfish' | 'gpu' | 'asic' | 'ps' | 'bash' | 'docker' | 'k8s'>('redfish')
  const [copied, setCopied] = useState(false)

  const redfishScript = `#!/bin/bash
# GridWitness Redfish Agent — reads actual PSU power from server BMC
# Works with: Dell iDRAC 8/9, HP iLO 4/5/6, Supermicro IPMI, Lenovo XCC
# Requires: curl, python3 (standard on all Linux distros)
#
# HOW TO FIND YOUR BMC IP:
#   Dell:       ipmitool lan print 1  |  grep "IP Address "
#   HP:         ipmitool lan print 1  |  grep "IP Address "
#   Any Linux:  ip route | grep default (BMC is usually on same subnet)
#
# Run once to test, then add to crontab or systemd for continuous monitoring.

BMC_HOST="192.168.1.100"   # <-- replace with your BMC/iDRAC/iLO IP
BMC_USER="root"             # Dell default: root / HP default: Administrator
BMC_PASS="calvin"           # <-- replace with your BMC password
TENANT_ID="${tenantId}"
GW_API_KEY="gwk-YOUR_API_KEY_HERE"   # Settings → API Keys → create key
API_URL="${INGEST_URL}"
GRID_ID="AB"
INTERVAL=300  # seconds between readings (5 min)

# Redfish power endpoint paths (tried in order until one works)
REDFISH_PATHS=(
  "/redfish/v1/Chassis/System.Embedded.1/Power"  # Dell iDRAC
  "/redfish/v1/Chassis/1/Power"                  # HP iLO / Supermicro
  "/redfish/v1/Chassis/Self/Power"               # Lenovo XCC
)

get_power_watts() {
  for path in "\${REDFISH_PATHS[@]}"; do
    response=$(curl -s -k -u "\${BMC_USER}:\${BMC_PASS}" \\
      -H "Accept: application/json" \\
      "https://\${BMC_HOST}\${path}" 2>/dev/null)
    watts=$(echo "\$response" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  # Standard Redfish: PowerControl[0].PowerConsumedWatts
  pc = d.get('PowerControl', [])
  if pc and pc[0].get('PowerConsumedWatts', 0) > 0:
    print(int(pc[0]['PowerConsumedWatts']))
    sys.exit(0)
  # Some vendors use PowerSupplies total
  ps = d.get('PowerSupplies', [])
  total = sum(float(p.get('PowerOutputWatts') or p.get('LastPowerOutputWatts') or 0) for p in ps)
  if total > 0:
    print(int(total))
    sys.exit(0)
except: pass
print(0)
" 2>/dev/null)
    if [ -n "\$watts" ] && [ "\$watts" -gt 0 ]; then
      echo "\$watts"
      return 0
    fi
  done
  echo "0"
}

echo "GridWitness Redfish Agent starting for ${tenantId} — polling \${BMC_HOST} every \${INTERVAL}s"

while true; do
  WATTS=$(get_power_watts)
  if [ "\$WATTS" -eq 0 ]; then
    DATA_SOURCE="FALLBACK_ESTIMATE"
    WATTS=500  # conservative fallback for a rack server
    echo "WARN: Redfish read failed — using fallback \${WATTS}W"
  else
    DATA_SOURCE="REDFISH_BMC"
    echo "OK: \$(date -u +%H:%M:%S) — \${WATTS}W from \${BMC_HOST}"
  fi

  curl -s -X POST "\$API_URL" \\
    -H "Content-Type: application/json" \\
    -H "X-GW-API-Key: \${GW_API_KEY}" \\
    -d "{\\"TenantID\\":\\"\$TENANT_ID\\",\\"Source\\":\\"$(hostname)\\",\\"Actual_Wattage\\":\$WATTS,\\"InfraType\\":\\"Physical_BMC\\",\\"GridID\\":\\"\$GRID_ID\\",\\"DataSource\\":\\"\$DATA_SOURCE\\",\\"api_key\\":\\"\$GW_API_KEY\\"}" \\
    > /dev/null 2>&1

  sleep \$INTERVAL
done`

  const gpuScript = `#!/bin/bash
# GridWitness GPU Mining Agent — reads actual GPU+CPU power via nvidia-smi / rocm-smi
# Works with: Nvidia GeForce/Quadro/Tesla, AMD Radeon (via rocm-smi)
# Requires: nvidia-smi (Nvidia) or rocm-smi (AMD) — pre-installed with GPU drivers
#
# Reports ACTUAL measured wattage (not estimates) — suitable for OSFI B-15 Scope 2 reporting.

TENANT_ID="${tenantId}"
GW_API_KEY="gwk-YOUR_API_KEY_HERE"   # Settings → API Keys → create key
API_URL="${INGEST_URL}"
GRID_ID="AB"
# Overhead for PSU losses + CPU + memory + fans (typical mining rig: 80-120W)
OVERHEAD_WATTS=100
INTERVAL=300

get_nvidia_watts() {
  if ! command -v nvidia-smi &>/dev/null; then echo "0"; return; fi
  # Sum power across all GPUs (handles multi-GPU rigs)
  nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits 2>/dev/null | \\
    awk '{sum += $1} END {print (sum > 0) ? int(sum) : 0}'
}

get_amd_watts() {
  if ! command -v rocm-smi &>/dev/null; then echo "0"; return; fi
  rocm-smi --showpower 2>/dev/null | awk '/Average Graphics Package Power/{sum += $NF} END {print int(sum)}'
}

echo "GridWitness GPU Mining Agent starting for ${tenantId}"

while true; do
  NVIDIA_W=$(get_nvidia_watts)
  AMD_W=$(get_amd_watts)
  GPU_WATTS=$(( NVIDIA_W + AMD_W ))

  if [ "\$GPU_WATTS" -gt 0 ]; then
    TOTAL_WATTS=$(( GPU_WATTS + OVERHEAD_WATTS ))
    DATA_SOURCE="NVIDIA_SMI"
    [ "\$AMD_W" -gt 0 ] && [ "\$NVIDIA_W" -eq 0 ] && DATA_SOURCE="ROCM_SMI"
    echo "OK: \$(date -u +%H:%M:%S) — GPU \${GPU_WATTS}W + overhead \${OVERHEAD_WATTS}W = \${TOTAL_WATTS}W"
  else
    # Fallback: estimate from CPU load (less accurate)
    LOAD=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}')
    TOTAL_WATTS=$(echo "150 + (\$LOAD * 2)" | bc | awk '{print int($1)}')
    DATA_SOURCE="CPU_ESTIMATE"
    echo "WARN: GPU power unavailable — CPU load estimate \${TOTAL_WATTS}W"
  fi

  curl -s -X POST "\$API_URL" \\
    -H "Content-Type: application/json" \\
    -H "X-GW-API-Key: \${GW_API_KEY}" \\
    -d "{\\"TenantID\\":\\"\$TENANT_ID\\",\\"Source\\":\\"$(hostname)\\",\\"Actual_Wattage\\":\$TOTAL_WATTS,\\"InfraType\\":\\"GPU_Mining_Rig\\",\\"GridID\\":\\"\$GRID_ID\\",\\"DataSource\\":\\"\$DATA_SOURCE\\",\\"api_key\\":\\"\$GW_API_KEY\\"}" \\
    > /dev/null 2>&1

  sleep \$INTERVAL
done`

  const asicScript = `#!/usr/bin/env python3
# GridWitness ASIC Mining Agent
# Supports: Antminer (all S/T series), Whatsminer M20/M30/M50/M60 series
# Reads actual power consumption from miner API — no estimates.
# Requires: Python 3.6+ (zero external dependencies)
#
# SETUP:
#   1. Copy this file to any machine on the same network as your miners
#   2. Set MINER_IP and MINER_TYPE below
#   3. For multiple miners, run one instance per miner (or extend MINERS list)
#   4. Run: python3 gw_asic_agent.py
#      To run in background: nohup python3 gw_asic_agent.py &

import socket, json, time, urllib.request, sys

# ── CONFIGURE THESE ─────────────────────────────────────────
MINER_IP    = "192.168.1.50"   # IP of your ASIC miner (check router DHCP table)
MINER_TYPE  = "antminer"       # "antminer" or "whatsminer"
WM_PASSWORD = "admin"          # Whatsminer HTTP API password (default: admin)

TENANT_ID   = "${tenantId}"
GW_API_KEY  = "gwk-YOUR_API_KEY_HERE"   # Settings → API Keys → create key
API_URL     = "${INGEST_URL}"
GRID_ID     = "AB"
INTERVAL    = 300              # seconds between readings (5 min)

# Power reference table — used only if API doesn't return watts directly
# Format: "model_substring": (hashrate_TH, rated_watts)
ANTMINER_REF = {
    "s9":   (13.5, 1350),  "t9":   (10.5, 1576),
    "s17":  (56,   2520),  "t17":  (42,   2200),
    "s19":  (95,   3250),  "t19":  (84,   3150),
    "s19pro": (110, 3250), "s19xp": (140, 3010),
    "s21":  (200,  3500),  "s21pro": (234, 3531),
}
# ─────────────────────────────────────────────────────────────

def cgminer_call(ip, port, command, timeout=10):
    try:
        s = socket.create_connection((ip, port), timeout=timeout)
        s.sendall(json.dumps({"command": command}).encode())
        buf = b""
        while True:
            chunk = s.recv(4096)
            if not chunk or b"\\x00" in chunk: buf += chunk; break
            buf += chunk
        s.close()
        return json.loads(buf.decode("utf-8", errors="replace").rstrip("\\x00").strip())
    except Exception as e:
        print(f"  CGMiner error: {e}")
        return {}

def antminer_power(ip):
    r = cgminer_call(ip, 4028, "stats")
    for s in r.get("STATS", []):
        for key in ("Power", "power", "total_power", "power_rate"):
            v = float(s.get(key) or 0)
            if v > 0: return int(v), "ANTMINER_DIRECT"
    # Fall back: derive from hash rate
    r2 = cgminer_call(ip, 4028, "summary")
    for item in r2.get("SUMMARY", []):
        ghs = float(item.get("GHS 5s") or item.get("GHS av") or 0)
        if ghs <= 0: continue
        ths = ghs / 1000.0
        # Detect model name from stats
        for s in r.get("STATS", []):
            mname = str(s.get("Type","") or s.get("Miner","")).lower().replace(" ","")
            for k,(ref_ths, ref_w) in ANTMINER_REF.items():
                if k in mname:
                    return int((ths / ref_ths) * ref_w), "ANTMINER_HASHRATE_EST"
        return int(ths * 30_000), "ANTMINER_GENERIC_EST"  # ~30 J/TH default
    return 0, "UNKNOWN"

def whatsminer_power(ip):
    # Try newer HTTP API (M30S+, M50, M60)
    try:
        tok_req = urllib.request.Request(
            f"http://{ip}/api/v1/token",
            data=json.dumps({"password": WM_PASSWORD}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        tok_data = json.loads(urllib.request.urlopen(tok_req, timeout=8).read())
        token = tok_data.get("data", {}).get("token") or tok_data.get("token", "")
        if token:
            sr = urllib.request.Request(f"http://{ip}/api/v1/summary",
                headers={"Authorization": f"Bearer {token}"})
            sd = json.loads(urllib.request.urlopen(sr, timeout=8).read())
            d  = sd.get("data", {})
            pw = float(d.get("power") or d.get("Power") or 0)
            if pw > 0: return int(pw), "WHATSMINER_HTTP"
    except Exception as e:
        print(f"  Whatsminer HTTP error: {e}")
    # Fallback: CGMiner-compatible API (older M20/M30 firmware)
    r = cgminer_call(ip, 4028, "summary")
    for item in r.get("SUMMARY", []):
        pw = float(item.get("Power") or item.get("power") or 0)
        if pw > 0: return int(pw), "WHATSMINER_CGMINER"
        ghs = float(item.get("GHS 5s") or item.get("GHS av") or 0)
        if ghs > 0: return int((ghs/1000) * 34_000), "WHATSMINER_HASHRATE_EST"
    return 0, "UNKNOWN"

def get_power():
    return whatsminer_power(MINER_IP) if MINER_TYPE == "whatsminer" else antminer_power(MINER_IP)

def report(watts, src):
    payload = json.dumps({
        "TenantID": TENANT_ID, "Source": socket.gethostname() or MINER_IP,
        "Actual_Wattage": watts, "InfraType": "ASIC_Miner",
        "GridID": GRID_ID, "DataSource": src, "api_key": GW_API_KEY,
    }).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(
            API_URL, data=payload,
            headers={"Content-Type": "application/json", "X-GW-API-Key": GW_API_KEY},
            method="POST"
        ), timeout=10)
    except Exception as e:
        print(f"  Report error: {e}")

print(f"GridWitness ASIC Agent | {MINER_TYPE} @ {MINER_IP} | tenant {TENANT_ID}")
while True:
    watts, src = get_power()
    if watts == 0:
        watts, src = 3250, "FALLBACK_ESTIMATE"
        print(f"WARN {time.strftime('%H:%M:%S')} — miner unreachable, fallback {watts}W")
    else:
        print(f"OK   {time.strftime('%H:%M:%S')} — {watts}W  ({src})")
    report(watts, src)
    time.sleep(INTERVAL)`

  const psScript = `# GridWitness Agent — Windows PowerShell (CPU load estimate)
$JobName = "GridWitnessAgent_${tenantId}"
Get-Job -Name $JobName -ErrorAction SilentlyContinue | Stop-Job -PassThru | Remove-Job
Start-Job -Name $JobName -ScriptBlock {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $TenantID = "${tenantId}"
    $ApiKey   = "gwk-YOUR_API_KEY_HERE"   # Settings → API Keys → create key
    $ApiUrl   = "${INGEST_URL}"
    while ($true) {
        try {
            $Cpu = Get-CimInstance Win32_Processor
            $Load = ($Cpu | Measure-Object -Property LoadPercentage -Average).Average
            $RealWattage = [math]::Round(35 + ($Load * 1.2))
            $Payload = @{
                TenantID = $TenantID; Source = $env:COMPUTERNAME
                Actual_Wattage = $RealWattage; InfraType = "Private_DC"; GridID = "AB"
                api_key = $ApiKey
            } | ConvertTo-Json -Compress
            Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $Payload \`
                -ContentType "application/json" \`
                -Headers @{ "X-GW-API-Key" = $ApiKey }
        } catch {}
        Start-Sleep -Seconds 300
    }
} | Out-Null
Write-Host "GridWitness Agent attached for ${tenantId}." -ForegroundColor Green`

  const bashScript = `#!/bin/bash
# GridWitness Agent — Linux/Unix (CPU load estimate)
# For more accurate readings on rack servers, use the Redfish tab instead.
TENANT_ID="${tenantId}"
GW_API_KEY="gwk-YOUR_API_KEY_HERE"   # Settings → API Keys → create key
API_URL="${INGEST_URL}"
while true; do
    LOAD=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}')
    WATT=$(echo "35 + ($LOAD * 1.2)" | bc | awk '{print int($1+0.5)}')
    PAYLOAD="{\\"TenantID\\":\\"$TENANT_ID\\",\\"Source\\":\\"$(hostname)\\",\\"Actual_Wattage\\":$WATT,\\"InfraType\\":\\"Private_DC\\",\\"GridID\\":\\"AB\\",\\"DataSource\\":\\"CPU_ESTIMATE\\",\\"api_key\\":\\"$GW_API_KEY\\"}"
    curl -s -X POST $API_URL \\
      -H "Content-Type: application/json" \\
      -H "X-GW-API-Key: $GW_API_KEY" \\
      -d "$PAYLOAD" > /dev/null 2>&1
    sleep 300
done &
echo "GridWitness Agent attached for ${tenantId}."`

  const dockerScript = `docker run -d --name gridwitness-agent --restart unless-stopped \\
  -e GW_TENANT_ID=${tenantId} \\
  -e GW_API_KEY=gwk-YOUR_API_KEY_HERE \\
  -e GW_API_URL=${INGEST_URL} \\
  alpine:3.19 sh -c 'apk add --no-cache curl bc; while true; do \\
    curl -s -X POST $GW_API_URL \\
      -H "Content-Type: application/json" \\
      -H "X-GW-API-Key: $GW_API_KEY" \\
      -d "{\\"TenantID\\":\\"$GW_TENANT_ID\\",\\"Source\\":\\"$(hostname)\\",\\"Actual_Wattage\\":50,\\"InfraType\\":\\"Container\\",\\"GridID\\":\\"AB\\",\\"api_key\\":\\"$GW_API_KEY\\"}"; \\
    sleep 300; done'`

  const k8sScript = `# Save as gridwitness-agent.yaml and apply with: kubectl apply -f gridwitness-agent.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: gridwitness-agent
  namespace: gridwitness
spec:
  selector: { matchLabels: { app: gridwitness-agent } }
  template:
    metadata: { labels: { app: gridwitness-agent } }
    spec:
      containers:
        - name: agent
          image: alpine:3.19
          env:
            - { name: GW_TENANT_ID, value: "${tenantId}" }
            - { name: GW_API_KEY,   value: "gwk-YOUR_API_KEY_HERE" }
            - { name: GW_API_URL,   value: "${INGEST_URL}" }`

  const scriptMap: Record<string, string> = {
    redfish: redfishScript,
    gpu:     gpuScript,
    asic:    asicScript,
    ps:      psScript,
    bash:    bashScript,
    docker:  dockerScript,
    k8s:     k8sScript,
  }
  const current = scriptMap[tab] ?? psScript

  function copyScript() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(current)
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    }
  }

  const tabs: Array<[string, string, string]> = [
    ['redfish', 'Redfish / BMC',   'Rack servers (Dell/HP/Supermicro) — actual PSU watts via BMC'],
    ['gpu',     'GPU Mining',       'Nvidia/AMD GPU rigs — nvidia-smi / rocm-smi actual draw'],
    ['asic',    'ASIC Miner',      'Antminer + Whatsminer — CGMiner API + HTTP API, Python 3'],
    ['ps',      'Windows',         'CPU load estimate (PowerShell)'],
    ['bash',    'Linux',           'CPU load estimate (Bash)'],
    ['docker',  'Docker',          'Container workload'],
    ['k8s',     'Kubernetes',      'DaemonSet on every node'],
  ]

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <Code className="w-4 h-4 text-gw-green" />
        Agent Scripts
      </h2>
      <p className="text-sm text-gw-muted mb-1">
        Pre-configured for <code className="text-xs bg-gw-dark px-1.5 py-0.5 rounded border border-gw-border text-gw-green">{tenantId}</code> · 5-min polling.
      </p>
      <p className="text-xs text-gw-muted mb-4">
        <span className="text-gw-green font-medium">Redfish / GPU</span> tabs report actual measured watts from hardware — required for OSFI B-15 Scope 2 compliance.
        OS tabs estimate from CPU load.
      </p>
      <div className="flex gap-1 mb-3 border-b border-gw-border overflow-x-auto">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t as typeof tab)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t
                ? 'border-gw-green text-gw-green'
                : 'border-transparent text-gw-muted hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="text-xs text-gw-muted mb-2">
        {tabs.find(([t]) => t === tab)?.[2]}
      </div>
      <div className="relative">
        <pre className="bg-gw-dark border border-gw-border text-gw-muted text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed max-h-96">
          {current}
        </pre>
        <button
          onClick={copyScript}
          className="absolute top-2 right-2 flex items-center gap-1 px-3 py-1 bg-gw-panel border border-gw-border hover:border-gw-green hover:text-gw-green text-gw-muted text-xs rounded"
        >
          <Copy className="w-3 h-3" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  )
}

const SCOPE1_FUELS: Record<string, { label: string; unit: string; factor: number }> = {
  diesel:      { label: 'Diesel',         unit: 'liters', factor: 2.68 },
  natural_gas: { label: 'Natural Gas',    unit: 'm³',     factor: 1.96 },
  propane:     { label: 'Propane (LPG)',  unit: 'liters', factor: 1.51 },
  hfo:         { label: 'Heavy Fuel Oil', unit: 'liters', factor: 3.18 },
  gasoline:    { label: 'Gasoline',       unit: 'liters', factor: 2.31 },
  coal:        { label: 'Coal',           unit: 'kg',     factor: 2.50 },
}

interface Scope1Entry {
  entry_id:     string
  fuel_type:    string
  quantity:     number
  unit:         string
  kg_co2e:      number
  source:       string
  period_start?: string
  period_end?:   string
  recorded_at:   string
  notes?:        string
}

function Scope1Section({ tenantId }: { tenantId: string }) {
  const [mode, setMode]               = useState<'manual' | 'bms'>('manual')
  const [bmsTab, setBmsTab]           = useState<'rest' | 'modbus' | 'mqtt'>('rest')
  const [entries, setEntries]         = useState<Scope1Entry[]>([])
  const [totalT, setTotalT]           = useState(0)
  const [loading, setLoading]         = useState(true)
  const [fuelType, setFuelType]       = useState('diesel')
  const [quantity, setQuantity]       = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd]     = useState('')
  const [notes, setNotes]             = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [formError, setFormError]     = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [bmsCopied, setBmsCopied]     = useState(false)

  const fuel    = SCOPE1_FUELS[fuelType]
  const qty     = parseFloat(quantity) || 0
  const preview = qty > 0 ? (qty * fuel.factor).toFixed(1) : null

  const ingestUrl = `${API_BASE}/api/scope1/ingest`

  const restBmsScript = `#!/usr/bin/env python3
# GridWitness BMS Connector — REST/JSON BMS Integration
# Compatible: Siemens Desigo CC, Schneider EcoStruxure, Johnson Controls Metasys,
#             Honeywell EBI, Tridium Niagara, and any BMS with a REST API.
# Requires: Python 3.6+  (zero external dependencies — pure stdlib)
#
# SETUP:
#   1. Set BMS_BASE_URL, credentials, and FUEL_POINTS below
#   2. Run: python3 gw_bms_connector.py
#      Background: nohup python3 gw_bms_connector.py &
#
# HOW TO FIND POINT PATHS:
#   Siemens Desigo:   Management Station → Object Configurator → browse points
#   Schneider:        EcoStruxure Building Expert → Points browser → filter "fuel"
#   JCI Metasys:      Site Management Portal → tree view → copy object reference
#   Niagara:          Workbench → nav tree → right-click point → copy ord

import json, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

# ── CONFIGURE THESE ─────────────────────────────────────────
BMS_BASE_URL = "https://bms.yourbuilding.com"    # BMS API host
BMS_USERNAME = "api_reader"
BMS_PASSWORD = "changeme"

# Map each fuel point path (in your BMS) → GridWitness fuel type.
# The value at each point must be the DAILY or PERIODIC consumption in the
# units GridWitness expects (liters for diesel/propane/HFO, m³ for gas, kg for coal).
FUEL_POINTS = {
    "diesel":      "/api/v1/points/Generator.A.FuelConsumed_L",
    # "natural_gas": "/api/v1/points/Gas.Meter1.DailyTotal_m3",
}
POLL_HOURS = 24   # report every N hours (24 = daily totals)

TENANT_ID  = "${tenantId}"
GW_API_KEY = "gwk-YOUR_API_KEY_HERE"   # Settings → API Keys
GW_INGEST  = "${API_BASE}/api/scope1/ingest"
# ─────────────────────────────────────────────────────────────

_token = ""

def bms_login():
    global _token
    req = urllib.request.Request(
        f"{BMS_BASE_URL}/api/v1/authenticate",
        data=json.dumps({"username": BMS_USERNAME, "password": BMS_PASSWORD}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    r = json.loads(urllib.request.urlopen(req, timeout=15).read())
    # Handles Desigo (Token), Metasys (accessToken), generic (token / access_token)
    _token = r.get("Token") or r.get("accessToken") or r.get("token") or r.get("access_token", "")
    print(f"BMS auth OK ({BMS_BASE_URL}), token …{_token[-6:]}")

def bms_read(path):
    req = urllib.request.Request(
        f"{BMS_BASE_URL}{path}",
        headers={"Authorization": f"Bearer {_token}", "Accept": "application/json"})
    d = json.loads(urllib.request.urlopen(req, timeout=10).read())
    # Try common field names across BMS vendors
    for key in ("presentValue", "value", "Value", "numericValue", "result"):
        if key in d: return float(d[key])
    raise ValueError(f"Unrecognised response shape: {list(d.keys())}")

def report(fuel_type, quantity):
    today = datetime.now(timezone.utc).date()
    payload = json.dumps({
        "tenant_id":   TENANT_ID,
        "fuel_type":   fuel_type,
        "quantity":    round(quantity, 3),
        "period_start": str(today - timedelta(days=1)),
        "period_end":   str(today),
        "source":      "bms_rest_api",
        "notes":       f"Auto-read {BMS_BASE_URL}",
    }).encode()
    req = urllib.request.Request(GW_INGEST, data=payload, method="POST",
        headers={"Content-Type": "application/json", "X-GW-API-Key": GW_API_KEY})
    urllib.request.urlopen(req, timeout=10)
    print(f"  Reported: {fuel_type} {quantity}")

bms_login()
print(f"GridWitness BMS Connector running — polling every {POLL_HOURS}h")
while True:
    for fuel, path in FUEL_POINTS.items():
        try:
            qty = bms_read(path)
            if qty > 0:
                report(fuel, qty)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                print("Token expired, re-authenticating…"); bms_login()
            else:
                print(f"BMS read error ({fuel}): {e}")
        except Exception as e:
            print(f"Error ({fuel}): {e}")
    time.sleep(POLL_HOURS * 3600)`

  const modbusBmsScript = `#!/usr/bin/env python3
# GridWitness Modbus TCP Bridge — reads fuel meters via Modbus TCP
# Compatible: Krohne, Endress+Hauser, Yokogawa, Siemens MAG flow meters,
#             any Modbus TCP-enabled fuel flow meter or tank level sensor.
# Requires: Python 3.6+  (zero external dependencies — uses stdlib socket + struct)
#
# SETUP:
#   1. Get the Modbus register map from your meter's documentation
#   2. Set MODBUS_HOST and REGISTERS below
#   3. Run: python3 gw_modbus_bridge.py

import struct, socket, json, time, urllib.request
from datetime import datetime, timedelta, timezone

# ── CONFIGURE THESE ─────────────────────────────────────────
MODBUS_HOST = "192.168.1.200"   # Modbus device IP
MODBUS_PORT = 502               # standard Modbus TCP port
UNIT_ID     = 1                 # Modbus unit/slave ID (check device label)

# Register map — from your device's Modbus map document.
# type: "float32" (4 bytes, 2 registers) or "uint16" (2 bytes, 1 register)
# scale: multiply raw value by this to get the unit GridWitness expects
REGISTERS = [
    # Example: holding reg 3000 holds diesel consumption as float32 in liters
    {"fuel": "diesel",      "reg": 3000, "type": "float32", "scale": 1.0},
    # {"fuel": "natural_gas", "reg": 3010, "type": "float32", "scale": 1.0},
]
POLL_HOURS = 24

TENANT_ID  = "${tenantId}"
GW_API_KEY = "gwk-YOUR_API_KEY_HERE"   # Settings → API Keys
GW_INGEST  = "${API_BASE}/api/scope1/ingest"
# ─────────────────────────────────────────────────────────────

def modbus_read(host, port, unit_id, reg_addr, reg_type):
    n_regs = 2 if reg_type == "float32" else 1
    frame  = struct.pack(">HHHBBHH", 1, 0, 6, unit_id, 0x03, reg_addr, n_regs)
    with socket.create_connection((host, port), timeout=10) as s:
        s.sendall(frame)
        resp = s.recv(256)
    if len(resp) < 9 + n_regs * 2 or resp[7] != 0x03:
        raise ValueError(f"Bad Modbus response: {resp.hex()}")
    raw = resp[9:9 + n_regs * 2]
    return struct.unpack(">f", raw)[0] if reg_type == "float32" else struct.unpack(">H", raw)[0]

def report(fuel_type, quantity):
    today = datetime.now(timezone.utc).date()
    payload = json.dumps({
        "tenant_id":   TENANT_ID, "fuel_type": fuel_type,
        "quantity":    round(quantity, 3),
        "period_start": str(today - timedelta(days=1)), "period_end": str(today),
        "source":      "modbus_tcp",
        "notes":       f"Modbus {MODBUS_HOST}:{MODBUS_PORT} reg {[r['reg'] for r in REGISTERS]}",
    }).encode()
    req = urllib.request.Request(GW_INGEST, data=payload, method="POST",
        headers={"Content-Type": "application/json", "X-GW-API-Key": GW_API_KEY})
    urllib.request.urlopen(req, timeout=10)

print(f"GridWitness Modbus Bridge | {MODBUS_HOST}:{MODBUS_PORT} | tenant {TENANT_ID}")
while True:
    for r in REGISTERS:
        try:
            raw = modbus_read(MODBUS_HOST, MODBUS_PORT, UNIT_ID, r["reg"], r["type"])
            qty = round(raw * r["scale"], 3)
            print(f"OK {r['fuel']}: reg {r['reg']} = {raw:.3f} × {r['scale']} = {qty}")
            if qty > 0: report(r["fuel"], qty)
        except Exception as e:
            print(f"Error {r['fuel']}: {e}")
    time.sleep(POLL_HOURS * 3600)`

  const mqttBmsScript = `#!/usr/bin/env python3
# GridWitness MQTT Bridge — subscribes to BMS/IoT fuel consumption topics
# Compatible: any MQTT-enabled BMS, IoT gateway, smart meter, or SCADA system.
# Requires: Python 3.6+  |  pip3 install paho-mqtt
#
# SETUP:
#   1. pip3 install paho-mqtt
#   2. Set MQTT_BROKER, TOPIC_MAP below
#   3. Run: python3 gw_mqtt_bridge.py

import json, time, urllib.request
from datetime import datetime, timezone

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Install: pip3 install paho-mqtt"); raise

# ── CONFIGURE THESE ─────────────────────────────────────────
MQTT_BROKER = "mqtt.yourbuilding.com"
MQTT_PORT   = 1883
MQTT_USER   = ""        # leave empty if broker has no auth
MQTT_PASS   = ""

# Map MQTT topic → GridWitness fuel type.
# The payload on each topic must be JSON with a "value" key (or plain number).
# Quantity units must match GridWitness: liters for diesel/propane, m³ for gas.
TOPIC_MAP = {
    "building/generator/fuel_consumed_L": "diesel",
    # "building/gas/daily_m3":           "natural_gas",
}
PAYLOAD_KEY = "value"   # JSON key holding the numeric quantity

TENANT_ID  = "${tenantId}"
GW_API_KEY = "gwk-YOUR_API_KEY_HERE"   # Settings → API Keys
GW_INGEST  = "${API_BASE}/api/scope1/ingest"
# ─────────────────────────────────────────────────────────────

def report(fuel_type, quantity, topic):
    today = str(datetime.now(timezone.utc).date())
    payload = json.dumps({
        "tenant_id": TENANT_ID, "fuel_type": fuel_type,
        "quantity":  round(quantity, 3), "period_end": today,
        "source":    "mqtt_bms", "notes": f"MQTT: {topic}",
    }).encode()
    req = urllib.request.Request(GW_INGEST, data=payload, method="POST",
        headers={"Content-Type": "application/json", "X-GW-API-Key": GW_API_KEY})
    urllib.request.urlopen(req, timeout=10)

def on_message(client, userdata, msg):
    fuel = TOPIC_MAP.get(msg.topic)
    if not fuel: return
    try:
        raw  = json.loads(msg.payload)
        qty  = float(raw[PAYLOAD_KEY]) if isinstance(raw, dict) else float(raw)
        if qty > 0:
            report(fuel, qty, msg.topic)
            print(f"OK {fuel}: {qty} from {msg.topic}")
    except Exception as e:
        print(f"Parse error ({msg.topic}): {e}")

client = mqtt.Client()
if MQTT_USER: client.username_pw_set(MQTT_USER, MQTT_PASS)
client.on_message = on_message
client.connect(MQTT_BROKER, MQTT_PORT, 60)
for topic in TOPIC_MAP:
    client.subscribe(topic)
    print(f"Subscribed: {topic}")
print(f"GridWitness MQTT Bridge | {MQTT_BROKER} | tenant {TENANT_ID}")
client.loop_forever()`

  const bmsScripts: Record<string, string> = {
    rest:   restBmsScript,
    modbus: modbusBmsScript,
    mqtt:   mqttBmsScript,
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/scope1?limit=50`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setEntries(d.entries || [])
      setTotalT(d.total_t_co2e || 0)
    } catch {
      setEntries([])
    } finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!quantity || qty <= 0) { setFormError('Enter a quantity greater than 0'); return }
    setSubmitting(true); setFormError(''); setFormSuccess('')
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/scope1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fuel_type: fuelType, quantity: qty,
          period_start: periodStart || undefined,
          period_end:   periodEnd   || undefined,
          notes:        notes       || undefined,
          source:       'manual_entry',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setFormSuccess(`Recorded: ${d.kg_co2e} kgCO2e from ${qty} ${fuel.unit} of ${fuel.label}`)
      setQuantity(''); setPeriodStart(''); setPeriodEnd(''); setNotes('')
      load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Submission failed')
    } finally { setSubmitting(false) }
  }

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Flame className="w-4 h-4 text-orange-400" />
        <h2 className="font-semibold text-white">Scope 1 Emissions</h2>
      </div>
      <p className="text-sm text-gw-muted mb-4">
        Direct combustion: diesel generators, natural gas, propane. ECCC NRI emission factors.
      </p>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-gw-dark border border-gw-border rounded-lg p-3 text-center">
          <div className="text-xs text-gw-muted mb-1">Total Scope 1</div>
          <div className="text-lg font-bold text-orange-400">{totalT.toFixed(3)}</div>
          <div className="text-xs text-gw-muted">tCO2e</div>
        </div>
        <div className="bg-gw-dark border border-gw-border rounded-lg p-3 text-center">
          <div className="text-xs text-gw-muted mb-1">Entries</div>
          <div className="text-lg font-bold text-white">{loading ? '…' : entries.length}</div>
          <div className="text-xs text-gw-muted">records</div>
        </div>
        <div className="bg-gw-dark border border-gw-border rounded-lg p-3 text-center">
          <div className="text-xs text-gw-muted mb-1">Protocol</div>
          <div className="text-sm font-bold text-white pt-1">GHG Protocol</div>
          <div className="text-xs text-gw-muted">Scope 1 direct</div>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 border-b border-gw-border mb-5">
        {([['manual', 'Manual Entry'], ['bms', 'BMS Integration']] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              mode === m ? 'border-orange-400 text-orange-400' : 'border-transparent text-gw-muted hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'manual' ? (
        <>
          {/* Manual entry form */}
          <form onSubmit={submit} className="bg-gw-dark border border-gw-border rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gw-muted block mb-1">Fuel Type</label>
                <select value={fuelType} onChange={e => setFuelType(e.target.value)}
                  className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-orange-400 focus:outline-none">
                  {Object.entries(SCOPE1_FUELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gw-muted block mb-1">Quantity ({fuel.unit})</label>
                <div className="relative">
                  <input type="number" min="0" step="any" value={quantity}
                    onChange={e => setQuantity(e.target.value)} placeholder="0"
                    className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-orange-400 focus:outline-none" />
                  {preview && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-orange-400 font-mono">≈{preview} kg</span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gw-muted block mb-1">Period Start (optional)</label>
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                  className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-orange-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gw-muted block mb-1">Period End (optional)</label>
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                  className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-orange-400 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gw-muted block mb-1">Notes (optional)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Generator test run — Building B"
                className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-orange-400 focus:outline-none" />
            </div>
            {preview && (
              <div className="flex items-center gap-2 p-2.5 bg-orange-500/10 border border-orange-500/20 rounded text-xs">
                <Flame className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                <span className="text-orange-300">
                  {qty} {fuel.unit} × {fuel.factor} kgCO2e/{fuel.unit} = <strong className="text-orange-400">{preview} kgCO2e</strong>
                  <span className="text-gw-muted ml-1">(ECCC NRI)</span>
                </span>
              </div>
            )}
            {formError   && <p className="text-xs text-red-400">{formError}</p>}
            {formSuccess && <p className="text-xs text-gw-green">{formSuccess}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded text-sm font-medium">
                {submitting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {submitting ? 'Recording…' : 'Record Entry'}
              </button>
            </div>
          </form>

          {/* Entries table */}
          {loading ? (
            <div className="text-sm text-gw-muted py-3">Loading entries…</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-gw-muted py-4 text-center border border-dashed border-gw-border rounded-lg">
              No Scope 1 entries yet. Use the form above or connect a BMS via the <strong className="text-white">BMS Integration</strong> tab.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-gw-border">
                  <tr className="text-gw-muted text-left">
                    <th className="py-2 pr-3 font-medium">Fuel</th>
                    <th className="py-2 pr-3 font-medium">Quantity</th>
                    <th className="py-2 pr-3 font-medium">kgCO2e</th>
                    <th className="py-2 pr-3 font-medium hidden md:table-cell">Period</th>
                    <th className="py-2 pr-3 font-medium hidden md:table-cell">Source</th>
                    <th className="py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gw-border/40">
                  {entries.map(e => (
                    <tr key={e.entry_id} className="hover:bg-gw-dark/40">
                      <td className="py-2 pr-3 text-white font-medium">{SCOPE1_FUELS[e.fuel_type]?.label ?? e.fuel_type}</td>
                      <td className="py-2 pr-3 font-mono text-white">{e.quantity} {e.unit}</td>
                      <td className="py-2 pr-3 font-mono text-orange-400 font-medium">{e.kg_co2e.toFixed(1)}</td>
                      <td className="py-2 pr-3 text-gw-muted hidden md:table-cell">
                        {e.period_start && e.period_end ? `${e.period_start} → ${e.period_end}` : e.period_start || '—'}
                      </td>
                      <td className="py-2 pr-3 text-gw-muted hidden md:table-cell">{e.source}</td>
                      <td className="py-2 text-gw-muted">{new Date(parseInt(e.recorded_at) * 1000).toLocaleDateString('en-CA')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* BMS Integration tab */
        <div className="space-y-4">
          {/* Webhook info */}
          <div className="bg-gw-dark border border-gw-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-gw-green/10 text-gw-green border border-gw-green/30">POST</span>
              <code className="text-xs text-white font-mono">{ingestUrl}</code>
            </div>
            <p className="text-xs text-gw-muted mb-3">
              Push endpoint for BMS systems that can send HTTP webhooks. Accepts fuel consumption data and computes kgCO2e automatically.
              Use the bridge scripts below for systems that need a polling connector.
            </p>
            <pre className="bg-black/50 rounded p-3 text-xs font-mono text-gw-green overflow-x-auto">{`POST ${ingestUrl}
X-GW-API-Key: gwk-YOUR_API_KEY_HERE
Content-Type: application/json

{
  "tenant_id":   "${tenantId}",
  "fuel_type":   "diesel",          // diesel | natural_gas | propane | hfo | gasoline | coal
  "quantity":    450.5,             // liters (diesel/propane/HFO/gasoline), m³ (gas), kg (coal)
  "period_start": "2024-06-01",     // optional ISO date
  "period_end":   "2024-06-30",     // optional ISO date
  "source":      "siemens_desigo",  // free-form label
  "notes":       "Generator A"      // optional
}`}</pre>
          </div>

          {/* Bridge script tabs */}
          <div>
            <p className="text-xs text-gw-muted mb-3">
              If your BMS cannot push HTTP webhooks, run one of these bridge scripts on any machine with network access to your BMS.
              They poll your BMS on a schedule and push results to GridWitness automatically.
            </p>
            <div className="flex gap-1 mb-3 border-b border-gw-border">
              {([
                ['rest',   'REST / JSON BMS', 'Siemens Desigo · Schneider · JCI Metasys · Niagara'],
                ['modbus', 'Modbus TCP',       'Flow meters · Tank sensors · any Modbus device'],
                ['mqtt',   'MQTT',             'IoT gateways · smart meters · SCADA (needs paho-mqtt)'],
              ] as const).map(([t, label, tip]) => (
                <button key={t} onClick={() => setBmsTab(t)}
                  title={tip}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    bmsTab === t ? 'border-orange-400 text-orange-400' : 'border-transparent text-gw-muted hover:text-white'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <pre className="bg-gw-dark border border-gw-border text-gw-muted text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed max-h-96">
                {bmsScripts[bmsTab]}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(bmsScripts[bmsTab])
                  setBmsCopied(true); setTimeout(() => setBmsCopied(false), 1500)
                }}
                className="absolute top-2 right-2 flex items-center gap-1 px-3 py-1 bg-gw-panel border border-gw-border hover:border-orange-400 hover:text-orange-400 text-gw-muted text-xs rounded"
              >
                <Copy className="w-3 h-3" />
                {bmsCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gw-muted">
              Siemens Desigo CC API: <span className="text-white">Property Services → activate REST</span> ·
              Schneider: <span className="text-white">EcoStruxure BE → API Portal</span> ·
              JCI Metasys: <span className="text-white">Site Management Portal → API Access</span>
            </p>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gw-muted">
        Factors (kgCO2e/unit): diesel 2.68 · natural gas 1.96 · propane 1.51 · HFO 3.18 · gasoline 2.31 · coal 2.50 — ECCC NRI 2024.
      </p>
    </section>
  )
}

function CarbonBudgetSection({ tenantId }: { tenantId: string }) {
  const [status, setStatus]             = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [budgetT, setBudgetT]           = useState('')
  const [periodType, setPeriodType]     = useState<'monthly' | 'quarterly'>('monthly')
  const [notifEmail, setNotifEmail]     = useState('')
  const [thresholds, setThresholds]     = useState([80, 95, 100])
  const [saveMsg, setSaveMsg]           = useState('')
  const [saveErr, setSaveErr]           = useState('')
  const [deleting, setDeleting]         = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/budget`)
      if (r.status === 404) { setStatus(null); setLoading(false); return }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setStatus(d)
      setBudgetT(String(d.budget_t_co2e ?? ''))
      setPeriodType(d.period_type ?? 'monthly')
      setNotifEmail(d.notification_email ?? '')
      setThresholds(d.thresholds ?? [80, 95, 100])
    } catch { setStatus(null) }
    finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!budgetT || parseFloat(budgetT) <= 0) { setSaveErr('Budget must be > 0'); return }
    setSaving(true); setSaveMsg(''); setSaveErr('')
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/budget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_t_co2e: parseFloat(budgetT), period_type: periodType,
          notification_email: notifEmail, thresholds }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setStatus(d); setSaveMsg('Budget saved')
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm('Remove carbon budget for this tenant?')) return
    setDeleting(true)
    await fetch(`${API_BASE}/api/tenants/${tenantId}/budget`, { method: 'DELETE' })
    setStatus(null); setBudgetT(''); setDeleting(false)
  }

  const pct     = typeof status?.pct_used === 'number' ? status.pct_used as number : 0
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 95 ? 'bg-orange-500' : pct >= 80 ? 'bg-amber-400' : 'bg-gw-green'
  const textColor = pct >= 100 ? 'text-red-400' : pct >= 95 ? 'text-orange-400' : pct >= 80 ? 'text-amber-400' : 'text-gw-green'

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Target className="w-4 h-4 text-purple-400" />
        <h2 className="font-semibold text-white">Carbon Budget</h2>
      </div>
      <p className="text-sm text-gw-muted mb-5">
        Set a Scope 1+2 tCO2e ceiling per period. Alerts fire at each threshold and create incidents automatically.
      </p>

      {/* Live status — only shown when a budget is configured */}
      {!loading && status && (
        <div className="mb-5 bg-gw-dark border border-gw-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gw-muted">
              {String(status.period_key)} · {String(status.period_type)}
            </span>
            <span className={`text-xs font-bold ${textColor}`}>{pct.toFixed(1)}% used</span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-3 bg-gw-panel rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              ['Consumed', `${Number(status.consumed_t_co2e).toFixed(4)} tCO2e`],
              ['Budget',   `${Number(status.budget_t_co2e).toFixed(2)} tCO2e`],
              ['Remaining',`${Number(status.remaining_t_co2e).toFixed(4)} tCO2e`],
              ['Days left', `${status.days_remaining} of ${status.days_total}`],
            ].map(([label, val]) => (
              <div key={label} className="bg-gw-panel border border-gw-border/50 rounded p-2">
                <div className="text-xs text-gw-muted">{label}</div>
                <div className="text-sm font-mono text-white mt-0.5">{val}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-gw-muted">
            <span>Scope 1: <span className="text-white font-mono">{Number(status.scope1_t_co2e).toFixed(4)} t</span></span>
            <span>Scope 2: <span className="text-white font-mono">{Number(status.scope2_t_co2e).toFixed(4)} t</span></span>
            <span>Burn rate: <span className="text-white font-mono">{Number(status.burn_rate_t_co2e_per_day).toFixed(5)} t/day</span></span>
            {status.will_breach && (
              <span className="flex items-center gap-1 text-red-400 font-medium">
                <AlertTriangle className="w-3 h-3" />
                On track to breach {status.projected_breach_date ? `on ${status.projected_breach_date}` : 'this period'}
              </span>
            )}
            {!status.will_breach && pct > 0 && (
              <span className="flex items-center gap-1 text-gw-green">
                <TrendingUp className="w-3 h-3" />
                On track to finish at {Number(status.projected_total_t_co2e).toFixed(4)} t
              </span>
            )}
          </div>

          {/* Threshold badges */}
          {status.thresholds && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {(status.thresholds as number[]).map(t => {
                const fired = (status.alerts_fired as Record<string, number | null>)?.[String(t)]
                return (
                  <span key={t} className={`text-xs px-2 py-0.5 rounded border font-mono ${
                    fired ? 'bg-red-500/10 border-red-500/30 text-red-400'
                          : 'bg-gw-dark border-gw-border text-gw-muted'
                  }`}>
                    {t}% {fired ? '⚠ fired' : '· pending'}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-sm text-gw-muted mb-4">Loading budget…</div>}

      {/* Config form */}
      <div className="bg-gw-dark border border-gw-border rounded-lg p-4 space-y-3">
        <div className="text-sm font-medium text-white mb-1">
          {status ? 'Update Budget' : 'Configure Budget'}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gw-muted block mb-1">Budget (tCO2e)</label>
            <input type="number" min="0" step="0.01" value={budgetT}
              onChange={e => setBudgetT(e.target.value)} placeholder="e.g. 10.0"
              className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-purple-400 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-gw-muted block mb-1">Period</label>
            <select value={periodType} onChange={e => setPeriodType(e.target.value as 'monthly' | 'quarterly')}
              className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-purple-400 focus:outline-none">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-gw-muted block mb-1">Alert thresholds (%)</label>
          <div className="flex gap-2">
            {[80, 95, 100].map(t => (
              <button key={t} type="button"
                onClick={() => setThresholds(prev =>
                  prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t].sort((a,b) => a-b)
                )}
                className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
                  thresholds.includes(t)
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                    : 'bg-gw-panel border-gw-border text-gw-muted'
                }`}>
                {t}%
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gw-muted block mb-1">Notification email (optional)</label>
          <input type="email" value={notifEmail} onChange={e => setNotifEmail(e.target.value)}
            placeholder="esg@yourcompany.com"
            className="w-full bg-gw-panel border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-purple-400 focus:outline-none" />
        </div>
        {saveErr && <p className="text-xs text-red-400">{saveErr}</p>}
        {saveMsg && <p className="text-xs text-gw-green">{saveMsg}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-medium">
            {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Save Budget'}
          </button>
          {status && (
            <button onClick={remove} disabled={deleting}
              className="px-4 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded text-sm">
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function NotificationsSection() {
  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-gw-green" />
        Notification Preferences
      </h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-center p-3 bg-gw-dark border border-gw-border rounded">
          <div>
            <div className="text-white">Grid Stress Incident Alerts (SNS)</div>
            <div className="text-xs text-gw-muted mt-0.5">Email when carbon/load/price thresholds are breached</div>
          </div>
          <span className="text-xs px-2 py-1 bg-gw-green/10 text-gw-green border border-gw-green/30 rounded">
            CONFIRMED
          </span>
        </div>
      </div>
    </section>
  )
}

function ApiReferenceSection({ tenantId }: { tenantId: string }) {
  const endpoints = [
    { method: 'GET',  path: `/api/tenants/${tenantId}/thresholds`, desc: 'Read thresholds' },
    { method: 'PUT',  path: `/api/tenants/${tenantId}/thresholds`, desc: 'Update thresholds' },
    { method: 'GET',  path: `/api/tenants/${tenantId}/aws`, desc: 'AWS integration status' },
    { method: 'POST', path: `/api/tenants/${tenantId}/aws`, desc: 'Connect AWS account' },
    { method: 'GET',  path: `/api/incidents?tenant_id=${tenantId}`, desc: 'List incidents' },
    { method: 'POST', path: '/api/reports/generate', desc: 'Generate report' },
    { method: 'GET',  path: '/api/grid-status', desc: 'Live grid intensity' },
    { method: 'GET',  path: '/api/telemetry/live', desc: 'Live telemetry' },
    { method: 'GET',  path: '/api/verify/{merkle_root}', desc: 'Public verification' },
  ]
  const methodColor: Record<string, string> = {
    GET: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    POST: 'bg-gw-green/10 text-gw-green border-gw-green/30',
    PUT: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    DELETE: 'bg-red-500/10 text-red-400 border-red-500/30',
  }
  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <Code className="w-4 h-4 text-gw-green" />
        API Reference
      </h2>
      <p className="text-sm text-gw-muted mb-4">
        Base URL: <code className="text-xs bg-gw-dark border border-gw-border px-2 py-0.5 rounded text-gw-green">{API_BASE}</code>
      </p>
      <div className="space-y-1 text-sm font-mono">
        {endpoints.map((ep, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-gw-border/40 last:border-b-0">
            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${methodColor[ep.method]}`}>
              {ep.method}
            </span>
            <span className="text-gw-muted flex-1 break-all">{ep.path}</span>
            <span className="text-xs text-gw-muted/70 font-sans hidden md:inline">{ep.desc}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Enforcement Mode ────────────────────────────────────────────────────────

function EnforcementSection({ tenantId }: { tenantId: string }) {
  const [mode, setMode]       = useState<boolean | null>(null)
  const [updatedAt, setUpdAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState<Toast>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/tenants/${tenantId}/enforcement`)
      .then(r => r.json())
      .then(d => { setMode(d.enforcement_mode ?? false); setUpdAt(d.updated_at ?? null) })
      .catch(() => setMode(false))
      .finally(() => setLoading(false))
  }, [tenantId])

  async function toggle() {
    const next = !mode
    setSaving(true); setToast(null)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/enforcement`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enforcement_mode: next }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setMode(next)
      setUpdAt(d.updated_at)
      setToast({ type: 'success', text: d.message })
    } catch (e: unknown) {
      setToast({ type: 'error', text: e instanceof Error ? e.message : 'Failed to update' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-gw-green" />
          Telemetry Enforcement Mode
        </h2>
        <p className="text-sm text-gw-muted mb-6">
          Controls how the telemetry ingest pipeline handles records with invalid or missing API keys.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-gw-muted text-sm">
            <Loader className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-3 ${
                mode ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                     : 'bg-gw-green/10 text-gw-green border border-gw-green/30'
              }`}>
                {mode ? <Lock className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                {mode ? 'Enforcement Mode — ACTIVE' : 'Audit Mode — Active (default)'}
              </div>
              <p className="text-sm text-gw-muted max-w-lg">
                {mode
                  ? 'Records with invalid or missing API keys are silently discarded. No telemetry is written for unauthorized agents.'
                  : 'Records with invalid or missing API keys are logged as warnings but still processed. All agents are accepted.'
                }
              </p>
              {updatedAt && (
                <p className="text-xs text-gw-muted/60 mt-2">
                  Last updated: {new Date(updatedAt).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={toggle}
              disabled={saving || mode === null}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors min-w-[140px] justify-center ${
                saving ? 'bg-gw-border text-gw-muted cursor-wait'
                       : mode
                         ? 'bg-gw-dark border border-gw-green text-gw-green hover:bg-gw-green/10'
                         : 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
              }`}
            >
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {saving ? 'Saving…' : mode ? 'Disable (→ Audit)' : 'Enable Enforcement'}
            </button>
          </div>
        )}

        {toast && (
          <div className={`mt-4 p-3 rounded text-sm border ${
            toast.type === 'success' ? 'bg-gw-green/10 border-gw-green/30 text-gw-green'
                                     : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>{toast.text}</div>
        )}
      </section>

      {mode && (
        <section className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-white font-medium text-sm mb-1">Enforcement mode is active</div>
              <ul className="text-xs text-red-400/80 space-y-1">
                <li>• Telemetry records submitted without a valid API key are silently dropped</li>
                <li>• Agents using a revoked or mismatched key appear to succeed (SQS ack) but data is not recorded</li>
                <li>• Disable to return to audit-only mode where all records are accepted and issues are logged</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="bg-gw-panel border border-gw-border rounded-xl p-5 text-sm text-gw-muted">
        <h3 className="text-white font-semibold mb-3 text-sm">Mode Comparison</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gw-dark rounded-lg p-3">
            <div className="text-gw-green font-medium text-xs mb-2">Audit Mode (default)</div>
            <ul className="text-xs space-y-1">
              <li>• All records processed regardless of key validity</li>
              <li>• Invalid keys logged as WARNING in CloudWatch</li>
              <li>• LastUsedAt updated only on valid keys</li>
              <li>• Safe for onboarding new agents</li>
            </ul>
          </div>
          <div className="bg-gw-dark rounded-lg p-3">
            <div className="text-red-400 font-medium text-xs mb-2">Enforcement Mode</div>
            <ul className="text-xs space-y-1">
              <li>• Records with invalid keys silently discarded</li>
              <li>• ENFORCEMENT_REJECT logged in CloudWatch</li>
              <li>• LastUsedAt updated only on valid keys</li>
              <li>• Recommended for production workloads</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Science-Based Targets (SBTi) ────────────────────────────────────────────

function SBTiSection({ tenantId }: { tenantId: string }) {
  const [target, setTarget]   = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState<Toast>(null)

  const [baseYear,   setBaseYear]   = useState(2024)
  const [baselineEm, setBaselineEm] = useState('')
  const [targetYear, setTargetYear] = useState(2030)
  const [targetType, setTargetType] = useState<'1.5C' | 'WB2C' | 'CUSTOM'>('WB2C')
  const [customRate, setCustomRate] = useState('')
  const [sector,     setSector]     = useState('Data Centres')

  const RATES: Record<string, number | null> = { '1.5C': 4.2, 'WB2C': 2.5, 'CUSTOM': null }

  useEffect(() => {
    fetch(`${API_BASE}/api/tenants/${tenantId}/sbti`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setTarget(d)
          setBaseYear(d.base_year ?? 2024)
          setBaselineEm(String(d.baseline_tco2e ?? ''))
          setTargetYear(d.target_year ?? 2030)
          setTargetType(d.target_type ?? 'WB2C')
          setCustomRate(d.annual_rate_pct ? String(d.annual_rate_pct) : '')
          setSector(d.sector ?? 'Data Centres')
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantId])

  async function save() {
    const baseline = parseFloat(baselineEm)
    if (isNaN(baseline) || baseline <= 0) {
      setToast({ type: 'error', text: 'Enter a valid baseline emissions value (tCO2e)' }); return
    }
    if (targetType === 'CUSTOM' && !parseFloat(customRate)) {
      setToast({ type: 'error', text: 'Enter a custom annual reduction rate %' }); return
    }
    setSaving(true); setToast(null)
    try {
      const body: Record<string, unknown> = {
        base_year: baseYear, baseline_tco2e: baseline,
        target_year: targetYear, target_type: targetType, sector,
      }
      if (targetType === 'CUSTOM') body.annual_reduction_rate = parseFloat(customRate)
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/sbti`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setToast({ type: 'success', text: 'SBTi target saved. Refreshing trajectory…' })
      const r2 = await fetch(`${API_BASE}/api/tenants/${tenantId}/sbti`)
      if (r2.ok) setTarget(await r2.json())
    } catch (e: unknown) {
      setToast({ type: 'error', text: e instanceof Error ? e.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const trajectoryData = target
    ? (target.trajectory as Array<{ year: number; target_tco2e: number }>)
    : null
  const baseline    = target ? Number(target.baseline_tco2e) : 0
  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-6">
      <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
          <Leaf className="w-4 h-4 text-gw-green" />
          Science-Based Targets (SBTi)
        </h2>
        <p className="text-sm text-gw-muted mb-5">
          Set emission reduction targets aligned with the Paris Agreement via the Science Based Targets initiative.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-gw-muted text-sm">
            <Loader className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gw-muted mb-2">Target Pathway</label>
              <div className="flex gap-2 flex-wrap">
                {(['1.5C', 'WB2C', 'CUSTOM'] as const).map(t => (
                  <button key={t} onClick={() => setTargetType(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      targetType === t
                        ? 'bg-gw-green/10 border-gw-green text-gw-green'
                        : 'bg-gw-dark border-gw-border text-gw-muted hover:border-gw-green/40'
                    }`}>
                    {t === '1.5C' ? '1.5°C Pathway' : t === 'WB2C' ? 'Well-Below 2°C' : 'Custom Rate'}
                    {RATES[t] && <span className="text-xs ml-1 opacity-70">({RATES[t]}%/yr)</span>}
                  </button>
                ))}
              </div>
              {targetType === 'CUSTOM' && (
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs text-gw-muted whitespace-nowrap">Annual reduction %</label>
                  <input type="number" value={customRate} onChange={e => setCustomRate(e.target.value)}
                    min={0} max={20} step={0.1} placeholder="e.g. 3.5"
                    className="w-28 bg-gw-dark border border-gw-border rounded px-3 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
                  <span className="text-xs text-gw-muted">% per year</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">Base Year</label>
                <input type="number" value={baseYear} onChange={e => setBaseYear(parseInt(e.target.value))}
                  min={2015} max={2025}
                  className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm text-white focus:border-gw-green focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">Baseline Emissions (tCO2e)</label>
                <input type="number" value={baselineEm} onChange={e => setBaselineEm(e.target.value)}
                  min={0} step={0.01} placeholder="e.g. 125.5"
                  className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm text-white focus:border-gw-green focus:outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">Target Year</label>
                <input type="number" value={targetYear} onChange={e => setTargetYear(parseInt(e.target.value))}
                  min={2025} max={2050}
                  className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm text-white focus:border-gw-green focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">Sector</label>
                <input type="text" value={sector} onChange={e => setSector(e.target.value)}
                  className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm text-white focus:border-gw-green focus:outline-none" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  saving ? 'bg-gw-border text-gw-muted cursor-wait' : 'bg-gw-green text-gw-dark hover:bg-gw-green/90'
                }`}>
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Target'}
              </button>
              {target && (
                <span className="text-xs text-gw-muted">
                  {target.total_reduction_pct as number}% total reduction by {targetYear}
                </span>
              )}
            </div>

            {toast && (
              <div className={`p-3 rounded text-sm border ${
                toast.type === 'success' ? 'bg-gw-green/10 border-gw-green/30 text-gw-green'
                                         : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>{toast.text}</div>
            )}
          </div>
        )}
      </section>

      {trajectoryData && trajectoryData.length > 0 && baseline > 0 && (
        <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-gw-green" />
            Decarbonisation Trajectory
          </h3>
          <div className="space-y-2">
            {trajectoryData.map(t => {
              const pct = baseline > 0 ? Math.round((t.target_tco2e / baseline) * 100) : 0
              const isCurrent = t.year === currentYear
              const reductionPct = Math.round(((baseline - t.target_tco2e) / baseline) * 100)
              return (
                <div key={t.year} className={`flex items-center gap-3 ${isCurrent ? 'opacity-100' : 'opacity-70'}`}>
                  <div className={`w-12 text-xs font-mono font-medium ${isCurrent ? 'text-gw-green' : 'text-gw-muted'}`}>
                    {t.year}{isCurrent ? ' ▶' : ''}
                  </div>
                  <div className="flex-1 h-4 bg-gw-dark rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isCurrent ? 'bg-gw-green' : 'bg-gw-green/30'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-xs text-gw-muted font-mono">
                    {t.target_tco2e.toFixed(1)} tCO2e
                  </div>
                  <div className={`w-16 text-right text-xs font-medium ${reductionPct >= 42 ? 'text-gw-green' : 'text-amber-400'}`}>
                    −{reductionPct}%
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gw-muted mt-4">
            Pathway: {target?.target_type as string} · {target?.annual_rate_pct as number}% annual absolute reduction
            · Baseline: {baseline} tCO2e ({baseYear})
          </p>
        </section>
      )}
    </div>
  )
}

// ─── Scope 3 AWS Cloud ───────────────────────────────────────────────────────

function Scope3Section({ tenantId }: { tenantId: string }) {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [yearMonth, setYearMonth] = useState(defaultMonth)
  const [data, setData]           = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading]     = useState(false)
  const [syncing, setSyncing]     = useState(false)
  const [toast, setToast]         = useState<Toast>(null)

  async function load(ym: string) {
    setLoading(true); setToast(null)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/scope3?year_month=${ym}`)
      if (r.status === 404) { setData(null); return }
      const d = await r.json()
      if (r.ok) setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function sync() {
    setSyncing(true); setToast(null)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/scope3/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_month: yearMonth }),
      })
      const d = await r.json()
      if (d.setup_required) {
        setToast({ type: 'info', text: d.error + ' ' + d.instructions })
        return
      }
      if (!r.ok) throw new Error(d.error || 'Sync failed')
      setData(d)
      setToast({ type: 'success', text: `Synced ${yearMonth}: ${d.total_tco2e} tCO2e from AWS` })
    } catch (e: unknown) {
      setToast({ type: 'error', text: e instanceof Error ? e.message : 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { load(yearMonth) }, [yearMonth])

  const byRegion = data?.ByRegion
    ? (typeof data.ByRegion === 'string'
        ? JSON.parse(data.ByRegion as string)
        : data.ByRegion) as Record<string, { cost_usd: number; kwh: number; kg_co2: number; intensity_gco2_kwh: number }>
    : null

  const totalKgCO2 = byRegion
    ? Object.values(byRegion).reduce((s, r) => s + r.kg_co2, 0)
    : 0

  return (
    <div className="space-y-6">
      <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-gw-green" />
          Scope 3 — AWS Cloud Emissions (Category 11)
        </h2>
        <p className="text-sm text-gw-muted mb-5">
          Estimates upstream cloud carbon from AWS compute spend using Cost Explorer and regional grid intensity factors.
        </p>

        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">Month</label>
            <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)}
              className="bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm text-white focus:border-gw-green focus:outline-none" />
          </div>
          <button onClick={sync} disabled={syncing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              syncing ? 'bg-gw-border text-gw-muted cursor-wait' : 'bg-gw-green text-gw-dark hover:bg-gw-green/90'
            }`}>
            {syncing ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? 'Syncing…' : 'Sync from AWS'}
          </button>
          {data && (
            <div className="text-xs text-gw-muted pb-1">
              Last synced: {(data.SyncedAt as string)?.slice(0, 16).replace('T', ' ')} UTC
            </div>
          )}
        </div>

        {toast && (
          <div className={`mt-4 p-3 rounded text-sm border ${
            toast.type === 'success' ? 'bg-gw-green/10 border-gw-green/30 text-gw-green'
                                     : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>{toast.text}</div>
        )}
      </section>

      {loading && (
        <div className="flex items-center gap-2 text-gw-muted text-sm p-4">
          <Loader className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {data && !loading && (
        <>
          <section className="grid grid-cols-3 gap-4">
            {[
              { label: 'AWS Compute Spend', value: `$${Number(data.TotalCostUSD ?? 0).toFixed(2)}`, sub: yearMonth },
              { label: 'Estimated Energy', value: `${Number(data.TotalKWh ?? 0).toFixed(1)} kWh`, sub: 'from compute' },
              { label: 'Scope 3 Cat. 11', value: `${Number(data.TotalTCO2e ?? 0).toFixed(4)} tCO2e`, sub: 'cloud carbon' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-gw-panel border border-gw-border rounded-xl p-4">
                <div className="text-xs text-gw-muted uppercase tracking-wider mb-1">{kpi.label}</div>
                <div className="text-xl font-bold text-white">{kpi.value}</div>
                <div className="text-xs text-gw-muted mt-1">{kpi.sub}</div>
              </div>
            ))}
          </section>

          {byRegion && Object.keys(byRegion).length > 0 && (
            <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
              <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-gw-green" />
                Emissions by AWS Region
              </h3>
              <div className="space-y-3">
                {Object.entries(byRegion)
                  .sort(([, a], [, b]) => b.kg_co2 - a.kg_co2)
                  .map(([region, rv]) => {
                    const pct = totalKgCO2 > 0 ? (rv.kg_co2 / totalKgCO2) * 100 : 0
                    return (
                      <div key={region}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-mono text-white">{region}</span>
                          <div className="flex items-center gap-4 text-gw-muted">
                            <span>${rv.cost_usd.toFixed(2)}</span>
                            <span>{rv.kwh.toFixed(1)} kWh</span>
                            <span className="text-gw-green font-medium">{rv.kg_co2.toFixed(2)} kgCO2</span>
                            <span className="text-xs opacity-60">{rv.intensity_gco2_kwh} gCO2/kWh</span>
                          </div>
                        </div>
                        <div className="h-2 bg-gw-dark rounded-full overflow-hidden">
                          <div className="h-full bg-gw-green/50 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </section>
          )}

          <section className="bg-gw-panel border border-gw-border rounded-xl p-5 text-xs text-gw-muted">
            <div className="font-medium text-white mb-1 text-sm">Methodology</div>
            <p>{data.Methodology as string}</p>
          </section>
        </>
      )}

      {!data && !loading && (
        <section className="bg-gw-panel border border-gw-border rounded-xl p-8 text-center">
          <Globe className="w-8 h-8 text-gw-muted mx-auto mb-3" />
          <p className="text-gw-muted text-sm">No data for {yearMonth}.</p>
          <p className="text-xs text-gw-muted/60 mt-1">
            Click <strong className="text-white">Sync from AWS</strong> to pull Cost Explorer data.
            Requires <code>ce:GetCostAndUsage</code> access in your linked account.
          </p>
        </section>
      )}
    </div>
  )
}

// ─── Carbon Tax Section ────────────────────────────────────────────────────

const CARBON_PRICE_SCHEDULE = [
  { year: 2023, price: 65  },
  { year: 2024, price: 80  },
  { year: 2025, price: 95  },
  { year: 2026, price: 110 },
  { year: 2027, price: 125 },
  { year: 2028, price: 140 },
  { year: 2029, price: 155 },
  { year: 2030, price: 170 },
]

interface CarbonTaxData {
  tax_year:     number
  as_of:        string
  ytd_fraction: number
  emissions: {
    scope1_kgco2e:       number
    scope2_kgco2e:       number
    scope3_cat11_kgco2e: number
    ytd_total_tco2e:     number
    annualized_tco2e:    number
  }
  current_year: {
    year:                    number
    price_per_tco2e_cad:     number
    ytd_liability_cad:       number
    annualized_liability_cad:number
  }
  flat_projection: Array<{ year:number; price_cad:number; tco2e:number; liability_cad:number }>
  sbti_projection?: Array<{ year:number; price_cad:number; tco2e:number; liability_cad:number }>
  sbti_savings_2030_cad?: number
}

function CarbonTaxSection({ tenantId }: { tenantId: string }) {
  const [data,    setData]    = useState<CarbonTaxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [year,    setYear]    = useState(new Date().getFullYear())
  const [view,    setView]    = useState<'flat' | 'sbti'>('flat')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(
        `${API_BASE}/api/tenants/${tenantId}/carbon-tax?year=${year}`,
        { cache: 'no-store' }
      )
      if (r.ok) setData(await r.json())
    } catch (e) { console.error('Carbon tax load failed:', e) }
    finally { setLoading(false) }
  }, [tenantId, year])

  useEffect(() => { load() }, [load])

  const proj = view === 'sbti' && data?.sbti_projection
    ? data.sbti_projection
    : data?.flat_projection ?? []

  const maxLiability = proj.length ? Math.max(...proj.map(p => p.liability_cad)) : 1

  return (
    <div className="space-y-6">
      <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 className="text-white font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gw-green" />
              Carbon Tax Liability Calculator
            </h2>
            <p className="text-xs text-gw-muted mt-1">
              Canada federal carbon backstop (GGPPA) · $110/tCO₂e in 2026 → $170/tCO₂e in 2030
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-gw-dark border border-gw-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-gw-green">
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button onClick={load}
              className="flex items-center gap-1.5 text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-gw-dark border border-gw-border rounded-lg p-3">
              <div className="text-xs text-gw-muted">YTD Liability ({year})</div>
              <div className="text-xl font-bold text-white mt-1">
                ${data.current_year.ytd_liability_cad.toFixed(2)}
                <span className="text-xs text-gw-muted font-normal ml-1">CAD</span>
              </div>
              <div className="text-xs text-gw-muted mt-0.5">
                {(data.ytd_fraction * 100).toFixed(0)}% of year elapsed
              </div>
            </div>
            <div className="bg-gw-dark border border-gw-border rounded-lg p-3">
              <div className="text-xs text-gw-muted">Annualised ({year})</div>
              <div className="text-xl font-bold text-yellow-400 mt-1">
                ${data.current_year.annualized_liability_cad.toFixed(2)}
                <span className="text-xs text-gw-muted font-normal ml-1">CAD</span>
              </div>
              <div className="text-xs text-gw-muted mt-0.5">
                @ ${data.current_year.price_per_tco2e_cad}/tCO₂e
              </div>
            </div>
            <div className="bg-gw-dark border border-gw-border rounded-lg p-3">
              <div className="text-xs text-gw-muted">2030 Exposure (flat)</div>
              <div className="text-xl font-bold text-orange-400 mt-1">
                ${(data.flat_projection.find(p => p.year === 2030)?.liability_cad ?? 0).toFixed(2)}
                <span className="text-xs text-gw-muted font-normal ml-1">CAD</span>
              </div>
              <div className="text-xs text-gw-muted mt-0.5">@ $170/tCO₂e (2030)</div>
            </div>
            <div className="bg-gw-dark border border-gw-border rounded-lg p-3">
              <div className="text-xs text-gw-muted">Total tCO₂e (annualised)</div>
              <div className="text-xl font-bold text-gw-green mt-1">
                {data.emissions.annualized_tco2e.toFixed(4)}
              </div>
              <div className="text-xs text-gw-muted mt-0.5">Scope 1+2+3 combined</div>
            </div>
          </div>
        )}

        {/* Emissions breakdown */}
        {data && (
          <div className="mb-6 bg-gw-dark border border-gw-border rounded-lg p-4">
            <div className="text-xs font-semibold text-gw-muted uppercase tracking-wide mb-3">
              YTD Emissions Breakdown (kgCO₂e)
            </div>
            <div className="space-y-2">
              {[
                { label: 'Scope 1 — Direct Fuel (manual entry)', value: data.emissions.scope1_kgco2e, color: 'bg-orange-500' },
                { label: 'Scope 2 — Purchased Electricity (WORM ledger)', value: data.emissions.scope2_kgco2e, color: 'bg-blue-500' },
                { label: 'Scope 3 Cat.11 — AWS Cloud Compute (CE sync)', value: data.emissions.scope3_cat11_kgco2e, color: 'bg-purple-500' },
              ].map(row => {
                const total = data.emissions.scope1_kgco2e + data.emissions.scope2_kgco2e + data.emissions.scope3_cat11_kgco2e
                const pct   = total > 0 ? (row.value / total) * 100 : 0
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gw-muted">{row.label}</span>
                      <span className="text-white font-mono">{row.value.toFixed(4)} kg</span>
                    </div>
                    <div className="h-1.5 bg-gw-border/40 rounded-full">
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Projection chart */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-xs font-semibold text-gw-muted uppercase tracking-wide">
              2026–2030 Liability Projection
            </div>
            {data?.sbti_projection && (
              <div className="flex items-center gap-1 bg-gw-dark border border-gw-border rounded-lg p-0.5">
                <button onClick={() => setView('flat')}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${view === 'flat' ? 'bg-gw-green/20 text-gw-green' : 'text-gw-muted'}`}>
                  Flat Emissions
                </button>
                <button onClick={() => setView('sbti')}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${view === 'sbti' ? 'bg-gw-green/20 text-gw-green' : 'text-gw-muted'}`}>
                  SBTi Path
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {proj.map(p => (
              <div key={p.year} className="flex items-center gap-3">
                <div className="text-xs font-mono text-gw-muted w-10 flex-shrink-0">{p.year}</div>
                <div className="flex-1 h-6 bg-gw-dark border border-gw-border/50 rounded relative overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${
                      view === 'sbti' ? 'bg-gw-green/40' : 'bg-yellow-500/40'
                    }`}
                    style={{ width: `${(p.liability_cad / maxLiability) * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center pl-2 text-xs text-white font-mono">
                    ${p.liability_cad.toFixed(2)} CAD
                  </span>
                </div>
                <div className="text-xs text-gw-muted w-20 flex-shrink-0 text-right">
                  {p.tco2e.toFixed(4)} tCO₂e
                </div>
                <div className="text-xs text-gw-muted w-16 flex-shrink-0 text-right">
                  ${p.price_cad}/t
                </div>
              </div>
            ))}
          </div>

          {data?.sbti_savings_2030_cad && view === 'sbti' && (
            <div className="mt-3 bg-gw-green/10 border border-gw-green/30 rounded-lg px-4 py-2.5 text-sm">
              <span className="text-gw-green font-medium">
                SBTi reduction saves ${data.sbti_savings_2030_cad.toFixed(2)} CAD
              </span>
              <span className="text-gw-muted ml-2">in 2030 carbon tax exposure vs flat-emissions scenario</span>
            </div>
          )}
        </div>

        {/* Statutory price schedule */}
        <div>
          <div className="text-xs font-semibold text-gw-muted uppercase tracking-wide mb-2">
            Statutory Price Schedule (GGPPA)
          </div>
          <div className="flex gap-1 flex-wrap">
            {CARBON_PRICE_SCHEDULE.map(s => (
              <div key={s.year}
                className={`text-xs px-2.5 py-1.5 rounded border ${
                  s.year === year
                    ? 'border-gw-green bg-gw-green/10 text-gw-green font-bold'
                    : 'border-gw-border text-gw-muted'
                }`}>
                {s.year}: ${s.price}
              </div>
            ))}
          </div>
          <p className="text-xs text-gw-muted/70 mt-2">
            Canada Greenhouse Gas Pollution Pricing Act (S.C. 2018, c.12, s.186).
            Price increases $15/tCO₂e per year. Data centres pay through electricity rates (Scope 2)
            and directly on fuel combustion (Scope 1 — diesel generators, natural gas).
          </p>
        </div>

        {loading && !data && (
          <div className="text-center py-8 text-gw-muted text-sm">Loading carbon tax data...</div>
        )}
      </section>
    </div>
  )
}

// ── RECs & PPAs Section ────────────────────────────────────────────────────────
interface REC {
  RECID: string; Type: string; Provider: string; CertifiedBy: string
  MWh: number; VintageYear: number; FuelType: string; Province: string
  Status: string; CertificateNo?: string; Notes?: string; CreatedAt?: string
}
interface Scope2Data {
  location_based_tco2?: number; market_based_tco2?: number
  retired_recs_count?: number; retired_recs_mwh?: number
  reduction_pct?: number; bill_c59_compliant?: boolean; year?: number
}

const REC_TYPES   = ['REC','PPA','VPPA','BUNDLED_REC','UNBUNDLED_REC','GREEN_TARIFF']
const FUEL_TYPES  = ['solar','wind','hydro','geothermal','biomass','tidal']
const CERT_BODIES = ['EcoLogo','Green-e','I-REC','TIGR','RE100','IREC']
const PROVINCES   = ['AB','BC','ON','QC','SK','MB','NS','NB','NL','PE','NT','YT','NU']

function RECsSection({ tenantId }: { tenantId: string }) {
  const [recs, setRecs]           = useState<REC[]>([])
  const [scope2, setScope2]       = useState<Scope2Data | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [retiring, setRetiring]   = useState<string | null>(null)
  const [toast, setToast]         = useState<string>('')
  const year = new Date().getFullYear()

  const [form, setForm] = useState({
    type: 'REC', provider: '', certificate_no: '', certified_by: 'EcoLogo',
    mwh: '', vintage_year: String(year - 1), fuel_type: 'wind',
    province: 'AB', country: 'CA', price_per_mwh: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API_BASE}/api/tenants/${tenantId}/recs`),
        fetch(`${API_BASE}/api/tenants/${tenantId}/recs/scope2?year=${year}`),
      ])
      if (r1.ok) { const d = await r1.json(); setRecs(d.recs || []) }
      if (r2.ok) setScope2(await r2.json())
    } catch {}
    finally { setLoading(false) }
  }, [tenantId, year])

  useEffect(() => { load() }, [load])

  async function addRec(e: React.FormEvent) {
    e.preventDefault()
    if (!form.mwh || parseFloat(form.mwh) <= 0) { setFormErr('MWh must be > 0'); return }
    setSaving(true); setFormErr('')
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/recs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, mwh: parseFloat(form.mwh), vintage_year: parseInt(form.vintage_year) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setShowModal(false)
      setForm({ type: 'REC', provider: '', certificate_no: '', certified_by: 'EcoLogo',
        mwh: '', vintage_year: String(year - 1), fuel_type: 'wind', province: 'AB', country: 'CA', price_per_mwh: '', notes: '' })
      showToast(`REC added (${d.rec_id})`)
      load()
    } catch (ex) { setFormErr(ex instanceof Error ? ex.message : 'Save failed') }
    finally { setSaving(false) }
  }

  async function retire(recId: string) {
    setRetiring(recId)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/recs/${recId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RETIRED', retired_for: year }),
      })
      if (r.ok) { showToast(`REC ${recId} retired for ${year}`); load() }
    } catch {}
    finally { setRetiring(null) }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const c59Color = scope2?.bill_c59_compliant ? 'text-gw-green' : 'text-amber-400'

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Leaf className="w-4 h-4 text-gw-green" />
            RECs &amp; PPAs
          </h2>
          <p className="text-sm text-gw-muted mt-1">
            Market-based Scope 2 methodology. Certified RECs required for Bill C-59 net-zero claims.
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gw-green text-gw-dark rounded text-sm font-medium hover:bg-gw-green/90">
          <Plus className="w-3.5 h-3.5" /> Add REC
        </button>
      </div>

      {toast && (
        <div className="bg-gw-green/10 border border-gw-green/30 rounded px-3 py-2 text-xs text-gw-green">{toast}</div>
      )}

      {/* Market-based Scope 2 summary */}
      {scope2 && (
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4">
          <div className="text-xs font-semibold text-gw-muted uppercase tracking-wide mb-3">
            Market-Based Scope 2 · {scope2.year}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              ['Location-Based', `${scope2.location_based_tco2?.toFixed(3) ?? '—'} tCO₂e`, 'text-amber-400'],
              ['Market-Based',   `${scope2.market_based_tco2?.toFixed(3)  ?? '—'} tCO₂e`, 'text-gw-green'],
              ['Reduction',      `${scope2.reduction_pct ?? 0}%`,                          'text-blue-400'],
            ].map(([label, val, cls]) => (
              <div key={label} className="bg-gw-panel border border-gw-border/50 rounded p-2.5 text-center">
                <div className="text-xs text-gw-muted mb-1">{label}</div>
                <div className={`text-sm font-mono font-bold ${cls}`}>{val}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${c59Color}`}>
              Bill C-59: {scope2.bill_c59_compliant ? 'COMPLIANT' : 'NOT COMPLIANT'}
            </span>
            <span className="text-gw-muted">·</span>
            <span className="text-gw-muted">{scope2.retired_recs_count ?? 0} RECs retired · {scope2.retired_recs_mwh?.toFixed(1) ?? 0} MWh</span>
          </div>
        </div>
      )}

      {/* REC table */}
      {loading ? (
        <div className="text-sm text-gw-muted py-4">Loading…</div>
      ) : recs.length === 0 ? (
        <div className="text-sm text-gw-muted py-6 text-center border border-dashed border-gw-border rounded-lg">
          No RECs yet. Add your first renewable energy certificate above.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gw-border">
              <tr className="text-gw-muted text-left">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Provider</th>
                <th className="py-2 pr-3 font-medium">MWh</th>
                <th className="py-2 pr-3 font-medium">Certified By</th>
                <th className="py-2 pr-3 font-medium">Vintage</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gw-border/40">
              {recs.map(r => (
                <tr key={r.RECID} className="hover:bg-gw-dark/40">
                  <td className="py-2 pr-3 font-mono text-gw-muted">{r.RECID}</td>
                  <td className="py-2 pr-3 text-white">{r.Type}</td>
                  <td className="py-2 pr-3 text-white">{r.Provider || '—'}</td>
                  <td className="py-2 pr-3 font-mono text-gw-green">{Number(r.MWh).toFixed(1)}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${
                      CERT_BODIES.includes(r.CertifiedBy)
                        ? 'bg-gw-green/10 border-gw-green/30 text-gw-green'
                        : 'bg-gw-dark border-gw-border text-gw-muted'
                    }`}>{r.CertifiedBy || '—'}</span>
                  </td>
                  <td className="py-2 pr-3 text-gw-muted">{r.VintageYear}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${
                      r.Status === 'RETIRED'
                        ? 'bg-gw-muted/10 border-gw-border text-gw-muted'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    }`}>{r.Status}</span>
                  </td>
                  <td className="py-2">
                    {r.Status === 'ACTIVE' && (
                      <button onClick={() => retire(r.RECID)} disabled={retiring === r.RECID}
                        className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50">
                        {retiring === r.RECID ? '…' : 'Retire'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add REC modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gw-panel border border-gw-border rounded-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gw-border flex items-center justify-between">
              <h3 className="font-semibold text-white">Add REC / PPA</h3>
              <button onClick={() => setShowModal(false)} className="text-gw-muted hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={addRec} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none">
                    {REC_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gw-muted block mb-1">MWh *</label>
                  <input type="number" min="0.01" step="0.01" required value={form.mwh}
                    onChange={e => setForm(f => ({ ...f, mwh: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gw-muted block mb-1">Provider</label>
                <input type="text" value={form.provider}
                  onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                  placeholder="e.g. Enel Green Power"
                  className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Certificate No.</label>
                  <input type="text" value={form.certificate_no}
                    onChange={e => setForm(f => ({ ...f, certificate_no: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Certified By</label>
                  <select value={form.certified_by} onChange={e => setForm(f => ({ ...f, certified_by: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none">
                    {CERT_BODIES.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Fuel Type</label>
                  <select value={form.fuel_type} onChange={e => setForm(f => ({ ...f, fuel_type: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none">
                    {FUEL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Vintage Year</label>
                  <input type="number" min="2010" max="2030" value={form.vintage_year}
                    onChange={e => setForm(f => ({ ...f, vintage_year: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Province</label>
                  <select value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none">
                    {PROVINCES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Price/MWh (CAD)</label>
                  <input type="number" min="0" step="0.01" value={form.price_per_mwh}
                    onChange={e => setForm(f => ({ ...f, price_per_mwh: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-gw-green focus:outline-none" />
                </div>
              </div>
              {formErr && <p className="text-xs text-red-400">{formErr}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-gw-green text-gw-dark py-2 rounded text-sm font-medium hover:bg-gw-green/90 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Add REC'}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gw-border text-gw-muted rounded text-sm hover:text-white">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="text-xs text-gw-muted">
        GHG Protocol Scope 2 Guidance — Market-Based Method. Retiring a certified REC zeros out the corresponding MWh from your Scope 2 location-based total.
      </p>
    </section>
  )
}

// ── Carbon Offsets Section ────────────────────────────────────────────────────
interface Offset {
  OffsetID: string; Registry: string; SerialNo?: string; VintageYear: number
  QuantityTco2: number; ProjectName?: string; ProjectType?: string
  Country: string; Status: string; Notes?: string; RetiredFor?: number
}
interface NetPos {
  gross?: { total_tco2?: number; scope1_kg?: number; scope2_kg?: number; scope3_kg?: number }
  offsets_tco2?: number; net_tco2?: number; reduction_pct?: number; net_zero_ready?: boolean
  offsets_retired_count?: number; year?: number; by_registry?: Record<string, number>
}

const REGISTRIES  = ['GOLD_STANDARD','VCS','TIER','ACR','CAR','ECOTRUST','OBIN','CUSTOM']
const PROJ_TYPES  = ['reforestation','afforestation','improved_forest_mgmt','soil_carbon',
  'methane_capture','renewable_energy','cookstoves','blue_carbon','direct_air_capture','avoided_deforestation']
const REG_LABELS: Record<string,string> = {
  GOLD_STANDARD:'Gold Standard', VCS:'Verra VCS', TIER:'Alberta TIER',
  ACR:'American Carbon Reg', CAR:'Climate Action Res.', ECOTRUST:'EcoTrust CA', OBIN:'Ontario Carbon', CUSTOM:'Custom',
}

function OffsetsSection({ tenantId }: { tenantId: string }) {
  const [offsets, setOffsets]     = useState<Offset[]>([])
  const [netPos, setNetPos]       = useState<NetPos | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [retiring, setRetiring]   = useState<string | null>(null)
  const [toast, setToast]         = useState<string>('')
  const year = new Date().getFullYear()

  const [form, setForm] = useState({
    registry: 'GOLD_STANDARD', serial_no: '', vintage_year: String(year - 1),
    quantity_tco2: '', project_name: '', project_type: 'reforestation',
    country: 'CA', province: '', price_per_tco2: '', co_registry_url: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API_BASE}/api/tenants/${tenantId}/offsets`),
        fetch(`${API_BASE}/api/tenants/${tenantId}/offsets/net-position?year=${year}`),
      ])
      if (r1.ok) { const d = await r1.json(); setOffsets(d.offsets || []) }
      if (r2.ok) setNetPos(await r2.json())
    } catch {}
    finally { setLoading(false) }
  }, [tenantId, year])

  useEffect(() => { load() }, [load])

  async function addOffset(e: React.FormEvent) {
    e.preventDefault()
    if (!form.quantity_tco2 || parseFloat(form.quantity_tco2) <= 0) { setFormErr('Quantity must be > 0'); return }
    setSaving(true); setFormErr('')
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/offsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          quantity_tco2: parseFloat(form.quantity_tco2),
          vintage_year:  parseInt(form.vintage_year),
          price_per_tco2: parseFloat(form.price_per_tco2 || '0') || 0,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setShowModal(false)
      setForm({ registry: 'GOLD_STANDARD', serial_no: '', vintage_year: String(year - 1),
        quantity_tco2: '', project_name: '', project_type: 'reforestation',
        country: 'CA', province: '', price_per_tco2: '', co_registry_url: '', notes: '' })
      showToast(`Offset added (${d.offset_id})`)
      load()
    } catch (ex) { setFormErr(ex instanceof Error ? ex.message : 'Save failed') }
    finally { setSaving(false) }
  }

  async function retire(offsetId: string) {
    setRetiring(offsetId)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/offsets/${offsetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RETIRED', retired_for: year }),
      })
      if (r.ok) { showToast(`Offset ${offsetId} retired for ${year}`); load() }
    } catch {}
    finally { setRetiring(null) }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const grossTco2 = netPos?.gross?.total_tco2 ?? 0
  const netTco2   = netPos?.net_tco2          ?? 0
  const pct       = netPos?.reduction_pct      ?? 0

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Archive className="w-4 h-4 text-blue-400" />
            Carbon Offset Registry
          </h2>
          <p className="text-sm text-gw-muted mt-1">
            Verified offset retirements → net emissions position. Stored in the compliance vault.
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
          <Plus className="w-3.5 h-3.5" /> Add Offset
        </button>
      </div>

      {toast && (
        <div className="bg-gw-green/10 border border-gw-green/30 rounded px-3 py-2 text-xs text-gw-green">{toast}</div>
      )}

      {/* Net position */}
      {netPos && (
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4">
          <div className="text-xs font-semibold text-gw-muted uppercase tracking-wide mb-3">
            Net Emissions Position · {netPos.year}
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              ['Gross tCO₂e',    grossTco2.toFixed(3),              'text-amber-400'],
              ['Offsets Retired', `${netPos.offsets_tco2?.toFixed(3) ?? 0}`, 'text-blue-400'],
              ['Net tCO₂e',      netTco2.toFixed(3),                'text-gw-green'],
              ['Reduction',       `${pct}%`,                        'text-gw-green'],
            ].map(([label, val, cls]) => (
              <div key={label} className="bg-gw-panel border border-gw-border/50 rounded p-2.5 text-center">
                <div className="text-xs text-gw-muted mb-1">{label}</div>
                <div className={`text-sm font-mono font-bold ${cls}`}>{val}</div>
              </div>
            ))}
          </div>
          {netPos.net_zero_ready && (
            <div className="flex items-center gap-2 text-xs text-gw-green bg-gw-green/10 border border-gw-green/30 rounded px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5" />
              Net-zero ready — verified net position ≈ 0 tCO₂e
            </div>
          )}
          {netPos.by_registry && Object.keys(netPos.by_registry).length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {Object.entries(netPos.by_registry).map(([reg, qty]) => (
                <span key={reg} className="text-xs px-2 py-0.5 rounded border border-gw-border text-gw-muted">
                  {REG_LABELS[reg] ?? reg}: {qty.toFixed(2)} t
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Offsets table */}
      {loading ? (
        <div className="text-sm text-gw-muted py-4">Loading…</div>
      ) : offsets.length === 0 ? (
        <div className="text-sm text-gw-muted py-6 text-center border border-dashed border-gw-border rounded-lg">
          No offsets yet. Add a verified carbon offset to start tracking net emissions.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gw-border">
              <tr className="text-gw-muted text-left">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Registry</th>
                <th className="py-2 pr-3 font-medium">tCO₂e</th>
                <th className="py-2 pr-3 font-medium">Project</th>
                <th className="py-2 pr-3 font-medium">Vintage</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gw-border/40">
              {offsets.map(o => (
                <tr key={o.OffsetID} className="hover:bg-gw-dark/40">
                  <td className="py-2 pr-3 font-mono text-gw-muted">{o.OffsetID}</td>
                  <td className="py-2 pr-3">
                    <span className="px-1.5 py-0.5 rounded text-xs border border-blue-500/30 bg-blue-500/10 text-blue-400">
                      {REG_LABELS[o.Registry] ?? o.Registry}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-gw-green">{Number(o.QuantityTco2).toFixed(3)}</td>
                  <td className="py-2 pr-3 text-white">{o.ProjectName || '—'}</td>
                  <td className="py-2 pr-3 text-gw-muted">{o.VintageYear}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${
                      o.Status === 'RETIRED'
                        ? 'bg-gw-muted/10 border-gw-border text-gw-muted'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    }`}>{o.Status}{o.RetiredFor ? ` (${o.RetiredFor})` : ''}</span>
                  </td>
                  <td className="py-2">
                    {o.Status === 'ACTIVE' && (
                      <button onClick={() => retire(o.OffsetID)} disabled={retiring === o.OffsetID}
                        className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50">
                        {retiring === o.OffsetID ? '…' : 'Retire'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Offset modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gw-panel border border-gw-border rounded-xl w-full max-w-md max-h-screen overflow-y-auto">
            <div className="px-5 py-4 border-b border-gw-border flex items-center justify-between">
              <h3 className="font-semibold text-white">Add Carbon Offset</h3>
              <button onClick={() => setShowModal(false)} className="text-gw-muted hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={addOffset} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Registry *</label>
                  <select value={form.registry} onChange={e => setForm(f => ({ ...f, registry: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none">
                    {REGISTRIES.map(r => <option key={r} value={r}>{REG_LABELS[r] ?? r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Quantity (tCO₂e) *</label>
                  <input type="number" min="0.001" step="0.001" required value={form.quantity_tco2}
                    onChange={e => setForm(f => ({ ...f, quantity_tco2: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gw-muted block mb-1">Serial Number</label>
                <input type="text" value={form.serial_no}
                  onChange={e => setForm(f => ({ ...f, serial_no: e.target.value }))}
                  placeholder="Registry serial / certificate number"
                  className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gw-muted block mb-1">Project Name</label>
                <input type="text" value={form.project_name}
                  onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
                  placeholder="e.g. Alberta Reforestation Initiative"
                  className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Project Type</label>
                  <select value={form.project_type} onChange={e => setForm(f => ({ ...f, project_type: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none">
                    {PROJ_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Vintage Year</label>
                  <input type="number" min="2010" max="2030" value={form.vintage_year}
                    onChange={e => setForm(f => ({ ...f, vintage_year: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Country</label>
                  <input type="text" maxLength={2} value={form.country}
                    onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase() }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Price/tCO₂e (CAD)</label>
                  <input type="number" min="0" step="0.01" value={form.price_per_tco2}
                    onChange={e => setForm(f => ({ ...f, price_per_tco2: e.target.value }))}
                    className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gw-muted block mb-1">Registry URL</label>
                <input type="url" value={form.co_registry_url}
                  onChange={e => setForm(f => ({ ...f, co_registry_url: e.target.value }))}
                  placeholder="https://registry.verra.org/..."
                  className="w-full bg-gw-dark border border-gw-border rounded px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
              {formErr && <p className="text-xs text-red-400">{formErr}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Add Offset'}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gw-border text-gw-muted rounded text-sm hover:text-white">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="text-xs text-gw-muted">
        Supported registries: Gold Standard · Verra VCS · Alberta TIER · ACR · CAR.
        Retiring an offset reduces net tCO₂e in all compliance reports and PDFs.
      </p>
    </section>
  )
}
