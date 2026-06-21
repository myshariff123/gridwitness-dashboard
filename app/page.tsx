'use client'
import Link from 'next/link'
import {
  Shield, Zap, FileText, Lock, CheckCircle, ArrowRight,
  BarChart2, Globe, Leaf, AlertTriangle, TrendingDown,
  Database, Eye, Award, ChevronRight
} from 'lucide-react'

const FRAMEWORKS = ['OSFI B-15', 'Bill C-59', 'TCFD', 'IFRS S2 / CSDS 2', 'ISO 14064-1', 'GHG Protocol', 'Alberta TIER', 'Science Based Targets']

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-Time Hardware Telemetry',
    color: 'text-yellow-400',
    border: 'border-yellow-400/20',
    bg: 'bg-yellow-400/5',
    body: 'Our lightweight agent reads actual watt consumption from your servers (BMC Redfish, GPU, ASIC, Linux, Windows, Docker, Kubernetes) and converts it to CO₂e using the live AESO grid intensity — updated every 5 minutes. No more waiting for monthly utility bills.',
  },
  {
    icon: Database,
    title: 'WORM Immutable Ledger',
    color: 'text-blue-400',
    border: 'border-blue-400/20',
    bg: 'bg-blue-400/5',
    body: 'Every telemetry record is SHA-256 hash-chained and written to a Write-Once-Read-Many ledger. No record can be altered or deleted after the fact — giving regulators, auditors, and your board a tamper-evident emissions trail from day one.',
  },
  {
    icon: FileText,
    title: 'One-Click Regulatory Reports',
    color: 'text-gw-green',
    border: 'border-gw-green/20',
    bg: 'bg-gw-green/5',
    body: 'Generate OSFI B-15, TCFD, and IFRS S2 / CSDS 2 disclosure PDFs in under 30 seconds. Reports pull live Scope 1, 2, and 3 data, your SBTi trajectory, market-based Scope 2 (with REC retirement), carbon tax liability, and a Merkle root hash — ready for board sign-off.',
  },
  {
    icon: Lock,
    title: 'Digital Board Attestation',
    color: 'text-purple-400',
    border: 'border-purple-400/20',
    bg: 'bg-purple-400/5',
    body: 'Send a single-use link to your board member or CRO. They review the disclosure summary and confirm. GridWitness creates a SHA-256 cryptographic seal stored in AWS S3 Object Lock COMPLIANCE mode for 7 years — satisfying OSFI B-15 §5.3 governance requirements without paper or wet signatures.',
  },
  {
    icon: Leaf,
    title: 'Bill C-59 Market-Based Scope 2',
    color: 'text-emerald-400',
    border: 'border-emerald-400/20',
    bg: 'bg-emerald-400/5',
    body: "Purchase and retire Renewable Energy Certificates (EcoLogo, I-REC, Green-e, TIGR). GridWitness calculates your market-based Scope 2 automatically and flags whether your RECs meet Canada's anti-greenwashing law. Your net position (after verified carbon offsets) appears on every compliance report.",
  },
  {
    icon: TrendingDown,
    title: 'Carbon Tax & SBTi Trajectory',
    color: 'text-orange-400',
    border: 'border-orange-400/20',
    bg: 'bg-orange-400/5',
    body: 'See your federal carbon tax liability today, projected to 2030 ($170/tCO₂e). Plot your Science Based Targets pathway and instantly see how much you save in tax exposure by hitting your reduction milestones. Present this to your CFO in one screen.',
  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Deploy an Agent',
    body: 'Install a one-line script on your server, GPU rack, or data centre. It reads real watt consumption and sends encrypted telemetry to your private GridWitness tenant.',
  },
  {
    step: '02',
    title: 'Configure Your Profile',
    body: 'Enter your carbon budget, SBTi targets, fuel records, RECs, and offsets. The platform calculates your Scope 1, 2 (location + market-based), and 3 emissions continuously.',
  },
  {
    step: '03',
    title: 'Generate & Attest',
    body: 'Click Generate Report. Download a board-ready OSFI B-15, TCFD, or IFRS S2 PDF. Send the attestation link to your signing officer. The cryptographic seal is created the moment they confirm.',
  },
]

const DIFFERENTIATORS = [
  { label: 'Hardware-level telemetry (not invoice upload)', checked: true },
  { label: 'Live AESO grid carbon intensity compositing', checked: true },
  { label: 'WORM hash-chained immutable ledger', checked: true },
  { label: 'SHA-256 board attestation, S3 Object Lock 7yr', checked: true },
  { label: 'Bill C-59 REC certification validation', checked: true },
  { label: 'OSFI B-15, TCFD, IFRS S2 in one platform', checked: true },
  { label: 'Canadian data residency (AWS ca-central-1)', checked: true },
  { label: 'Mid-market pricing — no $300K+ enterprise contract', checked: true },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gw-dark text-white">

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav className="border-b border-gw-border bg-gw-dark/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-7 h-7 text-gw-green" />
            <div>
              <div className="text-lg font-bold tracking-wide text-white leading-none">GridWitness</div>
              <div className="text-[10px] text-gw-muted leading-none mt-0.5">by NimbleStride Inc.</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="text-sm text-gw-muted hover:text-white transition-colors px-4 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/onboarding"
              className="text-sm bg-gw-green text-gw-dark font-semibold px-5 py-2 rounded-lg hover:bg-gw-green/90 transition-colors flex items-center gap-1.5"
            >
              Get Started Free <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-gw-green/10 border border-gw-green/30 text-gw-green text-xs font-medium px-4 py-1.5 rounded-full mb-8">
          <Globe className="w-3.5 h-3.5" />
          Canada's First Hardware-Anchored ESG Compliance Platform
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight mb-6">
          Real emissions data.<br />
          <span className="text-gw-green">Regulator-ready reports.</span><br />
          In minutes.
        </h1>

        <p className="text-lg text-gw-muted max-w-2xl mx-auto mb-10 leading-relaxed">
          GridWitness measures your GHG emissions at the hardware level, seals the data in an immutable ledger, and generates OSFI B-15, TCFD, and IFRS S2 disclosure PDFs with a cryptographic board attestation — all from one platform built for Canadian regulations.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/onboarding"
            className="flex items-center gap-2 bg-gw-green text-gw-dark font-bold px-8 py-3.5 rounded-xl hover:bg-gw-green/90 transition-colors text-base"
          >
            Start Your Free Trial <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/auth"
            className="flex items-center gap-2 border border-gw-border text-white font-medium px-8 py-3.5 rounded-xl hover:border-gw-green/50 hover:text-gw-green transition-colors text-base"
          >
            Sign In to Dashboard
          </Link>
        </div>

        <p className="mt-6 text-xs text-gw-muted">
          No credit card required to start · Canadian data residency · SOC 2 in progress
        </p>
      </section>

      {/* ── Regulatory badge strip ──────────────────────────────── */}
      <section className="border-y border-gw-border bg-gw-panel/50 py-5">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs text-gw-muted text-center mb-4 uppercase tracking-widest">Regulatory frameworks covered</p>
          <div className="flex flex-wrap justify-center gap-2">
            {FRAMEWORKS.map(f => (
              <span key={f} className="text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded-full">
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem statement ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-medium uppercase tracking-widest mb-4">
              <AlertTriangle className="w-4 h-4" />
              The Problem
            </div>
            <h2 className="text-3xl font-bold mb-5 leading-snug">
              OSFI and CSA are not waiting. Are you ready?
            </h2>
            <div className="space-y-4 text-gw-muted text-sm leading-relaxed">
              <p>
                <strong className="text-white">OSFI Guideline B-15</strong> has been mandatory for all federally regulated financial institutions since January 2024. OSFI supervisors are actively reviewing climate risk disclosures — and the first enforcement actions are expected in 2026.
              </p>
              <p>
                <strong className="text-white">Bill C-59 / CCPA</strong> makes it a legal offence to make unsubstantiated environmental claims. "Net-zero" on your website without verified data behind it exposes you to Competition Bureau penalties.
              </p>
              <p>
                <strong className="text-white">IFRS S2 / CSDS 2</strong> is mandatory for Canadian public companies with fiscal years beginning January 2025. Scope 1, 2, and 3 disclosure with board attestation is required.
              </p>
              <p>
                Enterprise GHG platforms (IBM Envizi, Salesforce Net Zero Cloud) cost $300,000–$800,000/year and take 6–12 months to implement. GridWitness is live in a day.
              </p>
            </div>
          </div>
          <div className="bg-gw-panel border border-gw-border rounded-2xl p-6 space-y-3">
            <p className="text-xs text-gw-muted uppercase tracking-widest mb-4">Why GridWitness is different</p>
            {DIFFERENTIATORS.map(d => (
              <div key={d.label} className="flex items-start gap-3">
                <CheckCircle className="w-4 h-4 text-gw-green flex-shrink-0 mt-0.5" />
                <span className="text-sm text-white">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────── */}
      <section className="bg-gw-panel/30 border-y border-gw-border py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Everything compliance needs, nothing it doesn't</h2>
            <p className="text-gw-muted max-w-xl mx-auto text-sm">Built specifically for Canadian mid-market organizations with hardware-intensive operations.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div key={f.title} className={`bg-gw-panel border ${f.border} rounded-xl p-5 flex flex-col gap-3`}>
                <div className={`w-9 h-9 rounded-lg ${f.bg} border ${f.border} flex items-center justify-center`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="font-semibold text-white text-sm">{f.title}</h3>
                <p className="text-xs text-gw-muted leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">Up and running in one business day</h2>
          <p className="text-gw-muted text-sm">No SI partner, no 6-month implementation, no $300K contract.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.step} className="relative">
              {i < HOW_IT_WORKS.length - 1 && (
                <div className="hidden md:block absolute top-8 left-full w-full h-px border-t border-dashed border-gw-border z-0" style={{ width: 'calc(100% - 2rem)', left: 'calc(50% + 2rem)' }} />
              )}
              <div className="bg-gw-panel border border-gw-border rounded-xl p-6 text-center relative z-10">
                <div className="text-4xl font-bold text-gw-green/20 mb-3">{s.step}</div>
                <h3 className="font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-xs text-gw-muted leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Metrics strip ─────────────────────────────────────── */}
      <section className="border-y border-gw-border bg-gw-panel/50 py-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: '< 30s', label: 'Report generation time' },
              { value: '7 yr', label: 'Cryptographic seal retention' },
              { value: '5 min', label: 'AESO grid intensity refresh' },
              { value: '8', label: 'Carbon offset registries supported' },
            ].map(m => (
              <div key={m.label}>
                <div className="text-3xl font-bold text-gw-green mb-1">{m.value}</div>
                <div className="text-xs text-gw-muted">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ──────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3">Built for the teams responsible for compliance</h2>
          <p className="text-gw-muted text-sm">One platform that gives every stakeholder what they need.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              icon: Award,
              role: 'Chief Risk Officer / CRO',
              points: [
                'OSFI B-15 readiness at a glance',
                'Board attestation workflow built-in',
                'Incident log for climate risk evidence',
                'Filing calendar with deadline alerts',
              ],
            },
            {
              icon: BarChart2,
              role: 'CFO / Finance',
              points: [
                'Carbon tax liability YTD and projected to 2030',
                'SBTi savings vs flat-emissions scenario',
                'Market-based Scope 2 for cost optimization',
                'Annualised carbon budget burn rate',
              ],
            },
            {
              icon: Eye,
              role: 'VP Sustainability / ESG',
              points: [
                'Scope 1, 2 (location + market), and 3 in one view',
                'REC and carbon offset registry management',
                'Bill C-59 anti-greenwashing compliance check',
                'TCFD and IFRS S2 disclosure drafting',
              ],
            },
          ].map(r => (
            <div key={r.role} className="bg-gw-panel border border-gw-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-gw-green/10 border border-gw-green/20 flex items-center justify-center">
                  <r.icon className="w-5 h-5 text-gw-green" />
                </div>
                <h3 className="font-semibold text-white text-sm">{r.role}</h3>
              </div>
              <ul className="space-y-2">
                {r.points.map(p => (
                  <li key={p} className="flex items-start gap-2 text-xs text-gw-muted">
                    <ChevronRight className="w-3.5 h-3.5 text-gw-green flex-shrink-0 mt-0.5" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────────── */}
      <section className="border-y border-gw-border bg-gw-green/5 py-16">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <Shield className="w-12 h-12 text-gw-green mx-auto mb-5" />
          <h2 className="text-3xl font-bold mb-4">
            Your next OSFI submission is closer than you think.
          </h2>
          <p className="text-gw-muted text-sm mb-8 leading-relaxed">
            Start your free trial today. Deploy your first agent, enter your Scope 1 records, and have a draft OSFI B-15 disclosure ready before your next board meeting.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/onboarding"
              className="flex items-center gap-2 bg-gw-green text-gw-dark font-bold px-8 py-3.5 rounded-xl hover:bg-gw-green/90 transition-colors"
            >
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:support@nimblestride.ca"
              className="flex items-center gap-2 border border-gw-border text-white font-medium px-8 py-3.5 rounded-xl hover:border-gw-green/50 hover:text-gw-green transition-colors"
            >
              Talk to Sales
            </a>
          </div>
          <p className="mt-5 text-xs text-gw-muted">
            Questions? Email us at{' '}
            <a href="mailto:support@nimblestride.ca" className="text-gw-green hover:underline">support@nimblestride.ca</a>
          </p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-gw-green" />
            <div>
              <div className="text-sm font-bold text-white">GridWitness</div>
              <div className="text-xs text-gw-muted">by NimbleStride Inc.</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-gw-muted">
            <Link href="/auth" className="hover:text-white transition-colors">Sign In</Link>
            <Link href="/onboarding" className="hover:text-white transition-colors">Get Started</Link>
            <a href="mailto:support@nimblestride.ca" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="text-xs text-gw-muted text-center md:text-right">
            <div>All data stored in AWS ca-central-1</div>
            <div className="mt-0.5">Canadian sovereign infrastructure · © 2026 NimbleStride Inc.</div>
          </div>
        </div>
      </footer>

    </div>
  )
}
