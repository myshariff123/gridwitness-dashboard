'use client'
// components/CarbonTrendSparkline.tsx — Last-N-hours carbon trend
// Pure frontend. Reads the existing /api/telemetry/live response.
// No backend changes required.

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { TrendingUp } from 'lucide-react'

interface TelemetryRecord {
  Timestamp: string
  gCO2e?: number
  Actual_Wattage?: number
}

interface Props {
  records: TelemetryRecord[]
  /** Bucket interval in minutes (default 60 = hourly) */
  bucketMinutes?: number
  /** How many buckets to show (default 24) */
  buckets?: number
}

function bucketize(records: TelemetryRecord[], bucketMin: number, count: number) {
  if (records.length === 0) return []
  // Sort ascending (oldest first)
  const sorted = [...records].sort((a, b) =>
    a.Timestamp.localeCompare(b.Timestamp))
  const newest = new Date(sorted[sorted.length - 1].Timestamp).getTime()
  const bucketMs = bucketMin * 60 * 1000
  const start = newest - (count - 1) * bucketMs
  const out: Array<{ ts: number; label: string; gco2e: number; watts: number; n: number }> = []
  for (let i = 0; i < count; i++) {
    const bStart = start + i * bucketMs
    const bEnd = bStart + bucketMs
    out.push({
      ts: bStart,
      label: new Date(bStart).toLocaleTimeString('en-CA',
        { hour12: false, hour: '2-digit', minute: '2-digit' }),
      gco2e: 0, watts: 0, n: 0,
    })
  }
  for (const r of sorted) {
    const t = new Date(r.Timestamp).getTime()
    if (t < start) continue
    const idx = Math.min(count - 1, Math.floor((t - start) / bucketMs))
    if (idx < 0) continue
    out[idx].gco2e += Number(r.gCO2e || 0)
    out[idx].watts += Number(r.Actual_Wattage || 0)
    out[idx].n += 1
  }
  return out
}

export default function CarbonTrendSparkline({
  records, bucketMinutes = 60, buckets = 24
}: Props) {
  const data = useMemo(
    () => bucketize(records, bucketMinutes, buckets),
    [records, bucketMinutes, buckets])

  const total = data.reduce((acc, d) => acc + d.gco2e, 0)
  const peak = data.reduce((acc, d) => Math.max(acc, d.gco2e), 0)
  const avg = total / Math.max(data.filter(d => d.n > 0).length, 1)

  return (
    <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gw-green" />
          Carbon Trend ({buckets} × {bucketMinutes}min)
        </h2>
        <div className="flex gap-4 text-xs text-gw-muted">
          <span>Total: <span className="text-white font-mono">{(total/1000).toFixed(4)} kg</span></span>
          <span>Peak/bucket: <span className="text-white font-mono">{peak.toFixed(2)} g</span></span>
          <span>Avg/bucket: <span className="text-white font-mono">{avg.toFixed(2)} g</span></span>
        </div>
      </div>

      {data.length === 0 || total === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-gw-muted">
          No data in this period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              stroke="#8b949e"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#8b949e"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => v.toFixed(0)}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: '#161b22',
                border: '1px solid #21263a',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#8b949e' }}
              itemStyle={{ color: '#21de9a' }}
              formatter={(v: number) => [`${v.toFixed(3)} g`, 'CO\u2082e']}
            />
            <ReferenceLine y={avg} stroke="#8b949e" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="gco2e"
              stroke="#21de9a"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#21de9a' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
