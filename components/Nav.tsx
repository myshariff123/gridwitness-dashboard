/* ============================================================================
 * components/Nav.tsx
 * ============================================================================
 * Updated top navigation. Includes:
 *   - GridWitness logo / title
 *   - Environment badge (STAGING/LIVE) — now clickable via EnvironmentSwitcher
 *   - Customer name + tenant ID
 *   - Section tabs (Monitor, Incidents, Settings, Compliance)
 *   - Sign out
 *
 * Replaces existing components/Nav.tsx in gridwitness-dashboard repo.
 * ============================================================================ */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import EnvironmentSwitcher from './EnvironmentSwitcher';

const NAV_ITEMS = [
  { href: '/monitor',    label: 'Monitor'    },
  { href: '/incidents',  label: 'Incidents'  },
  { href: '/settings',   label: 'Settings'   },
  { href: '/compliance', label: 'Compliance' },
];

export default function Nav() {
  const pathname = usePathname();
  const [tenantId,   setTenantId]   = useState<string>('GW-NIMBL-AEB47A92');
  const [tenantName, setTenantName] = useState<string>('');

  // Resolve tenant ID and name from URL or localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URLSearchParams(window.location.search);
    const fromUrl = url.get('tenant_id');
    const fromLs  = window.localStorage.getItem('gw_tenant_id');
    const tid = fromUrl || fromLs || 'GW-NIMBL-AEB47A92';
    setTenantId(tid);

    // Try to fetch org name (best-effort)
    fetch(`https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com/api/tenants/${tid}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.OrgName) setTenantName(data.OrgName); })
      .catch(() => {});
  }, []);

  // Detect environment label (STAGING vs LIVE) from API URL
  const apiUrl = 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com';
  const envLabel = apiUrl.includes('staging') ? 'STAGING' : 'LIVE';

  return (
    <header className="bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-6">

        {/* Left: brand + active env + customer */}
        <div className="flex items-center gap-4">
          <Link href="/monitor" className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">GridWitness</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              envLabel === 'LIVE'
                ? 'bg-green-100 text-green-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {envLabel}
            </span>
          </Link>

          <div className="hidden md:block h-6 border-l border-gray-300" />

          {/* Environment switcher */}
          <EnvironmentSwitcher
            tenantId={tenantId}
            tenantName={tenantName || undefined}
          />
        </div>

        {/* Middle: nav tabs */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href ||
                             pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={`${item.href}?tenant_id=${tenantId}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: tenant + sign out */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-500 hidden lg:inline">{tenantId}</span>
          <Link
            href="/auth"
            className="text-sm text-blue-600 hover:underline"
          >
            Sign out
          </Link>
        </div>

      </div>
    </header>
  );
}
