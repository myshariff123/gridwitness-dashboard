"""
gw-ms-carbon-tax-staging
Calculates each tenant's carbon tax liability under Canada's federal
Greenhouse Gas Pollution Pricing Act (GGPPA).

Routes:
  GET /api/tenants/{tenantId}/carbon-tax?year=2026

Returns current-year YTD liability, full-year annualised projection,
statutory price schedule to 2030, and (if SBTi configured) a
reduced-emissions projection showing savings from the SBTi pathway.

Price schedule (Canada federal backstop, statutory):
  2023 $65 · 2024 $80 · 2025 $95 · 2026 $110
  2027 $125 · 2028 $140 · 2029 $155 · 2030 $170
"""
import json, os, logging
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ca-central-1')
ddb    = boto3.resource('dynamodb', region_name=REGION)
tel_t  = ddb.Table(os.environ.get('TELEMETRY_TABLE', 'gw-telemetry-staging'))
sc1_t  = ddb.Table(os.environ.get('SCOPE1_TABLE',    'gw-scope1-staging'))
sc3_t  = ddb.Table(os.environ.get('SCOPE3_TABLE',    'gw-scope3-staging'))
sbti_t = ddb.Table(os.environ.get('SBTI_TABLE',      'gw-sbti-staging'))

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,OPTIONS',
}

# Canada federal carbon price backstop (CAD/tCO₂e) per calendar year
CARBON_PRICE_SCHEDULE = {
    2023: 65.0, 2024: 80.0,  2025: 95.0,
    2026: 110.0, 2027: 125.0, 2028: 140.0,
    2029: 155.0, 2030: 170.0,
}

PROJECTION_YEARS = list(range(2026, 2031))


def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

def _dec(v):
    return float(v) if isinstance(v, Decimal) else (v if v is not None else 0.0)


# ─── Data fetchers ────────────────────────────────────────────────────────────

def _scope2_emissions(tenant_id: str, year: int) -> float:
    """Sum gCO2e from WORM ledger for the given calendar year → return kgCO2e."""
    date_from = f'{year}-01-01'
    date_to   = f'{year}-12-31T23:59:59Z'
    total_g   = 0.0
    kwargs = {'FilterExpression': Attr('TenantID').eq(tenant_id)}
    for _ in range(20):
        r = tel_t.scan(**kwargs)
        for item in r.get('Items', []):
            ts = str(item.get('Timestamp', ''))
            if date_from <= ts[:10] <= date_to[:10]:
                g = _dec(item.get('CarbonDebt_gCO2') or item.get('gCO2e') or 0)
                # only Scope 2 (physical/edge — exclude cloud discovery)
                ds = str(item.get('DataSource', ''))
                if ds != 'CLOUD_DISCOVERY' and 'cloud' not in ds.lower():
                    total_g += g
        if 'LastEvaluatedKey' not in r:
            break
        kwargs['ExclusiveStartKey'] = r['LastEvaluatedKey']
    return total_g / 1000.0  # gCO2e → kgCO2e


def _scope1_emissions(tenant_id: str, year: int) -> float:
    """Sum kgCO2e from Scope 1 manual entries for the given year → kgCO2e."""
    date_from = f'{year}-01-01'
    date_to   = f'{year}-12-31'
    total_kg  = 0.0
    try:
        r = sc1_t.query(
            KeyConditionExpression=Key('TenantID').eq(tenant_id) &
                Key('RecordedAt').between(date_from, date_to + 'T23:59:59Z'),
        )
        for item in r.get('Items', []):
            total_kg += _dec(item.get('kgCO2e') or 0)
    except Exception as e:
        logger.warning('Scope1 fetch error: %s', e)
    return total_kg


def _scope3_cat11(tenant_id: str, year: int) -> float:
    """Return latest cached Scope 3 Cat.11 kgCO2e for the year → kgCO2e."""
    try:
        r = sc3_t.query(
            KeyConditionExpression=Key('TenantID').eq(tenant_id),
            FilterExpression=Attr('YearMonth').begins_with(str(year)),
            ScanIndexForward=False,
            Limit=12,
        )
        total = sum(_dec(i.get('TotalKgCO2') or 0) for i in r.get('Items', []))
        return total
    except Exception as e:
        logger.warning('Scope3 fetch error: %s', e)
        return 0.0


def _sbti_annual_rate(tenant_id: str) -> float | None:
    """Return SBTi annual reduction rate (%) if configured, else None."""
    try:
        r = sbti_t.get_item(Key={'TenantID': tenant_id})
        item = r.get('Item')
        if not item:
            return None
        return _dec(item.get('AnnualReductionRate') or 0)
    except Exception:
        return None


# ─── Calculation helpers ─────────────────────────────────────────────────────

def _ytd_fraction(year: int) -> float:
    """Fraction of the year elapsed as of today (for annualisation)."""
    now  = datetime.now(timezone.utc)
    if now.year > year:
        return 1.0
    if now.year < year:
        return 0.0
    day_of_year = now.timetuple().tm_yday
    days_in_year = 366 if _is_leap(year) else 365
    return max(day_of_year / days_in_year, 1 / 365)


def _is_leap(year: int) -> bool:
    return (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)


def _annualise(ytd_tco2e: float, year: int) -> float:
    frac = _ytd_fraction(year)
    return ytd_tco2e / frac if frac > 0 else ytd_tco2e


def _project_flat(annual_tco2e: float) -> list:
    rows = []
    for yr in PROJECTION_YEARS:
        price = CARBON_PRICE_SCHEDULE.get(yr, 170.0)
        rows.append({
            'year':         yr,
            'price_cad':    price,
            'tco2e':        round(annual_tco2e, 6),
            'liability_cad':round(annual_tco2e * price, 2),
            'path':         'flat_emissions',
        })
    return rows


def _project_sbti(base_tco2e: float, rate_pct: float) -> list:
    rows = []
    tco2e = base_tco2e
    base_year = PROJECTION_YEARS[0]
    for yr in PROJECTION_YEARS:
        years_since_base = yr - base_year
        tco2e_yr = base_tco2e * ((1 - rate_pct / 100) ** years_since_base)
        price    = CARBON_PRICE_SCHEDULE.get(yr, 170.0)
        rows.append({
            'year':         yr,
            'price_cad':    price,
            'tco2e':        round(tco2e_yr, 6),
            'liability_cad':round(tco2e_yr * price, 2),
            'path':         'sbti_reduction',
        })
    return rows


# ─── Handler ─────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    if method == 'OPTIONS':
        return _r(200, {})

    qs        = event.get('queryStringParameters') or {}
    path_p    = event.get('pathParameters') or {}
    tenant_id = path_p.get('tenantId') or qs.get('tenant_id') or ''
    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    now       = datetime.now(timezone.utc)
    tax_year  = int(qs.get('year') or now.year)

    # ── Fetch emissions ───────────────────────────────────────────────────
    scope1_kg = _scope1_emissions(tenant_id, tax_year)
    scope2_kg = _scope2_emissions(tenant_id, tax_year)
    scope3_kg = _scope3_cat11(tenant_id, tax_year)
    ytd_total_tco2e = (scope1_kg + scope2_kg + scope3_kg) / 1000.0

    # Annualise to full year
    annual_tco2e = _annualise(ytd_total_tco2e, tax_year)
    ytd_frac     = _ytd_fraction(tax_year)

    # ── Current year liability ────────────────────────────────────────────
    cur_price = CARBON_PRICE_SCHEDULE.get(tax_year, 170.0)
    ytd_liability  = ytd_total_tco2e * cur_price
    ann_liability  = annual_tco2e * cur_price

    # ── Projections ───────────────────────────────────────────────────────
    flat_proj  = _project_flat(annual_tco2e)
    sbti_rate  = _sbti_annual_rate(tenant_id)
    sbti_proj  = _project_sbti(annual_tco2e, sbti_rate) if sbti_rate else None

    # Savings on SBTi path by 2030
    savings_2030 = None
    if sbti_proj:
        flat_2030  = next(p['liability_cad'] for p in flat_proj  if p['year'] == 2030)
        sbti_2030  = next(p['liability_cad'] for p in sbti_proj  if p['year'] == 2030)
        savings_2030 = round(flat_2030 - sbti_2030, 2)

    logger.info('carbon_tax tenant=%s year=%d ytd_tco2e=%.6f annual_tco2e=%.6f ytd_cad=%.2f',
                tenant_id, tax_year, ytd_total_tco2e, annual_tco2e, ytd_liability)

    return _r(200, {
        'tenant_id':   tenant_id,
        'tax_year':    tax_year,
        'as_of':       now.strftime('%Y-%m-%d'),
        'ytd_fraction':round(ytd_frac, 4),
        'emissions': {
            'scope1_kgco2e':      round(scope1_kg, 4),
            'scope2_kgco2e':      round(scope2_kg, 4),
            'scope3_cat11_kgco2e':round(scope3_kg, 4),
            'ytd_total_tco2e':   round(ytd_total_tco2e, 6),
            'annualized_tco2e':  round(annual_tco2e, 6),
        },
        'current_year': {
            'year':                   tax_year,
            'price_per_tco2e_cad':    cur_price,
            'ytd_liability_cad':      round(ytd_liability, 2),
            'annualized_liability_cad':round(ann_liability, 2),
        },
        'price_schedule': [
            {'year': yr, 'price_cad': pr}
            for yr, pr in sorted(CARBON_PRICE_SCHEDULE.items())
        ],
        'flat_projection':  flat_proj,
        'sbti_projection':  sbti_proj,
        'sbti_savings_2030_cad': savings_2030,
        'methodology': (
            'Canada Greenhouse Gas Pollution Pricing Act (S.C. 2018, c. 12, s. 186). '
            'Price schedule: $65/tCO₂e (2023) rising $15/yr to $170/tCO₂e (2030). '
            'Scope 1: direct fuel combustion from manual entry. '
            'Scope 2: location-based from WORM telemetry ledger. '
            'Scope 3 Cat.11: AWS Cost Explorer sync data.'
        ),
    })
