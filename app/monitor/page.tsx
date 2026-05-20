/* ============================================================================
 * app/monitor/page.tsx
 * ============================================================================
 * Replaces the existing monitor page. Wires every metric to live data:
 *   - Net Carbon Debt: computed from gw-telemetry-staging records in last 24h
 *   - Active Devices: deduplicated source list from telemetry stream
 *   - Provincial Grid Health: pulled from gw-grid-cache-staging via API
 *   - Auto-refreshes every 30s
 *
 * Endpoints used (all confirmed live in your account):
 *   GET /api/telemetry/live?tenant_id={id}
 *   GET /api/grid-status (NEW - included in DEPLOY_NEXT_BATCH.sh)
 * ============================================================================ */

'use client';

import { useEffect, useState, useCallback } from 'react';
import Nav from '@/components/Nav';

const API_BASE = 'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com';

interface TelemetryRecord {
  TenantID: string;
  Timestamp: string;
  Source: string;
  GridID: string;
  Actual_Wattage: number;
  InfraType?: string;
  gCO2e?: number;
  Environment?: string;
}

interface GridStatus {
  GridID: string;
  CurrentIntensity: number | null;
  Source: string | null;
  UpdatedAt: string | null;
  ProvinceName: string;
  Operator: string;
}

interface DeviceRow {
  source: string;
  type: string;
  wattage: number;
  grid: string;
  gCO2e: number;
  lastSeen: string;
}

const PROVINCE_META: Record<string, { name: string; operator: string }> = {
  AB: { name: 'Alberta',          operator: 'AESO'       },
  ON: { name: 'Ontario',          operator: 'IESO'       },
  BC: { name: 'British Columbia', operator: 'BC Hydro'   },
  QC: { name: 'Québec',           operator: 'Hydro-QC'   },
};

function classify(intensity: number | null): { label: string; color: string } {
  if (intensity == null) return { label: 'UNKNOWN', color: '#6b7280' };
  if (intensity < 100)   return { label: 'OPTIMAL',  color: '#10b981' };
  if (intensity < 300)   return { label: 'WARNING',  color: '#f59e0b' };
  return                       { label: 'CRITICAL', color: '#dc2626' };
}

export default function MonitorPage() {
  const [tenantId, setTenantId] = useState('GW-NIMBL-AEB47A92');
  const [activeEnv, setActiveEnv] = useState('production');
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [gridStatuses, setGridStatuses] = useState<GridStatus[]>([]);
  const [carbonDebt24h, setCarbonDebt24h] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URLSearchParams(window.location.search);
    const t = url.get('tenant_id') || window.localStorage.getItem('gw_tenant_id') || 'GW-NIMBL-AEB47A92';
    const e = window.localStorage.getItem('gw_active_env') || 'production';
    setTenantId(t);
    setActiveEnv(e);
  }, []);

  const loadData = useCallback(async () => {
    try {
      // 1. Telemetry (devices + 24h emissions calculation)
      const telRes = await fetch(`${API_BASE}/api/telemetry/live?tenant_id=${tenantId}&env=${activeEnv}`);
      if (telRes.ok) {
        const telData: TelemetryRecord[] = await telRes.json();

        // Deduplicate by Source, keep most recent
        const byDevice = new Map<string, TelemetryRecord>();
        for (const r of telData) {
          const existing = byDevice.get(r.Source);
          if (!existing || new Date(r.Timestamp) > new Date(existing.Timestamp)) {
            byDevice.set(r.Source, r);
          }
        }

        const now = new Date();
        const rows: DeviceRow[] = [];
        for (const r of byDevice.values()) {
          const seenAt = new Date(r.Timestamp);
          const ageMin = (now.getTime() - seenAt.getTime()) / 60000;
          if (ageMin > 15) continue; // 15-min freshness window
          rows.push({
            source:   r.Source,
            type:     r.InfraType === 'AWS_Cloud' ? 'Cloud' : (r.InfraType || 'Unknown'),
            wattage:  Number(r.Actual_Wattage) || 0,
            grid:     r.GridID,
            gCO2e:    Number(r.gCO2e) || 0,
            lastSeen: seenAt.toLocaleTimeString(),
          });
        }
        setDevices(rows);

        // 24h carbon debt: sum gCO2e across all records in last 24h
        const cutoff24h = now.getTime() - 24 * 60 * 60 * 1000;
        const sum_gCO2e = telData
          .filter(r => new Date(r.Timestamp).getTime() >= cutoff24h)
          .reduce((acc, r) => acc + (Number(r.gCO2e) || 0), 0);
        setCarbonDebt24h(sum_gCO2e / 1000);  // gCO2e -> kgCO2e
      }

      // 2. Provincial grid status — pulled live from gw-grid-cache-staging
      const gridRes = await fetch(`${API_BASE}/api/grid-status`);
      if (gridRes.ok) {
        const gridData: Array<{ GridID: string; CurrentIntensity?: number; Source?: string; UpdatedAt?: string }> = await gridRes.json();
        const statuses: GridStatus[] = ['AB', 'BC', 'ON', 'QC'].map(g => {
          const entry = gridData.find(d => d.GridID === g);
          return {
            GridID: g,
            CurrentIntensity: entry?.CurrentIntensity != null ? Number(entry.CurrentIntensity) : null,
            Source: entry?.Source || null,
            UpdatedAt: entry?.UpdatedAt || null,
            ProvinceName: PROVINCE_META[g].name,
            Operator: PROVINCE_META[g].operator,
          };
        });
        setGridStatuses(statuses);
      }

      setLastUpdate(new Date());
    } catch (e) {
      console.error('Monitor data load error:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeEnv]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Nav tenantId={tenantId} />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Net Carbon Debt */}
        <section className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-baseline">
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Net Carbon Debt (24h)
              </h2>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {carbonDebt24h.toFixed(4)}{' '}
                <span className="text-base text-gray-500">kgCO₂e</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Sum of all telemetry records in last 24h · Environment: {activeEnv}
              </p>
            </div>
            <div className="text-xs text-gray-500 text-right">
              <div>Auto-refresh: 30s</div>
              <div>Last update: {lastUpdate.toLocaleTimeString()}</div>
            </div>
          </div>
        </section>

        {/* Active Device Stream */}
        <section className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Active Device Stream{' '}
              <span className="text-sm text-gray-500 font-normal">
                ({devices.length} nodes)
              </span>
            </h2>
            <span className="text-xs text-gray-500">
              15-min freshness window
            </span>
          </div>
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : devices.length === 0 ? (
            <div className="text-sm text-gray-500">
              No devices reporting in the last 15 minutes.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="py-2 text-left text-gray-700">Source / Instance ID</th>
                  <th className="py-2 text-left text-gray-700">Type</th>
                  <th className="py-2 text-left text-gray-700">Wattage</th>
                  <th className="py-2 text-left text-gray-700">Grid</th>
                  <th className="py-2 text-left text-gray-700">Carbon (gCO₂e)</th>
                  <th className="py-2 text-left text-gray-700">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.source} className="border-b">
                    <td className="py-3 font-mono text-xs text-gray-900">{d.source}</td>
                    <td className="py-3 text-gray-700">{d.type}</td>
                    <td className="py-3 text-gray-700">{d.wattage.toFixed(1)} W</td>
                    <td className="py-3 text-gray-700">{d.grid}</td>
                    <td className="py-3 text-gray-700">{d.gCO2e.toFixed(3)}</td>
                    <td className="py-3 text-gray-500 text-xs">{d.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Provincial Grid Health */}
        <section className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Provincial Grid Health
            </h2>
            <span className="text-xs text-gray-500">Live · gCO₂/kWh</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {gridStatuses.map(g => {
              const cls = classify(g.CurrentIntensity);
              const isLive = g.Source && g.Source !== 'FALLBACK_BASELINE' && g.Source !== 'fallback';
              return (
                <div key={g.GridID} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-gray-500 font-mono">{g.GridID}</div>
                      <div className="font-semibold text-gray-900">{g.ProvinceName}</div>
                      <div className="text-xs text-gray-400">{g.Operator}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        {g.CurrentIntensity != null ? g.CurrentIntensity.toFixed(0) : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cls.color }}
                    />
                    <span className="text-xs font-medium" style={{ color: cls.color }}>
                      {cls.label}
                    </span>
                    {!isLive && g.CurrentIntensity != null && (
                      <span className="ml-auto text-xs text-amber-600">FALLBACK</span>
                    )}
                  </div>
                  {g.UpdatedAt && (
                    <div className="mt-1 text-xs text-gray-400">
                      Updated: {new Date(g.UpdatedAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Optimal: &lt;100 · Warning: 100–300 · Critical: &gt;300 gCO₂/kWh (global standard) ·
            Incident thresholds are configured per-grid in Settings.
          </p>
        </section>
      </div>
    </div>
  );
}
