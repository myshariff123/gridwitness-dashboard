'use client'
import { Download, RefreshCw, Filter, Shield, Zap, BarChart2, AlertTriangle,
         CheckCircle, Clock, Activity, TrendingUp, Eye } from 'lucide-react'
import { toCsv, downloadCsv, tsFilename } from '@/lib/csv'
import { useState, useEffect, useCallback } from 'react'
import Nav from '@/components/Nav'
import IncidentActions from '@/components/IncidentActions'
import {
  listIncidents, getLiveGridData, recordIncidentAction, closeIncident,
  type Incident, type GridSnapshot, DEFAULT_GRID_THRESHOLDS,
} from '@/lib/api'

type FilterMode = 'all' | 'open' | 'closed'
type SourceGroup = 'GRID_THRESHOLD_MONITOR' | 'CARBON_BUDGET_MONITOR' | 'POWER_ANOMALY_DETECTOR' | 'OTHER'

// ─── helpers ───────────────────────────────────────────────────────────────

function formatDuration(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime()
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0)   return `${h}h ${m}m`
  return `${m}m`
}

function incidentSource(inc: Incident): SourceGroup {
  const src    = inc.Source || ''
  const metric = inc.Metric || ''
  if (src === 'GRID_THRESHOLD_MONITOR' || metric.includes('carbon_intensity')) return 'GRID_THRESHOLD_MONITOR'
  if (src === 'CARBON_BUDGET_MONITOR'  || metric.includes('budget'))            return 'CARBON_BUDGET_MONITOR'
  if (src === 'POWER_ANOMALY_DETECTOR' || metric.includes('power_anomaly'))     return 'POWER_ANOMALY_DETECTOR'
  return 'OTHER'
}

function incidentTitle(inc: Incident): string {
  if (inc.Title) return inc.Title
  const zone   = inc.GridID || ''
  const metric = (inc.Metric || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return `${zone} — ${metric}`
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-400 border-red-500/40 bg-red-500/10',
  HIGH:     'text-orange-400 border-orange-500/40 bg-orange-500/10',
  MEDIUM:   'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  WARNING:  'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
}

const GROUP_META: Record<SourceGroup, { label: string; icon: React.ReactNode; accent: string }> = {
  GRID_THRESHOLD_MONITOR: {
    label:  'Grid Carbon Intensity',
    icon:   <Zap className="w-4 h-4" />,
    accent: 'text-orange-400',
  },
  CARBON_BUDGET_MONITOR: {
    label:  'Carbon Budget',
    icon:   <BarChart2 className="w-4 h-4" />,
    accent: 'text-yellow-400',
  },
  POWER_ANOMALY_DETECTOR: {
    label:  'Power Anomaly',
    icon:   <Activity className="w-4 h-4" />,
    accent: 'text-purple-400',
  },
  OTHER: {
    label:  'Other',
    icon:   <AlertTriangle className="w-4 h-4" />,
    accent: 'text-gw-muted',
  },
}

const GROUP_ORDER: SourceGroup[] = [
  'GRID_THRESHOLD_MONITOR',
  'CARBON_BUDGET_MONITOR',
  'POWER_ANOMALY_DETECTOR',
  'OTHER',
]

// ─── page component ────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const [tenantId,  setTenantId]  = useState('GW-NIMBL-AEB47A92')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [gridData,  setGridData]  = useState<GridSnapshot[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState<FilterMode>('all')
  const [lastFetch, setLastFetch] = useState<Date>(new Date())
  const [countdown, setCountdown] = useState(30)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = new URLSearchParams(window.location.search)
    setTenantId(
      q.get('tenant_id') ||
      window.localStorage.getItem('gw_tenant_id') ||
      'GW-NIMBL-AEB47A92',
    )
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, grid] = await Promise.all([
        listIncidents(
          tenantId,
          filter === 'all' ? undefined : filter === 'open' ? 'OPEN' : 'CLOSED',
        ),
        getLiveGridData(),
      ])
      setIncidents(data)
      setGridData(grid)
      setLastFetch(new Date())
      setCountdown(30)
    } catch (e) {
      console.error('Load incidents failed:', e)
    } finally {
      setLoading(false)
    }
  }, [tenantId, filter])

  // Auto-refresh every 30 s + countdown tick
  useEffect(() => {
    load()
    const refresh = setInterval(load, 30000)
    const tick    = setInterval(() => setCountdown(c => (c <= 1 ? 30 : c - 1)), 1000)
    return () => { clearInterval(refresh); clearInterval(tick) }
  }, [load])

  const exportCsv = () => {
    const csv = toCsv(incidents, [
      { key: 'IncidentID',      label: 'Incident ID' },
      { key: 'Title',           label: 'Title' },
      { key: 'Source',          label: 'Source' },
      { key: 'GridID',          label: 'Grid' },
      { key: 'Metric',          label: 'Metric' },
      { key: 'Status',          label: 'Status' },
      { key: 'Severity',        label: 'Severity' },
      { key: 'BreachValue',     label: 'Breach Value' },
      { key: 'PeakValue',       label: 'Peak Value' },
      { key: 'Threshold',       label: 'Threshold' },
      { key: 'ObservationCount',label: 'Observations' },
      { key: 'OpenedAt',        label: 'Opened At (UTC)' },
      { key: 'ClosedAt',        label: 'Closed At (UTC)' },
      { key: 'LastAction',      label: 'Last Action' },
      { key: 'LastActionAt',    label: 'Last Action At (UTC)' },
    ])
    downloadCsv(tsFilename('incidents', tenantId), csv)
  }

  const openCount   = incidents.filter(i => i.Status === 'OPEN').length
  const closedCount = incidents.filter(i => i.Status === 'CLOSED').length

  const grouped = GROUP_ORDER.reduce<Record<SourceGroup, Incident[]>>((acc, g) => {
    acc[g] = incidents.filter(i => incidentSource(i) === g)
    return acc
  }, {} as Record<SourceGroup, Incident[]>)

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-gw-green" />
              Grid Stress Incidents
            </h1>
            <p className="text-sm text-gw-muted mt-1">
              All breaches WORM-sealed · OSFI B-15 §7.1 · refreshes every 30 s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gw-muted font-mono">next in {countdown}s</span>
            <button onClick={load}
              className="flex items-center gap-1.5 text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button onClick={exportCsv} disabled={incidents.length === 0}
              className="flex items-center gap-1.5 text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors disabled:opacity-50">
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Live Grid Status Panel */}
        <LiveGridPanel gridData={gridData} />

        {/* Counters + filter */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-3">
            <div className="bg-gw-panel border border-gw-border rounded-lg px-4 py-2.5">
              <span className="text-xs text-gw-muted">Open</span>
              <span className={`text-lg font-bold ml-2 ${openCount > 0 ? 'text-orange-400' : 'text-gw-green'}`}>
                {openCount}
              </span>
            </div>
            <div className="bg-gw-panel border border-gw-border rounded-lg px-4 py-2.5">
              <span className="text-xs text-gw-muted">Resolved</span>
              <span className="text-lg font-bold text-gw-green ml-2">{closedCount}</span>
            </div>
            <div className="bg-gw-panel border border-gw-border rounded-lg px-4 py-2.5 hidden sm:block">
              <span className="text-xs text-gw-muted">Updated</span>
              <span className="text-sm font-mono text-white ml-2">
                {lastFetch.toLocaleTimeString('en-CA', { hour12: false })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gw-muted" />
            {(['all', 'open', 'closed'] as FilterMode[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                  filter === f
                    ? 'border-gw-green bg-gw-green/10 text-gw-green'
                    : 'border-gw-border text-gw-muted hover:border-gw-green/50'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Empty / loading states */}
        {loading && incidents.length === 0 && (
          <div className="bg-gw-panel border border-gw-border rounded-xl p-10 text-center text-gw-muted text-sm">
            Loading incidents...
          </div>
        )}
        {!loading && incidents.length === 0 && (
          <div className="bg-gw-panel border border-gw-green/20 rounded-xl p-10 text-center">
            <CheckCircle className="w-8 h-8 text-gw-green mx-auto mb-3" />
            <div className="text-white font-medium">No incidents</div>
            <div className="text-xs text-gw-muted mt-1">
              All monitored grids and budgets within configured thresholds
            </div>
          </div>
        )}

        {/* Grouped incident lists */}
        {GROUP_ORDER.map(group => {
          const items = grouped[group]
          if (!items || items.length === 0) return null
          const meta = GROUP_META[group]
          const openItems = items.filter(i => i.Status === 'OPEN').length
          return (
            <div key={group} className="space-y-3">
              <div className={`flex items-center gap-2 text-sm font-medium ${meta.accent}`}>
                {meta.icon}
                <span>{meta.label}</span>
                <span className="text-xs font-mono text-gw-muted ml-1">
                  {openItems > 0 ? `${openItems} open · ` : ''}{items.length} total
                </span>
              </div>
              {items.map(inc => (
                <IncidentCard key={inc.IncidentID} incident={inc} onUpdate={load} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Live Grid Status Panel ────────────────────────────────────────────────

function LiveGridPanel({ gridData }: { gridData: GridSnapshot[] }) {
  const zoneMap = Object.fromEntries(gridData.map(g => [g.GridID, g]))

  return (
    <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-gw-green" />
        <span className="text-xs font-semibold text-white">Live Grid Carbon Intensity vs Configured Thresholds</span>
        <span className="text-xs text-gw-muted ml-auto">AESO live · 5 min</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {DEFAULT_GRID_THRESHOLDS.map(cfg => {
          const snap      = zoneMap[cfg.gridId]
          const intensity = snap ? (snap.CarbonIntensity ?? snap.CurrentIntensity ?? 0) : null
          const threshold = cfg.carbonAlert
          const pct       = intensity !== null ? (intensity / threshold) * 100 : null
          const breached  = pct !== null && pct > 100
          const warning   = pct !== null && pct > 80 && !breached
          const barColor  = breached ? 'bg-red-500' : warning ? 'bg-yellow-400' : 'bg-gw-green'
          const textColor = breached ? 'text-red-400' : warning ? 'text-yellow-400' : 'text-gw-green'

          return (
            <div key={cfg.gridId}
              className={`rounded-lg border p-3 ${
                breached ? 'border-red-500/30 bg-red-500/5'
                : warning ? 'border-yellow-400/30 bg-yellow-400/5'
                : 'border-gw-border'
              }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white">{cfg.gridId}</span>
                <span className={`text-xs font-mono font-bold ${textColor}`}>
                  {intensity !== null ? `${Math.round(intensity)}` : '—'}
                  <span className="font-normal text-gw-muted"> gCO₂</span>
                </span>
              </div>
              {/* Intensity bar */}
              <div className="relative h-1.5 bg-gw-border/50 rounded-full overflow-visible">
                {pct !== null && (
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                )}
                {/* Threshold marker at 100% */}
                <div className="absolute top-1/2 right-0 -translate-y-1/2 w-0.5 h-3 bg-gw-border rounded" />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gw-muted">
                  {pct !== null ? `${Math.round(pct)}%` : '—'} of {threshold}
                </span>
                <span className={`text-xs font-medium ${textColor}`}>
                  {intensity === null ? 'No data' : breached ? 'BREACH' : warning ? 'WARNING' : 'OK'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Incident Card ─────────────────────────────────────────────────────────

function IncidentCard({ incident, onUpdate }: { incident: Incident; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const isOpen    = incident.Status === 'OPEN'
  const severity  = incident.Severity || 'WARNING'
  const source    = incidentSource(incident)
  const meta      = GROUP_META[source]
  const title     = incidentTitle(incident)
  const threshold = Number(incident.Threshold) || 0
  const breach    = Number(incident.BreachValue) || 0
  const peak      = Number(incident.PeakValue || incident.BreachValue) || 0
  const pctOver   = threshold > 0 ? ((breach - threshold) / threshold) * 100 : 0
  const barWidth  = threshold > 0 ? Math.min((breach / threshold) * 100, 150) : 0
  const sevColors = SEVERITY_COLOR[severity] || SEVERITY_COLOR['WARNING']

  return (
    <div className={`bg-gw-panel border rounded-xl transition-colors ${
      isOpen ? 'border-orange-500/25 hover:border-orange-500/40' : 'border-gw-border hover:border-gw-border/80'
    }`}>
      {/* Main row */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-0.5 flex-shrink-0 ${isOpen ? (severity === 'CRITICAL' ? 'text-red-400' : 'text-orange-400') : 'text-gw-green'}`}>
              {isOpen
                ? <AlertTriangle className="w-4.5 h-4.5" />
                : <CheckCircle className="w-4.5 h-4.5" />}
            </div>
            <div className="min-w-0">
              <div className="text-white font-medium text-sm leading-tight truncate">{title}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs font-mono text-gw-muted`}>{incident.IncidentID}</span>
                {/* Source badge */}
                <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${meta.accent} border-current/30 bg-current/5`}>
                  {meta.icon}
                  <span className="text-[10px] font-medium">{meta.label}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Duration for open incidents */}
            {isOpen && (
              <div className="flex items-center gap-1 text-xs text-orange-400 font-mono bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded">
                <Clock className="w-3 h-3" />
                {formatDuration(incident.OpenedAt)}
              </div>
            )}
            {/* Severity badge */}
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${sevColors}`}>
              {severity}
            </span>
            {/* Status badge */}
            <span className={`text-xs px-2 py-0.5 rounded border ${
              isOpen ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                     : 'border-gw-green/30 bg-gw-green/10 text-gw-green'
            }`}>
              {incident.Status}
            </span>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
          <div>
            <div className="text-gw-muted mb-0.5">Breach Value</div>
            <div className="text-white font-mono font-semibold">
              {breach.toFixed(breach >= 100 ? 0 : 1)}
              {incident.Metric?.includes('carbon') ? ' gCO₂/kWh' : ''}
            </div>
          </div>
          <div>
            <div className="text-gw-muted mb-0.5">Peak</div>
            <div className="text-white font-mono font-semibold">
              {peak.toFixed(peak >= 100 ? 0 : 1)}
              {incident.Metric?.includes('carbon') ? ' gCO₂/kWh' : ''}
            </div>
          </div>
          <div>
            <div className="text-gw-muted mb-0.5">Threshold</div>
            <div className="text-white font-mono font-semibold">
              {threshold.toFixed(threshold >= 100 ? 0 : 1)}
              {incident.Metric?.includes('carbon') ? ' gCO₂/kWh' : ''}
            </div>
          </div>
          <div>
            <div className="text-gw-muted mb-0.5">Observations</div>
            <div className="text-white font-mono font-semibold flex items-center gap-1">
              <Eye className="w-3 h-3 text-gw-muted" />
              {incident.ObservationCount ?? 1}×
            </div>
          </div>
        </div>

        {/* Breach severity bar — only shown when breached (breach > threshold) */}
        {threshold > 0 && breach > threshold && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gw-muted mb-1">
              <span>Breach severity</span>
              <span className="text-orange-400 font-mono">+{pctOver.toFixed(1)}% over threshold</span>
            </div>
            <div className="relative h-2 bg-gw-border/40 rounded-full overflow-hidden">
              {/* Threshold reference line at the "normal" position */}
              <div
                className="absolute top-0 h-full bg-gw-green/20"
                style={{ width: `${(threshold / (peak * 1.1)) * 100}%` }}
              />
              {/* Breach fill */}
              <div
                className={`absolute top-0 h-full rounded-full ${
                  pctOver > 50 ? 'bg-red-500' : pctOver > 20 ? 'bg-orange-500' : 'bg-yellow-400'
                } opacity-80`}
                style={{ width: `${(breach / (peak * 1.1)) * 100}%` }}
              />
              {/* Threshold marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-white/30"
                style={{ left: `${(threshold / (peak * 1.1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="flex items-center gap-4 text-xs text-gw-muted">
          <span>
            Opened{' '}
            <span className="text-white font-mono">
              {new Date(incident.OpenedAt).toLocaleString('en-CA', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
          {incident.ClosedAt && (
            <span>
              Resolved{' '}
              <span className="text-gw-green font-mono">
                {new Date(incident.ClosedAt).toLocaleString('en-CA', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </span>
          )}
          {incident.LastAction && incident.LastAction !== 'none' && !incident.ClosedAt && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {incident.LastAction.replace(/_/g, ' ').toLowerCase()}
              {incident.LastActionAt && ` · ${new Date(incident.LastActionAt).toLocaleTimeString('en-CA', { hour12: false })}`}
            </span>
          )}
          {/* Expand description toggle */}
          {incident.Description && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="ml-auto text-gw-muted hover:text-gw-green transition-colors">
              {expanded ? '▲ Hide details' : '▼ Details'}
            </button>
          )}
        </div>

        {/* Expandable description */}
        {expanded && incident.Description && (
          <div className="mt-3 pt-3 border-t border-gw-border text-xs text-gw-muted leading-relaxed">
            {incident.Description}
          </div>
        )}
      </div>

      {/* Actions footer (open incidents only) */}
      {isOpen && (
        <div className="px-4 pb-4 pt-0 border-t border-gw-border mt-0">
          <div className="pt-3">
            <IncidentActions
              tenantId={incident.TenantID}
              incidentId={incident.IncidentID}
              onActionRecorded={onUpdate}
            />
          </div>
        </div>
      )}
    </div>
  )
}
