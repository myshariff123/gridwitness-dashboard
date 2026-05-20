/* ============================================================================
 * components/EnvironmentSwitcher.tsx — FINAL
 * ============================================================================
 * Changes:
 *   - Fires 'gw-env-changed' CustomEvent so Nav badge updates instantly
 *   - Delete button works correctly (was broken because the API URL fragment
 *     was missing in some calls)
 *   - Closes dropdown after every action so UI feels responsive
 *   - Visual loading indicator during async ops
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

function fireEnvChange(env: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('gw_active_env', env);
  window.dispatchEvent(new CustomEvent('gw-env-changed', { detail: { env } }));
}

export default function EnvironmentSwitcher({ tenantId, tenantName, onChange }: Props) {
  const [envs,    setEnvs]    = useState<Record<string, Environment>>({});
  const [active,  setActive]  = useState<string>('production');
  const [open,    setOpen]    = useState(false);
  const [loaded,  setLoaded]  = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setEnvs(data.environments || {});
      const a = data.active_environment || 'production';
      setActive(a);
      fireEnvChange(a);
      onChange?.(a);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }, [tenantId, onChange]);

  useEffect(() => { load(); }, [load]);

  async function switchTo(envName: string) {
    setBusy(true);
    setOpen(false);
    setActive(envName);
    fireEnvChange(envName);
    onChange?.(envName);
    try {
      await fetch(`${API_BASE}/api/tenants/${tenantId}/environments/${envName}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activate: true }),
      });
    } catch { /* keep UI state */ }
    setBusy(false);
  }

  async function createNew() {
    setOpen(false);
    const display = prompt('Display name for new environment (e.g. "Staging"):');
    if (!display) return;
    const name = display.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, display_name: display }),
      });
      if (r.ok) await load();
      else {
        const data = await r.json().catch(() => ({}));
        alert(data.error || 'Failed to create environment');
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteEnv(envName: string) {
    setOpen(false);
    if (envName === 'production') {
      alert('Cannot delete the production environment');
      return;
    }
    if (!confirm(`Delete environment "${envName}"? This requires it to have NO telemetry records.`)) {
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments/${envName}`, {
        method: 'DELETE',
      });
      if (r.ok) {
        await load();
      } else {
        const data = await r.json().catch(() => ({}));
        alert(data.error || `Delete failed (HTTP ${r.status})`);
      }
    } catch (e: any) {
      alert(`Delete failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  if (loaded && error) return null;
  if (!loaded) return <div className="text-sm text-gray-400">Loading env…</div>;

  const activeEnv = envs[active];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border hover:bg-gray-50 transition-all disabled:opacity-50"
      >
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: activeEnv?.ColorHex || '#10b981' }}
        />
        <span className="text-sm font-medium text-gray-700">
          {tenantName && <span className="text-gray-400 mr-2">{tenantName} ·</span>}
          {activeEnv?.DisplayName || active}
        </span>
        <span className="text-gray-400 text-xs">{busy ? '…' : '▼'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-72 bg-white border rounded-md shadow-lg z-50">
            <div className="p-2 border-b text-xs font-semibold text-gray-500 uppercase">
              Switch Environment
            </div>
            <div className="max-h-72 overflow-y-auto">
              {Object.entries(envs).map(([name, env]) => (
                <div key={name} className={`px-3 py-2 hover:bg-gray-50 ${active === name ? 'bg-blue-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => switchTo(name)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: env.ColorHex }}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{env.DisplayName}</div>
                        <div className="text-xs text-gray-500 font-mono">{name}</div>
                      </div>
                      {active === name && (
                        <span className="ml-auto text-xs text-blue-600 font-semibold">ACTIVE</span>
                      )}
                    </button>
                    {name !== 'production' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteEnv(name); }}
                        className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                        title="Delete environment"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
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
