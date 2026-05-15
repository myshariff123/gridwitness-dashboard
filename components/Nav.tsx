'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Settings, FileText, Shield, LogOut } from 'lucide-react'

const links = [
  { href: '/monitor',    label: 'Monitor',    icon: Activity },
  { href: '/settings',   label: 'Settings',   icon: Settings },
  { href: '/compliance', label: 'Compliance', icon: FileText },
]

export default function Nav({ tenantId }: { tenantId?: string }) {
  const path = usePathname()

  return (
    <nav className="border-b border-gw-border bg-gw-panel sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-gw-green" />
          <span className="font-bold text-white tracking-wide">GridWitness</span>
          <span className="hidden sm:inline text-xs text-gw-muted border border-gw-border rounded px-2 py-0.5">
            STAGING
          </span>
          {/* Live indicator */}
          <span className="flex items-center gap-1.5 text-xs text-gw-green">
            <span className="w-1.5 h-1.5 rounded-full bg-gw-green gw-pulse" />
            LIVE
          </span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors
                ${path === href
                  ? 'bg-gw-green/10 text-gw-green border border-gw-green/30'
                  : 'text-gw-muted hover:text-white hover:bg-gw-border/50'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>

        {/* Tenant ID + logout */}
        <div className="flex items-center gap-3 text-xs text-gw-muted">
          {tenantId && (
            <span className="hidden md:block font-mono">{tenantId}</span>
          )}
          <Link href="/auth" className="flex items-center gap-1 hover:text-white transition-colors">
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
