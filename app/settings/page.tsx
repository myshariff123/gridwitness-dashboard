/* ============================================================================
 * app/settings/page.tsx
 * ============================================================================
 * Complete drop-in replacement for the GridWitness dashboard settings page.
 *
 * Sections:
 *   1. Tenant Info  — read-only display of tenant ID and org name
 *   2. Environments — switch / create / delete environments (requires
 *                     ms-environments Lambda from DEPLOY_MULTI_ENV.sh; if
 *                     that Lambda is not deployed, this section gracefully
 *                     shows a notice instead of erroring)
 *   3. Grid Alert Thresholds — per-grid carbon, load, price thresholds with
 *                     persistent save (wired to gw-ms-thresholds-staging
 *                     Lambda which is already live)
 *   4. Notification Preferences — show SNS subscription status
 *   5. API Reference — read-only endpoint URLs for customer integration
 *
 * Single "Save All Settings" button at the top saves the editable sections
 * (currently: grid thresholds). It calls each section's save handler in turn
 * and reports a consolidated success/error result.
 *
 * Place this file at:
 *   gridwitness-dashboard/app/settings/page.tsx
 *
 * Dependencies: React 18+, Next.js 13+ app router, Tailwind CSS, TypeScript.
 * No additional npm packages required.
 * ============================================================================ */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com';

// ─── Types ────────────────────────────────────────────────────────────────
type ThresholdMetrics = { carbon: number; load: number; price: number };
type Thresholds       = Record<string, ThresholdMetrics>;
type Environment      = { DisplayName: string; ColorHex: string; IsDefault: boolean; CreatedAt: string };
type Tenant           = { TenantID: string; OrgName?: string; Status?: string; Tier?: string };
type ToastMsg         = { type: 'success' | 'error' | 'info'; text: string } | null;

// ─── Utility — read tenant_id from URL or localStorage ───────────────────
function useTenantId(): string {
  const [tenantId, setTenantId] = useState<string>('GW-NIMBL-AEB47A92');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URLSearchParams(window.location.search);
    const fromUrl = url.get('tenant_id');
    const fromLs  = window.localStorage.getItem('gw_tenant_id');
    setTenantId(fromUrl || fromLs || 'GW-NIMBL-AEB47A92');
  }, []);

  return tenantId;
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const tenantId = useTenantId();
  const [toast, setToast]     = useState<ToastMsg>(null);
  const [saving, setSaving]   = useState(false);

  // Refs to call save methods on child sections from a single "Save All" button
  const thresholdSaveRef = useRef<() => Promise<{ ok: boolean; msg: string }>>();

  async function handleSaveAll() {
    setSaving(true);
    setToast(null);

    const results: Array<{ section: string; ok: boolean; msg: string }> = [];

    if (thresholdSaveRef.current) {
      const r = await thresholdSaveRef.current();
      results.push({ section: 'Grid Thresholds', ...r });
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length === 0) {
      setToast({ type: 'success', text: `✓ All settings saved successfully.` });
    } else {
      setToast({
        type: 'error',
        text: `Save failed for ${failed.length} section(s): ${failed.map(f => f.section).join(', ')}`,
      });
    }
    setSaving(false);
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tenant: <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{tenantId}</code>
          </p>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className={`px-5 py-2.5 rounded-lg font-semibold transition-all ${
            saving
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
          }`}
        >
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>
      </div>

      {/* Global toast */}
      {toast && (
        <div className={`p-4 rounded-lg border ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          toast.type === 'error'   ? 'bg-red-50   border-red-200   text-red-800'   :
                                     'bg-blue-50  border-blue-200  text-blue-800'
        }`}>
          {toast.text}
        </div>
      )}

      <TenantInfoSection      tenantId={tenantId} />
      <EnvironmentSection     tenantId={tenantId} setToast={setToast} />
      <ThresholdSection       tenantId={tenantId} registerSave={(fn) => { thresholdSaveRef.current = fn; }} />
      <NotificationsSection   tenantId={tenantId} />
      <ApiReferenceSection    tenantId={tenantId} />
    </div>
  );
}

// ─── Section 1: Tenant Info ───────────────────────────────────────────────
function TenantInfoSection({ tenantId }: { tenantId: string }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => setTenant(data))
      .catch(() => setTenant({ TenantID: tenantId }))
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Tenant Information</h2>
      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="font-medium text-gray-500">Tenant ID</dt>
            <dd className="mt-1 font-mono text-gray-900">{tenant?.TenantID}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Organization Name</dt>
            <dd className="mt-1 text-gray-900">{tenant?.OrgName || '(not set)'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Status</dt>
            <dd className="mt-1 text-gray-900">{tenant?.Status || 'ACTIVE'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Subscription Tier</dt>
            <dd className="mt-1 text-gray-900">{tenant?.Tier || 'TIER_1_AUDIT'}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

// ─── Section 2: Environments (multi-env management) ───────────────────────
function EnvironmentSection({ tenantId, setToast }: { tenantId: string; setToast: (t: ToastMsg) => void }) {
  const [envs, setEnvs]       = useState<Record<string, Environment>>({});
  const [active, setActive]   = useState('production');
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments`);
      if (r.status === 404 || r.status === 403) {
        setAvailable(false);
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setEnvs(data.environments || {});
      setActive(data.active_environment || 'production');
      setAvailable(true);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('gw_active_env', data.active_environment || 'production');
      }
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  async function switchTo(envName: string) {
    setActive(envName);
    if (typeof window !== 'undefined') window.localStorage.setItem('gw_active_env', envName);
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments/${envName}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activate: true }),
    });
    if (r.ok) {
      setToast({ type: 'success', text: `✓ Switched active environment to "${envName}"` });
    } else {
      setToast({ type: 'error', text: 'Failed to switch environment' });
    }
  }

  async function createNew() {
    const display = prompt('Display name for the new environment (e.g. "QA Canada"):');
    if (!display) return;
    const name = display.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!name) { setToast({ type: 'error', text: 'Invalid name' }); return; }
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, display_name: display }),
    });
    if (r.ok) {
      setToast({ type: 'success', text: `✓ Environment "${display}" created` });
      load();
    } else {
      const data = await r.json();
      setToast({ type: 'error', text: data.error || 'Create failed' });
    }
  }

  async function deleteEnv(envName: string) {
    if (envName === 'production') {
      setToast({ type: 'error', text: 'Cannot delete the production environment' });
      return;
    }
    if (!confirm(`Permanently delete environment "${envName}"? This requires it to have NO telemetry records.`)) return;
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments/${envName}`, { method: 'DELETE' });
    if (r.ok) {
      setToast({ type: 'success', text: `✓ Deleted environment "${envName}"` });
      load();
    } else {
      const data = await r.json();
      setToast({ type: 'error', text: data.error || 'Delete failed' });
    }
  }

  if (!available) {
    return (
      <section className="bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Environments</h2>
        <p className="text-sm text-gray-500">
          Multi-environment management is not yet enabled for this tenant. Run
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded mx-1">DEPLOY_MULTI_ENV.sh</code>
          on the server to activate this feature.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Environments</h2>
        <button onClick={createNew}
          className="px-3 py-1.5 text-sm border border-dashed border-gray-400 rounded text-gray-600 hover:bg-gray-50">
          + New Environment
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Switch between environments to view telemetry and reports scoped to that environment only.
      </p>
      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-2">
          {Object.entries(envs).map(([name, env]) => (
            <div key={name}
              className={`flex justify-between items-center p-3 rounded-lg border-2 transition-all ${
                active === name ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: env.ColorHex }} />
                <div>
                  <div className="font-medium text-gray-900">{env.DisplayName}</div>
                  <div className="text-xs text-gray-500 font-mono">{name}</div>
                </div>
                {active === name && (
                  <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">ACTIVE</span>
                )}
              </div>
              <div className="flex gap-2">
                {active !== name && (
                  <button onClick={() => switchTo(name)}
                    className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded">
                    Activate
                  </button>
                )}
                {name !== 'production' && (
                  <button onClick={() => deleteEnv(name)}
                    className="px-3 py-1 text-sm border border-red-300 text-red-600 hover:bg-red-50 rounded">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Section 3: Grid Alert Thresholds ─────────────────────────────────────
function ThresholdSection({
  tenantId,
  registerSave,
}: {
  tenantId: string;
  registerSave: (fn: () => Promise<{ ok: boolean; msg: string }>) => void;
}) {
  const [thresholds,   setThresholds]   = useState<Thresholds | null>(null);
  const [original,     setOriginal]     = useState<Thresholds | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [updatedAt,    setUpdatedAt]    = useState<string | null>(null);
  const [localMsg,     setLocalMsg]     = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/thresholds`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setThresholds(data.grid_thresholds);
      setOriginal(JSON.parse(JSON.stringify(data.grid_thresholds)));
      setUsingDefaults(data.using_defaults);
      setUpdatedAt(data.updated_at);
    } catch (e: any) {
      setLocalMsg(`Failed to load: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tenantId]);

  // Register save handler with parent for "Save All" button
  useEffect(() => {
    registerSave(async () => {
      if (!thresholds) return { ok: false, msg: 'No thresholds loaded' };
      try {
        const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/thresholds`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid_thresholds: thresholds }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setUpdatedAt(data.updated_at);
        setOriginal(JSON.parse(JSON.stringify(thresholds)));
        setUsingDefaults(false);
        return { ok: true, msg: 'Saved' };
      } catch (e: any) {
        return { ok: false, msg: e.message };
      }
    });
  }, [thresholds, tenantId, registerSave]);

  function handleChange(grid: string, metric: keyof ThresholdMetrics, value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setThresholds(prev => prev ? { ...prev, [grid]: { ...prev[grid], [metric]: num } } : prev);
  }

  function handleResetThis() {
    if (original) setThresholds(JSON.parse(JSON.stringify(original)));
  }

  const isDirty = thresholds && original && JSON.stringify(thresholds) !== JSON.stringify(original);
  const grids   = ['AB', 'ON', 'BC', 'QC'] as const;
  const metrics: Array<[keyof ThresholdMetrics, string, string]> = [
    ['carbon', 'Carbon', 'gCO₂e/kWh'],
    ['load',   'Load',   '% capacity'],
    ['price',  'Price',  '$/MWh'],
  ];

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold">Grid Alert Thresholds</h2>
          <p className="text-sm text-gray-500">
            Breach any threshold to auto-open a WORM-sealed incident and trigger SNS notification.
          </p>
        </div>
        <span className="text-xs text-gray-500">
          {usingDefaults ? 'Using regulatory defaults' : updatedAt ? `Last saved: ${new Date(updatedAt).toLocaleString()}` : ''}
        </span>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : !thresholds ? (
        <div className="text-sm text-red-600">{localMsg || 'Unable to load thresholds'}</div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-2 text-left">Grid</th>
                {metrics.map(([k, label, unit]) => (
                  <th key={k} className="py-2 text-left">
                    {label} <span className="text-gray-400 font-normal">({unit})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grids.map(grid => (
                <tr key={grid} className="border-b">
                  <td className="py-3 font-medium">{grid}</td>
                  {metrics.map(([metric]) => (
                    <td key={metric} className="py-3 pr-4">
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        className="border rounded px-2 py-1 w-28 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={thresholds[grid]?.[metric] ?? ''}
                        onChange={e => handleChange(grid, metric, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {isDirty && (
            <div className="mt-4 flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <span className="text-sm text-yellow-800">You have unsaved threshold changes.</span>
              <button onClick={handleResetThis}
                className="text-sm px-3 py-1 border border-gray-300 rounded text-gray-700 hover:bg-white">
                Discard
              </button>
              <span className="text-xs text-gray-500 ml-auto">Click "Save All Settings" at the top to persist.</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Section 4: Notification Preferences ─────────────────────────────────
function NotificationsSection({ tenantId }: { tenantId: string }) {
  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Notification Preferences</h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
          <div>
            <div className="font-medium">Grid Stress Incident Alerts (SNS)</div>
            <div className="text-xs text-gray-500">Email when carbon/load/price thresholds are breached</div>
          </div>
          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">CONFIRMED</span>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
          <div>
            <div className="font-medium">Weekly Compliance Report Summary</div>
            <div className="text-xs text-gray-500">Email digest of records, incidents, emissions</div>
          </div>
          <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded">NOT CONFIGURED</span>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
          <div>
            <div className="font-medium">Webhook Integrations (Slack / Teams / PagerDuty)</div>
            <div className="text-xs text-gray-500">Real-time incident push to your channel</div>
          </div>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">COMING SOON</span>
        </div>
      </div>
    </section>
  );
}

// ─── Section 5: API Reference ─────────────────────────────────────────────
function ApiReferenceSection({ tenantId }: { tenantId: string }) {
  const endpoints = [
    { method: 'GET',  path: `/api/tenants/${tenantId}/thresholds`,   desc: 'Read alert thresholds' },
    { method: 'PUT',  path: `/api/tenants/${tenantId}/thresholds`,   desc: 'Update alert thresholds' },
    { method: 'GET',  path: `/api/tenants/${tenantId}/environments`, desc: 'List environments' },
    { method: 'GET',  path: `/api/incidents?tenant_id=${tenantId}`,  desc: 'List incidents' },
    { method: 'POST', path: '/api/reports/generate',                  desc: 'Generate compliance report' },
    { method: 'GET',  path: `/api/reports/latest?tenant_id=${tenantId}`, desc: 'Get latest report URL' },
  ];

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-4">API Reference</h2>
      <p className="text-sm text-gray-500 mb-4">
        Base URL: <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{API_BASE}</code>
      </p>
      <div className="space-y-1 text-sm font-mono">
        {endpoints.map((ep, i) => (
          <div key={i} className="flex gap-3 items-center py-2 border-b last:border-b-0">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              ep.method === 'GET'  ? 'bg-blue-100 text-blue-700' :
              ep.method === 'POST' ? 'bg-green-100 text-green-700' :
              ep.method === 'PUT'  ? 'bg-yellow-100 text-yellow-700' :
                                     'bg-red-100 text-red-700'
            }`}>{ep.method}</span>
            <span className="text-gray-700 flex-1">{ep.path}</span>
            <span className="text-xs text-gray-400 font-sans">{ep.desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
