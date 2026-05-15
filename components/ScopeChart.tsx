'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { BarChart2 } from 'lucide-react'

interface Props {
  scope2: number  // kgCO2e
  scope3: number
  loading: boolean
}

const COLORS = ['#21de9a', '#3b82f6']

export default function ScopeChart({ scope2, scope3, loading }: Props) {
  const total = scope2 + scope3
  const data = [
    { name: 'Scope 2 — Physical Servers', value: +scope2.toFixed(6) },
    { name: 'Scope 3 — Cloud Compute',    value: +scope3.toFixed(6) },
  ]

  return (
    <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <BarChart2 className="w-4 h-4 text-gw-green" />
        Scope Distribution (24h)
        <span className="ml-auto text-xs text-gw-muted font-normal">kgCO₂e</span>
      </h2>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-gw-border animate-pulse" />
        </div>
      ) : total === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gw-muted">
          No telemetry data in the last 24 hours
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(6)} kg`, '']}
                contentStyle={{ background: '#161b22', border: '1px solid #21263a', borderRadius: 8 }}
                labelStyle={{ color: '#8b949e' }}
                itemStyle={{ color: '#e6edf3' }}
              />
              <Legend
                formatter={(value) => <span className="text-xs text-gw-muted">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="bg-gw-dark rounded-lg p-3">
              <div className="text-xs text-gw-muted mb-1">Scope 2</div>
              <div className="font-mono text-gw-green text-sm">{scope2.toFixed(6)} kg</div>
              <div className="text-xs text-gw-muted mt-1">Physical · On-premise</div>
            </div>
            <div className="bg-gw-dark rounded-lg p-3">
              <div className="text-xs text-gw-muted mb-1">Scope 3</div>
              <div className="font-mono text-blue-400 text-sm">{scope3.toFixed(6)} kg</div>
              <div className="text-xs text-gw-muted mt-1">Cloud · Category 11</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
