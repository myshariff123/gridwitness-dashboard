'use client'
import Link  from 'next/link'
import { usePathname } from 'next/navigation'
import { Shield, LogOut, AlertTriangle } from 'lucide-react'

interface Props {
  tenantId: string
}

const TABS = [
  { href: '/monitor',    label: 'Monitor'    },
  { href: '/incidents',  label: 'Incidents'  },
  { href: '/settings',   label: 'Settings'   },
  { href: '/compliance', label: 'Compliance' },
]

export default function Nav({ tenantId }: Props) {
  const pathname = usePathname()

  return (
    <nav className="bg-gw-panel border-b border-gw-border">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gw-green" />
            <span className="font-bold text-white">GridWitness</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gw-green/10 text-gw-green border border-gw-green/30">
              STAGING
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gw-green/10 text-gw-green border border-gw-green/30">
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-4">
            {TABS.map(t => {
              const active = pathname.startsWith(t.href)
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`text-sm transition-colors ${
                    active ? 'text-gw-green font-medium' : 'text-gw-muted hover:text-white'
                  }`}
                >
                  {t.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gw-muted font-mono">{tenantId}</span>
          <Link href="/auth"
            className="flex items-center gap-1 text-xs text-gw-muted hover:text-gw-green transition-colors">
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </Link>
        </div>
      </div>
    </nav>
  )
}
