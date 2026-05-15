'use client'
import { useState } from 'react'
import Nav from '@/components/Nav'
import { CheckCircle, Clock, Copy, ExternalLink, Cloud, Server, AlertTriangle } from 'lucide-react'

// Demo tenant — in production this comes from Cognito JWT
const DEMO_TENANT = {
  tenant_id: 'GW-NIMBL-AEB47A92',
  organization_name: 'NimbleStride',
  status: 'PENDING_IAM_ROLE',
  admin_email: 'support@nimblestride.ca',
  subscription_tier: 'TIER_1_AUDIT',
}

export default function SettingsPage() {
  const [copied, setCopied] = useState<string | null>(null)
  const [carbonThreshold, setCarbonThreshold] = useState(400)
  const [disconnectAlert, setDisconnectAlert] = useState(15)
  const [saved, setSaved] = useState(false)

  const tenantId = DEMO_TENANT.tenant_id

  const cfnUrl = `https://ca-central-1.console.aws.amazon.com/cloudformation/home?region=ca-central-1#/stacks/create/review?templateURL=https://gw-cfn-templates-768949138583.s3.ca-central-1.amazonaws.com/gridwitness-scanner-role.yaml&param_TenantID=${tenantId}&stackName=GridWitness-Scanner-${tenantId}`

  const edgeScript = `#!/bin/bash
# GridWitness Edge Agent — One-Command Install
# Tenant: ${tenantId}
curl -sSL https://agent.gridwitness.ca/install.sh | \\
  TENANT_ID="${tenantId}" \\
  API_ENDPOINT="https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com" \\
  bash`

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const saveThresholds = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white">Integration Centre</h1>
          <p className="text-sm text-gw-muted mt-1">
            Connect your infrastructure to begin hardware-verified carbon attestation
          </p>
        </div>

        {/* Tenant Info */}
        <div className="bg-gw-panel border border-gw-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Account Details</h2>
            <span className="text-xs border border-amber-500/50 text-amber-400 px-2 py-1 rounded">
              {DEMO_TENANT.status.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Tenant ID',     tenantId],
              ['Organization',  DEMO_TENANT.organization_name],
              ['Admin Email',   DEMO_TENANT.admin_email],
              ['Tier',          DEMO_TENANT.subscription_tier],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-gw-muted text-xs mb-1">{label}</div>
                <div className="font-mono text-white text-xs">{value}</div>
              </div>
            ))}
          </div>
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
                GridWitness uses it to discover your EC2 instances. No inbound connections.
              </p>
            </div>
          </div>

          <div className="bg-gw-dark border border-gw-border rounded-lg p-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-gw-muted">
              This creates an IAM role with <strong className="text-white">read-only</strong> permissions only.
              GridWitness cannot modify, delete, or access your data — only discover running EC2 instances.
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
            After deployment, your account status will automatically flip to <span className="text-gw-green">ACTIVE</span> within 60 seconds.
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
                For physical servers and on-premise hardware. Reads actual wattage from BMC Redfish API.
                Outbound-only — opens no inbound ports.
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
              <label className="text-xs text-gw-muted block mb-2">
                Grid Carbon Alert (gCO2/kWh)
              </label>
              <input
                type="number"
                value={carbonThreshold}
                onChange={e => setCarbonThreshold(+e.target.value)}
                className="w-full bg-gw-dark border border-gw-border rounded-lg px-3 py-2 text-white text-sm focus:border-gw-green focus:outline-none"
              />
              <p className="text-xs text-gw-muted mt-1">Alberta grid averages 510 · Ontario averages 42</p>
            </div>
            <div>
              <label className="text-xs text-gw-muted block mb-2">
                Node Disconnect Alert (minutes)
              </label>
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
