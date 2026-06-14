'use client'
// components/Nav.tsx — DARK THEME (matches /auth, /incidents, /compliance)
// No environment switcher.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/monitor',    label: 'Monitor'    },
  { href: '/incidents',  label: 'Incidents'  },
  { href: '/settings',   label: 'Settings'   },
  { href: '/compliance', label: 'Compliance' },
  { href: '/calendar',   label: 'Calendar'   },
  { href: '/copilot',    label: 'Co-Pilot'   },
]

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
                 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com'

interface NavProps {
  tenantId?: string
}

export default function Nav({ tenantId: propTenantId }: NavProps = {}) {
  const pathname = usePathname()
  const [tenantId, setTenantId] = useState<string>(propTenantId || 'GW-NIMBL-AEB47A92')
  const [tenantName, setTenantName] = useState<string>('')

  useEffect(() => {
    if (propTenantId) { setTenantId(propTenantId); return }
    if (typeof window === 'undefined') return
    const fromUrl = new URLSearchParams(window.location.search).get('tenant_id')
    const fromLs  = window.localStorage.getItem('gw_tenant_id')
    setTenantId(fromUrl || fromLs || 'GW-NIMBL-AEB47A92')
  }, [propTenantId])

  useEffect(() => {
    if (!tenantId) return
    fetch(`${API_BASE}/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.OrgName) setTenantName(data.OrgName) })
      .catch(() => {})
  }, [tenantId])

  return (
    <header className="bg-gw-panel border-b border-gw-border">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-6">
        <Link href={`/monitor?tenant_id=${tenantId}`} className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-gw-green" />
          <span className="text-base font-bold text-white tracking-wide">GridWitness</span>
          {tenantName && (
            <span className="ml-2 text-xs text-gw-muted hidden md:inline">· {tenantName}</span>
          )}
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href ||
              (pathname && pathname.startsWith(item.href + '/'))
            return (
              <Link
                key={item.href}
                href={`${item.href}?tenant_id=${tenantId}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gw-green/10 text-gw-green border border-gw-green/30'
                    : 'text-gw-muted hover:text-white hover:bg-gw-dark border border-transparent'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gw-muted hidden lg:inline">{tenantId}</span>
          <Link
            href="/onboarding"
            className="text-xs border border-gw-border text-gw-muted px-2.5 py-1 rounded hover:border-gw-green hover:text-gw-green transition-colors hidden md:inline-flex items-center gap-1"
          >
            + New Tenant
          </Link>
          <a href="/auth/logout" className="text-sm text-gw-green hover:underline">
            Sign out
          </a>
        </div>
      </div>
    </header>
  )
}
