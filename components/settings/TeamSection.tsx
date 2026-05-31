'use client'
// components/settings/TeamSection.tsx — F8 Multi-user team management

import { useEffect, useState, useCallback } from 'react'
import { Users, UserPlus, UserX, AlertCircle, CheckCircle } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
                 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

interface TeamUser {
  username: string
  email: string
  role: 'admin' | 'auditor'
  status: string
  enabled: boolean
  created: string
  last_modified: string
}

export default function TeamSection({ tenantId }: { tenantId: string }) {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'auditor'>('auditor')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/users`)
      const data = await r.json()
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function invite() {
    if (!email.includes('@')) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      setMsg({ ok: true, text: `✓ Invite sent to ${email}` })
      setEmail(''); setShowInvite(false); load()
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'invite failed' })
    } finally { setBusy(false) }
  }

  async function disable(username: string) {
    if (!confirm(`Disable user ${username}? They will lose access immediately.`)) return
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      load()
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'disable failed' })
    }
  }

  const fmt = (iso: string) => iso ? new Date(iso).toLocaleString('en-CA', { hour12: false }) : '—'

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-gw-green" />
            Team
          </h2>
          <p className="text-sm text-gw-muted mt-1">
            Invite admins and auditors to your GridWitness tenant.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(s => !s)}
          className="flex items-center gap-2 bg-gw-green text-gw-dark px-4 py-2 rounded text-sm font-medium"
        >
          <UserPlus className="w-4 h-4" /> Invite User
        </button>
      </div>

      {showInvite && (
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="auditor@example.com"
                className="w-full bg-gw-panel border border-gw-border rounded px-3 py-2 text-sm focus:border-gw-green focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'admin' | 'auditor')}
                className="w-full bg-gw-panel border border-gw-border rounded px-3 py-2 text-sm focus:border-gw-green focus:outline-none"
              >
                <option value="auditor">Auditor (read-only)</option>
                <option value="admin">Admin (full access)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={invite}
              disabled={busy || !email.includes('@')}
              className="bg-gw-green text-gw-dark px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send Invite'}
            </button>
            <button
              onClick={() => { setShowInvite(false); setEmail('') }}
              className="border border-gw-border text-gw-muted px-3 py-2 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`mb-3 text-sm flex items-center gap-2 ${msg.ok ? 'text-gw-green' : 'text-red-400'}`}>
          {msg.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gw-muted py-4">Loading…</div>
      ) : users.length === 0 ? (
        <div className="text-sm text-gw-muted py-6 text-center">
          No team members yet. Click "Invite User" to add one.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gw-border">
            <tr className="text-gw-muted">
              <th className="text-left py-2 pr-4 text-xs font-medium">Email</th>
              <th className="text-left py-2 pr-4 text-xs font-medium">Role</th>
              <th className="text-left py-2 pr-4 text-xs font-medium">Status</th>
              <th className="text-left py-2 pr-4 text-xs font-medium">Created</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gw-border/40">
            {users.map(u => (
              <tr key={u.username} className={!u.enabled ? 'opacity-50' : ''}>
                <td className="py-2.5 pr-4 text-white">{u.email}</td>
                <td className="py-2.5 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    u.role === 'admin'
                      ? 'bg-gw-green/10 text-gw-green border-gw-green/30'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  }`}>
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-xs text-gw-muted">{u.status}</td>
                <td className="py-2.5 pr-4 text-xs text-gw-muted">{fmt(u.created)}</td>
                <td className="py-2.5 text-right">
                  {u.enabled && (
                    <button
                      onClick={() => disable(u.username)}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <UserX className="w-3 h-3" /> Disable
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
