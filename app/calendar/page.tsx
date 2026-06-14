'use client'
import { useState, useEffect, useCallback } from 'react'
import Nav from '@/components/Nav'
import {
  Calendar, Clock, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  FileText, Plus, Bell, ChevronRight, Filter, Download,
} from 'lucide-react'
import { toCsv, downloadCsv, tsFilename } from '@/lib/csv'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

// ─── Types ────────────────────────────────────────────────────────────────

interface Deadline {
  DeadlineID:   string
  Framework:    string
  Title:        string
  Description:  string
  DueDate:      string
  Priority:     string
  Preset:       boolean
  Custom?:      boolean
  Status:       'UPCOMING' | 'DUE_SOON' | 'OVERDUE' | 'FILED' | 'WAIVED'
  FiledAt?:     string
  Notes?:       string
  DaysRemaining:number
  FrameworkMeta:{ label: string; color: string; mandatory: boolean }
  ReminderDays: number[]
}

interface Summary {
  total: number; upcoming: number; overdue: number; filed: number
}

type FilterMode = 'all' | 'upcoming' | 'overdue' | 'filed'

// ─── Style helpers ────────────────────────────────────────────────────────

const FW_COLORS: Record<string, string> = {
  green:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  blue:   'bg-blue-500/10   text-blue-400    border-blue-500/30',
  purple: 'bg-purple-500/10 text-purple-400  border-purple-500/30',
  teal:   'bg-teal-500/10   text-teal-400    border-teal-500/30',
  indigo: 'bg-indigo-500/10 text-indigo-400  border-indigo-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-400  border-yellow-500/30',
  gray:   'bg-gray-500/10   text-gray-400    border-gray-500/30',
}

function fwBadge(fw: string, meta: Deadline['FrameworkMeta']) {
  const cls = FW_COLORS[meta.color] || FW_COLORS.gray
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>
      {meta.label}
    </span>
  )
}

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  UPCOMING: { label: 'Upcoming',  icon: <Clock className="w-3.5 h-3.5" />,        cls: 'text-blue-400   border-blue-500/30   bg-blue-500/10'   },
  DUE_SOON: { label: 'Due Soon',  icon: <AlertTriangle className="w-3.5 h-3.5" />, cls: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  OVERDUE:  { label: 'Overdue',   icon: <XCircle className="w-3.5 h-3.5" />,       cls: 'text-red-400    border-red-500/30    bg-red-500/10'    },
  FILED:    { label: 'Filed',     icon: <CheckCircle className="w-3.5 h-3.5" />,   cls: 'text-gw-green   border-gw-green/30   bg-gw-green/10'   },
  WAIVED:   { label: 'Waived',    icon: <CheckCircle className="w-3.5 h-3.5" />,   cls: 'text-gw-muted   border-gw-border                       ' },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.UPCOMING
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${m.cls}`}>
      {m.icon}{m.label}
    </span>
  )
}

function daysLabel(days: number): string {
  if (days < 0)  return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days <= 30) return `${days}d remaining`
  const weeks = Math.floor(days / 7)
  if (days < 60) return `${weeks}w remaining`
  const months = Math.floor(days / 30)
  return `${months}mo remaining`
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [tenantId,   setTenantId]   = useState('GW-NIMBL-AEB47A92')
  const [deadlines,  setDeadlines]  = useState<Deadline[]>([])
  const [summary,    setSummary]    = useState<Summary>({ total:0, upcoming:0, overdue:0, filed:0 })
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState<FilterMode>('all')
  const [showAdd,    setShowAdd]    = useState(false)
  const [markingId,  setMarkingId]  = useState<string | null>(null)
  const [lastFetch,  setLastFetch]  = useState<Date>(new Date())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = new URLSearchParams(window.location.search)
    setTenantId(q.get('tenant_id') || window.localStorage.getItem('gw_tenant_id') || 'GW-NIMBL-AEB47A92')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/calendar`, { cache: 'no-store' })
      if (r.ok) {
        const d = await r.json()
        setDeadlines(d.deadlines || [])
        setSummary(d.summary || { total:0, upcoming:0, overdue:0, filed:0 })
        setLastFetch(new Date())
      }
    } catch (e) { console.error('Calendar load failed:', e) }
    finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  const markFiled = async (id: string) => {
    setMarkingId(id)
    try {
      await fetch(`${API_BASE}/api/tenants/${tenantId}/calendar/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FILED' }),
      })
      await load()
    } finally { setMarkingId(null) }
  }

  const markWaived = async (id: string) => {
    setMarkingId(id)
    try {
      await fetch(`${API_BASE}/api/tenants/${tenantId}/calendar/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'WAIVED' }),
      })
      await load()
    } finally { setMarkingId(null) }
  }

  const exportCsv = () => {
    const csv = toCsv(deadlines, [
      { key: 'DeadlineID',   label: 'ID' },
      { key: 'Framework',    label: 'Framework' },
      { key: 'Title',        label: 'Title' },
      { key: 'DueDate',      label: 'Due Date' },
      { key: 'Status',       label: 'Status' },
      { key: 'DaysRemaining',label: 'Days Remaining' },
      { key: 'Priority',     label: 'Priority' },
      { key: 'FiledAt',      label: 'Filed At' },
      { key: 'Notes',        label: 'Notes' },
    ])
    downloadCsv(tsFilename('filing-calendar', tenantId), csv)
  }

  const filtered = deadlines.filter(d => {
    if (filter === 'upcoming') return d.Status === 'UPCOMING' || d.Status === 'DUE_SOON'
    if (filter === 'overdue')  return d.Status === 'OVERDUE'
    if (filter === 'filed')    return d.Status === 'FILED' || d.Status === 'WAIVED'
    return true
  })

  return (
    <div className="min-h-screen bg-gw-dark">
      <Nav tenantId={tenantId} />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gw-green" />
              Regulatory Filing Calendar
            </h1>
            <p className="text-sm text-gw-muted mt-1">
              GHGRP · OSFI B-15 · TCFD · CDP · IFRS S2 · Carbon Levy · Custom deadlines
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="flex items-center gap-1.5 text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button onClick={exportCsv} disabled={deadlines.length === 0}
              className="flex items-center gap-1.5 text-xs border border-gw-border text-gw-muted px-3 py-1.5 rounded hover:border-gw-green hover:text-gw-green transition-colors disabled:opacity-50">
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs border border-gw-green text-gw-green px-3 py-1.5 rounded hover:bg-gw-green/10 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Add Deadline
            </button>
          </div>
        </div>

        {/* Summary KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',    value: summary.total,    color: 'text-white' },
            { label: 'Upcoming', value: summary.upcoming,  color: 'text-blue-400' },
            { label: 'Overdue',  value: summary.overdue,   color: summary.overdue > 0 ? 'text-red-400' : 'text-gw-muted' },
            { label: 'Filed',    value: summary.filed,     color: 'text-gw-green' },
          ].map(k => (
            <div key={k.label} className="bg-gw-panel border border-gw-border rounded-xl p-4">
              <div className="text-xs text-gw-muted">{k.label}</div>
              <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gw-muted" />
          {(['all', 'upcoming', 'overdue', 'filed'] as FilterMode[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors capitalize ${
                filter === f
                  ? 'border-gw-green bg-gw-green/10 text-gw-green'
                  : 'border-gw-border text-gw-muted hover:border-gw-green/40'
              }`}>{f}</button>
          ))}
          <span className="ml-auto text-xs text-gw-muted">
            Updated {lastFetch.toLocaleTimeString('en-CA', { hour12: false })}
          </span>
        </div>

        {/* Deadline cards */}
        {loading && filtered.length === 0 && (
          <div className="bg-gw-panel border border-gw-border rounded-xl p-10 text-center text-gw-muted text-sm">
            Loading calendar...
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="bg-gw-panel border border-gw-green/20 rounded-xl p-10 text-center">
            <CheckCircle className="w-8 h-8 text-gw-green mx-auto mb-3" />
            <div className="text-white font-medium">No deadlines in this view</div>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map(d => (
            <DeadlineCard
              key={d.DeadlineID}
              deadline={d}
              marking={markingId === d.DeadlineID}
              onFiled={() => markFiled(d.DeadlineID)}
              onWaived={() => markWaived(d.DeadlineID)}
            />
          ))}
        </div>
      </div>

      {/* Add custom deadline modal */}
      {showAdd && (
        <AddDeadlineModal
          tenantId={tenantId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

// ─── Deadline Card ────────────────────────────────────────────────────────

function DeadlineCard({
  deadline: d, marking, onFiled, onWaived,
}: {
  deadline: Deadline
  marking: boolean
  onFiled: () => void
  onWaived: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isActionable = d.Status !== 'FILED' && d.Status !== 'WAIVED'
  const borderCls = {
    OVERDUE:  'border-red-500/30',
    DUE_SOON: 'border-orange-500/30',
    FILED:    'border-gw-green/20',
    WAIVED:   'border-gw-border/50',
    UPCOMING: 'border-gw-border',
  }[d.Status] ?? 'border-gw-border'

  return (
    <div className={`bg-gw-panel border rounded-xl ${borderCls} transition-colors`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <FileText className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
              d.Status === 'OVERDUE' ? 'text-red-400' :
              d.Status === 'DUE_SOON' ? 'text-orange-400' :
              d.Status === 'FILED' ? 'text-gw-green' : 'text-gw-muted'
            }`} />
            <div className="min-w-0">
              <div className="text-white font-medium text-sm leading-tight">{d.Title}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {fwBadge(d.Framework, d.FrameworkMeta)}
                <StatusBadge status={d.Status} />
                {d.Priority === 'MANDATORY' && (
                  <span className="text-xs text-red-400 font-medium">Mandatory</span>
                )}
                {d.Custom && (
                  <span className="text-xs text-gw-muted">Custom</span>
                )}
              </div>
            </div>
          </div>

          {/* Right side: due date + days */}
          <div className="flex-shrink-0 text-right">
            <div className="text-white text-sm font-mono">
              {new Date(d.DueDate + 'T12:00:00').toLocaleDateString('en-CA', {
                month: 'short', day: 'numeric', year: 'numeric'
              })}
            </div>
            <div className={`text-xs mt-0.5 font-medium ${
              d.Status === 'OVERDUE' ? 'text-red-400' :
              d.Status === 'DUE_SOON' ? 'text-orange-400' :
              d.Status === 'FILED' ? 'text-gw-green' : 'text-gw-muted'
            }`}>
              {d.Status === 'FILED'
                ? `Filed ${d.FiledAt ? new Date(d.FiledAt).toLocaleDateString('en-CA') : ''}`
                : d.Status === 'WAIVED' ? 'Waived'
                : daysLabel(d.DaysRemaining)}
            </div>
          </div>
        </div>

        {/* Countdown bar for non-filed items */}
        {isActionable && (
          <div className="mt-3">
            <div className="h-1 bg-gw-border/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  d.Status === 'OVERDUE' ? 'bg-red-500 w-full' :
                  d.Status === 'DUE_SOON' ? 'bg-orange-400' : 'bg-blue-500/60'
                }`}
                style={{
                  width: d.Status === 'OVERDUE' ? '100%' :
                    `${Math.max(5, 100 - Math.min(d.DaysRemaining / 3.65, 100))}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {isActionable && (
              <>
                <button
                  onClick={onFiled}
                  disabled={marking}
                  className="flex items-center gap-1 text-xs border border-gw-green/40 text-gw-green px-2.5 py-1 rounded hover:bg-gw-green/10 transition-colors disabled:opacity-50">
                  <CheckCircle className="w-3 h-3" />
                  Mark Filed
                </button>
                <button
                  onClick={onWaived}
                  disabled={marking}
                  className="text-xs border border-gw-border text-gw-muted px-2.5 py-1 rounded hover:border-gw-border/80 transition-colors disabled:opacity-50">
                  Waive
                </button>
              </>
            )}
            <Bell className="w-3.5 h-3.5 text-gw-muted/60 ml-1" />
            <span className="text-xs text-gw-muted">
              Reminders: {d.ReminderDays.join('/')}{' '}d
            </span>
          </div>
          {d.Description && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-gw-muted hover:text-gw-green transition-colors flex items-center gap-1">
              {expanded ? 'Hide' : 'Details'}
              <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>

        {expanded && d.Description && (
          <div className="mt-3 pt-3 border-t border-gw-border text-xs text-gw-muted leading-relaxed">
            {d.Description}
            {d.Notes && (
              <div className="mt-2 text-white/70 italic">Note: {d.Notes}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Custom Deadline Modal ─────────────────────────────────────────────

function AddDeadlineModal({
  tenantId, onClose, onSaved,
}: {
  tenantId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title,    setTitle]    = useState('')
  const [dueDate,  setDueDate]  = useState('')
  const [desc,     setDesc]     = useState('')
  const [priority, setPriority] = useState('CUSTOM')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const save = async () => {
    if (!title.trim() || !dueDate) { setError('Title and due date are required.'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, due_date: dueDate, description: desc, priority }),
      })
      if (r.ok) { onSaved() }
      else { setError('Save failed. Please try again.') }
    } catch { setError('Network error.') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gw-panel border border-gw-border rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold flex items-center gap-2">
            <Plus className="w-4 h-4 text-gw-green" />
            Add Custom Deadline
          </h2>
          <button onClick={onClose} className="text-gw-muted hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gw-muted block mb-1">Title *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Board ESG Report Q3 2026"
              className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gw-green"
            />
          </div>
          <div>
            <label className="text-xs text-gw-muted block mb-1">Due Date *</label>
            <input
              type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gw-green"
            />
          </div>
          <div>
            <label className="text-xs text-gw-muted block mb-1">Description</label>
            <textarea
              value={desc} onChange={e => setDesc(e.target.value)} rows={3}
              placeholder="Optional context or instructions..."
              className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gw-green resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-gw-muted block mb-1">Priority</label>
            <select
              value={priority} onChange={e => setPriority(e.target.value)}
              className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gw-green">
              <option value="CUSTOM">Custom</option>
              <option value="MANDATORY">Mandatory</option>
              <option value="RECOMMENDED">Recommended</option>
            </select>
          </div>
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose}
            className="flex-1 text-sm border border-gw-border text-gw-muted px-4 py-2 rounded hover:border-gw-border/80 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 text-sm bg-gw-green text-gw-dark font-medium px-4 py-2 rounded hover:bg-gw-green/90 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Add Deadline'}
          </button>
        </div>
      </div>
    </div>
  )
}
