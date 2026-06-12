'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Shield, Building2, Mail, ChevronRight, CheckCircle,
  Copy, Check, Terminal, Cloud, Server, Cpu, RefreshCw,
  ArrowRight, Zap,
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

function generateTenantId(orgName: string): string {
  const slug = orgName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ORG'
  const arr = new Uint8Array(3)
  crypto.getRandomValues(arr)
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `GW-${slug}-${hex}`
}

function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="relative group">
      <pre className="bg-black/60 border border-gw-border rounded-lg p-4 text-xs font-mono text-gw-green overflow-x-auto whitespace-pre-wrap break-all pr-10">
        {value}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded bg-gw-border hover:bg-gw-green/20 transition-colors"
        title="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-gw-green" /> : <Copy className="w-3.5 h-3.5 text-gw-muted" />}
      </button>
    </div>
  )
}

const DEPLOYMENT_TABS = [
  { id: 'linux',  label: 'Linux / On-Prem', icon: Terminal },
  { id: 'docker', label: 'Docker',           icon: Server   },
  { id: 'aws',    label: 'AWS EC2',          icon: Cloud    },
  { id: 'win',    label: 'Windows Server',   icon: Cpu      },
]

function DeploymentInstructions({ tenantId, grid }: { tenantId: string; grid: string }) {
  const [tab, setTab] = useState('linux')
  const API = API_BASE

  const commands: Record<string, string> = {
    linux: `# Install GridWitness Agent (Linux x86_64 / arm64)
curl -sSL https://packages.gridwitness.ca/install.sh | sudo bash -s -- \\
  --tenant-id ${tenantId} \\
  --grid ${grid} \\
  --api-url ${API}

# The agent runs as a systemd service:
sudo systemctl status gw-agent`,

    docker: `# Run GridWitness Agent via Docker
docker run -d \\
  --name gw-agent \\
  --restart unless-stopped \\
  --privileged \\
  -e GW_TENANT_ID="${tenantId}" \\
  -e GW_GRID="${grid}" \\
  -e GW_API_URL="${API}" \\
  ghcr.io/nimblestride/gw-agent:latest

# Verify agent is running:
docker logs gw-agent --tail 20`,

    aws: `# AWS EC2 Auto-Discovery via IAM Role
# 1. Create IAM role with this trust policy (in your AWS account):
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
    "Action": "sts:AssumeRole"
  }]
}

# 2. Attach this inline policy to the role:
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:DescribeInstances",
      "cloudwatch:GetMetricData"
    ],
    "Resource": "*"
  }]
}

# 3. Add the role ARN in Settings → AWS Auto-Discovery
# Tenant ID: ${tenantId}`,

    win: `# Install GridWitness Agent (Windows Server 2019/2022)
# Run in PowerShell as Administrator:

$env:GW_TENANT_ID = "${tenantId}"
$env:GW_GRID      = "${grid}"
$env:GW_API_URL   = "${API}"

Invoke-WebRequest https://packages.gridwitness.ca/install.ps1 \`
  -UseBasicParsing | Invoke-Expression

# The agent installs as a Windows Service:
Get-Service GWAgent`,
  }

  return (
    <div>
      <div className="flex gap-1 mb-4 flex-wrap">
        {DEPLOYMENT_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-gw-green/10 text-gw-green border border-gw-green/30'
                : 'text-gw-muted border border-gw-border hover:text-white'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>
      <CopyBlock value={commands[tab]} />
      <p className="text-xs text-gw-muted mt-3">
        The agent collects power and carbon data every 5 minutes and seals records to your WORM ledger.
        It uses IPMI/Redfish for bare-metal and CloudWatch for AWS instances.
      </p>
    </div>
  )
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [orgName,  setOrgName]  = useState('')
  const [orgEmail, setOrgEmail] = useState('')
  const [industry, setIndustry] = useState('Data Centre')
  const [tenantId, setTenantId] = useState('')
  const [checkStatus, setCheckStatus] = useState<'idle'|'checking'|'connected'|'waiting'>('idle')
  const [pollCount, setPollCount] = useState(0)

  function handleGenerate() {
    if (!orgName.trim() || !orgEmail.trim()) return
    const tid = generateTenantId(orgName)
    setTenantId(tid)
    if (typeof window !== 'undefined') {
      localStorage.setItem('gw_tenant_id', tid)
      localStorage.setItem('gw_org_name', orgName)
    }
    setStep(2)
  }

  const checkConnection = useCallback(async () => {
    if (!tenantId) return
    setCheckStatus('checking')
    try {
      const r = await fetch(`${API_BASE}/api/telemetry/live?tenant_id=${tenantId}`, {
        cache: 'no-store',
      })
      if (r.ok) {
        const data = await r.json()
        const records = Array.isArray(data) ? data : (data.records || [])
        if (records.length > 0) {
          setCheckStatus('connected')
          return
        }
      }
    } catch {}
    setCheckStatus('waiting')
    setPollCount(c => c + 1)
  }, [tenantId])

  useEffect(() => {
    if (step !== 3 || checkStatus === 'connected') return
    checkConnection()
    const interval = setInterval(checkConnection, 15000)
    return () => clearInterval(interval)
  }, [step, checkConnection, checkStatus])

  return (
    <div className="min-h-screen bg-gw-dark">
      {/* Header */}
      <header className="bg-gw-panel border-b border-gw-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gw-green" />
            <span className="text-base font-bold text-white">GridWitness</span>
          </Link>
          <Link href="/auth" className="text-sm text-gw-muted hover:text-white">
            Already have an account? Sign in →
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Progress */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                s < step  ? 'bg-gw-green border-gw-green text-gw-dark' :
                s === step ? 'border-gw-green text-gw-green' :
                             'border-gw-border text-gw-muted'
              }`}>
                {s < step ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              <span className={`text-sm ${s === step ? 'text-white font-medium' : 'text-gw-muted'}`}>
                {s === 1 ? 'Organization' : s === 2 ? 'Deploy Agent' : 'Verify'}
              </span>
              {s < 3 && <ChevronRight className="w-4 h-4 text-gw-border mx-1" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Org Setup ─────────────────────────── */}
        {step === 1 && (
          <div className="bg-gw-panel border border-gw-border rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-gw-green" />
                Set Up Your Organization
              </h1>
              <p className="text-sm text-gw-muted mt-1">
                We'll generate a unique tenant ID and WORM ledger for your infrastructure.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1.5">
                  Organization Name *
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="Acme Data Centres Inc."
                  className="w-full bg-gw-dark border border-gw-border rounded-lg px-4 py-2.5 text-white text-sm focus:border-gw-green focus:outline-none placeholder:text-gw-border"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1.5">
                  Contact Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gw-muted" />
                  <input
                    type="email"
                    value={orgEmail}
                    onChange={e => setOrgEmail(e.target.value)}
                    placeholder="ops@acmedatacentres.ca"
                    className="w-full bg-gw-dark border border-gw-border rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:border-gw-green focus:outline-none placeholder:text-gw-border"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1.5">
                  Industry
                </label>
                <select
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  className="w-full bg-gw-dark border border-gw-border rounded-lg px-4 py-2.5 text-white text-sm focus:border-gw-green focus:outline-none"
                >
                  {['Data Centre', 'Financial Services', 'Energy', 'Technology', 'Healthcare', 'Government', 'Other'].map(i => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-gw-dark border border-gw-border rounded-lg p-4 text-xs text-gw-muted space-y-1">
              <div className="text-white font-medium mb-2">What you'll get:</div>
              <div>✓ Unique tenant ID and isolated WORM ledger</div>
              <div>✓ SHA-256 Merkle chain — every record cryptographically sealed</div>
              <div>✓ OSFI B-15 · Bill C-59 · ISO 14064-1 compliance reports</div>
              <div>✓ Alberta grid intensity monitoring via AESO</div>
              <div>✓ 7-year tamper-proof audit trail (S3 Object Lock COMPLIANCE)</div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!orgName.trim() || !orgEmail.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gw-green text-gw-dark font-semibold py-3 rounded-lg hover:bg-gw-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Organization & Generate Tenant ID
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step 2: Deploy Agent ──────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-gw-panel border border-gw-green/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="w-5 h-5 text-gw-green" />
                <h2 className="font-semibold text-white">Organization Created</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-xs text-gw-muted uppercase tracking-wider mb-1">Tenant ID</div>
                  <div className="font-mono text-gw-green text-sm">{tenantId}</div>
                </div>
                <div>
                  <div className="text-xs text-gw-muted uppercase tracking-wider mb-1">Organization</div>
                  <div className="text-white text-sm">{orgName}</div>
                </div>
                <div>
                  <div className="text-xs text-gw-muted uppercase tracking-wider mb-1">Grid</div>
                  <div className="text-white text-sm flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-gw-green" />
                    Alberta (AESO)
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gw-muted uppercase tracking-wider mb-1">Ledger Status</div>
                  <div className="text-gw-green text-sm flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gw-green animate-pulse" />
                    Ready
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gw-panel border border-gw-border rounded-xl p-6">
              <h2 className="font-semibold text-white mb-1">Deploy the GridWitness Agent</h2>
              <p className="text-sm text-gw-muted mb-5">
                Install the agent on each server you want to monitor. It reports power draw and
                carbon emissions every 5 minutes. Choose your deployment method:
              </p>
              <DeploymentInstructions tenantId={tenantId} grid="AB" />
            </div>

            <div className="bg-gw-panel border border-gw-border rounded-xl p-6">
              <h2 className="font-semibold text-white mb-3">What the Agent Measures</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Power Consumption', 'IPMI/Redfish DCMI Power Reading or CloudWatch'],
                  ['Carbon Intensity',   'Alberta AESO grid mix (gCO2/kWh) — real-time'],
                  ['Carbon Emissions',   'Wattage × grid intensity = gCO2e per record'],
                  ['Cryptographic Seal', 'SHA-256 hash chained to previous record'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gw-dark rounded-lg p-3">
                    <div className="text-white font-medium mb-1">{k}</div>
                    <div className="text-xs text-gw-muted">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => { setStep(3); setCheckStatus('idle') }}
              className="w-full flex items-center justify-center gap-2 bg-gw-green text-gw-dark font-semibold py-3 rounded-lg hover:bg-gw-green/90 transition-colors"
            >
              Agent Deployed — Verify Connection
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step 3: Verify ────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-gw-panel border border-gw-border rounded-xl p-8">
              <h2 className="text-xl font-bold text-white mb-1">Verify Connection</h2>
              <p className="text-sm text-gw-muted mb-6">
                Once your agent is running, telemetry will appear here within 5–10 minutes.
              </p>

              <div className="text-center py-8 space-y-4">
                {checkStatus === 'idle' && (
                  <button
                    onClick={checkConnection}
                    className="flex items-center gap-2 mx-auto bg-gw-green text-gw-dark px-6 py-2.5 rounded-lg font-medium hover:bg-gw-green/90"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Check for First Telemetry
                  </button>
                )}
                {checkStatus === 'checking' && (
                  <div className="flex items-center justify-center gap-2 text-gw-muted">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Checking API for tenant {tenantId}…
                  </div>
                )}
                {checkStatus === 'waiting' && (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-gw-border flex items-center justify-center mx-auto">
                      <RefreshCw className="w-5 h-5 text-gw-muted animate-spin" />
                    </div>
                    <div className="text-white font-medium">Waiting for first telemetry…</div>
                    <div className="text-sm text-gw-muted">
                      Checking every 15s (attempt {pollCount}).
                      Make sure the agent is running and can reach the API.
                    </div>
                    <div className="text-xs text-gw-muted font-mono bg-gw-dark rounded p-2 mt-2">
                      Tenant: {tenantId}
                    </div>
                  </div>
                )}
                {checkStatus === 'connected' && (
                  <div className="space-y-4">
                    <CheckCircle className="w-14 h-14 text-gw-green mx-auto" />
                    <div className="text-xl font-bold text-white">Connected!</div>
                    <div className="text-sm text-gw-muted">
                      Telemetry is flowing. Your WORM ledger is active.
                    </div>
                    <Link
                      href={`/monitor?tenant_id=${tenantId}`}
                      className="inline-flex items-center gap-2 bg-gw-green text-gw-dark px-8 py-3 rounded-lg font-semibold hover:bg-gw-green/90 mt-4"
                    >
                      Open Dashboard
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {checkStatus !== 'connected' && (
              <div className="bg-gw-panel border border-gw-border rounded-xl p-6">
                <h3 className="font-semibold text-white mb-3">Troubleshooting</h3>
                <ul className="space-y-2 text-sm text-gw-muted">
                  <li>• Agent must be able to reach <code className="text-gw-green text-xs">{API_BASE}</code></li>
                  <li>• Check agent logs: <code className="text-gw-green text-xs">journalctl -u gw-agent -f</code> or <code className="text-gw-green text-xs">docker logs gw-agent</code></li>
                  <li>• For IPMI/Redfish: run as root or with <code className="text-gw-green text-xs">sudo</code></li>
                  <li>• AWS auto-discovery: IAM role must be attached to EC2 instance profile</li>
                </ul>
                <div className="mt-4 pt-4 border-t border-gw-border flex items-center justify-between">
                  <span className="text-xs text-gw-muted">
                    Proceed without waiting — you can verify later from the dashboard.
                  </span>
                  <Link
                    href={`/monitor?tenant_id=${tenantId}`}
                    className="flex items-center gap-1 text-sm text-gw-green hover:underline"
                  >
                    Go to Dashboard anyway →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
