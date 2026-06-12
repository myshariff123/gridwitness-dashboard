'use client'
// app/settings/page.tsx — DARK THEME
// Matches /incidents and /compliance visually.
import WebhookSection  from '@/components/settings/WebhookSection'
import ApiKeysSection  from '@/components/settings/ApiKeysSection'
import TeamSection     from '@/components/settings/TeamSection'
import BrandingSection from '@/components/settings/BrandingSection'
import { useState, useEffect, useCallback, useRef } from 'react'
import Nav from '@/components/Nav'
import {
  Settings as SettingsIcon, Save, Cloud, Bell, Code,
  AlertCircle, ExternalLink, Copy, Loader, Shield
} from 'lucide-react'

const API_BASE   = process.env.NEXT_PUBLIC_API_URL ||
                   'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'
const INGEST_URL = 'https://cxdp3mup50.execute-api.ca-central-1.amazonaws.com/live/telemetry'

type Toast = { type: 'success' | 'error' | 'info'; text: string } | null
type ThresholdSet = { carbon: number; load: number; price: number }
type Thresholds   = Record<string, ThresholdSet>

export default function SettingsPage() {
  const [tenantId, setTenantId] = useState('GW-NIMBL-AEB47A92')
  const [toast, setToast]       = useState<Toast>(null)
  const [saving, setSaving]     = useState(false)
  const thresholdSaveRef = useRef<(() => Promise<{ ok: boolean; msg: string }>) | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URLSearchParams(window.location.search)
    setTenantId(url.get('tenant_id') ||
                window.localStorage.getItem('gw_tenant_id') ||
                'GW-NIMBL-AEB47A92')
  }, [])

  async function handleSaveAll() {
    setSaving(true); setToast(null)
    const results: Array<{ section: string; ok: boolean; msg: string }> = []
    if (thresholdSaveRef.current) {
      const r = await thresholdSaveRef.current()
      results.push({ section: 'Thresholds', ...r })
    }
    const failed = results.filter(r => !r.ok)
    if (failed.length === 0) {
      setToast({ type: 'success', text: '✓ All settings saved.' })
    } else {
      setToast({ type: 'error', text: `Save failed: ${failed.map(f => `${f.section} (${f.msg})`).join('; ')}` })
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-gw-green" />
              Settings
            </h1>
            <p className="text-sm text-gw-muted mt-1">
              Tenant: <code className="text-xs bg-gw-dark px-2 py-0.5 rounded border border-gw-border text-gw-muted">{tenantId}</code>
            </p>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              saving
                ? 'bg-gw-border text-gw-muted cursor-not-allowed'
                : 'bg-gw-green text-gw-dark hover:bg-gw-green/90'
            }`}
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save All Settings'}
          </button>
        </div>

        {toast && (
          <div className={`rounded-xl p-3 text-sm border ${
            toast.type === 'success' ? 'bg-gw-green/10 border-gw-green/30 text-gw-green' :
            toast.type === 'error'   ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                       'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}>
            {toast.text}
          </div>
        )}

        <TenantInfoSection tenantId={tenantId} />
        <ThresholdSection
          tenantId={tenantId}
          registerSave={fn => { thresholdSaveRef.current = fn }}
        />
        <AwsAutoDiscoverySection tenantId={tenantId} setToast={setToast} />
        <AgentScriptsSection tenantId={tenantId} />
        <WebhookSection  tenantId={tenantId} />
        <ApiKeysSection  tenantId={tenantId} />
        <TeamSection     tenantId={tenantId} />
        <BrandingSection tenantId={tenantId} />
        <NotificationsSection />
        <ApiReferenceSection tenantId={tenantId} />

      </div>
    </div>
  )
}

function TenantInfoSection({ tenantId }: { tenantId: string }) {
  const [tenant, setTenant] = useState<{
    TenantID: string; OrgName?: string; Status?: string; Tier?: string
  } | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTenant(d || { TenantID: tenantId }))
      .catch(() => setTenant({ TenantID: tenantId }))
  }, [tenantId])

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-gw-green" />
        Tenant Information
      </h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-gw-muted">Tenant ID</div>
          <div className="font-mono text-white mt-1">{tenant?.TenantID}</div>
        </div>
        <div>
          <div className="text-xs text-gw-muted">Organization</div>
          <div className="text-white mt-1">{tenant?.OrgName || '(not set)'}</div>
        </div>
        <div>
          <div className="text-xs text-gw-muted">Status</div>
          <div className="text-white mt-1">{tenant?.Status || 'ACTIVE'}</div>
        </div>
        <div>
          <div className="text-xs text-gw-muted">Tier</div>
          <div className="text-white mt-1">{tenant?.Tier || 'TIER_1_AUDIT'}</div>
        </div>
      </div>
    </section>
  )
}

function ThresholdSection({
  tenantId, registerSave
}: {
  tenantId: string
  registerSave: (fn: () => Promise<{ ok: boolean; msg: string }>) => void
}) {
  const [thresholds, setThresholds] = useState<Thresholds | null>(null)
  const [original, setOriginal]     = useState<Thresholds | null>(null)
  const [loading, setLoading]       = useState(true)
  const [usingDefaults, setUsingDef] = useState(false)
  const [updatedAt, setUpdatedAt]   = useState<string | null>(null)
  const [err, setErr]               = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/thresholds`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setThresholds(d.grid_thresholds)
      setOriginal(JSON.parse(JSON.stringify(d.grid_thresholds)))
      setUsingDef(Boolean(d.using_defaults))
      setUpdatedAt(d.updated_at || null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'unknown')
    } finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    registerSave(async () => {
      if (!thresholds) return { ok: false, msg: 'No thresholds loaded' }
      try {
        const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/thresholds`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid_thresholds: thresholds }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        setUpdatedAt(d.updated_at)
        setOriginal(JSON.parse(JSON.stringify(thresholds)))
        setUsingDef(false)
        return { ok: true, msg: 'Saved' }
      } catch (e: unknown) {
        return { ok: false, msg: e instanceof Error ? e.message : 'unknown' }
      }
    })
  }, [thresholds, tenantId, registerSave])

  function change(grid: string, metric: keyof ThresholdSet, value: string) {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) return
    setThresholds(prev => prev ? { ...prev, [grid]: { ...prev[grid], [metric]: num } } : prev)
  }

  const dirty = thresholds && original &&
    JSON.stringify(thresholds) !== JSON.stringify(original)
  const grids = ['AB'] as const
  const metrics: Array<[keyof ThresholdSet, string, string]> = [
    ['carbon', 'Carbon', 'gCO2/kWh'],
    ['load',   'Load',   '% capacity'],
    ['price',  'Price',  '$/MWh'],
  ]

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-gw-green" />
            Grid Alert Thresholds
          </h2>
          <p className="text-sm text-gw-muted mt-1">
            Breach any threshold to auto-open a WORM-sealed incident.
          </p>
        </div>
        <span className="text-xs text-gw-muted">
          {usingDefaults
            ? 'Using regulatory defaults'
            : updatedAt
            ? `Saved: ${new Date(updatedAt).toLocaleString('en-CA', { hour12: false })}`
            : ''}
        </span>
      </div>
      {loading ? (
        <div className="text-sm text-gw-muted py-4">Loading…</div>
      ) : err || !thresholds ? (
        <div className="text-sm text-red-400 py-4">{err || 'Unable to load thresholds'}</div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="border-b border-gw-border">
              <tr>
                <th className="py-2 text-left text-gw-muted text-xs font-medium">Grid</th>
                {metrics.map(([k, label, unit]) => (
                  <th key={k} className="py-2 text-left text-gw-muted text-xs font-medium">
                    {label} <span className="text-gw-muted/70 font-normal">({unit})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gw-border/50">
              {grids.map(g => (
                <tr key={g}>
                  <td className="py-3 font-mono text-white">{g}</td>
                  {metrics.map(([m]) => (
                    <td key={m} className="py-3 pr-4">
                      <input
                        type="number" step="0.1" min={0}
                        className="bg-gw-dark border border-gw-border rounded px-2 py-1 w-28 text-white text-sm focus:border-gw-green focus:outline-none"
                        value={thresholds[g]?.[m] ?? ''}
                        onChange={e => change(g, m, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {dirty && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-sm">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400">Unsaved changes.</span>
              <span className="text-gw-muted ml-auto text-xs">Click "Save All Settings" at the top.</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function AwsAutoDiscoverySection({
  tenantId, setToast
}: {
  tenantId: string
  setToast: (t: Toast) => void
}) {
  const [integration, setIntegration] = useState<{
    status?: string
    role_arn?: string
    connected_at?: string
    cloudformation_url?: string
  } | null>(null)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [roleArn, setRoleArn] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`)
      if (r.status === 404 || r.status === 403) { setAvailable(false); return }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setIntegration(await r.json())
    } catch { setAvailable(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!roleArn.trim()) return
    setBusy(true)
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_arn: roleArn.trim() }),
    })
    setBusy(false)
    const data = await r.json().catch(() => ({}))
    if (r.ok) {
      setToast({ type: 'success', text: '✓ AWS integration verified — monitoring active' })
      setShowSubmit(false); setRoleArn(''); load()
    } else {
      setToast({ type: 'error', text: data.error || data.details || 'Verification failed' })
    }
  }

  async function revoke() {
    if (!confirm('Revoke AWS integration? This stops auto-discovery.')) return
    setBusy(true)
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`, { method: 'DELETE' })
    setBusy(false)
    if (r.ok) { setToast({ type: 'success', text: '✓ Integration revoked' }); load() }
  }

  if (!available) return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-3">
        <Cloud className="w-4 h-4 text-gw-green" />
        AWS Auto-Discovery Integration
      </h2>
      <div className="bg-gw-green/10 border border-gw-green/30 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-gw-green animate-pulse" />
          <span className="font-semibold text-gw-green">AUTO-DISCOVERY ACTIVE</span>
        </div>
        <p className="text-sm text-gw-muted">
          GridWitness is actively discovering and monitoring your AWS EC2 instances via cross-account IAM role.
          Telemetry is being collected and sealed to the WORM ledger every 5 minutes.
        </p>
        <p className="text-xs text-gw-muted mt-2">
          To update your IAM role ARN or connect additional accounts, contact your GridWitness administrator.
        </p>
      </div>
    </section>
  )

  const isActive = integration?.status === 'ACTIVE'

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <Cloud className="w-4 h-4 text-gw-green" />
        AWS Auto-Discovery Integration
      </h2>
      <p className="text-sm text-gw-muted mb-4">
        Securely grant GridWitness read-only access to discover and monitor servers in your AWS account.
      </p>

      {isActive ? (
        <div className="bg-gw-green/10 border border-gw-green/30 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-gw-green gw-pulse" />
                <span className="font-semibold text-gw-green">MONITORING ACTIVE</span>
              </div>
              <div className="text-xs text-gw-muted">Connected via IAM Role:</div>
              <div className="text-xs text-white font-mono mt-1 break-all">{integration?.role_arn}</div>
              {integration?.connected_at && (
                <div className="text-xs text-gw-muted mt-2">
                  Connected: {new Date(integration.connected_at).toLocaleString('en-CA', { hour12: false })}
                </div>
              )}
            </div>
            <button
              onClick={revoke}
              disabled={busy}
              className="text-xs border border-red-500/30 text-red-400 px-3 py-1.5 rounded hover:bg-red-500/10 disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-gw-muted" />
            <span className="font-semibold text-gw-muted">Not Connected</span>
          </div>
          <ol className="text-sm text-gw-muted space-y-1.5 mb-4 list-decimal pl-5">
            <li>Click <strong className="text-white">Launch CloudFormation</strong> to open AWS Console</li>
            <li>Create the stack — a read-only IAM role is provisioned with external-id <code className="text-xs bg-gw-panel px-1 rounded text-gw-green">gridwitness-{tenantId}</code></li>
            <li>Copy the <strong className="text-white">RoleArn</strong> output from the completed stack</li>
            <li>Paste it below and click <strong className="text-white">Verify & Connect</strong></li>
          </ol>
          <div className="flex flex-wrap gap-2 mb-3">
            {integration?.cloudformation_url && (
              <a
                href={integration.cloudformation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded text-sm font-medium"
              >
                <Cloud className="w-4 h-4" />
                Launch CloudFormation Stack
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={() => setShowSubmit(s => !s)}
              className="border border-gw-border hover:border-gw-green hover:text-gw-green text-gw-muted px-4 py-2 rounded text-sm"
            >
              I have my Role ARN →
            </button>
          </div>
          {showSubmit && (
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={roleArn}
                onChange={e => setRoleArn(e.target.value)}
                placeholder="arn:aws:iam::123456789012:role/GridWitnessReadOnly"
                className="flex-1 bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm font-mono text-white focus:border-gw-green focus:outline-none"
              />
              <button
                onClick={submit}
                disabled={busy || !roleArn.trim()}
                className="bg-gw-green text-gw-dark px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Verify & Connect'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function AgentScriptsSection({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<'ps' | 'bash' | 'docker' | 'k8s'>('ps')
  const [copied, setCopied] = useState(false)

  const psScript = `# GridWitness Agent — Windows PowerShell
$JobName = "GridWitnessAgent_${tenantId}"
Get-Job -Name $JobName -ErrorAction SilentlyContinue | Stop-Job -PassThru | Remove-Job
Start-Job -Name $JobName -ScriptBlock {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $TenantID = "${tenantId}"
    $ApiUrl = "${INGEST_URL}"
    while ($true) {
        try {
            $Cpu = Get-CimInstance Win32_Processor
            $Load = ($Cpu | Measure-Object -Property LoadPercentage -Average).Average
            $RealWattage = [math]::Round(35 + ($Load * 1.2))
            $Payload = @{
                TenantID = $TenantID; Source = $env:COMPUTERNAME
                Actual_Wattage = $RealWattage; InfraType = "Private_DC"; GridID = "AB"
            } | ConvertTo-Json -Compress
            Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $Payload -ContentType "application/json"
        } catch {}
        Start-Sleep -Seconds 300
    }
} | Out-Null
Write-Host "GridWitness Agent attached for ${tenantId}." -ForegroundColor Green`

  const bashScript = `#!/bin/bash
# GridWitness Agent — Linux/Unix
TENANT_ID="${tenantId}"
API_URL="${INGEST_URL}"
while true; do
    LOAD=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}')
    WATT=$(echo "35 + ($LOAD * 1.2)" | bc | awk '{print int($1+0.5)}')
    PAYLOAD="{\\"TenantID\\":\\"$TENANT_ID\\",\\"Source\\":\\"$(hostname)\\",\\"Actual_Wattage\\":$WATT,\\"InfraType\\":\\"Private_DC\\",\\"GridID\\":\\"AB\\"}"
    curl -s -X POST $API_URL -H "Content-Type: application/json" -d "$PAYLOAD" > /dev/null 2>&1
    sleep 300
done &
echo "GridWitness Agent attached for ${tenantId}."`

  const dockerScript = `docker run -d --name gridwitness-agent --restart unless-stopped \\
  -e GW_TENANT_ID=${tenantId} \\
  -e GW_API_URL=${INGEST_URL} \\
  alpine:3.19 sh -c 'apk add --no-cache curl bc; while true; do curl -s -X POST $GW_API_URL -H "Content-Type: application/json" -d "{\\"TenantID\\":\\"$GW_TENANT_ID\\",\\"Source\\":\\"$(hostname)\\",\\"Actual_Wattage\\":50,\\"InfraType\\":\\"Container\\",\\"GridID\\":\\"AB\\"}"; sleep 300; done'`

  const k8sScript = `# Save as gridwitness-agent.yaml and apply with: kubectl apply -f gridwitness-agent.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: gridwitness-agent
  namespace: gridwitness
spec:
  selector: { matchLabels: { app: gridwitness-agent } }
  template:
    metadata: { labels: { app: gridwitness-agent } }
    spec:
      containers:
        - name: agent
          image: alpine:3.19
          env:
            - { name: GW_TENANT_ID, value: "${tenantId}" }
            - { name: GW_API_URL,   value: "${INGEST_URL}" }`

  const current = tab === 'ps' ? psScript :
                  tab === 'bash' ? bashScript :
                  tab === 'docker' ? dockerScript : k8sScript

  function copyScript() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(current)
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    }
  }

  const tabs: Array<[typeof tab, string]> = [
    ['ps', 'Windows (PowerShell)'],
    ['bash', 'Linux (Bash)'],
    ['docker', 'Docker'],
    ['k8s', 'Kubernetes'],
  ]

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <Code className="w-4 h-4 text-gw-green" />
        Manual Agent Scripts (Alternative)
      </h2>
      <p className="text-sm text-gw-muted mb-4">
        Pre-configured for <code className="text-xs bg-gw-dark px-1.5 py-0.5 rounded border border-gw-border text-gw-green">{tenantId}</code> · 5-min polling.
      </p>
      <div className="flex gap-1 mb-3 border-b border-gw-border overflow-x-auto">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t
                ? 'border-gw-green text-gw-green'
                : 'border-transparent text-gw-muted hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre className="bg-gw-dark border border-gw-border text-gw-muted text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed max-h-96">
          {current}
        </pre>
        <button
          onClick={copyScript}
          className="absolute top-2 right-2 flex items-center gap-1 px-3 py-1 bg-gw-panel border border-gw-border hover:border-gw-green hover:text-gw-green text-gw-muted text-xs rounded"
        >
          <Copy className="w-3 h-3" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  )
}

function NotificationsSection() {
  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-gw-green" />
        Notification Preferences
      </h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-center p-3 bg-gw-dark border border-gw-border rounded">
          <div>
            <div className="text-white">Grid Stress Incident Alerts (SNS)</div>
            <div className="text-xs text-gw-muted mt-0.5">Email when carbon/load/price thresholds are breached</div>
          </div>
          <span className="text-xs px-2 py-1 bg-gw-green/10 text-gw-green border border-gw-green/30 rounded">
            CONFIRMED
          </span>
        </div>
      </div>
    </section>
  )
}

function ApiReferenceSection({ tenantId }: { tenantId: string }) {
  const endpoints = [
    { method: 'GET',  path: `/api/tenants/${tenantId}/thresholds`, desc: 'Read thresholds' },
    { method: 'PUT',  path: `/api/tenants/${tenantId}/thresholds`, desc: 'Update thresholds' },
    { method: 'GET',  path: `/api/tenants/${tenantId}/aws`, desc: 'AWS integration status' },
    { method: 'POST', path: `/api/tenants/${tenantId}/aws`, desc: 'Connect AWS account' },
    { method: 'GET',  path: `/api/incidents?tenant_id=${tenantId}`, desc: 'List incidents' },
    { method: 'POST', path: '/api/reports/generate', desc: 'Generate report' },
    { method: 'GET',  path: '/api/grid-status', desc: 'Live grid intensity' },
    { method: 'GET',  path: '/api/telemetry/live', desc: 'Live telemetry' },
    { method: 'GET',  path: '/api/verify/{merkle_root}', desc: 'Public verification' },
  ]
  const methodColor: Record<string, string> = {
    GET: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    POST: 'bg-gw-green/10 text-gw-green border-gw-green/30',
    PUT: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    DELETE: 'bg-red-500/10 text-red-400 border-red-500/30',
  }
  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <Code className="w-4 h-4 text-gw-green" />
        API Reference
      </h2>
      <p className="text-sm text-gw-muted mb-4">
        Base URL: <code className="text-xs bg-gw-dark border border-gw-border px-2 py-0.5 rounded text-gw-green">{API_BASE}</code>
      </p>
      <div className="space-y-1 text-sm font-mono">
        {endpoints.map((ep, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-gw-border/40 last:border-b-0">
            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${methodColor[ep.method]}`}>
              {ep.method}
            </span>
            <span className="text-gw-muted flex-1 break-all">{ep.path}</span>
            <span className="text-xs text-gw-muted/70 font-sans hidden md:inline">{ep.desc}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
