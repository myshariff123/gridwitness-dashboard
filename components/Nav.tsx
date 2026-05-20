/* ============================================================================
 * components/Nav.tsx — FINAL with dynamic env label
 * ============================================================================
 * Changes from prior version:
 *   - "STAGING" badge next to logo is now DYNAMIC — reflects current active env
 *   - Listens to localStorage changes (when EnvironmentSwitcher updates env)
 *   - Listens to a custom 'gw-env-changed' event for same-tab updates
 *   - Color of badge changes based on env (production=green, staging=amber,
 *     others=indigo)
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

interface NavProps {
  tenantId?: string;
}

function envBadgeColor(env: string): string {
  if (env === 'production' || env === 'live') return 'bg-green-100 text-green-800';
  if (env === 'staging' || env === 'stage')   return 'bg-amber-100 text-amber-800';
  if (env === 'qa' || env === 'test')         return 'bg-blue-100  text-blue-800';
  return 'bg-indigo-100 text-indigo-800';
}

export default function Nav({ tenantId: propTenantId }: NavProps = {}) {
  const pathname = usePathname();
  const [tenantId, setTenantId] = useState<string>(propTenantId || 'GW-NIMBL-AEB47A92');
  const [tenantName, setTenantName] = useState<string>('');
  const [activeEnv, setActiveEnv] = useState<string>('production');

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
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('gw_active_env');
    if (stored) setActiveEnv(stored);

    // Listen for env changes from EnvironmentSwitcher (other components in same tab)
    const onEnvChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.env) setActiveEnv(detail.env);
    };
    // Listen for cross-tab localStorage changes
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gw_active_env' && e.newValue) setActiveEnv(e.newValue);
    };
    window.addEventListener('gw-env-changed', onEnvChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('gw-env-changed', onEnvChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${envBadgeColor(activeEnv)}`}>
              {activeEnv.toUpperCase()}
            </span>
          </Link>

          <div className="hidden md:block h-6 border-l border-gray-300" />

          <EnvironmentSwitcher
            tenantId={tenantId}
            tenantName={tenantName || undefined}
            onChange={(env) => {
              setActiveEnv(env);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('gw-env-changed', { detail: { env } }));
              }
            }}
          />
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
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
