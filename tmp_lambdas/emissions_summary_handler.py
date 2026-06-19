"""
gw-ms-emissions-summary-staging
Single canonical emissions number for all GridWitness features.

Route: GET /api/tenants/{tenantId}/emissions-summary?year=YYYY

Returns:
  scope1_t, scope2_location_t, scope2_market_t (after RECs), scope3_t
  gross_t (s1+s2_location+s3), net_t (gross - retired offsets)
  offsets_t, bill_c59_compliant, net_zero_ready
  carbon_price_cad, carbon_tax_cad (net basis)
  recs_count, offsets_count, recs_mwh_retired
  reduction_from_recs_pct, reduction_from_offsets_pct
"""
import json, os, logging
from datetime import datetime, timezone, date
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ca-central-1')
ddb    = boto3.resource('dynamodb', region_name=REGION)

scope1_t  = ddb.Table(os.environ.get('SCOPE1_TABLE',    'gw-scope1-staging'))
telem_t   = ddb.Table(os.environ.get('TELEMETRY_TABLE', 'gw-telemetry-staging'))
scope3_t  = ddb.Table(os.environ.get('SCOPE3_TABLE',    'gw-scope3-staging'))
recs_t    = ddb.Table(os.environ.get('RECS_TABLE',      'gw-recs-staging'))
offsets_t = ddb.Table(os.environ.get('OFFSETS_TABLE',   'gw-offsets-staging'))
sbti_t    = ddb.Table(os.environ.get('SBTI_TABLE',      'gw-sbti-staging'))
budget_t  = ddb.Table(os.environ.get('BUDGET_TABLE',    'gw-carbon-budget-staging'))

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,OPTIONS',
}

CERTIFIED_BODIES = {'EcoLogo','Green-e','I-REC','TIGR','RE100','IREC'}

CARBON_PRICE = {
    2024: 65, 2025: 80, 2026: 95, 2027: 110, 2028: 125, 2029: 140, 2030: 170,
}

def _r(code, body): return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

# ── Data sources ──────────────────────────────────────────────────────────────

def _scope1_t(tenant_id: str, year: int) -> float:
    try:
        r = scope1_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id),
                           FilterExpression=Attr('Year').eq(str(year)))
        return sum(float(i.get('kgCO2e', 0)) for i in r.get('Items', [])) / 1000
    except Exception as e:
        logger.warning('scope1: %s', e); return 0.0

def _scope2_location_t(tenant_id: str, year: int) -> float:
    try:
        total_g = 0.0
        kw = {
            'FilterExpression': Attr('TenantID').eq(tenant_id)
                                & Attr('DataSource').ne('CLOUD_DISCOVERY'),
        }
        for _ in range(20):
            r = telem_t.scan(**kw)
            for item in r.get('Items', []):
                ts = str(item.get('Timestamp', ''))
                if ts[:4] == str(year):
                    g = float(item.get('CarbonDebt_gCO2') or item.get('CO2e_g') or item.get('gCO2e') or 0)
                    total_g += g
            if 'LastEvaluatedKey' not in r:
                break
            kw['ExclusiveStartKey'] = r['LastEvaluatedKey']
        return total_g / 1_000_000  # g → tCO2e
    except Exception as e:
        logger.warning('scope2: %s', e); return 0.0

def _scope3_t(tenant_id: str, year: int) -> float:
    try:
        r = scope3_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id),
                           FilterExpression=Attr('YearMonth').begins_with(str(year)))
        return sum(float(i.get('TotalKgCO2', 0)) for i in r.get('Items', [])) / 1000
    except Exception as e:
        logger.warning('scope3: %s', e); return 0.0

def _recs(tenant_id: str, year: int) -> dict:
    try:
        r = recs_t.query(
            KeyConditionExpression=Key('TenantID').eq(tenant_id),
            FilterExpression=Attr('Status').eq('RETIRED') & Attr('RetiredFor').eq(year)
                             & Attr('Deleted').ne(True)
        )
        items = r.get('Items', [])
        mwh   = sum(float(i.get('MWh', 0)) for i in items)
        c59   = len(items) > 0 and all(i.get('CertifiedBy') in CERTIFIED_BODIES for i in items)
        return {'count': len(items), 'mwh': mwh, 'bill_c59': c59}
    except Exception as e:
        logger.warning('recs: %s', e); return {'count': 0, 'mwh': 0.0, 'bill_c59': False}

def _offsets_t(tenant_id: str, year: int) -> float:
    try:
        r = offsets_t.query(
            KeyConditionExpression=Key('TenantID').eq(tenant_id),
            FilterExpression=Attr('Status').eq('RETIRED') & Attr('RetiredFor').eq(year)
                             & Attr('Deleted').ne(True)
        )
        return sum(float(i.get('QuantityTco2', 0)) for i in r.get('Items', []))
    except Exception as e:
        logger.warning('offsets: %s', e); return 0.0

# ── Handler ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    if event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper() == 'OPTIONS':
        return _r(200, {})

    path_p    = event.get('pathParameters') or {}
    qs        = event.get('queryStringParameters') or {}
    tenant_id = path_p.get('tenantId') or qs.get('tenant_id') or ''
    year      = int(qs.get('year', date.today().year))

    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    # ── Pull all data ─────────────────────────────────────────────────────────
    s1   = _scope1_t(tenant_id, year)
    s2_l = _scope2_location_t(tenant_id, year)
    s3   = _scope3_t(tenant_id, year)
    recs = _recs(tenant_id, year)
    off  = _offsets_t(tenant_id, year)

    # Market-based Scope 2: location − (retired MWh × Alberta grid factor)
    # 0.5 tCO2e/MWh ≈ 500 kgCO2e/MWh (Alberta grid average)
    s2_market = max(0.0, s2_l - recs['mwh'] * 0.5)

    gross   = s1 + s2_l + s3
    gross_m = s1 + s2_market + s3   # market-based gross
    net     = max(0.0, gross_m - off)

    price_cad = CARBON_PRICE.get(year, 95)

    # SBTi
    sbti_note = ''
    try:
        sb = sbti_t.get_item(Key={'TenantID': tenant_id}).get('Item') or {}
        if sb.get('TargetYear'):
            sbti_note = f'SBTi {sb.get("TargetType","??")} — {sb.get("AnnualReductionRate","??")}% yr reduction'
    except Exception:
        pass

    # Budget
    budget_t_val = 0.0
    try:
        bg = budget_t.get_item(Key={'TenantID': tenant_id}).get('Item') or {}
        budget_t_val = float(bg.get('AnnualBudgetKg', 0)) / 1000
    except Exception:
        pass

    result = {
        'tenant_id':            tenant_id,
        'year':                 year,
        'methodology':          'GHG Protocol Corporate Standard + Scope 2 Guidance',
        # Scope breakdown
        'scope1_t':             round(s1,      3),
        'scope2_location_t':    round(s2_l,    3),
        'scope2_market_t':      round(s2_market,3),
        'scope3_t':             round(s3,      3),
        # Gross (location-based, used in reports)
        'gross_t':              round(gross,   3),
        # Gross market-based (after RECs)
        'gross_market_t':       round(gross_m, 3),
        # Net (after verified offsets)
        'net_t':                round(net,     3),
        # RECs
        'recs_retired_count':   recs['count'],
        'recs_mwh_retired':     round(recs['mwh'], 2),
        'bill_c59_compliant':   recs['bill_c59'],
        # Offsets
        'offsets_t':            round(off,     3),
        'offsets_retired_count': 0,  # filled below
        # Reduction percentages
        'recs_reduction_pct':   round((s2_l - s2_market) / max(0.001, s2_l) * 100, 1) if s2_l > 0 else 0,
        'offsets_reduction_pct':round(off / max(0.001, gross_m) * 100, 1) if gross_m > 0 else 0,
        # Net zero
        'net_zero_ready':       net < 0.01,
        # Carbon pricing
        'carbon_price_cad':     price_cad,
        'carbon_tax_gross_cad': round(gross   * price_cad, 2),
        'carbon_tax_market_cad':round(gross_m * price_cad, 2),
        'carbon_tax_net_cad':   round(net     * price_cad, 2),
        # Context
        'annual_budget_t':      round(budget_t_val, 3),
        'budget_pct_used':      round(net / max(0.001, budget_t_val) * 100, 1) if budget_t_val > 0 else None,
        'sbti_note':            sbti_note,
        'generated_at':         datetime.now(timezone.utc).isoformat(),
    }
    logger.info('Emissions summary %s %d: gross=%.3f market=%.3f net=%.3f',
                tenant_id, year, gross, gross_m, net)
    return _r(200, result)
