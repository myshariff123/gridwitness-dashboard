/* ============================================================================
 * components/Nav.tsx — SIMPLIFIED (no env switcher)
 * ============================================================================
 * What's NOT here anymore:
 *   - No EnvironmentSwitcher import or usage
 *   - No "STAGING" badge next to logo
 *   - No env-changed event listeners
 *
 * What stays:
 *   - GridWitness logo / brand
 *   - Tenant name (fetched from API if available)
 *   - Tab navigation: Monitor / Incidents / Settings / Compliance
 *   - Tenant ID display
 *   - Sign out link
 * ============================================================================ */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { href: '/monitor',    label: 'Monitor'    },
  { href: '/incidents',  label: 'Incidents'  },
  { href: '/settings',   label: 'Settings'   },
  { href: '/compliance', label: 'Compliance' },
];

interface NavProps {
  tenantId?: string;
}

export default function Nav({ tenantId: propTenantId }: NavProps = {}) {
  const pathname = usePathname();
  const [tenantId, setTenantId] = useState<string>(propTenantId || 'GW-NIMBL-AEB47A92');
  const [tenantName, setTenantName] = useState<string>('');

  useEffect(() => {
    if (propTenantId) {
      setTenantId(propTenantId);
      return;
    }
    if (typeof window === 'undefined') return;
    const url = new URLSearchParams(window.location.search);
    const fromUrl = url.get('tenant_id');
    const fromLs  = window.localStorage.getItem('gw_tenant_id');
    setTenantId(fromUrl || fromLs || 'GW-NIMBL-AEB47A92');
  }, [propTenantId]);

  useEffect(() => {
    if (!tenantId) return;
    fetch(`https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.OrgName) setTenantName(data.OrgName); })
      .catch(() => {});
  }, [tenantId]);

  return (
    <header className="bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Link href={`/monitor?tenant_id=${tenantId}`} className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">GridWitness</span>
          </Link>
          {tenantName && (
            <>
              <div className="hidden md:block h-6 border-l border-gray-300" />
              <span className="text-sm text-gray-600">{tenantName}</span>
            </>
          )}
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || (pathname && pathname.startsWith(item.href + '/'));
            return (
              <Link
                key={item.href}
                href={`${item.href}?tenant_id=${tenantId}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-500 hidden lg:inline">{tenantId}</span>
          <Link href="/auth" className="text-sm text-blue-600 hover:underline">
            Sign out
          </Link>
        </div>
      </div>
    </header>
  );
}
