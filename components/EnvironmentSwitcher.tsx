/* ============================================================================
 * components/EnvironmentSwitcher.tsx
 * ============================================================================
 * Drop into the top nav. Shows the currently active environment, lets users
 * switch between environments, and exposes a "+ New" button to create one.
 * The selection is mirrored to localStorage so other pages can read it
 * (Monitor, Incidents, Compliance) and filter their views accordingly.
 *
 * Usage in Nav.tsx:
 *   import EnvironmentSwitcher from '@/components/EnvironmentSwitcher';
 *   ...
 *   <EnvironmentSwitcher tenantId={tenantId} tenantName={tenantName} />
 * ============================================================================ */

'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com';

interface Environment {
  DisplayName: string;
  ColorHex:    string;
  IsDefault:   boolean;
  CreatedAt:   string;
}

interface Props {
  tenantId:   string;
  tenantName?: string;
  onChange?:  (envName: string) => void;
}

export default function EnvironmentSwitcher({ tenantId, tenantName, onChange }: Props) {
  const [envs,    setEnvs]    = useState<Record<string, Environment>>({});
  const [active,  setActive]  = useState<string>('production');
  const [open,    setOpen]    = useState(false);
  const [loaded,  setLoaded]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setEnvs(data.environments || {});
      setActive(data.active_environment || 'production');
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('gw_active_env', data.active_environment || 'production');
      }
      onChange?.(data.active_environment || 'production');
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }, [tenantId, onChange]);

  useEffect(() => { load(); }, [load]);

  async function switchTo(envName: string) {
    setActive(envName);
    setOpen(false);
    if (typeof window !== 'undefined') window.localStorage.setItem('gw_active_env', envName);
    onChange?.(envName);
    try {
      await fetch(`${API_BASE}/api/tenants/${tenantId}/environments/${envName}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activate: true }),
      });
    } catch { /* still UI-active for this session */ }
  }

  async function createNew() {
    setOpen(false);
    const display = prompt('Display name for new environment (e.g. "Staging"):');
    if (!display) return;
    const name = display.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!name) return;
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, display_name: display }),
    });
    if (r.ok) load();
    else {
      const data = await r.json();
      alert(data.error || 'Failed to create environment');
    }
  }

  // Hide gracefully when API not available
  if (loaded && error) return null;
  if (!loaded) return <div className="text-sm text-gray-400">Loading env…</div>;

  const activeEnv = envs[active];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border hover:bg-gray-50 transition-all"
      >
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: activeEnv?.ColorHex || '#10b981' }}
        />
        <span className="text-sm font-medium text-gray-700">
          {tenantName && <span className="text-gray-400 mr-2">{tenantName} ·</span>}
          {activeEnv?.DisplayName || active}
        </span>
        <span className="text-gray-400 text-xs">▼</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 w-64 bg-white border rounded-md shadow-lg z-50">
            <div className="p-2 border-b text-xs font-semibold text-gray-500 uppercase">
              Switch Environment
            </div>
            <div className="max-h-72 overflow-y-auto">
              {Object.entries(envs).map(([name, env]) => (
                <button
                  key={name}
                  onClick={() => switchTo(name)}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 ${
                    active === name ? 'bg-blue-50' : ''
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: env.ColorHex }}
                  />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-gray-900">{env.DisplayName}</div>
                    <div className="text-xs text-gray-500 font-mono">{name}</div>
                  </div>
                  {active === name && (
                    <span className="text-xs text-blue-600 font-semibold">ACTIVE</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={createNew}
              className="w-full p-2 border-t text-sm text-blue-600 hover:bg-gray-50"
            >
              + Create New Environment
            </button>
          </div>
        </>
      )}
    </div>
  );
}
