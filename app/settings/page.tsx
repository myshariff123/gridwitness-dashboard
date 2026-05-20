/* ============================================================================
 * app/settings/page.tsx — COMPLETE REWRITE (May 19, 2026)
 * ============================================================================
 * Matches the layout of /monitor, /incidents, /compliance pages:
 *   - <Nav /> at the top (consistent navigation, same env badge)
 *   - Same background, same content max-width, same card style
 *
 * Sections:
 *   1. Tenant Info
 *   2. Environments  (list, switch, create, delete)
 *   3. Device Assignment  (assign each device to an environment)
 *   4. Grid Alert Thresholds  (with working save)
 *   5. AWS Auto-Discovery Integration  (CloudFormation quick-link flow)
 *   6. Agent Installation Scripts  (Windows PS / Linux bash / K8s Helm)
 *   7. Notification Preferences
 *   8. API Reference
 * ============================================================================ */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Nav from '@/components/Nav';

const API_BASE = 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com';

type ThresholdMetrics = { carbon: number; load: number; price: number };
type Thresholds       = Record<string, ThresholdMetrics>;
type Environment      = { DisplayName: string; ColorHex: string; IsDefault: boolean; CreatedAt: string };
type Tenant           = { TenantID: string; OrgName?: string; Status?: string; Tier?: string };
type Device           = { device_id: string; grid: string; infra_type: string; last_seen: string; environment: string; explicitly_assigned?: boolean };
type AwsIntegration   = { status: string; role_arn?: string; connected_at?: string; cloudformation_url?: string };
type ToastType        = 'success' | 'error' | 'info';
type ToastMsg         = { type: ToastType; text: string } | null;
type SaveResult       = { ok: boolean; msg: string };
type SaveFn           = () => Promise<SaveResult>;

export default function SettingsPage() {
  const [tenantId, setTenantId] = useState<string>('GW-NIMBL-AEB47A92');
  const [toast, setToast] = useState<ToastMsg>(null);
  const [saving, setSaving] = useState(false);

  const thresholdSaveRef = useRef<SaveFn | null>(null);
  const registerThresholdSave = useCallback((fn: SaveFn) => {
    thresholdSaveRef.current = fn;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URLSearchParams(window.location.search);
    const fromUrl = url.get('tenant_id');
    const fromLs = window.localStorage.getItem('gw_tenant_id');
    setTenantId(fromUrl || fromLs || 'GW-NIMBL-AEB47A92');
  }, []);

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
      setToast({ type: 'error', text: `Save failed: ${failed.map(f => `${f.section} (${f.msg})`).join('; ')}` });
    }
    setSaving(false);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Nav tenantId={tenantId} />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
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
              saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
            }`}
          >
            {saving ? 'Saving…' : 'Save All Settings'}
          </button>
        </div>

        {toast && (
          <div className={`p-4 rounded-lg border ${
            toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            toast.type === 'error'   ? 'bg-red-50 border-red-200 text-red-800' :
                                       'bg-blue-50 border-blue-200 text-blue-800'
          }`}>{toast.text}</div>
        )}

        <TenantInfoSection tenantId={tenantId} />
        <EnvironmentSection tenantId={tenantId} setToast={setToast} />
        <DeviceAssignmentSection tenantId={tenantId} setToast={setToast} />
        <ThresholdSection tenantId={tenantId} registerSave={registerThresholdSave} />
        <AwsIntegrationSection tenantId={tenantId} setToast={setToast} />
        <AgentScriptsSection tenantId={tenantId} />
        <NotificationsSection />
        <ApiReferenceSection tenantId={tenantId} />
      </div>
    </div>
  );
}

function TenantInfoSection({ tenantId }: { tenantId: string }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: Tenant) => setTenant(d))
      .catch(() => setTenant({ TenantID: tenantId }));
  }, [tenantId]);
  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Tenant Information</h2>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="font-medium text-gray-500">Tenant ID</dt><dd className="mt-1 font-mono text-gray-900">{tenant?.TenantID}</dd></div>
        <div><dt className="font-medium text-gray-500">Organization</dt><dd className="mt-1 text-gray-900">{tenant?.OrgName || '(not set)'}</dd></div>
        <div><dt className="font-medium text-gray-500">Status</dt><dd className="mt-1 text-gray-900">{tenant?.Status || 'ACTIVE'}</dd></div>
        <div><dt className="font-medium text-gray-500">Tier</dt><dd className="mt-1 text-gray-900">{tenant?.Tier || 'TIER_1_AUDIT'}</dd></div>
      </dl>
    </section>
  );
}

function EnvironmentSection({ tenantId, setToast }: { tenantId: string; setToast: (t: ToastMsg) => void }) {
  const [envs, setEnvs] = useState<Record<string, Environment>>({});
  const [active, setActive] = useState('production');
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments`);
      if (r.status === 404 || r.status === 403) { setAvailable(false); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setEnvs(data.environments || {});
      setActive(data.active_environment || 'production');
      setAvailable(true);
    } catch { setAvailable(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  async function switchTo(envName: string) {
    setBusy(true);
    setActive(envName);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('gw_active_env', envName);
      window.dispatchEvent(new CustomEvent('gw-env-changed', { detail: { env: envName } }));
    }
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments/${envName}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activate: true }),
    });
    setBusy(false);
    if (r.ok) setToast({ type: 'success', text: `✓ Switched to "${envName}"` });
    else setToast({ type: 'error', text: 'Switch failed' });
  }

  async function createNew() {
    const display = prompt('New environment display name (e.g. "Staging"):');
    if (!display) return;
    const name = display.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!name) return;
    setBusy(true);
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, display_name: display }),
    });
    setBusy(false);
    if (r.ok) {
      setToast({ type: 'success', text: `✓ Created "${display}"` });
      load();
    } else {
      const data = await r.json().catch(() => ({}));
      setToast({ type: 'error', text: data.error || 'Create failed' });
    }
  }

  async function deleteEnv(envName: string) {
    if (envName === 'production') {
      setToast({ type: 'error', text: 'Cannot delete production' });
      return;
    }
    if (!confirm(`Delete environment "${envName}"? Requires NO telemetry records.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/environments/${envName}`, { method: 'DELETE' });
      if (r.ok) {
        setToast({ type: 'success', text: `✓ Deleted "${envName}"` });
        load();
      } else {
        const data = await r.json().catch(() => ({}));
        setToast({ type: 'error', text: data.error || `Delete failed (HTTP ${r.status})` });
      }
    } catch (e: any) {
      setToast({ type: 'error', text: `Delete error: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  if (!available) return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-2 text-gray-900">Environments</h2>
      <p className="text-sm text-gray-500">
        Multi-environment management not enabled. Run <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">DEPLOY_MULTI_ENV.sh</code> on the server.
      </p>
    </section>
  );

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Environments</h2>
        <button onClick={createNew} disabled={busy} className="px-3 py-1.5 text-sm border border-dashed border-gray-400 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50">+ New Environment</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Switch between environments to view scoped telemetry and reports.</p>
      <div className="space-y-2">
        {Object.entries(envs).map(([name, env]) => (
          <div key={name} className={`flex justify-between items-center p-3 rounded-lg border-2 ${active === name ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: env.ColorHex }} />
              <div>
                <div className="font-medium text-gray-900">{env.DisplayName}</div>
                <div className="text-xs text-gray-500 font-mono">{name}</div>
              </div>
              {active === name && (<span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">ACTIVE</span>)}
            </div>
            <div className="flex gap-2">
              {active !== name && (
                <button onClick={() => switchTo(name)} disabled={busy} className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">Activate</button>
              )}
              {name !== 'production' && (
                <button onClick={() => deleteEnv(name)} disabled={busy} className="px-3 py-1 text-sm border border-red-300 text-red-600 hover:bg-red-50 rounded disabled:opacity-50">Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeviceAssignmentSection({ tenantId, setToast }: { tenantId: string; setToast: (t: ToastMsg) => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [envs, setEnvs] = useState<Record<string, Environment>>({});
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, eRes] = await Promise.all([
        fetch(`${API_BASE}/api/tenants/${tenantId}/devices`),
        fetch(`${API_BASE}/api/tenants/${tenantId}/environments`),
      ]);
      if (dRes.status === 404 || dRes.status === 403) { setAvailable(false); setLoading(false); return; }
      if (dRes.ok) {
        const d = await dRes.json();
        setDevices(d.devices || []);
      }
      if (eRes.ok) {
        const e = await eRes.json();
        setEnvs(e.environments || {});
      }
    } catch { setAvailable(false); }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  async function reassignDevice(deviceId: string, newEnv: string) {
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/devices/${deviceId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: newEnv }),
    });
    if (r.ok) {
      setToast({ type: 'success', text: `✓ Device assigned to ${newEnv}` });
      setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, environment: newEnv, explicitly_assigned: true } : d));
    } else {
      const data = await r.json().catch(() => ({}));
      setToast({ type: 'error', text: data.error || 'Assignment failed' });
    }
  }

  if (!available) return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-2 text-gray-900">Device Assignment</h2>
      <p className="text-sm text-gray-500">
        Per-device environment assignment requires running <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">DEPLOY_SPRINT_FINAL.sh</code> on the server.
      </p>
    </section>
  );

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Device Assignment</h2>
        <span className="text-xs text-gray-500">{devices.length} devices</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Map each monitored device to a specific environment. Newly discovered devices default to "production" until you assign them.
      </p>
      {loading ? (
        <div className="text-sm text-gray-500">Loading devices…</div>
      ) : devices.length === 0 ? (
        <div className="text-sm text-gray-500">No devices discovered yet. Once agents start reporting, they'll appear here.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="py-2 text-left text-gray-700">Device ID</th>
              <th className="py-2 text-left text-gray-700">Grid</th>
              <th className="py-2 text-left text-gray-700">Type</th>
              <th className="py-2 text-left text-gray-700">Last Seen</th>
              <th className="py-2 text-left text-gray-700">Environment</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(d => (
              <tr key={d.device_id} className="border-b">
                <td className="py-3 font-mono text-xs text-gray-900">{d.device_id}</td>
                <td className="py-3 text-gray-700">{d.grid}</td>
                <td className="py-3 text-gray-700">{d.infra_type}</td>
                <td className="py-3 text-gray-500 text-xs">{d.last_seen ? new Date(d.last_seen).toLocaleString() : '—'}</td>
                <td className="py-3">
                  <select
                    value={d.environment}
                    onChange={(e) => reassignDevice(d.device_id, e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                  >
                    {Object.entries(envs).map(([name, env]) => (
                      <option key={name} value={name}>{env.DisplayName}</option>
                    ))}
                  </select>
                  {d.explicitly_assigned && (
                    <span className="ml-2 text-xs text-green-700">✓ explicit</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ThresholdSection({ tenantId, registerSave }: { tenantId: string; registerSave: (fn: SaveFn) => void }) {
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [original, setOriginal] = useState<Thresholds | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/thresholds`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setThresholds(data.grid_thresholds);
      setOriginal(JSON.parse(JSON.stringify(data.grid_thresholds)));
      setUsingDefaults(Boolean(data.using_defaults));
      setUpdatedAt(data.updated_at || null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown';
      setLocalMsg(`Failed to load: ${msg}`);
    } finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    registerSave(async () => {
      if (!thresholds) return { ok: false, msg: 'No thresholds loaded' };
      try {
        const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/thresholds`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid_thresholds: thresholds }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setUpdatedAt(data.updated_at);
        setOriginal(JSON.parse(JSON.stringify(thresholds)));
        setUsingDefaults(false);
        return { ok: true, msg: 'Saved' };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'unknown';
        return { ok: false, msg };
      }
    });
  }, [thresholds, tenantId, registerSave]);

  function handleChange(grid: string, metric: keyof ThresholdMetrics, value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setThresholds(prev => prev ? { ...prev, [grid]: { ...prev[grid], [metric]: num } } : prev);
  }

  const isDirty = thresholds && original && JSON.stringify(thresholds) !== JSON.stringify(original);
  const grids = ['AB', 'ON', 'BC', 'QC'] as const;
  const metrics: Array<[keyof ThresholdMetrics, string, string]> = [
    ['carbon', 'Carbon', 'gCO₂e/kWh'],
    ['load', 'Load', '% capacity'],
    ['price', 'Price', '$/MWh'],
  ];

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Grid Alert Thresholds</h2>
          <p className="text-sm text-gray-500">Breach any threshold to auto-open a WORM-sealed incident.</p>
        </div>
        <span className="text-xs text-gray-500">
          {usingDefaults ? 'Using regulatory defaults' : updatedAt ? `Last saved: ${new Date(updatedAt).toLocaleString()}` : ''}
        </span>
      </div>
      {loading ? <div className="text-sm text-gray-500">Loading…</div> :
       !thresholds ? <div className="text-sm text-red-600">{localMsg || 'Unable to load thresholds'}</div> : (
        <>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-2 text-left text-gray-700">Grid</th>
                {metrics.map(([k, label, unit]) => (
                  <th key={k} className="py-2 text-left text-gray-700">{label} <span className="text-gray-400 font-normal">({unit})</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grids.map(grid => (
                <tr key={grid} className="border-b">
                  <td className="py-3 font-medium text-gray-900">{grid}</td>
                  {metrics.map(([metric]) => (
                    <td key={metric} className="py-3 pr-4">
                      <input
                        type="number" step="0.1" min={0}
                        className="border border-gray-300 rounded px-2 py-1 w-28 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
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
              <span className="text-xs text-gray-500 ml-auto">Click "Save All Settings" at the top.</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AwsIntegrationSection({ tenantId, setToast }: { tenantId: string; setToast: (t: ToastMsg) => void }) {
  const [integration, setIntegration] = useState<AwsIntegration | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [roleArn, setRoleArn] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`);
      if (r.status === 404 || r.status === 403) { setAvailable(false); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setIntegration(await r.json());
    } catch { setAvailable(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!roleArn.trim()) return;
    setBusy(true);
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_arn: roleArn.trim() }),
    });
    setBusy(false);
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      setToast({ type: 'success', text: '✓ AWS integration verified and active' });
      setShowSubmit(false);
      setRoleArn('');
      load();
    } else {
      setToast({ type: 'error', text: data.error || data.details || 'Verification failed' });
    }
  }

  async function revoke() {
    if (!confirm('Revoke AWS integration? GridWitness will stop discovering new instances.')) return;
    setBusy(true);
    const r = await fetch(`${API_BASE}/api/tenants/${tenantId}/aws`, { method: 'DELETE' });
    setBusy(false);
    if (r.ok) {
      setToast({ type: 'success', text: '✓ Integration revoked' });
      load();
    }
  }

  if (!available) return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-2 text-gray-900">AWS Auto-Discovery Integration</h2>
      <p className="text-sm text-gray-500">
        Run <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">DEPLOY_SPRINT_FINAL.sh</code> to enable this feature.
      </p>
    </section>
  );

  const isActive = integration?.status === 'ACTIVE';

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-2 text-gray-900">AWS Auto-Discovery Integration</h2>
      <p className="text-sm text-gray-500 mb-4">
        Securely grant GridWitness read-only access to your AWS account to automatically discover and monitor EC2 instances.
      </p>

      {isActive ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-semibold text-green-800">🟢 AWS Integration Active</div>
              <div className="text-sm text-green-700 mt-1">Cross-account role attached and verified.</div>
              <div className="text-xs text-green-600 mt-2 font-mono">{integration?.role_arn}</div>
              {integration?.connected_at && (
                <div className="text-xs text-green-600 mt-1">Connected: {new Date(integration.connected_at).toLocaleString()}</div>
              )}
            </div>
            <button onClick={revoke} disabled={busy} className="px-3 py-1 text-sm border border-red-300 text-red-700 hover:bg-red-50 rounded">Revoke</button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-gray-50 border rounded-lg">
          <div className="font-semibold text-gray-800 mb-3">⚪ Not Connected</div>
          <ol className="text-sm text-gray-700 space-y-2 mb-4 list-decimal pl-5">
            <li>Click the button below to launch CloudFormation in your AWS Console</li>
            <li>The template creates a read-only IAM role with external-id <code className="text-xs bg-white px-1 rounded">gridwitness-{tenantId}</code></li>
            <li>Once the stack is CREATE_COMPLETE, copy the <strong>RoleArn</strong> output</li>
            <li>Paste it below and click Verify</li>
          </ol>
          <div className="flex gap-3 mb-3">
            {integration?.cloudformation_url && (
              <a href={integration.cloudformation_url} target="_blank" rel="noopener noreferrer"
                 className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium">
                Launch CloudFormation Stack ↗
              </a>
            )}
            <button onClick={() => setShowSubmit(s => !s)}
                    className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded text-sm">
              I have my Role ARN
            </button>
          </div>
          {showSubmit && (
            <div className="flex gap-2 mt-3">
              <input
                type="text" value={roleArn} onChange={e => setRoleArn(e.target.value)}
                placeholder="arn:aws:iam::123456789012:role/GridWitnessReadOnly"
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono text-gray-900"
              />
              <button onClick={submit} disabled={busy || !roleArn.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50">
                {busy ? 'Verifying…' : 'Verify & Connect'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AgentScriptsSection({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<'windows' | 'linux' | 'k8s'>('windows');
  const [activeEnv, setActiveEnv] = useState('production');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('gw_active_env');
    if (stored) setActiveEnv(stored);
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.env) setActiveEnv(detail.env);
    };
    window.addEventListener('gw-env-changed', onChange);
    return () => window.removeEventListener('gw-env-changed', onChange);
  }, []);

  const apiUrl = `${API_BASE}/api/telemetry/ingest`;

  const psScript = `# GridWitness Agent - Windows PowerShell (env: ${activeEnv})
$JobName = "GridWitnessAgent_${tenantId}"
Get-Job -Name $JobName -ErrorAction SilentlyContinue | Stop-Job -PassThru | Remove-Job
Start-Job -Name $JobName -ScriptBlock {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $TenantID = "${tenantId}"
    $Environment = "${activeEnv}"
    $ApiUrl = "${apiUrl}"
    try { $Geo = Invoke-RestMethod -Uri "http://ip-api.com/json" -UseBasicParsing; $Region = $Geo.regionName } catch { $Region = "Alberta" }
    $GridID = "Unknown"
    if ($Region -match "Alberta") { $GridID = "AB" }
    elseif ($Region -match "Ontario") { $GridID = "ON" }
    elseif ($Region -match "British Columbia") { $GridID = "BC" }
    elseif ($Region -match "Quebec|Québec") { $GridID = "QC" }
    $Sys = Get-CimInstance Win32_ComputerSystem
    $InfraType = if ($Sys.Manufacturer -match "Amazon|Xen") { "AWS_Cloud" } else { "Private_DC" }
    while ($true) {
        try {
            $Cpu = Get-CimInstance Win32_Processor
            $Load = ($Cpu | Measure-Object -Property LoadPercentage -Average).Average
            $RealWattage = [math]::Round(35 + ($Load * 1.2))
            $Payload = @{
                TenantID = $TenantID; Source = $env:COMPUTERNAME
                Actual_Wattage = $RealWattage; InfraType = $InfraType
                GridID = $GridID; Environment = $Environment
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $Payload -ContentType "application/json"
        } catch {}
        Start-Sleep -Seconds 300
    }
} | Out-Null
Write-Host "GridWitness Agent attached for tenant ${tenantId} (env: ${activeEnv})." -ForegroundColor Green`;

  const bashScript = `#!/bin/bash
# GridWitness Agent - Linux/Unix (env: ${activeEnv})
cat << 'EOF' > /tmp/gw_agent.sh
TENANT_ID="${tenantId}"
ENVIRONMENT="${activeEnv}"
API_URL="${apiUrl}"
REGION=$(curl -s http://ip-api.com/json | grep -oP '"regionName":"\\K[^"]+')
[[ -z "$REGION" ]] && REGION="Alberta"
case "$REGION" in
    *Alberta*) GRID="AB" ;;
    *Ontario*) GRID="ON" ;;
    *British*Columbia*) GRID="BC" ;;
    *Quebec*|*Québec*) GRID="QC" ;;
    *) GRID="Unknown" ;;
esac
VENDOR=$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null)
[[ "$VENDOR" == *Amazon* ]] && INFRA="AWS_Cloud" || INFRA="Private_DC"
while true; do
    LOAD=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}')
    WATT=$(echo "35 + ($LOAD * 1.2)" | bc | awk '{print int($1+0.5)}')
    PAYLOAD="{\\"TenantID\\":\\"$TENANT_ID\\",\\"Source\\":\\"$(hostname)\\",\\"Actual_Wattage\\":$WATT,\\"InfraType\\":\\"$INFRA\\",\\"GridID\\":\\"$GRID\\",\\"Environment\\":\\"$ENVIRONMENT\\"}"
    curl -s -X POST $API_URL -H "Content-Type: application/json" -d "$PAYLOAD" > /dev/null 2>&1
    sleep 300
done
EOF
chmod +x /tmp/gw_agent.sh
nohup /tmp/gw_agent.sh > /dev/null 2>&1 &
echo "GridWitness Agent attached for tenant ${tenantId} (env: ${activeEnv})."`;

  const k8sScript = `# GridWitness K8s Agent (Helm) - env: ${activeEnv}
helm repo add gridwitness https://charts.gridwitness.io
helm repo update
helm install gw-agent gridwitness/green-scheduler \\
  --namespace kube-system \\
  --set tenantId="${tenantId}" \\
  --set environment="${activeEnv}" \\
  --set apiUrl="${apiUrl}" \\
  --set pollingIntervalSeconds=300

# Verify
kubectl get pods -n kube-system | grep gw-agent
kubectl logs -n kube-system -l app=gw-agent --tail=20`;

  const currentScript = tab === 'windows' ? psScript : tab === 'linux' ? bashScript : k8sScript;

  function copyToClipboard() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(currentScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-2 text-gray-900">Agent Installation Scripts</h2>
      <p className="text-sm text-gray-500 mb-4">
        Install the GridWitness telemetry agent on your servers. The script below is pre-configured for tenant <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{tenantId}</code> and environment <strong>{activeEnv}</strong>. Polls every 5 minutes.
      </p>

      <div className="flex gap-1 mb-3 border-b">
        {(['windows', 'linux', 'k8s'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}>
            {t === 'windows' ? 'Windows (PowerShell)' : t === 'linux' ? 'Linux (Bash)' : 'Kubernetes (Helm)'}
          </button>
        ))}
      </div>

      <div className="relative">
        <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">{currentScript}</pre>
        <button onClick={copyToClipboard}
                className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
        <strong>Tip:</strong> For production deployment, install as a Windows Service (NSSM/sc.exe) or systemd unit so the agent survives reboots.
      </div>
    </section>
  );
}

function NotificationsSection() {
  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Notification Preferences</h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
          <div>
            <div className="font-medium text-gray-900">Grid Stress Incident Alerts (SNS)</div>
            <div className="text-xs text-gray-500">Email when carbon/load/price thresholds are breached</div>
          </div>
          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">CONFIRMED</span>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
          <div>
            <div className="font-medium text-gray-900">Weekly Compliance Report Summary</div>
            <div className="text-xs text-gray-500">Email digest of records, incidents, emissions</div>
          </div>
          <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded">NOT CONFIGURED</span>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
          <div>
            <div className="font-medium text-gray-900">Webhook Integrations (Slack / Teams / PagerDuty)</div>
            <div className="text-xs text-gray-500">Real-time incident push to your channel</div>
          </div>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">COMING SOON</span>
        </div>
      </div>
    </section>
  );
}

function ApiReferenceSection({ tenantId }: { tenantId: string }) {
  const endpoints = [
    { method: 'GET',    path: `/api/tenants/${tenantId}/thresholds`, desc: 'Read alert thresholds' },
    { method: 'PUT',    path: `/api/tenants/${tenantId}/thresholds`, desc: 'Update alert thresholds' },
    { method: 'GET',    path: `/api/tenants/${tenantId}/environments`, desc: 'List environments' },
    { method: 'POST',   path: `/api/tenants/${tenantId}/environments`, desc: 'Create environment' },
    { method: 'GET',    path: `/api/tenants/${tenantId}/devices`,    desc: 'List devices' },
    { method: 'POST',   path: `/api/tenants/${tenantId}/devices/{device_id}`, desc: 'Assign device to environment' },
    { method: 'GET',    path: `/api/tenants/${tenantId}/aws`,        desc: 'AWS integration status' },
    { method: 'POST',   path: `/api/tenants/${tenantId}/aws`,        desc: 'Connect AWS account' },
    { method: 'DELETE', path: `/api/tenants/${tenantId}/aws`,        desc: 'Revoke AWS integration' },
    { method: 'GET',    path: `/api/incidents?tenant_id=${tenantId}`, desc: 'List incidents' },
    { method: 'POST',   path: '/api/reports/generate',                desc: 'Generate compliance report' },
    { method: 'GET',    path: '/api/grid-status',                     desc: 'Live provincial grid intensity' },
    { method: 'GET',    path: '/api/verify/{merkle_root}',            desc: 'Public Merkle root verification' },
  ];

  return (
    <section className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">API Reference</h2>
      <p className="text-sm text-gray-500 mb-4">
        Base URL: <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{API_BASE}</code>
      </p>
      <div className="space-y-1 text-sm font-mono">
        {endpoints.map((ep, i) => (
          <div key={i} className="flex gap-3 items-center py-2 border-b last:border-b-0">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              ep.method === 'GET' ? 'bg-blue-100 text-blue-700' :
              ep.method === 'POST' ? 'bg-green-100 text-green-700' :
              ep.method === 'PUT' ? 'bg-yellow-100 text-yellow-700' :
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
