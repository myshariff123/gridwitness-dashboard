"""
gw-ms-rec-tracker-staging
Renewable Energy Certificate (REC) and PPA tracker.
Required for market-based Scope 2 methodology under Bill C-59 net-zero claims.

Routes:
  GET    /api/tenants/{tenantId}/recs                → list RECs/PPAs (optional ?year=)
  POST   /api/tenants/{tenantId}/recs                → add REC or PPA
  PUT    /api/tenants/{tenantId}/recs/{recId}        → update / retire
  DELETE /api/tenants/{tenantId}/recs/{recId}        → delete (soft)
  GET    /api/tenants/{tenantId}/recs/scope2         → market-based vs location-based Scope 2

Market-based Scope 2 calculation (GHG Protocol Scope 2 Guidance):
  Market-based = max(0, location-based_kgCO2e − retired_RECs_MWh × zero_emission_factor)
  Where zero_emission_factor = 0 gCO2e/kWh for bundled RECs from certified zero-carbon sources.
"""
import json, os, uuid, logging
from datetime import datetime, timezone, date
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ca-central-1')
ddb    = boto3.resource('dynamodb', region_name=REGION)
rec_t  = ddb.Table(os.environ.get('RECS_TABLE',      'gw-recs-staging'))
telem_t= ddb.Table(os.environ.get('TELEMETRY_TABLE', 'gw-telemetry-staging'))
grid_t = ddb.Table('gw-grid-cache-staging')

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
}

CERTIFIED_BODIES = ['EcoLogo','Green-e','I-REC','TIGR','RE100','IREC']
FUEL_TYPES       = ['solar','wind','hydro','geothermal','biomass','tidal']
REC_TYPES        = ['REC','PPA','VPPA','BUNDLED_REC','UNBUNDLED_REC','GREEN_TARIFF']

def _r(code, body): return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}
def _now(): return datetime.now(timezone.utc).isoformat()
def _rec_id(): return f'REC-{uuid.uuid4().hex[:8].upper()}'

# ── Location-based Scope 2 (from telemetry) ───────────────────────────────────
def _location_scope2(tenant_id: str, year: int) -> float:
    """Sum CO2e_g from telemetry for the year, convert to kgCO2e."""
    try:
        r = telem_t.scan(
            FilterExpression=Attr('TenantID').eq(tenant_id) & Attr('Source').ne('CLOUD_DISCOVERY')
        )
        total_g = sum(
            float(i.get('CO2e_g', 0)) for i in r.get('Items', [])
            if str(i.get('Timestamp', ''))[:4] == str(year)
        )
        return total_g / 1000  # g → kg
    except Exception as e:
        logger.warning('Telemetry scan: %s', e)
        return 0.0

# ── RECs/PPAs retired for a year ──────────────────────────────────────────────
def _retired_recs(tenant_id: str, year: int) -> list:
    """Return all RECs retired for a specific year."""
    try:
        r = rec_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id),
                        FilterExpression=Attr('RetiredFor').eq(year) & Attr('Status').eq('RETIRED'))
        return r.get('Items', [])
    except Exception:
        return []

def _all_recs(tenant_id: str, year: int | None = None) -> list:
    try:
        kce = Key('TenantID').eq(tenant_id)
        fe  = Attr('Deleted').ne(True)
        if year:
            fe = fe & (Attr('VintageYear').eq(year) | Attr('RetiredFor').eq(year))
        r = rec_t.query(KeyConditionExpression=kce, FilterExpression=fe)
        return sorted(r.get('Items', []), key=lambda x: x.get('CreatedAt', ''), reverse=True)
    except Exception as e:
        logger.warning('RECs list: %s', e)
        return []

# ── Market-based Scope 2 calculation ─────────────────────────────────────────
def _market_scope2(tenant_id: str, year: int) -> dict:
    location_kg   = _location_scope2(tenant_id, year)
    retired       = _retired_recs(tenant_id, year)
    retired_mwh   = sum(float(r.get('MWh', 0)) for r in retired)
    # Each retired REC-MWh offsets 1 MWh of grid electricity consumption
    # Market-based residual factor for certified zero-carbon RECs = 0 gCO2e/kWh
    # Location-based assumed ~500 kgCO2e/MWh average Canadian grid
    location_mwh  = location_kg / 500  # rough reverse conversion
    market_kg     = max(0, location_kg - retired_mwh * 500)  # simplified
    reduction_pct = round((retired_mwh * 500 / max(1, location_kg)) * 100, 1)

    return {
        'year':                year,
        'location_based_kg':   round(location_kg, 2),
        'location_based_tco2': round(location_kg / 1000, 3),
        'retired_recs_count':  len(retired),
        'retired_recs_mwh':    round(retired_mwh, 2),
        'market_based_kg':     round(market_kg, 2),
        'market_based_tco2':   round(market_kg / 1000, 3),
        'reduction_pct':       reduction_pct,
        'bill_c59_compliant':  len(retired) > 0 and all(
            r.get('CertifiedBy') in CERTIFIED_BODIES for r in retired
        ),
        'methodology':         'GHG Protocol Scope 2 Guidance — Market-Based Method',
        'retired_details':     [
            {
                'rec_id':      r['RECID'],
                'provider':    r.get('Provider', ''),
                'mwh':         float(r.get('MWh', 0)),
                'certified_by':r.get('CertifiedBy', ''),
                'fuel_type':   r.get('FuelType', ''),
                'vintage':     r.get('VintageYear'),
            }
            for r in retired
        ],
    }

# ── Handler ───────────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    method  = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    path_p  = event.get('pathParameters') or {}
    qs      = event.get('queryStringParameters') or {}
    raw_path= event.get('rawPath', '')

    if method == 'OPTIONS':
        return _r(200, {})

    tenant_id = path_p.get('tenantId') or qs.get('tenant_id') or ''
    rec_id    = path_p.get('recId') or ''
    year      = int(qs.get('year', date.today().year))

    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    # GET /recs/scope2
    if method == 'GET' and 'scope2' in raw_path:
        result = _market_scope2(tenant_id, year)
        return _r(200, result)

    # GET /recs
    if method == 'GET':
        yr   = int(qs.get('year', 0)) or None
        items= _all_recs(tenant_id, yr)
        return _r(200, {
            'tenant_id': tenant_id,
            'recs': items,
            'count': len(items),
            'total_mwh': sum(float(i.get('MWh',0)) for i in items),
            'retired_mwh': sum(float(i.get('MWh',0)) for i in items if i.get('Status')=='RETIRED'),
        })

    # POST /recs — add
    if method == 'POST' and not rec_id:
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        mwh = float(body.get('mwh') or body.get('MWh') or 0)
        if mwh <= 0:
            return _r(400, {'error': 'mwh must be > 0'})

        rid  = _rec_id()
        item = {
            'TenantID':      tenant_id,
            'RECID':         rid,
            'Type':          body.get('type', 'REC').upper(),
            'Provider':      body.get('provider', '').strip(),
            'CertificateNo': body.get('certificate_no', '').strip(),
            'CertifiedBy':   body.get('certified_by', '').strip(),
            'MWh':           Decimal(str(mwh)),
            'VintageYear':   int(body.get('vintage_year', date.today().year)),
            'FuelType':      body.get('fuel_type', '').lower(),
            'Province':      body.get('province', '').upper(),
            'Country':       body.get('country', 'CA'),
            'PricePerMWh':   Decimal(str(body.get('price_per_mwh', 0) or 0)),
            'Status':        'ACTIVE',
            'Notes':         body.get('notes', ''),
            'CreatedAt':     _now(),
        }
        rec_t.put_item(Item=item)
        logger.info('REC added: %s %s %.1f MWh', tenant_id, rid, mwh)
        return _r(201, {'ok': True, 'rec_id': rid})

    # PUT /recs/{recId} — update / retire
    if method == 'PUT' and rec_id:
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        now    = _now()
        status = body.get('status', '').upper()
        upd_expr = 'SET UpdatedAt = :t'
        names, values = {}, {':t': now}

        if status:
            upd_expr += ', #st = :s'; names['#st'] = 'Status'; values[':s'] = status
        if status == 'RETIRED':
            upd_expr += ', RetiredAt = :ra, RetiredFor = :rf'
            values[':ra'] = now
            values[':rf'] = int(body.get('retired_for', date.today().year))
        if body.get('notes') is not None:
            upd_expr += ', Notes = :n'; values[':n'] = body['notes']
        if body.get('certificate_no'):
            upd_expr += ', CertificateNo = :cn'; values[':cn'] = body['certificate_no']

        kwargs = dict(
            Key={'TenantID': tenant_id, 'RECID': rec_id},
            UpdateExpression=upd_expr,
            ExpressionAttributeValues=values,
        )
        if names: kwargs['ExpressionAttributeNames'] = names

        rec_t.update_item(**kwargs)
        logger.info('REC updated: %s %s → %s', tenant_id, rec_id, status or 'notes')
        return _r(200, {'ok': True, 'rec_id': rec_id, 'status': status})

    # DELETE /recs/{recId} — soft delete
    if method == 'DELETE' and rec_id:
        rec_t.update_item(
            Key={'TenantID': tenant_id, 'RECID': rec_id},
            UpdateExpression='SET Deleted = :d, DeletedAt = :t',
            ExpressionAttributeValues={':d': True, ':t': _now()},
        )
        return _r(200, {'ok': True, 'rec_id': rec_id})

    return _r(405, {'error': 'Method not allowed'})
