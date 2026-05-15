interface Props {
  label:   string
  value:   string | number | null
  unit:    string
  loading: boolean
  color:   'green' | 'blue' | 'amber'
}

const colors = {
  green: 'text-gw-green  border-gw-green/30  bg-gw-green/5',
  blue:  'text-blue-400  border-blue-400/30  bg-blue-400/5',
  amber: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
}

export default function CarbonDebtWidget({ label, value, unit, loading, color }: Props) {
  return (
    <div className={`bg-gw-panel border rounded-xl p-5 ${colors[color]}`}>
      <div className="text-xs text-gw-muted mb-2 uppercase tracking-wider">{label}</div>
      {loading ? (
        <div className="h-8 w-28 bg-gw-border rounded animate-pulse mt-1" />
      ) : (
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold font-mono">
            {value ?? '—'}
          </span>
          {unit && <span className="text-xs text-gw-muted mb-1">{unit}</span>}
        </div>
      )}
    </div>
  )
}
