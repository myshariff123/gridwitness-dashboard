'use client'
import { useState, useEffect } from 'react'
import { getLiveGridData, type GridEntry } from '@/lib/api'
import { Zap } from 'lucide-react'

interface GridEntry {
  id:        string
  province:  string
  source:    string
  intensity: number   // gCO2/kWh
  status:    'optimal' | 'warning' | 'critical'
}

// Carbon intensity thresholds
function getStatus(intensity: number): GridEntry['status'] {
  if (intensity < 100) return 'optimal'
  if (intensity < 300) return 'warning'
  return 'critical'
}

const statusStyles = {
  optimal:  'text-gw-green  bg-gw-green/10  border-gw-green/30',
  warning:  'text-amber-400 bg-amber-400/10 border-amber-400/30',
  critical: 'text-red-400   bg-red-400/10   border-red-400/30',
}

const statusLabels = {
  optimal:  '● OPTIMAL',
  warning:  '● WARNING',
  critical: '● CRITICAL',
}

// Mock grid data — in production pulled from gw-grid-cache-staging
function getMockGridData(): GridEntry[] {
  return [
    { id: 'AB', province: 'Alberta',        source: 'AESO',     intensity: 490 + Math.random() * 40,  status: 'critical' },
    { id: 'ON', province: 'Ontario',        source: 'IESO',     intensity: 38  + Math.random() * 15,  status: 'optimal'  },
    { id: 'BC', province: 'British Columbia', source: 'BC Hydro', intensity: 12  + Math.random() * 8,   status: 'optimal'  },
    { id: 'QC', province: 'Québec',         source: 'Hydro-QC', intensity: 2   + Math.random() * 3,   status: 'optimal'  },
  ].map(g => ({ ...g, status: getStatus(g.intensity) }))
}

export default function GridHealthTable({ loading }: { loading: boolean }) {
  const [grids, setGrids] = useState<GridEntry[]>(getMockGridData())

useEffect(() => {
  const load = async () => {
    const data = await getLiveGridData()
    const mapped = data.map(g => ({
      id: g.GridID,
      province: { AB: 'Alberta', ON: 'Ontario', BC: 'British Columbia', QC: 'Québec' }[g.GridID] ?? g.GridID,
      source: { AB: 'AESO', ON: 'IESO', BC: 'BC Hydro', QC: 'Hydro-QC' }[g.GridID] ?? 'Grid',
      intensity: g.CarbonIntensity,
      status: getStatus(g.CarbonIntensity),
    }))
    setGrids(mapped)
  }
  load()
  const interval = setInterval(load, 30000)
  return () => clearInterval(interval)
}, [])

  return (
    <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-gw-green" />
        Provincial Grid Health
        <span className="ml-auto text-xs text-gw-muted font-normal">Live · gCO₂/kWh</span>
      </h2>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-10 bg-gw-border rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {grids.map(g => (
            <div key={g.id} className="flex items-center gap-3 p-3 bg-gw-dark rounded-lg">
              <span className="text-white font-mono font-bold w-8">{g.id}</span>
              <span className="text-gw-muted text-xs flex-1">{g.province}</span>
              <span className="text-gw-muted text-xs w-16">{g.source}</span>
              <span className="font-mono text-white text-sm w-16 text-right">
                {g.intensity.toFixed(0)}
              </span>
              <span className={`text-xs border px-2 py-0.5 rounded font-mono w-24 text-center ${statusStyles[g.status]}`}>
                {statusLabels[g.status]}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gw-muted mt-3">
        Optimal: &lt;100 · Warning: 100–300 · Critical: &gt;300 gCO₂/kWh
      </p>
    </div>
  )
}
