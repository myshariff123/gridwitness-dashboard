'use client'
import { useState } from 'react'
import { recordIncidentAction, closeIncident } from '@/lib/api'
import { Check, Cpu, Zap, X, Loader } from 'lucide-react'

type Action = 'Acknowledge' | 'K8s_Scale_Down' | 'Manual_Power_Reduction'

interface Props {
  tenantId:         string
  incidentId:       string
  onActionRecorded: () => void
}

export default function IncidentActions({ tenantId, incidentId, onActionRecorded }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const [error,   setError]   = useState<string>('')

  const handle = async (action: Action) => {
    setPending(action)
    setError('')
    try {
      await recordIncidentAction(tenantId, incidentId, action, 'support@nimblestride.ca')
      onActionRecorded()
    } catch (e: any) {
      setError(e?.message || 'Action failed')
    } finally {
      setPending(null)
    }
  }

  const handleClose = async () => {
    setPending('close')
    setError('')
    try {
      await closeIncident(tenantId, incidentId, 'support@nimblestride.ca', 'manual_close_via_dashboard')
      onActionRecorded()
    } catch (e: any) {
      setError(e?.message || 'Close failed')
    } finally {
      setPending(null)
    }
  }

  const btn = (action: Action, label: string, icon: React.ReactNode) => (
    <button
      key={action}
      disabled={!!pending}
      onClick={() => handle(action)}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gw-border text-gw-muted hover:border-gw-green hover:text-gw-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending === action ? <Loader className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="text-xs text-gw-muted">Take action — all stamped to WORM ledger:</div>
      <div className="flex flex-wrap gap-2">
        {btn('Acknowledge',           'Acknowledge',              <Check className="w-3.5 h-3.5" />)}
        {btn('K8s_Scale_Down',        'K8s Scale Down',            <Cpu className="w-3.5 h-3.5" />)}
        {btn('Manual_Power_Reduction','Manual Power Reduction',    <Zap className="w-3.5 h-3.5" />)}
        <button
          disabled={!!pending}
          onClick={handleClose}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-colors disabled:opacity-50"
        >
          {pending === 'close' ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Force Close
        </button>
      </div>
      {error && (
        <div className="text-xs text-red-400">{error}</div>
      )}
    </div>
  )
}
