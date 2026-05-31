'use client'
// components/settings/ApiKeysSection.tsx — F7 Tenant API key management

import { useEffect, useState, useCallback } from 'react'
import { Key, Plus, Copy, Trash2, AlertCircle } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
                 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

interface ApiKey {
  key_id: string
  label: string
  created_at: number
  last_used: number
  revoked_at: number
  active: boolean
}

export default function ApiKeysSection({ tenantId }: { tenantId: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/keys`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setKeys(Array.isArray(data) ? data : [])
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed')
    } finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!newLabel.trim()) return
    setCreating(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      setNewKeyPlaintext(data.plaintext_key)
      setNewLabel('')
      setShowCreate(false)
      load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'create failed')
    } finally { setCreating(false) }
  }

  async function revoke(keyId: string) {
    if (!confirm(`Revoke key ${keyId}? Any system using it will stop working immediately.`)) return
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/keys/${keyId}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'revoke failed')
    }
  }

  function copy(text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text)
    }
  }

  const fmt = (epoch: number) => {
    if (!epoch) return '—'
    return new Date(epoch * 1000).toLocaleString('en-CA', { hour12: false })
  }

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-gw-green" />
            API Keys
          </h2>
          <p className="text-sm text-gw-muted mt-1">
            Programmatic access to telemetry ingest and reporting endpoints.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(s => !s)}
          className="flex items-center gap-2 bg-gw-green text-gw-dark px-4 py-2 rounded text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New Key
        </button>
      </div>

      {showCreate && (
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4 mb-4">
          <label className="block text-xs uppercase tracking-wider text-gw-muted mb-2">
            Key Label (e.g., "production-ingest", "ci-pipeline")
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="production-ingest"
              maxLength={64}
              className="flex-1 bg-gw-panel border border-gw-border rounded px-3 py-2 text-sm focus:border-gw-green focus:outline-none"
            />
            <button
              onClick={create}
              disabled={creating || !newLabel.trim()}
              className="bg-gw-green text-gw-dark px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Generate'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewLabel('') }}
              className="border border-gw-border text-gw-muted px-3 py-2 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {newKeyPlaintext && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-400">Save this key now</div>
              <div className="text-xs text-gw-muted">
                This is the only time the plaintext key will be shown. Store it in your secrets manager.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 bg-gw-dark border border-gw-border rounded px-3 py-2 text-xs font-mono break-all">
              {newKeyPlaintext}
            </code>
            <button
              onClick={() => copy(newKeyPlaintext)}
              className="flex items-center gap-1 border border-gw-border hover:border-gw-green hover:text-gw-green text-gw-muted px-3 py-2 rounded text-xs"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
            <button
              onClick={() => setNewKeyPlaintext(null)}
              className="border border-gw-border text-gw-muted px-3 py-2 rounded text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {err && <div className="text-sm text-red-400 mb-3">{err}</div>}

      {loading ? (
        <div className="text-sm text-gw-muted py-4">Loading…</div>
      ) : keys.length === 0 ? (
        <div className="text-sm text-gw-muted py-6 text-center">
          No keys yet. Click "New Key" to generate one.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gw-border">
            <tr className="text-gw-muted">
              <th className="text-left py-2 pr-4 text-xs font-medium">Label</th>
              <th className="text-left py-2 pr-4 text-xs font-medium">Key ID</th>
              <th className="text-left py-2 pr-4 text-xs font-medium">Created</th>
              <th className="text-left py-2 pr-4 text-xs font-medium">Last Used</th>
              <th className="text-left py-2 pr-4 text-xs font-medium">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gw-border/40">
            {keys.map(k => (
              <tr key={k.key_id} className={!k.active ? 'opacity-50' : ''}>
                <td className="py-2.5 pr-4 text-white">{k.label}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-gw-muted">{k.key_id}</td>
                <td className="py-2.5 pr-4 text-xs text-gw-muted">{fmt(k.created_at)}</td>
                <td className="py-2.5 pr-4 text-xs text-gw-muted">{fmt(k.last_used)}</td>
                <td className="py-2.5 pr-4">
                  {k.active ? (
                    <span className="text-xs px-2 py-0.5 bg-gw-green/10 text-gw-green border border-gw-green/30 rounded">ACTIVE</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded">REVOKED</span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {k.active && (
                    <button
                      onClick={() => revoke(k.key_id)}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-3 h-3" /> Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-xs text-gw-muted mt-4">
        Usage: <code className="bg-gw-dark px-1.5 py-0.5 rounded text-gw-green">Authorization: Bearer {'{api_key}'}</code> on any /api/* request
      </p>
    </section>
  )
}
