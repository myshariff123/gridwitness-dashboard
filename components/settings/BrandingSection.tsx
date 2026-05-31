'use client'
// components/settings/BrandingSection.tsx — F10 Custom report branding

import { useEffect, useState } from 'react'
import { Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
                 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

export default function BrandingSection({ tenantId }: { tenantId: string }) {
  const [logoUrl, setLogoUrl] = useState('')
  const [disclaimer, setDisclaimer] = useState('')
  const [original, setOriginal] = useState({ logo: '', disclaimer: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const l = d?.BrandingLogoUrl || ''
        const dc = d?.BrandingDisclaimer || ''
        setLogoUrl(l); setDisclaimer(dc)
        setOriginal({ logo: l, disclaimer: dc })
      })
      .catch(() => {})
  }, [tenantId])

  const dirty = logoUrl !== original.logo || disclaimer !== original.disclaimer
  const isValidUrl = !logoUrl || /^https:\/\/.+\.(png|jpg|jpeg|svg)(\?.*)?$/i.test(logoUrl)

  async function save() {
    if (!isValidUrl) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BrandingLogoUrl: logoUrl,
          BrandingDisclaimer: disclaimer,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setOriginal({ logo: logoUrl, disclaimer })
      setMsg({ ok: true, text: '✓ Branding saved. Applies to next report.' })
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'save failed' })
    } finally { setBusy(false) }
  }

  return (
    <section className="bg-gw-panel border border-gw-border rounded-xl p-6">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
        <ImageIcon className="w-4 h-4 text-gw-green" />
        Report Branding
      </h2>
      <p className="text-sm text-gw-muted mb-4">
        Add your logo and disclaimer to compliance reports.
      </p>

      <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">
        Logo URL (PNG, JPG, or SVG · max 200KB)
      </label>
      <input
        type="text"
        value={logoUrl}
        onChange={e => setLogoUrl(e.target.value.trim())}
        placeholder="https://your-cdn.example.com/logo.png"
        className={`w-full bg-gw-dark border rounded px-3 py-2 text-sm font-mono mb-1 focus:outline-none ${
          !isValidUrl && logoUrl ? 'border-red-500' : 'border-gw-border focus:border-gw-green'
        }`}
      />
      {!isValidUrl && logoUrl && (
        <div className="text-xs text-red-400 mb-2">URL must be HTTPS and end with .png, .jpg, .jpeg, or .svg</div>
      )}
      <div className="text-xs text-gw-muted mb-4">
        Tip: Upload your logo to any public CDN (e.g. AWS S3, Cloudflare R2) and paste the URL here.
      </div>

      {logoUrl && isValidUrl && (
        <div className="bg-gw-dark border border-gw-border rounded-lg p-4 mb-4">
          <div className="text-xs text-gw-muted mb-2">Preview:</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Brand logo"
            className="max-h-16 max-w-xs"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

      <label className="block text-xs uppercase tracking-wider text-gw-muted mb-1">
        Footer Disclaimer (optional · appears on every page)
      </label>
      <textarea
        value={disclaimer}
        onChange={e => setDisclaimer(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Confidential — Internal Use Only. © 2026 Your Company Inc."
        className="w-full bg-gw-dark border border-gw-border rounded px-3 py-2 text-sm focus:border-gw-green focus:outline-none mb-2"
      />
      <div className="text-xs text-gw-muted mb-4">{disclaimer.length} / 500 characters</div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !dirty || !isValidUrl}
          className="bg-gw-green text-gw-dark px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save Branding'}
        </button>
        {dirty && (
          <span className="text-xs text-amber-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Unsaved changes
          </span>
        )}
        {msg && (
          <span className={`text-sm flex items-center gap-1 ${msg.ok ? 'text-gw-green' : 'text-red-400'}`}>
            {msg.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {msg.text}
          </span>
        )}
      </div>
    </section>
  )
}
