'use client'
import { Activity } from 'lucide-react'
import type { TelemetryRecord } from '@/lib/api'

interface Props {
  records: TelemetryRecord[]
  loading: boolean
}

const gridColors: Record<string, string> = {
  AB: 'text-red-400   bg-red-400/10',
  ON: 'text-gw-green  bg-gw-green/10',
  BC: 'text-gw-green  bg-gw-green/10',
  QC: 'text-gw-green  bg-gw-green/10',
}

const srcColors: Record<string, string> = {
  CLOUD_DISCOVERY: 'text-blue-400',
  EDGE_AGENT:      'text-amber-400',
  REDFISH_BMC:     'text-purple-400',
}

const srcLabels: Record<string, string> = {
  CLOUD_DISCOVERY: 'Cloud',
  EDGE_AGENT:      'Edge',
  REDFISH_BMC:     'BMC',
}

export default function DeviceStream({ records, loading }: Props) {
  const unique = records.reduce<TelemetryRecord[]>((acc, r) => {
    if (!acc.find(x => x.Source === r.Source)) acc.push(r)
    return acc
  }, [])

  return (
    <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-gw-green" />
        Active Device Stream
        {!loading && (
          <span className="ml-2 text-xs border border-gw-green/30 text-gw-green px-2 py-0.5 rounded">
            {unique.length} nodes
          </span>
        )}
        <span className="ml-auto text-xs text-gw-muted font-normal">Auto-refreshes every 30s</span>
      </h2>

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
            {loading ? (
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={j} className="py-2.5 pr-4">
                      <div className="h-3.5 bg-gw-border rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : unique.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gw-muted">
                  No active devices. Deploy the IAM stack to start collecting telemetry.
                </td>
              </tr>
            ) : (
              unique.map((r, i) => (
                <tr key={i} className="hover:bg-gw-dark/50 transition-colors">
                  <td className="py-2.5 pr-4 font-mono text-white">
                    {r.Source.length > 24 ? r.Source.slice(0, 24) + '…' : r.Source}
                  </td>
                  <td className={`py-2.5 pr-4 font-medium ${srcColors[r.DataSource] ?? 'text-gw-muted'}`}>
                    {srcLabels[r.DataSource] ?? r.DataSource}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-white">
                    {r.ActualWattage.toFixed(1)} W
                  </td>
                  <td className="py-2.5 pr-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono ${gridColors[r.GridID] ?? 'text-gw-muted'}`}>
                      {r.GridID}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-gw-muted">
                    {r.CarbonDebt_gCO2.toFixed(3)}
                  </td>
                  <td className="py-2.5 text-right text-gw-muted">
                    {new Date(r.Timestamp).toLocaleTimeString('en-CA', { hour12: false })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
