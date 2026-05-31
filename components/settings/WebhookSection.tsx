'use client'
// components/settings/WebhookSection.tsx — F4 Slack/Teams webhook config

import { useEffect, useState } from 'react'
import { Bell, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
                 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

export default function WebhookSection({ tenantId }: { tenantId: string }) {
  const [url, setUrl] = useState('')
  const [original, setOriginal] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const u = d?.WebhookURL || ''
        setUrl(u); setOriginal(u)
      })
      .catch(() => {})
  }, [tenantId])

  const isValid = !url || url.startsWith('https://hooks.slack.com/') ||
                          url.includes('.webhook.office.com')
  const dirty = url !== original

  async function save() {
    if (!isValid) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ WebhookURL: url }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setOriginal(url)
      setMsg({ ok: true, text: '✓ Webhook URL saved' })
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'save failed' })
    } finally { setBusy(false) }
  }

  async function test() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/webhook/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setMsg({ ok: true, text: '✓ Test message sent — check your Slack/Teams channel' })
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'test failed' })
    } finally { setBusy(false) }
  }

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <Bell className="w-4 h-4 text-gw-green" />
        Slack / Teams Notifications
      </h2>
      <p className="text-sm text-gw-muted mb-4">
        Paste an incoming webhook URL from Slack or Teams. Incidents will be forwarded here in real time.
      </p>

      <label className="block text-xs uppercase tracking-wider text-gw-muted mb-2">
        Incoming Webhook URL
      </label>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value.trim())}
          placeholder="https://hooks.slack.com/services/... or https://yourorg.webhook.office.com/..."
          className={`flex-1 bg-gw-dark border rounded px-3 py-2 text-sm font-mono focus:outline-none ${
            !isValid && url ? 'border-red-500 focus:border-red-500' : 'border-gw-border focus:border-gw-green'
          }`}
        />
        <button
          onClick={save}
          disabled={busy || !dirty || !isValid}
          className="bg-gw-green text-gw-dark px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={test}
          disabled={busy || !original}
          className="border border-gw-border hover:border-gw-green hover:text-gw-green text-gw-muted px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          Send Test
        </button>
      </div>

      {!isValid && url && (
        <div className="text-xs text-red-400 mb-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Must start with <code>https://hooks.slack.com/</code> or contain <code>.webhook.office.com</code>
        </div>
      )}

      <div className="text-xs text-gw-muted mb-3 flex flex-wrap gap-x-4 gap-y-1">
        <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1 hover:text-gw-green">
          Get Slack webhook URL <ExternalLink className="w-3 h-3" />
        </a>
        <a href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
           target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1 hover:text-gw-green">
          Get Teams webhook URL <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {msg && (
        <div className={`mt-2 text-sm flex items-center gap-2 ${msg.ok ? 'text-gw-green' : 'text-red-400'}`}>
          {msg.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}
    </section>
  )
}
