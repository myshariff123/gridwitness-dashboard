'use client'
import { useState, useEffect } from 'react'
import Nav from '@/components/Nav'
import { getTelemetry } from '@/lib/api'
import { CheckCircle, Copy, ExternalLink, Cloud, Server, AlertTriangle, Activity, Trash2, RefreshCw } from 'lucide-react'

const TENANT_ID = 'GW-NIMBL-AEB47A92'

const DEMO_TENANT = {
  tenant_id:         TENANT_ID,
  organization_name: 'NimbleStride',
  status:            'ACTIVE',
  admin_email:       'support@nimblestride.ca',
  subscription_tier: 'TIER_1_AUDIT',
}

export default function SettingsPage() {
  const [copied, setCopied]               = useState<string | null>(null)
  const [carbonThreshold, setCarbonThreshold] = useState(400)
  const [disconnectAlert, setDisconnectAlert] = useState(15)
  const [saved, setSaved]                 = useState(false)
  const [nodes, setNodes]                 = useState<Array<{id: string; grid: string; wattage: number; active: boolean}>>([])
  const [nodesLoading, setNodesLoading]   = useState(true)

  const tenantId = DEMO_TENANT.tenant_id

  // Load discovered nodes from real telemetry
  useEffect(() => {
    const load = async () => {
      setNodesLoading(true)
      try {
        const records = await getTelemetry(tenantId)
        const nodeMap: Record<string, {id: string; grid: string; wattage: number; active: boolean}> = {}
        records.forEach(r => {
          if (!nodeMap[r.Source]) {
            nodeMap[r.Source] = {
              id:      r.Source,
              grid:    r.GridID,
              wattage: r.ActualWattage,
              active:  true,
            }
          }
        })
        setNodes(Object.values(nodeMap))
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

  const cfnUrl = `https://ca-central-1.console.aws.amazon.com/cloudformation/home?region=ca-central-1#/stacks/create/review?templateURL=https://gw-cfn-templates-768949138583.s3.ca-central-1.amazonaws.com/gridwitness-scanner-role.yaml&param_TenantID=${tenantId}&stackName=GridWitness-Scanner-${tenantId}`

  const edgeScript = `#!/bin/bash\n# GridWitness Edge Agent\n# Tenant: ${tenantId}\ncurl -sSL https://agent.gridwitness.ca/install.sh | \\\\\n  TENANT_ID="${tenantId}" \\\\\n  API_ENDPOINT="https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com" \\\\\n  bash`

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const saveThresholds = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const activeNodes  = nodes.filter(n => n.active)
  const removedNodes = nodes.filter(n => !n.active)

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white">Integration Centre</h1>
          <p className="text-sm text-gw-muted mt-1">
            Manage your infrastructure connections and monitoring preferences
          </p>
        </div>

        {/* Tenant Info */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Account Details</h2>
            <span className={`text-xs border px-2 py-1 rounded font-mono ${
              DEMO_TENANT.status === 'ACTIVE'
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
            <div className="flex items-center gap-3">
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
              {[1,2].map(i => <div key={i} className="h-12 bg-gw-border rounded-lg animate-pulse" />)}
            </div>
          ) : nodes.length === 0 ? (
            <div className="text-sm text-gw-muted py-4 text-center">
              No nodes discovered yet. Deploy the IAM stack below to start discovery.
            </div>
          ) : (
            <div className="space-y-2">
              {nodes.map(node => (
                <div key={node.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  node.active
                    ? 'border-gw-green/20 bg-gw-dark'
                    : 'border-gw-border bg-gw-dark opacity-50'
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
            Removed nodes are excluded from carbon calculations and compliance reports.
            Re-add at any time.
          </p>
        </div>

        {/* Step 1 — AWS Integration */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-gw-green/10 border border-gw-green/30 flex items-center justify-center text-gw-green text-sm font-bold flex-shrink-0">1</div>
            <div>
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Cloud className="w-4 h-4 text-gw-green" />
                Deploy AWS IAM Scanner Role
              </h2>
              <p className="text-sm text-gw-muted mt-1">
                One-click CloudFormation deployment. Creates a read-only role in your AWS account.
                GridWitness uses it to discover your EC2 instances across all regions.
              </p>
            </div>
          </div>
          <div className="bg-gw-dark border border-gw-border rounded-lg p-3 mb-4 flex items-center gap-2">
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
        </div>

        {/* Step 2 — Edge Agent */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-gw-green/10 border border-gw-green/30 flex items-center justify-center text-gw-green text-sm font-bold flex-shrink-0">2</div>
            <div>
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-gw-green" />
                Install Physical Edge Agent (Optional)
              </h2>
              <p className="text-sm text-gw-muted mt-1">
                For physical servers with BMC Redfish API. Reads actual wattage. Outbound-only.
              </p>
            </div>
          </div>
          <div className="bg-gw-dark border border-gw-border rounded-lg p-4 font-mono text-xs text-gw-green relative">
            <pre className="whitespace-pre-wrap">{edgeScript}</pre>
            <button
              onClick={() => copy(edgeScript, 'edge')}
              className="absolute top-3 right-3 p-1.5 rounded hover:bg-gw-border transition-colors"
            >
              {copied === 'edge'
                ? <CheckCircle className="w-4 h-4 text-gw-green" />
                : <Copy className="w-4 h-4 text-gw-muted" />
              }
            </button>
          </div>
        </div>

        {/* Thresholds */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Alert Thresholds</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="text-xs text-gw-muted block mb-2">Grid Carbon Alert (gCO₂/kWh)</label>
              <input
                type="number"
                value={carbonThreshold}
                onChange={e => setCarbonThreshold(+e.target.value)}
                className="w-full bg-gw-dark border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none"
              />
              <p className="text-xs text-gw-muted mt-1">Alberta grid averages 510 · Ontario averages 42</p>
            </div>
            <div>
              <label className="text-xs text-gw-muted block mb-2">Node Disconnect Alert (minutes)</label>
              <input
                type="number"
                value={disconnectAlert}
                onChange={e => setDisconnectAlert(+e.target.value)}
                className="w-full bg-gw-dark border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={saveThresholds}
            className="mt-5 flex items-center gap-2 bg-gw-green/10 border border-gw-green/30 text-gw-green px-4 py-2 rounded-lg text-sm hover:bg-gw-green/20 transition-colors"
          >
            {saved ? <><CheckCircle className="w-4 h-4" /> Saved</> : <>Save Thresholds</>}
          </button>
        </div>

      </div>
    </div>
  )
}
