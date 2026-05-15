// GridWitness — lib/api.ts
// All API calls to the live backend.
// API URL: https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com

const API = process.env.NEXT_PUBLIC_API_URL

export interface TenantProvisionResponse {
  tenant_id: string
  status: string
  next_step: string
  created_at: string
}

export interface TelemetryRecord {
  TenantID: string
  Timestamp: string
  Source: string
  ActualWattage: number
  GridID: string
  CarbonIntensity: number
  CarbonDebt_gCO2: number
  DataSource: string
  DataQuality: string
  SHA256Hash: string
}

export interface GridCacheEntry {
  GridID: string
  CapturedAt: string
  CarbonIntensity: number
  PoolPrice: number
  DataQuality: string
}

// ─── Tenant Provisioning ─────────────────────────────────────────────────────

export async function provisionTenant(
  orgName: string,
  adminEmail: string,
  tier: string = 'TIER_1_AUDIT'
): Promise<TenantProvisionResponse> {
  const res = await fetch(`${API}/api/tenant/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_name: orgName,
      admin_email: adminEmail,
      subscription_tier: tier,
    }),
  })
  if (!res.ok) throw new Error(`Provisioning failed: ${res.status}`)
  return res.json()
}

// ─── Telemetry Data ───────────────────────────────────────────────────────────

export async function getTelemetry(tenantId: string): Promise<TelemetryRecord[]> {
  // Query DynamoDB via API — returns recent telemetry records
  // In production this hits a GET endpoint; for now we return mock data
  // that demonstrates the real data structure from the WORM ledger
  return getMockTelemetry(tenantId)
}

export async function getCarbonSummary(tenantId: string) {
  const records = await getTelemetry(tenantId)
  const last24h = records.filter(r => {
    const ts = new Date(r.Timestamp).getTime()
    return ts > Date.now() - 86400000
  })

  const totalCarbon = last24h.reduce((sum, r) => sum + (r.CarbonDebt_gCO2 || 0), 0)
  const cloudNodes  = last24h.filter(r => r.DataSource === 'CLOUD_DISCOVERY')
  const physNodes   = last24h.filter(r => r.DataSource === 'EDGE_AGENT' || r.DataSource === 'REDFISH_BMC')
  const scope2      = physNodes.reduce((s, r) => s + r.CarbonDebt_gCO2, 0)
  const scope3      = cloudNodes.reduce((s, r) => s + r.CarbonDebt_gCO2, 0)

  return {
    netCarbonKg:    +(totalCarbon / 1000).toFixed(4),
    scope2Kg:       +(scope2 / 1000).toFixed(4),
    scope3Kg:       +(scope3 / 1000).toFixed(4),
    liveNodesTotal: new Set(last24h.map(r => r.Source)).size,
    liveNodesCloud: new Set(cloudNodes.map(r => r.Source)).size,
    liveNodesPhys:  new Set(physNodes.map(r => r.Source)).size,
    records:        last24h,
  }
}

// ─── Report Generation ────────────────────────────────────────────────────────

export async function generateReport(
  tenantId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API}/api/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: tenantId,
      date_from: dateFrom,
      date_to:   dateTo,
    }),
  })
  if (!res.ok) throw new Error(`Report generation failed: ${res.status}`)
  return res.json()
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`, { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

// ─── Mock Data (used until GET telemetry endpoint is implemented) ─────────────
// This mirrors the exact structure of records in gw-telemetry-staging.
// Replace with real API calls as GET endpoints are added.

function getMockTelemetry(tenantId: string): TelemetryRecord[] {
  const grids = ['AB', 'ON', 'BC', 'QC']
  const sources = ['i-0a1b2c3d', 'i-0e4f5a6b', 'tor-sm5038ml-1', 'i-0c7d8e9f']
  const dataSources = ['CLOUD_DISCOVERY', 'CLOUD_DISCOVERY', 'EDGE_AGENT', 'CLOUD_DISCOVERY']
  const intensities: Record<string, number> = { AB: 510, ON: 42, BC: 15, QC: 2 }

  return Array.from({ length: 24 }, (_, i) => {
    const idx = i % 4
    const grid = grids[idx]
    const wattage = 35 + Math.random() * 30
    const intensity = intensities[grid]
    const carbon = (wattage * intensity * 5) / 60000

    return {
      TenantID:        tenantId,
      Timestamp:       new Date(Date.now() - i * 300000).toISOString(),
      Source:          sources[idx],
      ActualWattage:   +wattage.toFixed(2),
      GridID:          grid,
      CarbonIntensity: intensity,
      CarbonDebt_gCO2: +carbon.toFixed(6),
      DataSource:      dataSources[idx],
      DataQuality:     i < 4 ? 'LIVE' : 'ESTIMATED',
      SHA256Hash:      Array.from({length: 64}, () =>
        Math.floor(Math.random() * 16).toString(16)).join(''),
    }
  })
}
