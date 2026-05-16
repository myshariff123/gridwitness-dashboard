'use client'
import { useState, useEffect } from 'react'
import Nav from '@/components/Nav'
import { getTelemetry, DEFAULT_GRID_THRESHOLDS, type GridThresholds } from '@/lib/api'
import {
  CheckCircle, Copy, ExternalLink, Cloud, Server,
  AlertTriangle, Activity, Trash2, RefreshCw, Bell, Link2, Settings2
} from 'lucide-react'

const TENANT_ID = 'GW-NIMBL-AEB47A92'
const API       = process.env.NEXT_PUBLIC_API_URL

const DEMO_TENANT = {
  tenant_id:         TENANT_ID,
  organization_name: 'NimbleStride',
  status:            'ACTIVE',
  admin_email:       'support@nimblestride.ca',
  subscription_tier: 'TIER_1_AUDIT',
}

type ScriptTab = 'unix' | 'windows'

export default function SettingsPage() {
  // ── UI state ─────────────────────────────────────────────────────────────
  const [copied, setCopied]             = useState<string | null>(null)
  const [edgeTab, setEdgeTab]           = useState<ScriptTab>('unix')
  const [k8sTab, setK8sTab]             = useState<ScriptTab>('unix')
  const [saved, setSaved]               = useState(false)

  // ── Discovered nodes ──────────────────────────────────────────────────────
  const [nodes, setNodes]               = useState<Array<{id: string; grid: string; wattage: number; active: boolean}>>([])
  const [nodesLoading, setNodesLoading] = useState(true)

  // ── Per-grid thresholds ───────────────────────────────────────────────────
  const [thresholds, setThresholds]     = useState<GridThresholds[]>(DEFAULT_GRID_THRESHOLDS)

  // ── Notification email ────────────────────────────────────────────────────
  const [alertEmail, setAlertEmail]     = useState('support@nimblestride.ca')
  const [disconnectMins, setDisconnectMins] = useState(15)

  const tenantId    = DEMO_TENANT.tenant_id
  const isConnected = DEMO_TENANT.status === 'ACTIVE'

  // Load discovered nodes from real telemetry API
  useEffect(() => {
    const load = async () => {
      setNodesLoading(true)
      try {
        const records = await getTelemetry(tenantId)
        const map: Record<string, {id: string; grid: string; wattage: number; active: boolean}> = {}
        records.forEach(r => {
          if (!map[r.Source]) {
            map[r.Source] = { id: r.Source, grid: r.GridID, wattage: r.ActualWattage, active: true }
          }
        })
        setNodes(Object.values(map))
      } catch {
        setNodes([])
      } finally {
        setNodesLoading(false)
      }
    }
    load()
  }, [tenantId])

  const toggleNode = (id: string) =>
    setNodes(prev => prev.map(n => n.id === id ? { ...n, active: !n.active } : n))

  const updateThreshold = (gridId: string, field: keyof GridThresholds, value: number) =>
    setThresholds(prev => prev.map(t => t.gridId === gridId ? { ...t, [field]: value } : t))

  const saveSettings = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const cfnUrl = `https://ca-central-1.console.aws.amazon.com/cloudformation/home?region=ca-central-1#/stacks/create/review?templateURL=https://gw-cfn-templates-768949138583.s3.ca-central-1.amazonaws.com/gridwitness-scanner-role.yaml&param_TenantID=${tenantId}&stackName=GridWitness-Scanner-${tenantId}`

  // ── Install scripts ───────────────────────────────────────────────────────
  const edgeUnix = `#!/bin/bash
# GridWitness Edge Agent — Linux / macOS
# Tenant: ${tenantId}
curl -sSL https://agent.gridwitness.ca/install.sh | \\
  TENANT_ID="${tenantId}" \\
  API_ENDPOINT="${API}" \\
  bash`

  const edgeWindows = `# GridWitness Edge Agent — Windows PowerShell
# Tenant: ${tenantId}
$env:TENANT_ID = "${tenantId}"
$env:API_ENDPOINT = "${API}"
Invoke-WebRequest -Uri "https://agent.gridwitness.ca/install.ps1" \`
  -OutFile "$env:TEMP\\gw-install.ps1"
& "$env:TEMP\\gw-install.ps1"`

  const k8sUnix = `#!/bin/bash
# GridWitness Kubernetes Job Controller — Linux / macOS
# Grants GridWitness permission to scale workloads during grid stress events.
# All actions are logged to your WORM ledger and included in compliance reports.
# Tenant: ${tenantId}

kubectl create serviceaccount gridwitness-controller -n default

kubectl create clusterrolebinding gridwitness-controller \\
  --clusterrole=edit \\
  --serviceaccount=default:gridwitness-controller

K8S_TOKEN=$(kubectl create token gridwitness-controller --duration=8760h)

curl -X POST ${API}/api/auth/register-k8s \\
  -H "Content-Type: application/json" \\
  -d "{\\\"tenant_id\\\":\\\"${tenantId}\\\",\\\"k8s_token\\\":\\\"$K8S_TOKEN\\\"}"

echo "K8s controller registered. GridWitness can now scale workloads during grid events."`

  const k8sWindows = `# GridWitness Kubernetes Job Controller — Windows PowerShell
# Grants GridWitness permission to scale workloads during grid stress events.
# All actions are logged to your WORM ledger and included in compliance reports.
# Tenant: ${tenantId}

kubectl create serviceaccount gridwitness-controller -n default

kubectl create clusterrolebinding gridwitness-controller \`
  --clusterrole=edit \`
  --serviceaccount=default:gridwitness-controller

$K8S_TOKEN = kubectl create token gridwitness-controller --duration=8760h

$body = '{"tenant_id":"${tenantId}","k8s_token":"' + $K8S_TOKEN + '"}'
Invoke-RestMethod \`
  -Uri "${API}/api/auth/register-k8s" \`
  -Method POST \`
  -ContentType "application/json" \`
  -Body $body

Write-Host "K8s controller registered. GridWitness can now scale workloads during grid events."`

  const activeNodes  = nodes.filter(n => n.active)
  const removedNodes = nodes.filter(n => !n.active)

  const gridLabels: Record<string, string> = {
    AB: 'Alberta (AESO)',
    ON: 'Ontario (IESO)',
    BC: 'British Columbia (BC Hydro)',
    QC: 'Québec (Hydro-QC)',
  }

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white">Integration Centre</h1>
          <p className="text-sm text-gw-muted mt-1">
            Manage your infrastructure connections, grid alert thresholds, and monitoring preferences
          </p>
        </div>

        {/* Account Details */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Account Details</h2>
            <span className={`text-xs border px-2 py-1 rounded font-mono ${
              isConnected
                ? 'border-gw-green/50 text-gw-green'
                : 'border-amber-500/50 text-amber-400'
            }`}>
              {DEMO_TENANT.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Tenant ID',    tenantId],
              ['Organization', DEMO_TENANT.organization_name],
              ['Admin Email',  DEMO_TENANT.admin_email],
              ['Tier',         DEMO_TENANT.subscription_tier],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-gw-muted text-xs mb-1">{label}</div>
                <div className="font-mono text-white text-xs">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Discovered Nodes */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-gw-green" />
              Discovered Nodes
            </h2>
            <div className="flex items-center gap-2">
              {activeNodes.length > 0 && (
                <span className="text-xs border border-gw-green/30 text-gw-green px-2 py-0.5 rounded">
                  {activeNodes.length} monitored
                </span>
              )}
              {removedNodes.length > 0 && (
                <span className="text-xs border border-gw-border text-gw-muted px-2 py-0.5 rounded">
                  {removedNodes.length} excluded
                </span>
              )}
            </div>
          </div>

          {nodesLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 bg-gw-border rounded-lg animate-pulse" />)}
            </div>
          ) : nodes.length === 0 ? (
            <div className="text-sm text-gw-muted py-4 text-center">
              No nodes discovered yet. Deploy the IAM stack below to start discovery.
            </div>
          ) : (
            <div className="space-y-2">
              {nodes.map(node => (
                <div key={node.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  node.active ? 'border-gw-green/20 bg-gw-dark' : 'border-gw-border bg-gw-dark opacity-50'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Cloud className={`w-4 h-4 flex-shrink-0 ${node.active ? 'text-blue-400' : 'text-gw-muted'}`} />
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-white truncate">{node.id}</div>
                      <div className="text-xs text-gw-muted mt-0.5">
                        Grid: {node.grid} · {node.wattage}W
                        {!node.active && <span className="ml-2 text-amber-400">Excluded from reports</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleNode(node.id)}
                    className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ml-3 ${
                      node.active
                        ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                        : 'border-gw-green/30 text-gw-green hover:bg-gw-green/10'
                    }`}
                  >
                    {node.active
                      ? <><Trash2 className="w-3 h-3" /> Remove</>
                      : <><RefreshCw className="w-3 h-3" /> Re-add</>
                    }
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gw-muted mt-3">
            Removed nodes are excluded from carbon calculations and compliance reports. Re-add at any time.
          </p>
        </div>

        {/* Step 1 — AWS IAM Scanner Role */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              isConnected
                ? 'bg-gw-green/20 border border-gw-green text-gw-green'
                : 'bg-gw-green/10 border border-gw-green/30 text-gw-green'
            }`}>
              {isConnected ? <CheckCircle className="w-4 h-4" /> : '1'}
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Cloud className="w-4 h-4 text-gw-green" />
                Deploy AWS IAM Scanner Role
                {isConnected && (
                  <span className="flex items-center gap-1 text-xs text-gw-green border border-gw-green/30 px-2 py-0.5 rounded ml-2">
                    <Link2 className="w-3 h-3" /> Connected
                  </span>
                )}
              </h2>
              <p className="text-sm text-gw-muted mt-1">
                {isConnected
                  ? 'Your AWS account is connected. GridWitness is discovering EC2 instances across all Canadian regions every 2 minutes.'
                  : 'One-click CloudFormation deployment. Creates a read-only role in your AWS account. GridWitness uses it to discover your EC2 instances across all regions.'
                }
              </p>

              {!isConnected && (
                <>
                  <div className="bg-gw-dark border border-gw-border rounded-lg p-3 mt-3 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <p className="text-xs text-gw-muted">
                      Read-only permissions only. GridWitness cannot modify, delete, or access your data.
                    </p>
                  </div>
                  <a
                    href={cfnUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-gw-green text-gw-dark font-semibold px-5 py-2.5 rounded-lg hover:bg-gw-green/90 transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Deploy IAM Stack in AWS Console
                  </a>
                  <p className="text-xs text-gw-muted mt-3">
                    After deployment, new instances appear in Discovered Nodes within 2 minutes.
                  </p>
                </>
              )}

              {isConnected && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="text-xs text-gw-muted">
                    Role: <span className="font-mono text-white">GridWitness-Scanner-{tenantId}</span>
                  </div>
                  <a
                    href={cfnUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gw-muted hover:text-gw-green transition-colors flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> View stack
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 2 — Edge Agent */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-gw-green/10 border border-gw-green/30 flex items-center justify-center text-gw-green text-sm font-bold flex-shrink-0">2</div>
            <div className="flex-1">
              <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-gw-green" />
                Install Physical Edge Agent <span className="text-gw-muted font-normal text-xs">(Optional)</span>
              </h2>
              <p className="text-sm text-gw-muted mb-3">
                For physical servers with BMC Redfish API. Reads actual wattage directly from hardware. Outbound-only — no inbound ports required.
              </p>
              <div className="flex gap-2 mb-3">
                {(['unix', 'windows'] as const).map(t => (
                  <button key={t} onClick={() => setEdgeTab(t)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      edgeTab === t
                        ? 'border-gw-green text-gw-green bg-gw-green/10'
                        : 'border-gw-border text-gw-muted hover:border-gw-green/50'
                    }`}>
                    {t === 'unix' ? '🐧 Linux / macOS' : '🪟 Windows'}
                  </button>
                ))}
              </div>
              <div className="bg-gw-dark border border-gw-border rounded-lg p-4 font-mono text-xs text-gw-green relative">
                <pre className="whitespace-pre-wrap overflow-x-auto">{edgeTab === 'unix' ? edgeUnix : edgeWindows}</pre>
                <button
                  onClick={() => copy(edgeTab === 'unix' ? edgeUnix : edgeWindows, 'edge')}
                  className="absolute top-3 right-3 p-1.5 rounded hover:bg-gw-border transition-colors"
                >
                  {copied === 'edge'
                    ? <CheckCircle className="w-4 h-4 text-gw-green" />
                    : <Copy className="w-4 h-4 text-gw-muted" />
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 — Kubernetes Job Controller */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-gw-green/10 border border-gw-green/30 flex items-center justify-center text-gw-green text-sm font-bold flex-shrink-0">3</div>
            <div className="flex-1">
              <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
                <Settings2 className="w-4 h-4 text-gw-green" />
                Kubernetes Job Controller <span className="text-gw-muted font-normal text-xs">(Optional)</span>
              </h2>
              <p className="text-sm text-gw-muted mb-2">
                Grants GridWitness permission to automatically scale down workloads during grid stress events.
                All actions — including inaction — are stamped into your WORM ledger and included in compliance reports.
              </p>
              <div className="bg-gw-dark border border-amber-500/20 rounded-lg p-3 mb-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gw-muted">
                  This grants <strong className="text-white">edit</strong> permissions on your cluster workloads.
                  GridWitness will only scale deployments during declared grid incidents and will always log every action.
                </p>
              </div>
              <div className="flex gap-2 mb-3">
                {(['unix', 'windows'] as const).map(t => (
                  <button key={t} onClick={() => setK8sTab(t)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      k8sTab === t
                        ? 'border-gw-green text-gw-green bg-gw-green/10'
                        : 'border-gw-border text-gw-muted hover:border-gw-green/50'
                    }`}>
                    {t === 'unix' ? '🐧 Linux / macOS' : '🪟 Windows'}
                  </button>
                ))}
              </div>
              <div className="bg-gw-dark border border-gw-border rounded-lg p-4 font-mono text-xs text-gw-green relative">
                <pre className="whitespace-pre-wrap overflow-x-auto">{k8sTab === 'unix' ? k8sUnix : k8sWindows}</pre>
                <button
                  onClick={() => copy(k8sTab === 'unix' ? k8sUnix : k8sWindows, 'k8s')}
                  className="absolute top-3 right-3 p-1.5 rounded hover:bg-gw-border transition-colors"
                >
                  {copied === 'k8s'
                    ? <CheckCircle className="w-4 h-4 text-gw-green" />
                    : <Copy className="w-4 h-4 text-gw-muted" />
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Grid-Specific Alert Thresholds */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-gw-green" />
            Grid Alert Thresholds
          </h2>
          <p className="text-sm text-gw-muted mb-5">
            Each grid has independent thresholds reflecting its unique energy profile.
            Incidents trigger when a value exceeds its threshold and auto-resolve when it returns below.
          </p>

          <div className="space-y-6">
            {thresholds.map(t => (
              <div key={t.gridId} className="bg-gw-dark rounded-xl p-4 border border-gw-border">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-white">{gridLabels[t.gridId] ?? t.gridId}</h3>
                  <span className="text-xs text-gw-muted font-mono">{t.gridId}</span>
                </div>
                <p className="text-xs text-gw-muted mb-4">{t.description}</p>

                <div className={`grid gap-4 ${t.gridId === 'AB' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {/* Carbon threshold */}
                  <div>
                    <label className="text-xs text-gw-muted block mb-1">
                      Carbon Alert (gCO₂/kWh)
                      {t.gridId === 'QC' && <span className="ml-1 text-amber-400">secondary</span>}
                    </label>
                    <input
                      type="number"
                      value={t.carbonAlert}
                      onChange={e => updateThreshold(t.gridId, 'carbonAlert', +e.target.value)}
                      className="w-full bg-gw-panel border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none"
                    />
                  </div>

                  {/* Load threshold */}
                  <div>
                    <label className="text-xs text-gw-muted block mb-1">
                      Load Alert (% capacity)
                      {t.gridId === 'QC' && <span className="ml-1 text-gw-green">primary</span>}
                    </label>
                    <input
                      type="number"
                      value={t.loadAlert}
                      onChange={e => updateThreshold(t.gridId, 'loadAlert', +e.target.value)}
                      className="w-full bg-gw-panel border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none"
                    />
                  </div>

                  {/* Price threshold — AESO only */}
                  {t.gridId === 'AB' && (
                    <div>
                      <label className="text-xs text-gw-muted block mb-1">
                        Price Alert ($/MWh) <span className="text-blue-400">AESO</span>
                      </label>
                      <input
                        type="number"
                        value={t.priceAlert}
                        onChange={e => updateThreshold(t.gridId, 'priceAlert', +e.target.value)}
                        className="w-full bg-gw-panel border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none"
                      />
                      <p className="text-xs text-gw-muted mt-1">Historical avg ~$60 · Spike = &gt;$150</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notification & Disconnect Settings */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Notification Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs text-gw-muted block mb-1">
                Alert Email Address
              </label>
              <input
                type="email"
                value={alertEmail}
                onChange={e => setAlertEmail(e.target.value)}
                placeholder="ops@yourcompany.com"
                className="w-full bg-gw-dark border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none"
              />
              <p className="text-xs text-gw-muted mt-1">
                Receives incident start, threshold breach, and resolution notifications.
              </p>
            </div>
            <div>
              <label className="text-xs text-gw-muted block mb-1">
                Node Disconnect Alert (minutes)
              </label>
              <input
                type="number"
                value={disconnectMins}
                onChange={e => setDisconnectMins(+e.target.value)}
                className="w-full bg-gw-dark border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none"
              />
              <p className="text-xs text-gw-muted mt-1">
                Alert if a monitored node stops reporting for this many minutes.
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-gw-dark border border-gw-border rounded-lg text-xs text-gw-muted">
            <strong className="text-white">Incident lifecycle:</strong> An incident opens when any threshold is breached.
            It auto-closes when the grid value returns below threshold — not on a timer.
            If no action is taken, the incident remains open and is flagged UNRESOLVED in your compliance report.
            All customer responses (manual acknowledgment, K8s scale-down, power reduction) are WORM-stamped with timestamp and actor.
          </div>

          <button
            onClick={saveSettings}
            className="mt-5 flex items-center gap-2 bg-gw-green/10 border border-gw-green/30 text-gw-green px-5 py-2.5 rounded-lg text-sm hover:bg-gw-green/20 transition-colors"
          >
            {saved
              ? <><CheckCircle className="w-4 h-4" /> Settings Saved</>
              : <>Save All Settings</>
            }
          </button>
        </div>

      </div>
    </div>
  )
}
