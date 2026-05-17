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
  SealedAt: string
  TxID: string
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

export interface GridThresholds {
  gridId:        string
  carbonAlert:   number   // gCO2/kWh — breach triggers incident
  loadAlert:     number   // % of capacity — critical for QC/BC
  priceAlert:    number   // $/MWh — AESO only
  description:   string
}

// Grid-specific default thresholds based on each grid's historical profile
// AB is always dirty (510 baseline) — threshold set high to catch genuine spikes
// QC is always clean — load is the critical factor, not carbon
export const DEFAULT_GRID_THRESHOLDS: GridThresholds[] = [
  {
    gridId:      'AB',
    carbonAlert: 650,
    loadAlert:   90,
    priceAlert:  150,
    description: 'Alberta — AESO. Baseline ~510 gCO2/kWh coal/gas mix. Alert on genuine spikes above 650. Price alert at $150/MWh (historical avg ~$60).',
  },
  {
    gridId:      'ON',
    carbonAlert: 100,
    loadAlert:   85,
    priceAlert:  120,
    description: 'Ontario — IESO. Mostly nuclear/hydro. Alert on carbon above 100 (gas peakers). Price alert at $120/MWh.',
  },
  {
    gridId:      'BC',
    carbonAlert: 40,
    loadAlert:   88,
    priceAlert:  80,
    description: 'British Columbia — BC Hydro. Almost entirely hydro. Carbon alert at 40 flags rare fossil backup. Load is secondary concern.',
  },
  {
    gridId:      'QC',
    carbonAlert: 15,
    loadAlert:   82,
    priceAlert:  60,
    description: 'Québec — Hydro-QC. Near-zero carbon. Load threshold 82% is primary alert — grid stress here is a capacity issue not emissions.',
  },
]

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`, { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

export async function provisionTenant(
  orgName: string,
  adminEmail: string,
  tier = 'TIER_1_AUDIT'
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

export async function getLiveGridData(): Promise<GridEntry[]> {
  try {
    const res = await fetch(`${API}/api/grid/live`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Grid API ${res.status}`)
    const data = await res.json()
    return data.grids || []
  } catch {
    // Fallback to known baselines if API unreachable
    return [
      { GridID: 'AB', CapturedAt: new Date().toISOString(), CarbonIntensity: 510, DataQuality: 'FALLBACK' },
      { GridID: 'ON', CapturedAt: new Date().toISOString(), CarbonIntensity: 40,  DataQuality: 'FALLBACK' },
      { GridID: 'BC', CapturedAt: new Date().toISOString(), CarbonIntensity: 15,  DataQuality: 'FALLBACK' },
      { GridID: 'QC', CapturedAt: new Date().toISOString(), CarbonIntensity: 2,   DataQuality: 'FALLBACK' },
    ]
  }
}

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

export async function getCarbonSummary(tenantId: string) {
  const records = await getTelemetry(tenantId)

  const active = records

  const cloudNodes = active.filter(r => r.DataSource === 'CLOUD_DISCOVERY')
  const physNodes  = active.filter(r =>
    r.DataSource === 'EDGE_AGENT' || r.DataSource === 'REDFISH_BMC'
  )

  const scope2 = physNodes.reduce((s, r)  => s + (r.CarbonDebt_gCO2 || 0), 0)
  const scope3 = cloudNodes.reduce((s, r) => s + (r.CarbonDebt_gCO2 || 0), 0)
  const total  = scope2 + scope3

  const uniqueSources = new Set(active.map(r => r.Source))

  return {
    netCarbonKg:    +(total  / 1000).toFixed(6),
    scope2Kg:       +(scope2 / 1000).toFixed(6),
    scope3Kg:       +(scope3 / 1000).toFixed(6),
    liveNodesTotal: uniqueSources.size,
    liveNodesCloud: new Set(cloudNodes.map(r => r.Source)).size,
    liveNodesPhys:  new Set(physNodes.map(r => r.Source)).size,
    records:        active,
    hasRealData:    active.length > 0,
  }
}

// Report generation — uses date_from/date_to as expected by ms-osfi-reporting Lambda
export async function generateReport(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  frameworks: string[] = ['OSFI_B15', 'BILL_C59']
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API}/api/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: tenantId,
      date_from: `${dateFrom}T00:00:00Z`,
      date_to:   `${dateTo}T23:59:59Z`,
      format:    'PDF',
      frameworks,
    }),
  })
  if (res.status >= 200 && res.status < 300) {
    return { status: 'QUEUED', message: 'Report queued successfully' }
  }
  throw new Error(`Report failed: ${res.status}`)
}
