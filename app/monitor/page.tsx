'use client'
// app/monitor/page.tsx — DARK THEME (FIXED v3)
// Fixes:
//   1. CarbonTrendSparkline is now its own panel (not nested inside h2)
//   2. Uses lib/api.ts (envelope-aware) instead of raw fetch
//   3. Handles both Timestamp/SealedAt and gCO2e/CarbonDebt_gCO2 field names

import CarbonTrendSparkline from '@/components/CarbonTrendSparkline'
import { useEffect, useState, useCallback } from 'react'
import Nav from '@/components/Nav'
import {
  getLiveTelemetry, getLiveGridData,
  type TelemetryRecord, type GridSnapshot,
} from '@/lib/api'
import { Activity, Zap, Server, RefreshCw } from 'lucide-react'

interface DeviceRow {
  source:   string
  type:     string
  wattage:  number
  grid:     string
  gCO2e:    number
  lastSeen: Date
  ageMin:   number
}

const AB_GRID = { name: 'Alberta', operator: 'AESO' }

const OTHER_PROVINCES: Record<string, { name: string; operator: string }> = {
  BC: { name: 'British Columbia', operator: 'BC Hydro' },
  ON: { name: 'Ontario',          operator: 'IESO'     },
  QC: { name: 'Quebec',           operator: 'Hydro-QC' },
}

// Alberta-specific thresholds: AB grid runs 400-700 gCO2/kWh (coal/gas heavy)
function classify(intensity: number | undefined): { label: string; color: string } {
  if (intensity == null) return { label: 'UNKNOWN',  color: '#8b949e' }
  if (intensity < 400)   return { label: 'OPTIMAL',  color: '#21de9a' }
  if (intensity < 600)   return { label: 'WARNING',  color: '#f59e0b' }
  return                       { label: 'CRITICAL', color: '#ef4444' }
}

function inferType(infraType: string | undefined, source: string): string {
  if (!infraType) {
    if (source && source.startsWith('i-')) return 'AWS Cloud'
    return 'Unknown'
  }
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URLSearchParams(window.location.search)
    const t = url.get('tenant_id') ||
              window.localStorage.getItem('gw_tenant_id') ||
              'GW-NIMBL-AEB47A92'
    setTenantId(t)
  }, [])

  const loadData = useCallback(async () => {
    let anyError = false
    try {
      // Use envelope-aware lib/api.ts — handles {records:[...]} OR flat array
      const { records: telData, totalInLedger: ledgerTotal } = await getLiveTelemetry(tenantId)
      setTotal(ledgerTotal || telData.length)
      setTotalInLedger(ledgerTotal)
      setRawRecords(telData)

      if (telData.length === 0) anyError = true

      // Group by Source — keep newest record per device
      const byDevice = new Map<string, TelemetryRecord>()
      for (const r of telData) {
        const existing = byDevice.get(r.Source)
        if (!existing ||
            new Date(r.Timestamp).getTime() > new Date(existing.Timestamp).getTime()) {
          byDevice.set(r.Source, r)
        }
      }

      const now = new Date()
      const rows: DeviceRow[] = Array.from(byDevice.values()).map(r => {
        const seenAt = new Date(r.Timestamp)
        const ageMin = Math.round((now.getTime() - seenAt.getTime()) / 60000)
        return {
          source:   r.Source,
          type:     inferType(r.InfraType, r.Source),
          wattage:  Number(r.Actual_Wattage) || 0,
          grid:     r.GridID || 'AB',
          gCO2e:    Number(r.gCO2e) || 0,
          lastSeen: seenAt,
          ageMin,
        }
      }).sort((a, b) => a.ageMin - b.ageMin)
      setDevices(rows)

      const sumG = telData.reduce((acc, r) => acc + (Number(r.gCO2e) || 0), 0)
      setCarbon(sumG / 1000)

      // Grid status — AB first
      const gridData = await getLiveGridData()
      const ordered = ['AB', 'BC', 'ON', 'QC'].map(g =>
        gridData.find(d => d.GridID === g) || { GridID: g } as GridSnapshot)
      setGrids(ordered)
      if (gridData.length === 0) anyError = true

      setLastUpdate(new Date())
      setErr(anyError ? 'One or more endpoints returned no data — check API and network' : null)
    } catch (e) {
      console.error('Monitor load failed:', e)
      setErr(e instanceof Error ? e.message : 'Network error — check browser console')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    loadData()
    const i = setInterval(loadData, 30000)
    return () => clearInterval(i)
  }, [loadData])

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {err && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl p-3 text-sm">
            {err}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-gw-green" />
              Live Monitor
            </h1>
            <p className="text-sm text-gw-muted mt-1">
              Hardware-verified telemetry · WORM-sealed to immutable ledger
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gw-muted">
            <span>Auto-refresh: 30s</span>
            <span>·</span>
            <span>Last update: {lastUpdate.toLocaleTimeString('en-CA', { hour12: false })}</span>
            <button
              onClick={loadData}
              className="ml-2 flex items-center gap-1 border border-gw-border px-2 py-1 rounded hover:border-gw-green hover:text-gw-green transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
            <div className="text-xs text-gw-muted uppercase tracking-wider mb-2">
              Net Carbon (recent)
            </div>
            <div className="text-2xl font-bold text-gw-green font-mono">
              {carbonRecent.toFixed(4)} <span className="text-sm text-gw-muted">kgCO₂e</span>
            </div>
            <div className="text-xs text-gw-muted mt-1">
              Sum across {totalRecords.toLocaleString()} ledger records
            </div>
          </div>

          <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
            <div className="text-xs text-gw-muted uppercase tracking-wider mb-2">
              Active Devices
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {devices.length} <span className="text-sm text-gw-muted">nodes</span>
            </div>
            <div className="text-xs text-gw-muted mt-1">
              {devices.filter(d => d.ageMin <= 15).length} reporting in last 15 min
            </div>
          </div>

          <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
            <div className="text-xs text-gw-muted uppercase tracking-wider mb-2">
              Telemetry Records
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {totalRecords.toLocaleString()}
            </div>
            <div className="text-xs text-gw-muted mt-1">
              {totalInLedger && totalInLedger > 0 ? 'Total in WORM ledger' : 'Returned by API'}
            </div>
          </div>
        </div>

        {/* Carbon Trend Sparkline — its OWN panel (was nested in h2; now fixed) */}
        <CarbonTrendSparkline records={rawRecords} bucketMinutes={60} buckets={24} />

        {/* Active Device Stream */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-gw-green" />
              Active Device Stream
              <span className="ml-2 text-xs border border-gw-green/30 text-gw-green px-2 py-0.5 rounded">
                {devices.length} nodes
              </span>
            </h2>
          </div>
          {loading && devices.length === 0 ? (
            <div className="text-sm text-gw-muted py-8 text-center">Loading…</div>
          ) : devices.length === 0 ? (
            <div className="text-sm text-gw-muted py-8 text-center">
              No devices reporting. Deploy the agent or enable AWS auto-discovery in Settings.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gw-muted border-b border-gw-border">
                    <th className="text-left pb-2 pr-4 font-medium">Source / Instance ID</th>
                    <th className="text-left pb-2 pr-4 font-medium">Type</th>
                    <th className="text-right pb-2 pr-4 font-medium">Wattage</th>
                    <th className="text-center pb-2 pr-4 font-medium">Grid</th>
                    <th className="text-right pb-2 pr-4 font-medium">Carbon (gCO₂)</th>
                    <th className="text-right pb-2 font-medium">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gw-border/50">
                  {devices.map(d => (
                    <tr key={d.source} className="hover:bg-gw-dark/50 transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-white">
                        {d.source.length > 28 ? d.source.slice(0, 28) + '…' : d.source}
                      </td>
                      <td className="py-2.5 pr-4 text-gw-muted">{d.type}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-white">
                        {d.wattage.toFixed(1)} W
                      </td>
                      <td className="py-2.5 pr-4 text-center">
                        <span className="px-2 py-0.5 rounded text-xs font-mono text-gw-green bg-gw-green/10">
                          {d.grid}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-gw-muted">
                        {d.gCO2e.toFixed(3)}
                      </td>
                      <td className="py-2.5 text-right text-gw-muted">
                        {d.ageMin < 1
                          ? 'just now'
                          : d.ageMin < 60
                          ? `${d.ageMin}m ago`
                          : d.ageMin < 1440
                          ? `${Math.floor(d.ageMin/60)}h ago`
                          : `${Math.floor(d.ageMin/1440)}d ago`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alberta Grid — Primary Focus */}
        {(() => {
          const abGrid = grids.find(g => g.GridID === 'AB')
          const intensity = abGrid ? (abGrid.CurrentIntensity ?? abGrid.CarbonIntensity) : undefined
          const cls = classify(intensity)
          const quality = abGrid?.DataQuality ?? ''
          const isLive = quality.includes('LIVE') || quality.includes('AESO')
          const isFallback = !isLive
          return (
            <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-gw-green" />
                  Alberta Grid (AESO)
                  <span className="ml-2 text-xs border border-gw-green/30 text-gw-green px-2 py-0.5 rounded">
                    Live · gCO2/kWh
                  </span>
                </h2>
                {isLive
                  ? <span className="text-xs text-gw-green border border-gw-green/30 px-2 py-0.5 rounded">LIVE</span>
                  : <span className="text-xs text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded" title={quality}>
                      {quality === 'TIME_ESTIMATED' ? 'TIME ESTIMATE' : 'BASELINE'}
                    </span>
                }
              </div>
              <div className="flex items-center gap-8">
                <div>
                  <div className="text-5xl font-bold font-mono" style={{ color: cls.color }}>
                    {intensity != null ? Number(intensity).toFixed(0) : '—'}
                  </div>
                  <div className="text-sm text-gw-muted mt-1">gCO2/kWh</div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
                    <span className="font-semibold text-lg" style={{ color: cls.color }}>{cls.label}</span>
                  </div>
                  <div className="text-xs text-gw-muted space-y-1">
                    <div>Below 400 gCO2/kWh — Optimal (renewable-heavy generation)</div>
                    <div>400–600 gCO2/kWh — Warning (natural gas dominant)</div>
                    <div>Above 600 gCO2/kWh — Critical (coal generation peak)</div>
                  </div>
                </div>
                <div className="text-right text-xs text-gw-muted space-y-1">
                  <div>Operator: AESO</div>
                  <div>Region: ca-west-1</div>
                  {abGrid?.PoolPrice != null && Number(abGrid.PoolPrice) > 0 && (
                    <div className="text-white font-mono">
                      ${Number(abGrid.PoolPrice).toFixed(2)}<span className="text-gw-muted font-sans">/MWh</span>
                    </div>
                  )}
                  <div className="text-gw-muted/60 text-xs">{quality || 'DATA'}</div>
                </div>
              </div>
              <p className="text-xs text-gw-muted mt-4 border-t border-gw-border pt-3">
                Alberta data centres are subject to AER reporting requirements.
                GridWitness provides OSFI B-15 and Bill C-59 compliant audit trails for Alberta operators. ·
                <span className="text-gw-green ml-1">Thresholds configurable in Settings</span>
              </p>
            </div>
          )
        })()}

        {/* Other Canadian Regions — Expansion */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-gw-muted" />
              Other Canadian Regions
            </h2>
            <span className="text-xs text-gw-muted border border-gw-border px-2 py-0.5 rounded">
              Available for multi-region clients
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {grids.filter(g => g.GridID !== 'AB').map(g => {
              const intensity = g.CurrentIntensity ?? g.CarbonIntensity
              const meta = OTHER_PROVINCES[g.GridID] || { name: g.GridID, operator: '' }
              return (
                <div key={g.GridID} className="bg-gw-dark border border-gw-border/50 rounded-lg p-3 opacity-70">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-mono text-gw-muted">{g.GridID}</div>
                      <div className="text-sm text-white">{meta.name}</div>
                      <div className="text-xs text-gw-muted">{meta.operator}</div>
                    </div>
                    <div className="font-mono text-white font-bold">
                      {intensity != null ? Number(intensity).toFixed(0) : '—'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gw-muted mt-3">
            GridWitness can extend compliance coverage to BC, ON, and QC data centres. Contact us to expand your reporting scope.
          </p>
        </div>

      </div>
    </div>
  )
}
