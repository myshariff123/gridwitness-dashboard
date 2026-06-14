'use client'

import CarbonTrendSparkline from '@/components/CarbonTrendSparkline'
import { useEffect, useState, useCallback } from 'react'
import Nav from '@/components/Nav'
import {
  getLiveTelemetry, getLiveGridData,
  type TelemetryRecord, type GridSnapshot,
} from '@/lib/api'
import { Activity, Zap, Server, RefreshCw, Target, TrendingUp, AlertTriangle, Search, Leaf, Wind } from 'lucide-react'

interface EmissionsSummary {
  scope1_t: number
  scope2_location_t: number
  scope2_market_t: number
  scope3_t: number
  gross_t: number
  gross_market_t: number
  net_t: number
  recs_mwh_retired: number
  bill_c59_compliant: boolean
  offsets_t: number
  net_zero_ready: boolean
  recs_reduction_pct: number
  offsets_reduction_pct: number
  carbon_tax_gross_cad: number
  carbon_tax_market_cad: number
  carbon_tax_net_cad: number
  carbon_price_cad: number
  year: number
}

interface DeviceRow {
  source:   string
  type:     string
  wattage:  number
  grid:     string
  gCO2e:    number
  lastSeen: Date
  ageMin:   number
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
                 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

interface BudgetStatus {
  period_key:               string
  period_type:              string
  budget_t_co2e:            number
  consumed_t_co2e:          number
  remaining_t_co2e:         number
  pct_used:                 number
  burn_rate_t_co2e_per_day: number
  days_remaining:           number
  will_breach:              boolean
  projected_breach_date:    string | null
  thresholds:               number[]
  alerts_fired:             Record<string, number | null>
}

const OTHER_PROVINCES: Record<string, { name: string; operator: string }> = {
  BC: { name: 'British Columbia', operator: 'BC Hydro' },
  ON: { name: 'Ontario',          operator: 'IESO'     },
  QC: { name: 'Quebec',           operator: 'Hydro-QC' },
}

function classify(intensity: number | undefined): { label: string; color: string; bg: string } {
  if (intensity == null) return { label: 'UNKNOWN',  color: '#8b949e', bg: 'bg-gray-500/10'  }
  if (intensity < 400)   return { label: 'OPTIMAL',  color: '#21de9a', bg: 'bg-gw-green/10'  }
  if (intensity < 600)   return { label: 'WARNING',  color: '#f59e0b', bg: 'bg-amber-500/10' }
  return                       { label: 'CRITICAL', color: '#ef4444', bg: 'bg-red-500/10'    }
}

function inferType(infraType: string | undefined, source: string): string {
  if (!infraType) return source?.startsWith('i-') ? 'AWS Cloud' : 'Unknown'
  if (infraType.includes('AWS') || infraType.includes('Cloud')) return 'AWS Cloud'
  if (infraType.includes('Kubernetes')) return 'Kubernetes'
  if (infraType.includes('Container'))  return 'Container'
  if (infraType.includes('Private') || infraType.includes('Edge')) return 'Edge Agent'
  if (infraType.includes('BMC') || infraType.includes('Redfish')) return 'BMC Redfish'
  return infraType
}

export default function MonitorPage() {
  const [tenantId, setTenantId]     = useState('GW-NIMBL-AEB47A92')
  const [devices, setDevices]       = useState<DeviceRow[]>([])
  const [grids, setGrids]           = useState<GridSnapshot[]>([])
  const [carbonRecent, setCarbon]   = useState(0)
  const [totalRecords, setTotal]    = useState(0)
  const [loading, setLoading]       = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [err, setErr]               = useState<string | null>(null)
  const [rawRecords, setRawRecords] = useState<TelemetryRecord[]>([])
  const [totalInLedger, setTotalInLedger] = useState<number | null>(null)
  const [budget, setBudget]         = useState<BudgetStatus | null>(null)
  const [emSummary, setEmSummary]   = useState<EmissionsSummary | null>(null)
  const [deviceSearch, setDeviceSearch] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URLSearchParams(window.location.search)
    const t = url.get('tenant_id') || window.localStorage.getItem('gw_tenant_id') || 'GW-NIMBL-AEB47A92'
    setTenantId(t)
  }, [])

  const loadData = useCallback(async () => {
    let anyError = false
    try {
      const { records: telData, totalInLedger: ledgerTotal } = await getLiveTelemetry(tenantId)
      setTotal(ledgerTotal || telData.length)
      setTotalInLedger(ledgerTotal)
      setRawRecords(telData)
      if (telData.length === 0) anyError = true

      const byDevice = new Map<string, TelemetryRecord>()
      for (const r of telData) {
        const existing = byDevice.get(r.Source)
        if (!existing || new Date(r.Timestamp).getTime() > new Date(existing.Timestamp).getTime())
          byDevice.set(r.Source, r)
      }
      const now = new Date()
      const rows: DeviceRow[] = Array.from(byDevice.values()).map(r => {
        const seenAt = new Date(r.Timestamp)
        return {
          source:   r.Source,
          type:     inferType(r.InfraType, r.Source),
          wattage:  Number(r.Actual_Wattage) || 0,
          grid:     r.GridID || 'AB',
          gCO2e:    Number(r.gCO2e) || 0,
          lastSeen: seenAt,
          ageMin:   Math.round((now.getTime() - seenAt.getTime()) / 60000),
        }
      }).sort((a, b) => a.ageMin - b.ageMin)
      setDevices(rows)
      setCarbon(telData.reduce((acc, r) => acc + (Number(r.gCO2e) || 0), 0) / 1000)

      const gridData = await getLiveGridData()
      const ordered = ['AB', 'BC', 'ON', 'QC'].map(g =>
        gridData.find(d => d.GridID === g) || { GridID: g } as GridSnapshot)
      setGrids(ordered)
      if (gridData.length === 0) anyError = true

      // Budget — silent 404
      try {
        const br = await fetch(`${API_BASE}/api/tenants/${tenantId}/budget`)
        setBudget(br.ok ? await br.json() : null)
      } catch { setBudget(null) }

      // Verified emissions summary (market-based + net)
      try {
        const year = new Date().getFullYear()
        const er = await fetch(`${API_BASE}/api/tenants/${tenantId}/emissions-summary?year=${year}`)
        setEmSummary(er.ok ? await er.json() : null)
      } catch { setEmSummary(null) }

      setLastUpdate(new Date())
      setErr(anyError ? 'One or more data sources returned no data' : null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    loadData()
    const i = setInterval(loadData, 30000)
    return () => clearInterval(i)
  }, [loadData])

  const abGrid    = grids.find(g => g.GridID === 'AB')
  const intensity = abGrid ? (abGrid.CurrentIntensity ?? abGrid.CarbonIntensity) : undefined
  const cls       = classify(intensity)
  const isLive    = (abGrid?.DataQuality ?? '').includes('LIVE') || (abGrid?.DataQuality ?? '').includes('AESO')

  const filteredDevices = devices.filter(d =>
    !deviceSearch || d.source.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    d.type.toLowerCase().includes(deviceSearch.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {err && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg p-3 text-sm">{err}</div>
        )}

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-gw-green" />
              Live Monitor
            </h1>
            <p className="text-xs text-gw-muted mt-0.5">Hardware-verified telemetry · WORM-sealed immutable ledger</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gw-muted">
            <span>Updated {lastUpdate.toLocaleTimeString('en-CA', { hour12: false })}</span>
            <button onClick={loadData}
              className="flex items-center gap-1 border border-gw-border px-2.5 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── KPI row — 4 cards including AB Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
            <div className="text-xs text-gw-muted uppercase tracking-wider mb-2">Net Carbon</div>
            <div className="text-2xl font-bold text-gw-green font-mono">{carbonRecent.toFixed(4)}</div>
            <div className="text-xs text-gw-muted mt-1">kgCO₂e · {totalRecords.toLocaleString()} records</div>
          </div>

          <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
            <div className="text-xs text-gw-muted uppercase tracking-wider mb-2">Active Devices</div>
            <div className="text-2xl font-bold text-white font-mono">{devices.length}</div>
            <div className="text-xs text-gw-muted mt-1">{devices.filter(d => d.ageMin <= 15).length} reporting &lt;15 min</div>
          </div>

          <div className={`bg-gw-panel border border-gw-border rounded-xl p-4 ${intensity != null ? cls.bg : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gw-muted uppercase tracking-wider">AB Grid</div>
              {isLive
                ? <span className="text-xs text-gw-green border border-gw-green/30 px-1.5 py-0.5 rounded">LIVE</span>
                : <span className="text-xs text-amber-400 border border-amber-400/30 px-1.5 py-0.5 rounded">EST</span>
              }
            </div>
            <div className="text-2xl font-bold font-mono" style={{ color: cls.color }}>
              {intensity != null ? Number(intensity).toFixed(0) : '—'}
            </div>
            <div className="text-xs mt-1" style={{ color: cls.color }}>{cls.label} · gCO₂/kWh</div>
          </div>

          <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
            <div className="text-xs text-gw-muted uppercase tracking-wider mb-2">Ledger Records</div>
            <div className="text-2xl font-bold text-white font-mono">{totalRecords.toLocaleString()}</div>
            <div className="text-xs text-gw-muted mt-1">{totalInLedger ? 'Total in WORM ledger' : 'Returned by API'}</div>
          </div>
        </div>

        {/* ── Carbon Budget widget ── */}
        {budget && (() => {
          const pct       = budget.pct_used
          const barColor  = pct >= 100 ? 'bg-red-500' : pct >= 95 ? 'bg-orange-500' : pct >= 80 ? 'bg-amber-400' : 'bg-gw-green'
          const textColor = pct >= 100 ? 'text-red-400' : pct >= 95 ? 'text-orange-400' : pct >= 80 ? 'text-amber-400' : 'text-gw-green'
          const fired     = Object.entries(budget.alerts_fired).filter(([,v]) => v !== null).map(([k]) => k)
          return (
            <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  Carbon Budget
                  <span className="text-xs text-gw-muted font-normal">· {budget.period_key} · {budget.period_type}</span>
                </h2>
                <div className="flex items-center gap-2">
                  {budget.will_breach && (
                    <span className="flex items-center gap-1 text-xs text-red-400 border border-red-400/30 px-2 py-0.5 rounded">
                      <AlertTriangle className="w-3 h-3" />
                      Breach projected {budget.projected_breach_date || 'this period'}
                    </span>
                  )}
                  <a href={`/settings?tenant_id=${tenantId}`}
                    className="text-xs text-gw-muted hover:text-purple-400 border border-gw-border px-2 py-0.5 rounded transition-colors">
                    Configure
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gw-muted">{budget.consumed_t_co2e.toFixed(4)} tCO₂e consumed</span>
                    <span className={`font-bold ${textColor}`}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-gw-dark rounded-full overflow-hidden mb-1">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="text-xs text-gw-muted">of {budget.budget_t_co2e.toFixed(2)} tCO₂e · {budget.days_remaining} days remaining</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end text-xs text-gw-muted"><TrendingUp className="w-3 h-3" />Burn rate</div>
                  <div className="font-mono text-white text-sm">{budget.burn_rate_t_co2e_per_day.toFixed(5)}</div>
                  <div className="text-xs text-gw-muted">tCO₂e/day</div>
                </div>
                {fired.length > 0 && (
                  <div className="shrink-0 flex flex-col gap-1">
                    {fired.map(k => (
                      <span key={k} className="text-xs px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 font-mono">{k}% fired</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── Verified Emissions Strip ── */}
        {emSummary && (
          <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Leaf className="w-4 h-4 text-gw-green" />
                Verified Emissions  ·  {emSummary.year}
                <span className="text-xs text-gw-muted font-normal">GHG Protocol · Market-Based Scope 2</span>
              </h2>
              <div className="flex items-center gap-2">
                {emSummary.bill_c59_compliant && (
                  <span className="text-xs text-gw-green border border-gw-green/30 px-2 py-0.5 rounded">Bill C-59 ✓</span>
                )}
                {emSummary.net_zero_ready && (
                  <span className="text-xs text-emerald-400 border border-emerald-400/30 px-2 py-0.5 rounded flex items-center gap-1">
                    <Wind className="w-3 h-3" /> Net-Zero Ready
                  </span>
                )}
                <a href={`/settings?tab=recs&tenant_id=${tenantId}`}
                  className="text-xs text-gw-muted hover:text-gw-green border border-gw-border px-2 py-0.5 rounded transition-colors">
                  Manage RECs &amp; Offsets
                </a>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gw-dark rounded-lg p-3">
                <div className="text-xs text-gw-muted mb-1">Gross (Location)</div>
                <div className="text-lg font-bold text-white font-mono">{emSummary.gross_t.toFixed(2)}</div>
                <div className="text-xs text-gw-muted">tCO₂e · S1+S2+S3</div>
              </div>
              <div className="bg-gw-dark rounded-lg p-3">
                <div className="text-xs text-gw-muted mb-1">Market-Based
                  {emSummary.recs_mwh_retired > 0 && (
                    <span className="ml-1 text-gw-green">−{emSummary.recs_reduction_pct}%</span>
                  )}
                </div>
                <div className="text-lg font-bold text-gw-green font-mono">{emSummary.gross_market_t.toFixed(2)}</div>
                <div className="text-xs text-gw-muted">
                  {emSummary.recs_mwh_retired > 0
                    ? `${emSummary.recs_mwh_retired.toFixed(1)} MWh RECs retired`
                    : 'tCO₂e · after RECs'}
                </div>
              </div>
              <div className="bg-gw-dark rounded-lg p-3">
                <div className="text-xs text-gw-muted mb-1">Net Position
                  {emSummary.offsets_t > 0 && (
                    <span className="ml-1 text-emerald-400">−{emSummary.offsets_reduction_pct}%</span>
                  )}
                </div>
                <div className={`text-lg font-bold font-mono ${emSummary.net_zero_ready ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {emSummary.net_t.toFixed(2)}
                </div>
                <div className="text-xs text-gw-muted">
                  {emSummary.offsets_t > 0
                    ? `${emSummary.offsets_t.toFixed(2)} tCO₂e offsets`
                    : 'tCO₂e · after offsets'}
                </div>
              </div>
              <div className="bg-gw-dark rounded-lg p-3">
                <div className="text-xs text-gw-muted mb-1">Carbon Liability (Net)</div>
                <div className="text-lg font-bold text-amber-400 font-mono">
                  ${emSummary.carbon_tax_net_cad.toLocaleString('en-CA', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gw-muted">${emSummary.carbon_price_cad}/tCO₂e federal price</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Carbon Trend ── */}
        <CarbonTrendSparkline records={rawRecords} bucketMinutes={60} buckets={24} />

        {/* ── Two-column: Device stream + AB Grid detail ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Device table — 2/3 width */}
          <div className="lg:col-span-2 bg-gw-panel border border-gw-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
                <Server className="w-4 h-4 text-gw-green" />
                Device Stream
                <span className="ml-1 text-xs border border-gw-green/30 text-gw-green px-2 py-0.5 rounded">{devices.length} nodes</span>
              </h2>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gw-muted" />
                <input value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)}
                  placeholder="Filter devices…"
                  className="bg-gw-dark border border-gw-border rounded pl-8 pr-3 py-1.5 text-xs text-white focus:border-gw-green focus:outline-none w-40" />
              </div>
            </div>
            {loading && devices.length === 0 ? (
              <div className="text-sm text-gw-muted py-8 text-center">Loading…</div>
            ) : filteredDevices.length === 0 ? (
              <div className="text-sm text-gw-muted py-8 text-center">
                {deviceSearch ? 'No devices match your filter.' : 'No devices reporting. Deploy the agent to get started.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gw-muted border-b border-gw-border">
                      <th className="text-left pb-2 pr-3 font-medium">Source</th>
                      <th className="text-left pb-2 pr-3 font-medium">Type</th>
                      <th className="text-right pb-2 pr-3 font-medium">Watts</th>
                      <th className="text-center pb-2 pr-3 font-medium">Grid</th>
                      <th className="text-right pb-2 pr-3 font-medium">gCO₂</th>
                      <th className="text-right pb-2 font-medium">Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gw-border/50">
                    {filteredDevices.map(d => (
                      <tr key={d.source} className="hover:bg-gw-dark/50 transition-colors group">
                        <td className="py-2 pr-3 font-mono text-white text-xs">
                          {d.source.length > 22 ? d.source.slice(0, 22) + '…' : d.source}
                        </td>
                        <td className="py-2 pr-3 text-gw-muted">{d.type}</td>
                        <td className="py-2 pr-3 text-right font-mono text-white">{d.wattage.toFixed(0)}</td>
                        <td className="py-2 pr-3 text-center">
                          <span className="px-1.5 py-0.5 rounded text-xs font-mono text-gw-green bg-gw-green/10">{d.grid}</span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-gw-muted">{d.gCO2e.toFixed(3)}</td>
                        <td className="py-2 text-right text-gw-muted">
                          {d.ageMin < 1 ? 'just now' : d.ageMin < 60 ? `${d.ageMin}m` : d.ageMin < 1440 ? `${Math.floor(d.ageMin/60)}h` : `${Math.floor(d.ageMin/1440)}d`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AB Grid detail + Other regions — 1/3 width */}
          <div className="space-y-4">
            {/* AB Grid deep-dive */}
            <div className={`bg-gw-panel border border-gw-border rounded-xl p-5 ${cls.bg}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-gw-green" />
                  Alberta Grid
                </h2>
                {isLive
                  ? <span className="text-xs text-gw-green border border-gw-green/30 px-2 py-0.5 rounded">LIVE · AESO</span>
                  : <span className="text-xs text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded">{abGrid?.DataQuality || 'BASELINE'}</span>
                }
              </div>
              <div className="text-5xl font-bold font-mono mb-1" style={{ color: cls.color }}>
                {intensity != null ? Number(intensity).toFixed(0) : '—'}
              </div>
              <div className="text-xs mb-3" style={{ color: cls.color }}>{cls.label} · gCO₂/kWh</div>
              <div className="space-y-1 text-xs text-gw-muted">
                <div className="flex justify-between"><span>Operator</span><span className="text-white">AESO</span></div>
                {abGrid?.PoolPrice != null && Number(abGrid.PoolPrice) > 0 && (
                  <div className="flex justify-between"><span>Pool Price</span>
                    <span className="text-white font-mono">${Number(abGrid.PoolPrice).toFixed(2)}/MWh</span>
                  </div>
                )}
                <div className="flex justify-between"><span>Region</span><span className="text-white">ca-west-1</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-gw-border/50 text-xs text-gw-muted space-y-0.5">
                <div>&lt;400 — Optimal (renewables)</div>
                <div>400–600 — Warning (gas)</div>
                <div>&gt;600 — Critical (coal)</div>
              </div>
            </div>

            {/* Other regions — compact */}
            <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
              <h2 className="text-xs font-semibold text-gw-muted uppercase tracking-wider mb-3">Other Provinces</h2>
              <div className="space-y-2">
                {grids.filter(g => g.GridID !== 'AB').map(g => {
                  const int2 = g.CurrentIntensity ?? g.CarbonIntensity
                  const cls2 = classify(int2)
                  const meta = OTHER_PROVINCES[g.GridID] || { name: g.GridID, operator: '' }
                  return (
                    <div key={g.GridID} className="flex items-center justify-between py-1.5 border-b border-gw-border/30 last:border-0">
                      <div>
                        <div className="text-xs font-medium text-white">{meta.name}</div>
                        <div className="text-xs text-gw-muted">{meta.operator}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold" style={{ color: cls2.color }}>
                          {int2 != null ? Number(int2).toFixed(0) : '—'}
                        </div>
                        <div className="text-xs" style={{ color: cls2.color }}>{cls2.label}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gw-muted mt-3 leading-relaxed">
                Multi-region coverage available. Contact us to expand reporting scope.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
