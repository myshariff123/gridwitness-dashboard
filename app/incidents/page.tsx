'use client'
import { Download } from 'lucide-react'
import { toCsv, downloadCsv, tsFilename } from '@/lib/csv'
import { useState, useEffect } from 'react'
import Nav from '@/components/Nav'
import IncidentActions from '@/components/IncidentActions'
import { listIncidents, recordIncidentAction, closeIncident, type Incident } from '@/lib/api'
import { AlertTriangle, CheckCircle, Clock, Shield, RefreshCw, Filter } from 'lucide-react'

const TENANT_ID = 'GW-NIMBL-AEB47A92'

type FilterMode = 'all' | 'open' | 'closed'

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState<FilterMode>('all')
  const [lastFetch, setLastFetch] = useState<Date>(new Date())

  const load = async () => {
    setLoading(true)
    try {
      const data = await listIncidents(TENANT_ID,
        filter === 'all' ? undefined : (filter === 'open' ? 'OPEN' : 'CLOSED'))
      setIncidents(data)
      setLastFetch(new Date())
    } catch (e) {
      console.error('Load incidents failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)  // refresh every 30s
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])
const exportCsv = () => {
  const csv = toCsv(incidents, [
    { key: 'IncidentID',   label: 'Incident ID' },
    { key: 'GridID',       label: 'Grid' },
    { key: 'Metric',       label: 'Metric' },
    { key: 'Status',       label: 'Status' },
    { key: 'Severity',     label: 'Severity' },
    { key: 'BreachValue',  label: 'Breach Value' },
    { key: 'PeakValue',    label: 'Peak Value' },
    { key: 'Threshold',    label: 'Threshold' },
    { key: 'OpenedAt',     label: 'Opened At (UTC)' },
    { key: 'ClosedAt',     label: 'Closed At (UTC)' },
    { key: 'LastAction',   label: 'Last Action' },
    { key: 'LastActionAt', label: 'Last Action At (UTC)' },
  ])
  downloadCsv(tsFilename('incidents', TENANT_ID), csv)
}

  const openCount   = incidents.filter(i => i.Status === 'OPEN').length
  const closedCount = incidents.filter(i => i.Status === 'CLOSED').length

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={TENANT_ID} />

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-gw-green" />
              Grid Stress Incidents
            </h1>
            <p className="text-sm text-gw-muted mt-1">
              All breaches WORM-sealed to the immutable ledger · OSFI B-15 §7.1
            </p>
          </div>
          <button onClick={load}
            className="flex items-center gap-2 text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={exportCsv}
  disabled={incidents.length === 0}
  className="flex items-center gap-2 text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors disabled:opacity-50">
  <Download className="w-3.5 h-3.5" />
  Export CSV
</button>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
            <div className="text-xs text-gw-muted">Open Incidents</div>
            <div className="text-2xl font-bold text-orange-400 mt-1">{openCount}</div>
          </div>
          <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
            <div className="text-xs text-gw-muted">Closed (Last 50)</div>
            <div className="text-2xl font-bold text-gw-green mt-1">{closedCount}</div>
          </div>
          <div className="bg-gw-panel border border-gw-border rounded-xl p-4">
            <div className="text-xs text-gw-muted">Last Updated</div>
            <div className="text-sm font-mono text-white mt-2">{lastFetch.toLocaleTimeString('en-CA', { hour12: false })}</div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gw-muted" />
          {(['all', 'open', 'closed'] as FilterMode[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                filter === f
                  ? 'border-gw-green bg-gw-green/10 text-gw-green'
                  : 'border-gw-border text-gw-muted hover:border-gw-border/80'
              }`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Incidents list */}
        <div className="space-y-3">
          {loading && incidents.length === 0 && (
            <div className="bg-gw-panel border border-gw-border rounded-xl p-8 text-center text-gw-muted text-sm">
              Loading incidents...
            </div>
          )}

          {!loading && incidents.length === 0 && (
            <div className="bg-gw-panel border border-gw-green/20 rounded-xl p-8 text-center">
              <CheckCircle className="w-8 h-8 text-gw-green mx-auto mb-2" />
              <div className="text-white font-medium">No incidents</div>
              <div className="text-xs text-gw-muted mt-1">
                All monitored grids operating within configured thresholds
              </div>
            </div>
          )}

          {incidents.map(inc => (
            <IncidentCard key={inc.IncidentID} incident={inc} onUpdate={load} />
          ))}
        </div>
      </div>
    </div>
  )
}

function IncidentCard({ incident, onUpdate }: { incident: Incident; onUpdate: () => void }) {
  const isOpen = incident.Status === 'OPEN'
  const severity = incident.Severity || 'WARNING'

  return (
    <div className={`bg-gw-panel border rounded-xl p-5 ${
      isOpen ? 'border-orange-500/30' : 'border-gw-border'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          {isOpen
            ? <AlertTriangle className={`w-5 h-5 mt-0.5 ${severity === 'CRITICAL' ? 'text-red-400' : 'text-orange-400'}`} />
            : <CheckCircle className="w-5 h-5 mt-0.5 text-gw-green" />}
          <div>
            <div className="text-white font-medium">
              {incident.GridID} {incident.Metric.replace(/_/g, ' ')}
            </div>
            <div className="text-xs text-gw-muted mt-0.5 font-mono">{incident.IncidentID}</div>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${
          isOpen ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                 : 'bg-gw-green/10 text-gw-green border border-gw-green/30'
        }`}>
          {incident.Status}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-gw-muted">Breach Value</div>
          <div className="text-white font-mono font-medium">{Number(incident.BreachValue).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-gw-muted">Peak</div>
          <div className="text-white font-mono font-medium">{Number(incident.PeakValue || incident.BreachValue).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-gw-muted">Threshold</div>
          <div className="text-white font-mono font-medium">{Number(incident.Threshold).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-gw-muted">Opened</div>
          <div className="text-white text-xs">
            {new Date(incident.OpenedAt).toLocaleString('en-CA', { hour12: false })}
          </div>
        </div>
      </div>

      {incident.LastAction && incident.LastAction !== 'none' && (
        <div className="mt-3 pt-3 border-t border-gw-border">
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-gw-muted" />
            <span className="text-gw-muted">Last action:</span>
            <span className="text-white">{incident.LastAction.replace(/_/g, ' ')}</span>
            {incident.LastActionAt && (
              <span className="text-gw-muted">
                · {new Date(incident.LastActionAt).toLocaleString('en-CA', { hour12: false })}
              </span>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-gw-border">
          <IncidentActions
            tenantId={incident.TenantID}
            incidentId={incident.IncidentID}
            onActionRecorded={onUpdate}
          />
        </div>
      )}
    </div>
  )
}
