'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  Shield, Building2, Mail, ChevronRight, CheckCircle,
  Copy, Check, Terminal, Cloud, Server, Cpu, RefreshCw,
  ArrowRight, Zap, Key, AlertCircle, Briefcase,
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

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
      <button onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded bg-gw-border hover:bg-gw-green/20 transition-colors">
        {copied ? <Check className="w-3.5 h-3.5 text-gw-green" /> : <Copy className="w-3.5 h-3.5 text-gw-muted" />}
      </button>
    </div>
  )
}

const DEPLOYMENT_TABS = [
  { id: 'test',   label: 'Quick Test',      icon: Zap      },
  { id: 'linux',  label: 'Linux / On-Prem', icon: Terminal },
  { id: 'docker', label: 'Docker',          icon: Server   },
  { id: 'aws',    label: 'AWS EC2',         icon: Cloud    },
  { id: 'win',    label: 'Windows Server',  icon: Cpu      },
]

function DeploymentInstructions({ tenantId, apiKey }: { tenantId: string; apiKey: string }) {
  const [tab, setTab] = useState('test')
  const commands: Record<string, string> = {
    test: `# Quick test — send one telemetry record to verify your tenant is live:
curl -X POST ${API_BASE}/api/telemetry/live \\
  -H 'Content-Type: application/json' \\
  -d '{
    "TenantID": "${tenantId}",
    "api_key":  "${apiKey}",
    "Source":   "manual-test",
    "Actual_Wattage": 450,
    "GridID":   "AB",
    "DataSource": "EDGE_AGENT"
  }'
# 200 → record accepted, appears on dashboard within ~10 s`,

    linux: `# Install GridWitness Agent (Linux x86_64 / arm64)
curl -sSL https://packages.gridwitness.ca/install.sh | sudo bash -s -- \\
  --tenant-id ${tenantId} \\
  --api-key   ${apiKey} \\
  --grid AB   \\
  --api-url ${API_BASE}
sudo systemctl status gw-agent`,

    docker: `# Run GridWitness Agent via Docker
docker run -d \\
  --name gw-agent --restart unless-stopped --privileged \\
  -e GW_TENANT_ID="${tenantId}" \\
  -e GW_API_KEY="${apiKey}" \\
  -e GW_GRID="AB" \\
  -e GW_API_URL="${API_BASE}" \\
  ghcr.io/nimblestride/gw-agent:latest
docker logs gw-agent --tail 20`,

    aws: `# AWS EC2 Auto-Discovery (cross-account IAM role)
# 1. In Settings → AWS Integration, paste your cross-account role ARN.
# 2. GridWitness assumes the role and discovers instances automatically.
#
# Your credentials:
#   Tenant ID: ${tenantId}
#   API Key:   ${apiKey}
#
# Add these to your IAM role trust policy:
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::768949138583:root" },
  "Action": "sts:AssumeRole"
}`,

    win: `# Install GridWitness Agent (Windows Server 2019/2022)
# Run in PowerShell as Administrator:
$env:GW_TENANT_ID = "${tenantId}"
$env:GW_API_KEY   = "${apiKey}"
$env:GW_GRID      = "AB"
$env:GW_API_URL   = "${API_BASE}"
Invoke-WebRequest https://packages.gridwitness.ca/install.ps1 \`
  -UseBasicParsing | Invoke-Expression
Get-Service GWAgent`,
  }
  return (
    <div>
      <div className="flex gap-1 mb-4 flex-wrap">
        {DEPLOYMENT_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-gw-green/10 text-gw-green border border-gw-green/30'
                : 'text-gw-muted border border-gw-border hover:text-white'
            }`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>
      <CopyBlock value={commands[tab]} />
    </div>
  )
}

type ProvisionResult = {
  tenant_id: string
  api_key: string
  key_id: string
  login_email: string
  message: string
}

export default function OnboardingPage() {
  const [step, setStep]           = useState(1)
  const [orgName, setOrgName]     = useState('')
  const [orgEmail, setOrgEmail]   = useState('')
  const [industry, setIndustry]   = useState('Data Centre')
  const [provisioning, setProvisioning] = useState(false)
  const [provError, setProvError] = useState<string | null>(null)
  const [result, setResult]       = useState<ProvisionResult | null>(null)
  const [checkStatus, setCheckStatus] = useState<'idle'|'checking'|'connected'|'waiting'>('idle')
  const [pollCount, setPollCount] = useState(0)

  async function handleProvision() {
    if (!orgName.trim() || !orgEmail.trim()) return
    setProvisioning(true); setProvError(null)
    try {
      const r = await fetch(`${API_BASE}/api/tenant/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_name: orgName, admin_email: orgEmail, industry }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setResult(d)
      if (typeof window !== 'undefined') {
        localStorage.setItem('gw_tenant_id', d.tenant_id)
        localStorage.setItem('gw_org_name', orgName)
      }
      setStep(2)
    } catch (e: unknown) {
      setProvError(e instanceof Error ? e.message : 'Provisioning failed — please try again.')
    } finally {
      setProvisioning(false)
    }
  }

  async function checkConnection() {
    if (!result?.tenant_id) return
    setCheckStatus('checking')
    try {
      const r = await fetch(`${API_BASE}/api/telemetry/live?tenant_id=${result.tenant_id}`, { cache: 'no-store' })
      if (r.ok) {
        const data = await r.json()
        const records = Array.isArray(data) ? data : (data.records || [])
        if (records.length > 0) { setCheckStatus('connected'); return }
      }
    } catch {}
    setCheckStatus('waiting')
    setPollCount(c => c + 1)
  }

  const STEPS = ['Organization', 'Credentials & Agent', 'Verify']

  return (
    <div className="min-h-screen bg-gw-dark">
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

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const s = i + 1
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  s < step  ? 'bg-gw-green border-gw-green text-gw-dark' :
                  s === step ? 'border-gw-green text-gw-green' :
                               'border-gw-border text-gw-muted'
                }`}>
                  {s < step ? <CheckCircle className="w-4 h-4" /> : s}
                </div>
                <span className={`text-sm ${s === step ? 'text-white font-medium' : 'text-gw-muted'}`}>{label}</span>
                {s < STEPS.length && <ChevronRight className="w-4 h-4 text-gw-border mx-1" />}
              </div>
            )
          })}
        </div>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="bg-gw-panel border border-gw-border rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-gw-green" />
                Set Up Your Organization
              </h1>
              <p className="text-sm text-gw-muted mt-1">
                We'll create your tenant, generate an API key, and send login credentials to your email.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1.5">Organization Name *</label>
                <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
                  placeholder="Acme Data Centres Inc."
                  className="w-full bg-gw-dark border border-gw-border rounded-lg px-4 py-2.5 text-white text-sm focus:border-gw-green focus:outline-none placeholder:text-gw-border" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1.5">Admin Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gw-muted" />
                  <input type="email" value={orgEmail} onChange={e => setOrgEmail(e.target.value)}
                    placeholder="ops@acmedatacentres.ca"
                    className="w-full bg-gw-dark border border-gw-border rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:border-gw-green focus:outline-none placeholder:text-gw-border" />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1.5">Industry</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-2.5 w-4 h-4 text-gw-muted" />
                  <select value={industry} onChange={e => setIndustry(e.target.value)}
                    className="w-full bg-gw-dark border border-gw-border rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:border-gw-green focus:outline-none appearance-none">
                    {['Data Centre','Financial Services','Energy','Technology','Healthcare','Government','Other'].map(i => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-gw-dark border border-gw-border rounded-lg p-4 text-xs text-gw-muted space-y-1.5">
              <div className="text-white font-medium mb-2 text-sm">What you get instantly:</div>
              {[
                'Unique Tenant ID and isolated WORM ledger',
                'API key for agent authentication',
                'Login email with temporary password (check inbox)',
                'OSFI B-15 · Bill C-59 · ISO 14064-1 compliance reports',
                'Alberta grid intensity monitoring via AESO — live',
                '7-year tamper-proof audit trail (S3 Object Lock COMPLIANCE)',
              ].map(t => <div key={t}>✓ {t}</div>)}
            </div>

            {provError && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {provError}
              </div>
            )}

            <button onClick={handleProvision} disabled={!orgName.trim() || !orgEmail.trim() || provisioning}
              className="w-full flex items-center justify-center gap-2 bg-gw-green text-gw-dark font-semibold py-3 rounded-lg hover:bg-gw-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {provisioning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {provisioning ? 'Creating your account…' : 'Create Organization & Get Credentials'}
            </button>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && result && (
          <div className="space-y-6">
            {/* Success banner */}
            <div className="bg-gw-panel border border-gw-green/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-5 h-5 text-gw-green" />
                <h2 className="font-semibold text-white">Account Created</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Tenant ID', result.tenant_id],
                  ['Organization', orgName],
                  ['Grid', 'Alberta (AESO)'],
                  ['Status', 'Active'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs text-gw-muted uppercase tracking-wider mb-1">{k}</div>
                    <div className="font-mono text-gw-green text-sm">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Credentials — most important thing */}
            <div className="bg-gw-panel border border-amber-500/30 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-1">
                <Key className="w-4 h-4 text-amber-400" />
                <h2 className="font-semibold text-white">Your Credentials</h2>
                <span className="ml-auto text-xs text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded">Save these now</span>
              </div>
              <p className="text-xs text-gw-muted mb-4">
                The API key is shown once. Your login password was emailed to <strong className="text-white">{result.login_email}</strong>.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gw-muted block mb-1">API Key (for agent authentication)</label>
                  <CopyBlock value={result.api_key} />
                </div>
                <div>
                  <label className="text-xs text-gw-muted block mb-1">Tenant ID</label>
                  <CopyBlock value={result.tenant_id} />
                </div>
              </div>
              <div className="mt-4 p-3 bg-amber-500/10 rounded text-xs text-amber-300">
                ⚠ Copy your API key now — it will not be shown again. You can generate additional keys in Settings → API Keys.
              </div>
            </div>

            {/* Email notice */}
            <div className="bg-gw-panel border border-blue-500/20 rounded-xl p-5 flex gap-3">
              <Mail className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white mb-1">Check your email</div>
                <div className="text-xs text-gw-muted">
                  A temporary password was sent to <strong className="text-white">{result.login_email}</strong>.
                  Use it to sign in at <a href="/auth" className="text-gw-green hover:underline">/auth</a> → Sign in with GridWitness SSO.
                  You'll be prompted to set a new password on first login.
                </div>
              </div>
            </div>

            {/* Deploy */}
            <div className="bg-gw-panel border border-gw-border rounded-xl p-6">
              <h2 className="font-semibold text-white mb-1">Deploy the GridWitness Agent</h2>
              <p className="text-sm text-gw-muted mb-5">
                Install on each server you want to monitor. The agent reports power draw and carbon every 5 minutes.
              </p>
              <DeploymentInstructions tenantId={result.tenant_id} apiKey={result.api_key} />
            </div>

            <button onClick={() => { setStep(3); setCheckStatus('idle') }}
              className="w-full flex items-center justify-center gap-2 bg-gw-green text-gw-dark font-semibold py-3 rounded-lg hover:bg-gw-green/90 transition-colors">
              Agent Deployed — Verify Connection
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && result && (
          <div className="space-y-6">
            <div className="bg-gw-panel border border-gw-border rounded-xl p-8">
              <h2 className="text-xl font-bold text-white mb-1">Verify Connection</h2>
              <p className="text-sm text-gw-muted mb-6">
                Telemetry will appear here within 5–10 minutes of the agent starting.
              </p>
              <div className="text-center py-8 space-y-4">
                {checkStatus === 'idle' && (
                  <button onClick={checkConnection}
                    className="flex items-center gap-2 mx-auto bg-gw-green text-gw-dark px-6 py-2.5 rounded-lg font-medium hover:bg-gw-green/90">
                    <RefreshCw className="w-4 h-4" />
                    Check for First Telemetry
                  </button>
                )}
                {checkStatus === 'checking' && (
                  <div className="flex items-center justify-center gap-2 text-gw-muted">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Checking for tenant {result.tenant_id}…
                  </div>
                )}
                {checkStatus === 'waiting' && (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-gw-border flex items-center justify-center mx-auto">
                      <RefreshCw className="w-5 h-5 text-gw-muted animate-spin" />
                    </div>
                    <div className="text-white font-medium">Waiting for first telemetry…</div>
                    <div className="text-sm text-gw-muted">Attempt {pollCount} — agent must reach the API endpoint.</div>
                    <button onClick={checkConnection}
                      className="flex items-center gap-2 mx-auto text-sm text-gw-muted border border-gw-border px-4 py-1.5 rounded hover:text-white hover:border-gw-green transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" /> Check now
                    </button>
                  </div>
                )}
                {checkStatus === 'connected' && (
                  <div className="space-y-4">
                    <CheckCircle className="w-14 h-14 text-gw-green mx-auto" />
                    <div className="text-xl font-bold text-white">Connected!</div>
                    <div className="text-sm text-gw-muted">Telemetry is flowing. Your WORM ledger is active.</div>
                    <Link href={`/monitor?tenant_id=${result.tenant_id}`}
                      className="inline-flex items-center gap-2 bg-gw-green text-gw-dark px-8 py-3 rounded-lg font-semibold hover:bg-gw-green/90 mt-4">
                      Open Dashboard <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
            {checkStatus !== 'connected' && (
              <div className="flex items-center justify-between bg-gw-panel border border-gw-border rounded-xl p-4">
                <span className="text-xs text-gw-muted">Skip verification — you can confirm from the dashboard later.</span>
                <Link href={`/monitor?tenant_id=${result.tenant_id}`}
                  className="text-sm text-gw-green hover:underline">Go to Dashboard →</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
