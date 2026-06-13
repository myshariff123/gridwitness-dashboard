"""
gw-ms-scope1-staging — Scope 1 fuel usage recording.
Routes:
  GET  /api/tenants/{id}/scope1          — list entries
  POST /api/tenants/{id}/scope1          — record manual entry
  POST /api/scope1/ingest               — generic BMS webhook (any system)
Emission factors from ECCC National Inventory Report.
"""
import json, os, logging, time, uuid
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ca-central-1')
TABLE  = os.environ.get('SCOPE1_TABLE', 'gw-scope1-staging')

ddb   = boto3.resource('dynamodb', region_name=REGION)
table = ddb.Table(TABLE)

HDR = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

FACTORS = {
    'diesel':      {'factor': 2.68,  'unit': 'liters',  'label': 'Diesel'},
    'natural_gas': {'factor': 1.96,  'unit': 'm3',      'label': 'Natural Gas'},
    'propane':     {'factor': 1.51,  'unit': 'liters',  'label': 'Propane (LPG)'},
    'hfo':         {'factor': 3.18,  'unit': 'liters',  'label': 'Heavy Fuel Oil'},
    'gasoline':    {'factor': 2.31,  'unit': 'liters',  'label': 'Gasoline'},
    'coal':        {'factor': 2.50,  'unit': 'kg',      'label': 'Coal'},
}

def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

def lambda_handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
    if method == 'OPTIONS':
        return _r(200, {})
    path  = event.get('rawPath', '')
    parts = [p for p in path.split('/') if p]

    if 'ingest' in path and method == 'POST':
        body = json.loads(event.get('body') or '{}')
        return _record(body.get('tenant_id', ''), body)

    try:
        ti        = parts.index('tenants')
        tenant_id = parts[ti + 1]
    except (ValueError, IndexError):
        return _r(400, {'error': 'Invalid path'})

    if method == 'GET':
        qs = event.get('queryStringParameters') or {}
        return _list(tenant_id, int(qs.get('limit', 50)))
    elif method == 'POST':
        return _record(tenant_id, json.loads(event.get('body') or '{}'))
    return _r(405, {'error': 'Method not allowed'})

def _record(tenant_id, body):
    if not tenant_id:
        return _r(400, {'error': 'tenant_id required'})
    fuel   = body.get('fuel_type', '').lower().replace(' ', '_').replace('-', '_')
    qty    = float(body.get('quantity') or 0)
    source = body.get('source', 'manual_entry')

    if fuel not in FACTORS:
        valid = {k: '{} kgCO2e/{}'.format(v['factor'], v['unit']) for k, v in FACTORS.items()}
        return _r(400, {
            'error': 'Unknown fuel_type. Valid types: ' + str(list(FACTORS.keys())),
            'emission_factors': valid,
        })
    if qty <= 0:
        return _r(400, {'error': 'quantity must be > 0'})

    ef      = FACTORS[fuel]
    kg_co2e = round(qty * ef['factor'], 4)
    entry   = {
        'TenantID':       tenant_id,
        'RecordedAt':     str(int(time.time())),
        'EntryID':        's1-' + uuid.uuid4().hex[:12],
        'FuelType':       fuel,
        'Quantity':       Decimal(str(qty)),
        'Unit':           ef['unit'],
        'kgCO2e':         Decimal(str(kg_co2e)),
        'EmissionFactor': Decimal(str(ef['factor'])),
        'Source':         source,
        'PeriodStart':    body.get('period_start', ''),
        'PeriodEnd':      body.get('period_end', ''),
        'Notes':          body.get('notes', ''),
        'Scope':          'SCOPE_1',
    }
    table.put_item(Item=entry)
    logger.info('Scope1: %s %s %s%s = %s kgCO2e', tenant_id, fuel, qty, ef['unit'], kg_co2e)
    return _r(201, {
        'entry_id': entry['EntryID'], 'fuel_type': fuel,
        'quantity': qty, 'unit': ef['unit'],
        'kg_co2e': kg_co2e, 'emission_factor': ef['factor'],
        'recorded_at': entry['RecordedAt'],
    })

def _list(tenant_id, limit=50):
    items = table.query(
        KeyConditionExpression=Key('TenantID').eq(tenant_id),
        ScanIndexForward=False, Limit=min(limit, 200),
    ).get('Items', [])
    entries = [{
        'entry_id':     i.get('EntryID'),    'fuel_type':   i.get('FuelType'),
        'quantity':     float(i.get('Quantity', 0)), 'unit': i.get('Unit'),
        'kg_co2e':      float(i.get('kgCO2e', 0)),  'source': i.get('Source'),
        'period_start': i.get('PeriodStart'), 'period_end': i.get('PeriodEnd'),
        'recorded_at':  i.get('RecordedAt'),  'notes':      i.get('Notes', ''),
    } for i in items]
    total_kg = sum(e['kg_co2e'] for e in entries)
    return _r(200, {
        'entries': entries, 'count': len(entries),
        'total_kg_co2e': round(total_kg, 4),
        'total_t_co2e':  round(total_kg / 1000, 6),
    })
