'use client'
import { useState, useEffect, useCallback } from 'react'
import Nav from '@/components/Nav'
import CarbonDebtWidget from '@/components/CarbonDebtWidget'
import GridHealthTable from '@/components/GridHealthTable'
import ScopeChart from '@/components/ScopeChart'
import DeviceStream from '@/components/DeviceStream'
import ActiveIncidents from '@/components/ActiveIncidents'
import { getCarbonSummary } from '@/lib/api'
import { RefreshCw, AlertTriangle } from 'lucide-react'

const TENANT_ID = 'GW-NIMBL-AEB47A92'
const REFRESH_INTERVAL = 30000

export default function MonitorPage() {
  const [summary, setSummary]     = useState<Awaited<ReturnType<typeof getCarbonSummary>> | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [countdown, setCountdown] = useState(30)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getCarbonSummary(TENANT_ID)
      setSummary(data)
      setLastRefresh(new Date())
      setCountdown(30)
    } catch {
      setError('Failed to reach GridWitness API. Retrying...')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const interval = setInterval(refresh, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 30), 1000)
    return () => clearInterval(tick)
  }, [lastRefresh])

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={TENANT_ID} />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Live Telemetry Dashboard</h1>
            <p className="text-sm text-gw-muted mt-0.5">
              Carbon data from WORM ledger · refreshes every 30s
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gw-muted">Next refresh in {countdown}s</span>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Active Grid Incidents — shown only when incidents exist */}
        <ActiveIncidents />

        {/* KPI widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CarbonDebtWidget
            label="Net Carbon Debt (24h)"
            value={summary?.netCarbonKg ?? null}
            unit="kgCO₂e"
            loading={loading}
            color="green"
          />
          <CarbonDebtWidget
            label="Live Nodes"
            value={summary ? `${summary.liveNodesPhys} Physical / ${summary.liveNodesCloud} Cloud` : null}
            unit=""
            loading={loading}
            color="blue"
          />
          <CarbonDebtWidget
            label="Last WORM Write"
            value={summary?.records[0]
              ? new Date(summary.records[0].Timestamp).toLocaleTimeString('en-CA')
              : null}
            unit="UTC"
            loading={loading}
            color="amber"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScopeChart
            scope2={summary?.scope2Kg ?? 0}
            scope3={summary?.scope3Kg ?? 0}
            loading={loading}
          />
          <GridHealthTable loading={loading} />
        </div>

        {/* Device stream */}
        <DeviceStream
          records={summary?.records ?? []}
          loading={loading}
        />

        {/* Footer */}
        <div className="text-xs text-gw-muted text-center pb-4">
          All telemetry is SHA-256 signed · WORM-locked in S3 ca-central-1 · 7-year retention
          · OSFI B-15 · Bill C-59 · ISO 14064-1
        </div>

      </div>
    </div>
  )
}
