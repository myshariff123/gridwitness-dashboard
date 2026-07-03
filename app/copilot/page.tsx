'use client'

import { useEffect, useRef, useState } from 'react'
import Nav from '@/components/Nav'
import { getLiveTelemetry, getLiveGridData } from '@/lib/api'
import { Bot, Send, Loader2, Sparkles, Zap, FileText, AlertTriangle, Database } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTED_PROMPTS = [
  { icon: AlertTriangle, text: 'Why did my emissions spike in the last 24 hours?', color: 'text-amber-400' },
  { icon: Zap, text: 'When is the next low-carbon grid window this week?', color: 'text-gw-green' },
  { icon: FileText, text: 'Draft my Q2 OSFI B-15 compliance narrative', color: 'text-blue-400' },
  { icon: Sparkles, text: 'Compare my carbon intensity to industry benchmarks', color: 'text-purple-400' },
]

function MarkdownText({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|^#{1,3} .+$)/m)
  const rendered = parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^\w+\n/, '')
      return <pre key={i} className="my-2 bg-gw-dark rounded p-3 text-xs font-mono text-gw-green overflow-x-auto whitespace-pre-wrap">{code}</pre>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 bg-gw-dark rounded text-xs font-mono text-gw-green">{part.slice(1, -1)}</code>
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    }
    if (/^#{1,3} /.test(part)) {
      const level = part.match(/^(#+) /)?.[1].length || 1
      const content = part.replace(/^#+\s/, '')
      const cls = level === 1 ? 'text-lg font-bold text-white mt-3 mb-1'
        : level === 2 ? 'text-base font-semibold text-white mt-2 mb-1'
        : 'text-sm font-semibold text-gw-muted mt-2 mb-0.5'
      return <p key={i} className={cls}>{content}</p>
    }
    return <span key={i}>{part}</span>
  })
  return <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{rendered}</div>
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-gw-green/20 border border-gw-green/40' : 'bg-blue-500/20 border border-blue-500/40'
      }`}>
        {isUser
          ? <span className="text-xs font-bold text-gw-green">You</span>
          : <Bot className="w-4 h-4 text-blue-400" />}
      </div>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
        isUser ? 'bg-gw-green/10 border border-gw-green/20 text-sm text-white' : 'bg-gw-panel border border-gw-border'
      }`}>
        {isUser ? <p className="text-sm text-white">{msg.content}</p> : <MarkdownText text={msg.content} />}
        <p className="mt-1.5 text-xs text-gw-muted/60 text-right">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
        <Bot className="w-4 h-4 text-blue-400" />
      </div>
      <div className="bg-gw-panel border border-gw-border rounded-xl px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-gw-muted animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-gw-muted animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-gw-muted animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

export default function CopilotPage() {
  const [tenantId, setTenantId] = useState('GW-NIMBL-AEB47A92')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emissionsCtx, setEmissionsCtx] = useState<string>('')
  const [ctxStatus, setCtxStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URLSearchParams(window.location.search)
    setTenantId(url.get('tenant_id') || window.localStorage.getItem('gw_tenant_id') || 'GW-NIMBL-AEB47A92')
  }, [])

  // Fetch live emissions context on mount (non-blocking)
  useEffect(() => {
    if (!tenantId) return
    const fetchCtx = async () => {
      try {
        const [{ records, totalInLedger }, grids] = await Promise.all([
          getLiveTelemetry(tenantId),
          getLiveGridData(),
        ])
        const totalCO2 = records.reduce((s, r) => s + r.gCO2e, 0)
        const totalWatts = records.reduce((s, r) => s + r.Actual_Wattage, 0)
        const abGrid = grids.find(g => g.GridID === 'AB')
        const onGrid = grids.find(g => g.GridID === 'ON')
        const infraTypes = [...new Set(records.map(r => r.InfraType).filter(Boolean))].slice(0, 4)
        const scope1CO2 = records.filter(r => r.InfraType === 'BMC Redfish' || r.DataSource === 'REDFISH_BMC').reduce((s, r) => s + r.gCO2e, 0)
        const scope2CO2 = totalCO2 - scope1CO2

        const ctx = [
          `[GRIDWITNESS LIVE CONTEXT — ${new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })} ET]`,
          `Tenant ID: ${tenantId}`,
          `Active Devices: ${records.length} of ${totalInLedger} total in WORM ledger`,
          `Total Power Load: ${(totalWatts / 1000).toFixed(1)} kW`,
          `Scope 1 Emissions (direct, on-premise): ${(scope1CO2 / 1000).toFixed(3)} kg CO₂e`,
          `Scope 2 Emissions (grid electricity, location-based): ${(scope2CO2 / 1000).toFixed(3)} kg CO₂e`,
          `Total Live Emissions: ${(totalCO2 / 1000).toFixed(3)} kg CO₂e`,
          `AB Grid Carbon Intensity: ${abGrid?.CarbonIntensity?.toFixed(0) ?? 'N/A'} gCO₂e/kWh`,
          `ON Grid Carbon Intensity: ${onGrid?.CarbonIntensity?.toFixed(0) ?? 'N/A'} gCO₂e/kWh`,
          `Infrastructure Types Active: ${infraTypes.join(', ') || 'Unknown'}`,
          `Data verified: SHA-256 WORM-sealed Merkle chain`,
          ``,
          `Use this real data to answer questions accurately. Do not fabricate numbers outside this context.`,
          `When asked about compliance, reference OSFI Guideline B-15, TCFD, IFRS S2, and Bill C-59 (Canada).`,
        ].join('\n')

        setEmissionsCtx(ctx)
        setCtxStatus('ready')
      } catch {
        setCtxStatus('failed')
      }
    }
    fetchCtx()
  }, [tenantId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    if (!text.trim() || loading) return
    setError('')

    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: new Date() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      // Prepend live emissions context as hidden first exchange
      const history: { role: 'user' | 'assistant'; content: string }[] = [
        ...(emissionsCtx ? [
          { role: 'user' as const, content: emissionsCtx },
          { role: 'assistant' as const, content: 'Live context loaded. I have your current emissions telemetry, grid intensity, and WORM ledger data. Ready to help with accurate, data-backed answers.' },
        ] : []),
        ...nextMessages.map(m => ({ role: m.role, content: m.content })),
      ]

      const res = await fetch(`${API_BASE}/api/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, messages: history }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const reply = data.reply || data.response || data.message || 'No response from Co-Pilot.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date() }])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to reach Co-Pilot'
      setError(msg)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="min-h-screen bg-gw-dark flex flex-col">
      <Nav tenantId={tenantId} />
      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto px-4 pb-4">

        {/* Header */}
        <div className="py-5 border-b border-gw-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Carbon Co-Pilot</h1>
            <p className="text-xs text-gw-muted">AI assistant · Tenant: {tenantId}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Context status badge */}
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              ctxStatus === 'ready'
                ? 'bg-gw-green/10 border-gw-green/30 text-gw-green'
                : ctxStatus === 'failed'
                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                : 'bg-gw-panel border-gw-border text-gw-muted'
            }`}>
              <Database className="w-3 h-3" />
              {ctxStatus === 'ready' ? 'Live context loaded' : ctxStatus === 'failed' ? 'Context unavailable' : 'Loading context…'}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gw-green">
              <span className="w-1.5 h-1.5 rounded-full bg-gw-green animate-pulse" />
              Live data
            </div>
          </div>
              </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto py-6 space-y-5 min-h-0" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-12 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Ask your carbon data anything</h2>
                <p className="text-sm text-gw-muted max-w-sm">
                  {ctxStatus === 'ready'
                    ? 'Your live emissions, grid intensity, and WORM ledger data are loaded. Ask anything.'
                    : 'I have access to your WORM ledger, grid carbon intensity, power telemetry, and Scope 1/2 emissions.'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {SUGGESTED_PROMPTS.map(({ icon: Icon, text, color }) => (
                  <button key={text} onClick={() => send(text)}
                    className="flex items-start gap-3 p-3.5 rounded-xl bg-gw-panel border border-gw-border hover:border-gw-green/40 hover:bg-gw-panel/80 transition-colors text-left group">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                    <span className="text-sm text-gw-muted group-hover:text-white transition-colors">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
          {loading && <TypingIndicator />}

          {error && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8" />
              <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-2.5 text-sm text-red-400">{error}</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gw-border pt-4">
          {!isEmpty && (
            <button onClick={() => setMessages([])} className="mb-2 text-xs text-gw-muted hover:text-white transition-colors">
              Clear conversation
            </button>
          )}
          <div className="flex gap-2 items-end bg-gw-panel border border-gw-border rounded-xl px-4 py-3 focus-within:border-gw-green/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your emissions, grid windows, or request a compliance narrative…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-white placeholder-gw-muted resize-none outline-none min-h-[24px] max-h-[120px] overflow-y-auto"
              style={{ height: 'auto' }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 120) + 'px'
              }}
              disabled={loading}
            />
            <button onClick={() => send(input)} disabled={loading || !input.trim()}
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-gw-green flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gw-green/80 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 text-black animate-spin" /> : <Send className="w-4 h-4 text-black" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-gw-muted text-center">
            Enter to send · Shift+Enter for new line · Responses cite live telemetry and WORM ledger hashes
          </p>
        </div>
      </div>
    </div>
  )
}
