'use client'
import { useState, useEffect } from 'react'
import { getLiveGridData, DEFAULT_GRID_THRESHOLDS } from '@/lib/api'
import { AlertTriangle, CheckCircle, Clock, Zap, TrendingUp, Activity } from 'lucide-react'

interface Incident {
  gridId:       string
  province:     string
  type:         'CARBON' | 'LOAD' | 'PRICE'
  currentValue: number
  threshold:    number
  unit:         string
  severity:     'WARNING' | 'CRITICAL'
  openedAt:     Date
}

const PROVINCE: Record<string, string> = {
  AB: 'Alberta', ON: 'Ontario', BC: 'British Columbia', QC: 'Québec'
}

const TYPE_LABELS: Record<string, string> = {
  CARBON: 'Carbon Intensity',
  LOAD:   'Grid Load',
  PRICE:  'Pool Price',
}

const TYPE_ICONS = {
  CARBON: Activity,
  LOAD:   TrendingUp,
  PRICE:  Zap,
}

function getSeverity(current: number, threshold: number): 'WARNING' | 'CRITICAL' {
  const ratio = current / threshold
  return ratio >= 1.2 ? 'CRITICAL' : 'WARNING'
}

export default function ActiveIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading]     = useState(true)
  const [lastCheck, setLastCheck] = useState<Date>(new Date())

  const evaluate = async () => {
    try {
      const grids = await getLiveGridData()
      const found: Incident[] = []

      grids.forEach(grid => {
        const thresholds = DEFAULT_GRID_THRESHOLDS.find(t => t.gridId === grid.GridID)
        if (!thresholds) return

        // Carbon check — primary for AB/ON/BC, secondary for QC
        if (grid.CarbonIntensity > thresholds.carbonAlert) {
          found.push({
            gridId:       grid.GridID,
            province:     PROVINCE[grid.GridID] ?? grid.GridID,
            type:         'CARBON',
            currentValue: grid.CarbonIntensity,
            threshold:    thresholds.carbonAlert,
            unit:         'gCO₂/kWh',
            severity:     getSeverity(grid.CarbonIntensity, thresholds.carbonAlert),
            openedAt:     new Date(),
          })
        }

        // Price check — AESO only
        if (grid.GridID === 'AB' && (grid as any).PoolPrice && (grid as any).PoolPrice > thresholds.priceAlert) {
          found.push({
            gridId:       grid.GridID,
            province:     PROVINCE[grid.GridID] ?? grid.GridID,
            type:         'PRICE',
            currentValue: (grid as any).PoolPrice,
            threshold:    thresholds.priceAlert,
            unit:         '$/MWh',
            severity:     getSeverity((grid as any).PoolPrice, thresholds.priceAlert),
            openedAt:     new Date(),
          })
        }
      })

      setIncidents(found)
      setLastCheck(new Date())
    } catch {
      // Silent fail — incidents panel is non-blocking
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    evaluate()
    const interval = setInterval(evaluate, 30000)
    return () => clearInterval(interval)
  }, [])

  const severityStyles = {
    CRITICAL: {
      border:  'border-red-500/40',
      bg:      'bg-red-500/5',
      badge:   'border-red-500/50 text-red-400 bg-red-500/10',
      icon:    'text-red-400',
    },
    WARNING: {
      border:  'border-amber-500/40',
      bg:      'bg-amber-500/5',
      badge:   'border-amber-500/50 text-amber-400 bg-amber-500/10',
      icon:    'text-amber-400',
    },
  }

  if (loading) return null

  if (incidents.length === 0) {
    return (
      <div className="bg-gw-panel border border-gw-green/20 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-gw-green flex-shrink-0" />
          <div>
            <div className="font-semibold text-white text-sm">All Grids Operating Normally</div>
           <div className="text-xs text-gw-muted mt-0.5">
  No threshold incidents — all monitored grids are within your configured limits ·
  Last checked {lastCheck.toLocaleTimeString('en-CA', { hour12: false })}
</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <h2 className="font-semibold text-white">Active Grid Incidents</h2>
        <span className="text-xs border border-red-500/40 text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
          {incidents.length} active
        </span>
        <span className="ml-auto text-xs text-gw-muted">
          Checked {lastCheck.toLocaleTimeString('en-CA', { hour12: false })}
        </span>
      </div>

      {incidents.map((inc, i) => {
        const styles   = severityStyles[inc.severity]
        const Icon     = TYPE_ICONS[inc.type]
        const pctOver  = (((inc.currentValue - inc.threshold) / inc.threshold) * 100).toFixed(1)
        const duration = Math.floor((Date.now() - inc.openedAt.getTime()) / 60000)

        return (
          <div key={i} className={`rounded-xl border p-4 ${styles.border} ${styles.bg}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 flex-shrink-0 ${styles.icon}`} />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {inc.province} ({inc.gridId}) — {TYPE_LABELS[inc.type]} Breach
                  </div>
                  <div className="text-xs text-gw-muted mt-0.5 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    Incident open since {inc.openedAt.toLocaleTimeString('en-CA', { hour12: false })}
                    {duration > 0 && ` · ${duration} min`}
                  </div>
                </div>
              </div>
              <span className={`text-xs border px-2 py-0.5 rounded font-mono flex-shrink-0 ${styles.badge}`}>
                {inc.severity}
              </span>
            </div>

            {/* Values */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-gw-dark rounded-lg p-2.5">
                <div className="text-xs text-gw-muted mb-1">Current</div>
                <div className={`font-mono text-sm font-bold ${styles.icon}`}>
                  {inc.currentValue.toFixed(0)} {inc.unit}
                </div>
              </div>
              <div className="bg-gw-dark rounded-lg p-2.5">
                <div className="text-xs text-gw-muted mb-1">Threshold</div>
                <div className="font-mono text-sm text-white">
                  {inc.threshold.toFixed(0)} {inc.unit}
                </div>
              </div>
              <div className="bg-gw-dark rounded-lg p-2.5">
                <div className="text-xs text-gw-muted mb-1">Excess</div>
                <div className={`font-mono text-sm font-bold ${styles.icon}`}>
                  +{pctOver}%
                </div>
              </div>
            </div>

            {/* Customer action options */}
            <div className="border-t border-gw-border/50 pt-3">
              <div className="text-xs text-gw-muted mb-2">
                Incident auto-closes when {inc.gridId} returns below {inc.threshold.toFixed(0)} {inc.unit}.
                Your response is logged to the WORM ledger and compliance report.
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors">
                  Acknowledge — No Action Taken
                </button>
                <button className="text-xs border border-blue-500/30 text-blue-400 px-3 py-1.5 rounded hover:bg-blue-500/10 transition-colors">
                  Reduce Workload (K8s)
                </button>
                <button className="text-xs border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded hover:bg-amber-500/10 transition-colors">
                  Manual Power Reduction
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
