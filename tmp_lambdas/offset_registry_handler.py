"""
gw-ms-offset-registry-staging
Carbon offset registry — verified offsets → net emissions position.

Routes:
  GET  /api/tenants/{tenantId}/offsets                 → list offsets
  POST /api/tenants/{tenantId}/offsets                 → add offset
  PUT  /api/tenants/{tenantId}/offsets/{offsetId}      → update / retire
  GET  /api/tenants/{tenantId}/offsets/net-position    → gross vs net emissions

Net position = gross tCO2e − verified/retired offsets tCO2e (for the year).
Offsets update all reports to show verified net position.
"""
import json, os, uuid, logging
from datetime import datetime, timezone, date
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION   = os.environ.get('AWS_REGION',      'ca-central-1')
BUCKET   = os.environ.get('S3_BUCKET',       'gw-compliance-vault-768949138583')
ddb      = boto3.resource('dynamodb', region_name=REGION)
s3       = boto3.client('s3',         region_name=REGION)

off_t    = ddb.Table(os.environ.get('OFFSETS_TABLE',    'gw-offsets-staging'))
scope1_t = ddb.Table(os.environ.get('SCOPE1_TABLE',     'gw-scope1-staging'))
telem_t  = ddb.Table(os.environ.get('TELEMETRY_TABLE',  'gw-telemetry-staging'))
scope3_t = ddb.Table(os.environ.get('SCOPE3_TABLE',     'gw-scope3-staging'))
sbti_t   = ddb.Table(os.environ.get('SBTI_TABLE',       'gw-sbti-staging'))

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
}

REGISTRIES = {
    'GOLD_STANDARD': {'label':'Gold Standard',     'color':'yellow', 'url':'goldstandard.org'},
    'VCS':           {'label':'Verra VCS',          'color':'green',  'url':'verra.org'},
    'TIER':          {'label':'Alberta TIER',       'color':'blue',   'url':'alberta.ca'},
    'ACR':           {'label':'American Carbon Reg','color':'purple', 'url':'americancarbonregistry.org'},
    'CAR':           {'label':'Climate Action Res.','color':'teal',   'url':'climateactionreserve.org'},
    'ECOTRUST':      {'label':'EcoTrust Canada',    'color':'indigo', 'url':'ecotrust.ca'},
    'OBIN':          {'label':'Ontario Carbon',     'color':'orange', 'url':'ontario.ca'},
    'CUSTOM':        {'label':'Bilateral/Custom',   'color':'gray',   'url':''},
}

PROJECT_TYPES = [
    'reforestation', 'afforestation', 'improved_forest_mgmt',
    'soil_carbon', 'methane_capture', 'renewable_energy',
    'cookstoves', 'blue_carbon', 'direct_air_capture', 'avoided_deforestation',
]

def _r(code, body): return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}
def _now(): return datetime.now(timezone.utc).isoformat()
def _off_id(): return f'OFF-{uuid.uuid4().hex[:8].upper()}'

# ── Gross emissions ───────────────────────────────────────────────────────────
def _gross_emissions(tenant_id: str, year: int) -> dict:
    # Scope 1
    try:
        r = scope1_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id),
                           FilterExpression=Attr('Year').eq(str(year)))
        s1_kg = sum(float(i.get('kgCO2e',0)) for i in r.get('Items',[]))
    except Exception:
        s1_kg = 0.0

    # Scope 2
    try:
        r = telem_t.scan(FilterExpression=Attr('TenantID').eq(tenant_id)
                          & Attr('Source').ne('CLOUD_DISCOVERY'))
        s2_g = sum(float(i.get('CO2e_g',0)) for i in r.get('Items',[])
                   if str(i.get('Timestamp',''))[:4] == str(year))
        s2_kg = s2_g / 1000
    except Exception:
        s2_kg = 0.0

    # Scope 3 Cat.11
    try:
        r = scope3_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id),
                           FilterExpression=Attr('PeriodStart').begins_with(str(year)))
        s3_kg = sum(float(i.get('TotalKgCO2',0)) for i in r.get('Items',[]))
    except Exception:
        s3_kg = 0.0

    total_kg  = s1_kg + s2_kg + s3_kg
    return {
        'scope1_kg':  round(s1_kg,  2),
        'scope2_kg':  round(s2_kg,  2),
        'scope3_kg':  round(s3_kg,  2),
        'total_kg':   round(total_kg, 2),
        'total_tco2': round(total_kg / 1000, 3),
    }

# ── Offsets ───────────────────────────────────────────────────────────────────
def _get_offsets(tenant_id: str) -> list:
    try:
        r = off_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id),
                        FilterExpression=Attr('Deleted').ne(True))
        return sorted(r.get('Items',[]), key=lambda x: x.get('CreatedAt',''), reverse=True)
    except Exception as e:
        logger.warning('Offsets list: %s', e)
        return []

def _retired_for_year(offsets: list, year: int) -> list:
    return [o for o in offsets
            if o.get('Status') == 'RETIRED' and int(o.get('RetiredFor', 0)) == year]

# ── Net position ──────────────────────────────────────────────────────────────
def _net_position(tenant_id: str, year: int) -> dict:
    gross     = _gross_emissions(tenant_id, year)
    all_offs  = _get_offsets(tenant_id)
    retired   = _retired_for_year(all_offs, year)

    total_off_tco2 = sum(float(o.get('QuantityTco2', 0)) for o in retired)
    net_tco2       = max(0, gross['total_tco2'] - total_off_tco2)
    reduction_pct  = round(total_off_tco2 / max(0.001, gross['total_tco2']) * 100, 1)

    # By registry
    by_registry: dict = {}
    for o in retired:
        reg = o.get('Registry', 'CUSTOM')
        by_registry.setdefault(reg, 0.0)
        by_registry[reg] += float(o.get('QuantityTco2', 0))

    # SBTi note
    try:
        sbti = sbti_t.get_item(Key={'TenantID': tenant_id}).get('Item') or {}
        sbti_note = f'SBTi target: -{sbti.get("Scope12ReductionPct","??")}% by {sbti.get("TargetYear","2030")}'
    except Exception:
        sbti_note = ''

    return {
        'year':                  year,
        'gross':                 gross,
        'offsets_retired_count': len(retired),
        'offsets_tco2':          round(total_off_tco2, 3),
        'net_tco2':              round(net_tco2, 3),
        'reduction_pct':         reduction_pct,
        'net_zero_ready':        net_tco2 < 0.01,
        'by_registry':           {k: round(v, 3) for k, v in by_registry.items()},
        'sbti_note':             sbti_note,
        'methodology':           'GHG Protocol Corporate Standard + offset retirement verification',
        'retired_details': [
            {
                'offset_id':   o['OffsetID'],
                'registry':    o.get('Registry',''),
                'serial_no':   o.get('SerialNo',''),
                'quantity_tco2': float(o.get('QuantityTco2',0)),
                'project':     o.get('ProjectName',''),
                'project_type':o.get('ProjectType',''),
                'vintage':     o.get('VintageYear'),
                'retired_for': o.get('RetiredFor'),
            }
            for o in retired
        ],
    }

# ── Handler ───────────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    method   = event.get('requestContext',{}).get('http',{}).get('method','GET').upper()
    path_p   = event.get('pathParameters') or {}
    qs       = event.get('queryStringParameters') or {}
    raw_path = event.get('rawPath','')

    if method == 'OPTIONS':
        return _r(200, {})

    tenant_id = path_p.get('tenantId') or qs.get('tenant_id') or ''
    offset_id = path_p.get('offsetId') or ''
    year      = int(qs.get('year', date.today().year))

    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    # GET net-position
    if method == 'GET' and 'net-position' in raw_path:
        return _r(200, _net_position(tenant_id, year))

    # GET list
    if method == 'GET':
        items = _get_offsets(tenant_id)
        yr    = int(qs.get('year', 0))
        if yr:
            items = [i for i in items if int(i.get('VintageYear',0)) == yr
                     or int(i.get('RetiredFor',0)) == yr]
        by_reg: dict = {}
        for o in items:
            by_reg.setdefault(o.get('Registry','CUSTOM'), 0)
            by_reg[o.get('Registry','CUSTOM')] += 1

        return _r(200, {
            'tenant_id':    tenant_id,
            'offsets':      items,
            'count':        len(items),
            'total_tco2':   round(sum(float(i.get('QuantityTco2',0)) for i in items), 3),
            'retired_tco2': round(sum(float(i.get('QuantityTco2',0)) for i in items
                                       if i.get('Status')=='RETIRED'), 3),
            'by_registry':  by_reg,
            'registry_meta':REGISTRIES,
        })

    # POST — add offset
    if method == 'POST' and not offset_id:
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        qty = float(body.get('quantity_tco2') or body.get('QuantityTco2') or 0)
        if qty <= 0:
            return _r(400, {'error': 'quantity_tco2 must be > 0'})
        if not body.get('registry'):
            return _r(400, {'error': 'registry required'})

        oid  = _off_id()
        item = {
            'TenantID':    tenant_id,
            'OffsetID':    oid,
            'Registry':    body['registry'].upper(),
            'SerialNo':    body.get('serial_no','').strip(),
            'VintageYear': int(body.get('vintage_year', date.today().year)),
            'QuantityTco2':Decimal(str(qty)),
            'ProjectName': body.get('project_name','').strip(),
            'ProjectType': body.get('project_type','').lower(),
            'Country':     body.get('country','CA').upper(),
            'Province':    body.get('province','').upper(),
            'PricePerTco2':Decimal(str(body.get('price_per_tco2',0) or 0)),
            'CoRegistryUrl':body.get('co_registry_url','').strip(),
            'Notes':       body.get('notes','').strip(),
            'Status':      'ACTIVE',
            'CreatedAt':   _now(),
        }
        off_t.put_item(Item=item)
        logger.info('Offset added: %s %s %.3f tCO2e', tenant_id, oid, qty)
        return _r(201, {'ok': True, 'offset_id': oid})

    # PUT — update / retire
    if method == 'PUT' and offset_id:
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        now    = _now()
        status = body.get('status','').upper()
        upd    = 'SET UpdatedAt = :t'
        names, vals = {}, {':t': now}

        if status:
            upd += ', #st = :s'; names['#st'] = 'Status'; vals[':s'] = status
        if status == 'RETIRED':
            upd += ', RetiredAt = :ra, RetiredFor = :rf'
            vals[':ra'] = now
            vals[':rf'] = int(body.get('retired_for', date.today().year))
        if body.get('notes') is not None:
            upd += ', Notes = :n'; vals[':n'] = body['notes']
        if body.get('co_registry_url'):
            upd += ', CoRegistryUrl = :url'; vals[':url'] = body['co_registry_url']

        kw = dict(Key={'TenantID': tenant_id, 'OffsetID': offset_id},
                  UpdateExpression=upd, ExpressionAttributeValues=vals)
        if names: kw['ExpressionAttributeNames'] = names
        off_t.update_item(**kw)
        logger.info('Offset updated: %s %s → %s', tenant_id, offset_id, status)
        return _r(200, {'ok': True, 'offset_id': offset_id, 'status': status})

    # DELETE — soft delete
    if method == 'DELETE' and offset_id:
        off_t.update_item(
            Key={'TenantID': tenant_id, 'OffsetID': offset_id},
            UpdateExpression='SET Deleted = :d, DeletedAt = :t',
            ExpressionAttributeValues={':d': True, ':t': _now()},
        )
        return _r(200, {'ok': True, 'offset_id': offset_id})

    return _r(405, {'error': 'Method not allowed'})
