// GridWitness — lib/api.ts
// All API calls to the live backend.
// API: https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com

const API = process.env.NEXT_PUBLIC_API_URL

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

export interface GridEntry {
  GridID: string
  CapturedAt: string
  CarbonIntensity: number
  DataQuality: string
}

export interface TenantProvisionResponse {
  tenant_id: string
  status: string
  next_step: string
  created_at: string
}

// Health Check
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`, { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

// Tenant Provisioning
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
      admin_email:       adminEmail,
      subscription_tier: tier,
    }),
  })
  if (!res.ok) throw new Error(`Provisioning failed: ${res.status}`)
  return res.json()
}

// Live Grid Data — REAL from gw-grid-cache-staging
export async function getLiveGridData(): Promise<GridEntry[]> {
  try {
    const res = await fetch(`${API}/api/grid/live`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Grid API ${res.status}`)
    const data = await res.json()
    return data.grids || []
  } catch (e) {
    console.warn('Grid API unavailable, using fallback:', e)
    return [
      { GridID: 'AB', CapturedAt: new Date().toISOString(), CarbonIntensity: 510, DataQuality: 'FALLBACK' },
      { GridID: 'ON', CapturedAt: new Date().toISOString(), CarbonIntensity: 40,  DataQuality: 'FALLBACK' },
      { GridID: 'BC', CapturedAt: new Date().toISOString(), CarbonIntensity: 15,  DataQuality: 'FALLBACK' },
      { GridID: 'QC', CapturedAt: new Date().toISOString(), CarbonIntensity: 2,   DataQuality: 'FALLBACK' },
    ]
  }
}

// Live Telemetry — REAL from gw-telemetry-staging
export async function getTelemetry(tenantId: string): Promise<TelemetryRecord[]> {
  try {
    const res = await fetch(
      `${API}/api/telemetry/live?tenant_id=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`Telemetry API ${res.status}`)
    const data = await res.json()
    return data.records || []
  } catch (e) {
    console.warn('Telemetry API unavailable:', e)
    return []
  }
}

// Carbon Summary
export async function getCarbonSummary(tenantId: string) {
  const records = await getTelemetry(tenantId)

  const last24h = records.filter(r => {
    const ts = new Date(r.Timestamp).getTime()
    return ts > Date.now() - 86400000
  })

  const cloudNodes = last24h.filter(r => r.DataSource === 'CLOUD_DISCOVERY')
  const physNodes  = last24h.filter(r =>
    r.DataSource === 'EDGE_AGENT' || r.DataSource === 'REDFISH_BMC'
  )

  const scope2 = physNodes.reduce((s, r)  => s + (r.CarbonDebt_gCO2 || 0), 0)
  const scope3 = cloudNodes.reduce((s, r) => s + (r.CarbonDebt_gCO2 || 0), 0)
  const total  = scope2 + scope3

  return {
    netCarbonKg:    +(total  / 1000).toFixed(6),
    scope2Kg:       +(scope2 / 1000).toFixed(6),
    scope3Kg:       +(scope3 / 1000).toFixed(6),
    liveNodesTotal: new Set(last24h.map(r => r.Source)).size,
    liveNodesCloud: new Set(cloudNodes.map(r => r.Source)).size,
    liveNodesPhys:  new Set(physNodes.map(r => r.Source)).size,
    records:        last24h,
    hasRealData:    last24h.length > 0,
  }
}

// Report Generation
export async function generateReport(
  tenantId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API}/api/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id:  tenantId,
      start_date: `${dateFrom}T00:00:00Z`,
      end_date:   `${dateTo}T23:59:59Z`,
      format:     'PDF',
    }),
  })
  if (!res.ok) throw new Error(`Report failed: ${res.status}`)
  return res.json()
}
