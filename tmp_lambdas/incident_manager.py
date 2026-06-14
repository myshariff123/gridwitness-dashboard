"""
gw-ms-incident-manager-staging

Handles two event sources:
  SQS:    op: open_or_update | auto_close
  API GW: GET  /api/incidents
          POST /api/incidents/{id}/actions
          POST /api/incidents/{id}/close

DynamoDB: gw-incidents-staging (PK: TenantID, SK: IncidentID)
GSIs:
  TenantID-Status-index    (HASH TenantID, RANGE Status)
  TenantID-OpenedAt-index  (HASH TenantID, RANGE OpenedAt)
"""
import json, uuid, os, logging
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION          = os.environ.get('AWS_REGION', 'ca-central-1')
INCIDENTS_TABLE = os.environ.get('INCIDENTS_TABLE', 'gw-incidents-staging')

ddb   = boto3.resource('dynamodb', region_name=REGION)
table = ddb.Table(INCIDENTS_TABLE)

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
}


def lambda_handler(event, context):
    if 'Records' in event:
        for record in event['Records']:
            try:
                msg = json.loads(record['body'])
                op  = msg.get('op', '')
                if op == 'open_or_update':
                    open_or_update_incident(msg)
                elif op == 'auto_close':
                    auto_close_incident(msg)
                else:
                    logger.warning('Unknown SQS op: %s', op)
            except Exception as e:
                logger.error('SQS record error: %s body=%s', e, record.get('body'))
        return {}

    method   = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    raw_path = event.get('rawPath', '')

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': HDR, 'body': '{}'}

    if method == 'GET' and (raw_path.endswith('/incidents') or raw_path.endswith('/incidents/')):
        return handle_list(event)

    if method == 'POST' and '/actions' in raw_path:
        inc_id = (event.get('pathParameters') or {}).get('incidentId', '')
        return handle_action(event, inc_id)

    if method == 'POST' and raw_path.endswith('/close'):
        inc_id = (event.get('pathParameters') or {}).get('incidentId', '')
        return handle_close(event, inc_id)

    return _r(405, {'error': 'Method not allowed'})


# ─── Helpers ────────────────────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc).isoformat()

def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

def _decimal_safe(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


# ─── SQS — open or update ───────────────────────────────────────────────────

def _find_open(tenant_id, grid_id, metric):
    resp = table.query(
        IndexName='TenantID-Status-index',
        KeyConditionExpression=Key('TenantID').eq(tenant_id) & Key('Status').eq('OPEN'),
        FilterExpression=Attr('GridID').eq(grid_id) & Attr('Metric').eq(metric),
    )
    items = resp.get('Items', [])
    return items[0] if items else None


def open_or_update_incident(msg):
    tenant_id   = msg['tenant_id']
    grid_id     = msg.get('grid_id', 'AB')
    metric      = msg.get('metric', 'unknown')
    value       = float(msg.get('value', 0))
    threshold   = float(msg.get('threshold', 0))
    severity    = msg.get('severity', 'WARNING')
    source      = msg.get('source', 'UNKNOWN')
    title       = msg.get('title') or f'{grid_id} {metric.replace("_", " ").title()}'
    description = msg.get('description') or ''

    existing = _find_open(tenant_id, grid_id, metric)

    if existing:
        peak = max(float(existing.get('PeakValue') or value), value)
        table.update_item(
            Key={'TenantID': tenant_id, 'IncidentID': existing['IncidentID']},
            UpdateExpression=(
                'SET LastObservedAt = :t, '
                'ObservationCount = if_not_exists(ObservationCount, :zero) + :one, '
                'PeakValue = :peak, BreachValue = :val, '
                'Title = :title, Description = :desc, Source = :src, Severity = :sev'
            ),
            ExpressionAttributeValues={
                ':t':     _now(),
                ':zero':  0,
                ':one':   1,
                ':peak':  Decimal(str(peak)),
                ':val':   Decimal(str(value)),
                ':title': title,
                ':desc':  description,
                ':src':   source,
                ':sev':   severity,
            },
        )
        logger.info('INCIDENT_UPDATED id=%s tenant=%s zone=%s value=%.0f',
                    existing['IncidentID'], tenant_id, grid_id, value)
    else:
        incident_id = f'INC-{uuid.uuid4().hex[:8].upper()}'
        now = _now()
        table.put_item(Item={
            'TenantID':         tenant_id,
            'IncidentID':       incident_id,
            'Status':           'OPEN',
            'GridID':           grid_id,
            'Metric':           metric,
            'BreachValue':      Decimal(str(value)),
            'PeakValue':        Decimal(str(value)),
            'Threshold':        Decimal(str(threshold)),
            'Severity':         severity,
            'Source':           source,
            'Title':            title,
            'Description':      description,
            'AutoGenerated':    True,
            'ObservationCount': 1,
            'OpenedAt':         now,
            'LastObservedAt':   now,
            'LastAction':       'none',
            'Actions':          [],
        })
        logger.info('INCIDENT_OPENED id=%s tenant=%s zone=%s metric=%s value=%.0f threshold=%.0f',
                    incident_id, tenant_id, grid_id, metric, value, threshold)


# ─── SQS — auto close ───────────────────────────────────────────────────────

def auto_close_incident(msg):
    tenant_id = msg['tenant_id']
    grid_id   = msg.get('grid_id', 'AB')
    metric    = msg.get('metric', 'unknown')
    value     = float(msg.get('value', 0))

    existing = _find_open(tenant_id, grid_id, metric)
    if not existing:
        return

    table.update_item(
        Key={'TenantID': tenant_id, 'IncidentID': existing['IncidentID']},
        UpdateExpression=(
            'SET #st = :closed, ClosedAt = :t, AutoClosedAt = :t, '
            'LastObservedAt = :t, LastAction = :act, AutoCloseValue = :val'
        ),
        ExpressionAttributeNames={'#st': 'Status'},
        ExpressionAttributeValues={
            ':closed': 'CLOSED',
            ':t':      _now(),
            ':act':    'AUTO_CLOSED_GRID_RECOVERED',
            ':val':    Decimal(str(value)),
        },
    )
    logger.info('INCIDENT_AUTO_CLOSED id=%s tenant=%s zone=%s recovered_at=%.0f',
                existing['IncidentID'], tenant_id, grid_id, value)


# ─── API GW — list incidents ─────────────────────────────────────────────────

def handle_list(event):
    qs        = event.get('queryStringParameters') or {}
    tenant_id = qs.get('tenant_id', '')
    status    = qs.get('status')

    if not tenant_id:
        return _r(400, {'error': 'tenant_id required'})

    if status in ('OPEN', 'CLOSED'):
        resp = table.query(
            IndexName='TenantID-Status-index',
            KeyConditionExpression=Key('TenantID').eq(tenant_id) & Key('Status').eq(status),
            ScanIndexForward=False,
            Limit=50,
        )
    else:
        resp = table.query(
            IndexName='TenantID-OpenedAt-index',
            KeyConditionExpression=Key('TenantID').eq(tenant_id),
            ScanIndexForward=False,
            Limit=50,
        )

    items = []
    for item in resp.get('Items', []):
        row = {k: _decimal_safe(v) for k, v in item.items()}
        items.append(row)

    return _r(200, {'items': items, 'count': len(items)})


# ─── API GW — record action ──────────────────────────────────────────────────

def handle_action(event, incident_id):
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _r(400, {'error': 'Invalid JSON'})

    tenant_id = body.get('tenant_id', '')
    action    = body.get('action', '')
    actor     = body.get('actor', 'unknown')

    if not tenant_id or not action or not incident_id:
        return _r(400, {'error': 'tenant_id, action, incidentId required'})

    now = _now()
    try:
        table.update_item(
            Key={'TenantID': tenant_id, 'IncidentID': incident_id},
            UpdateExpression=(
                'SET LastAction = :a, LastActionAt = :t, LastActionBy = :actor, '
                'Actions = list_append(if_not_exists(Actions, :empty), :entry)'
            ),
            ExpressionAttributeValues={
                ':a':     action,
                ':t':     now,
                ':actor': actor,
                ':empty': [],
                ':entry': [{'action': action, 'actor': actor, 'at': now}],
            },
            ConditionExpression=Attr('TenantID').exists(),
        )
    except ddb.meta.client.exceptions.ConditionalCheckFailedException:
        return _r(404, {'error': 'Incident not found'})

    logger.info('INCIDENT_ACTION id=%s action=%s actor=%s', incident_id, action, actor)
    return _r(200, {'ok': True, 'incident_id': incident_id, 'action': action})


# ─── API GW — force close ────────────────────────────────────────────────────

def handle_close(event, incident_id):
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _r(400, {'error': 'Invalid JSON'})

    tenant_id = body.get('tenant_id', '')
    actor     = body.get('actor', 'unknown')
    reason    = body.get('reason', 'manual_close')

    if not tenant_id or not incident_id:
        return _r(400, {'error': 'tenant_id and incidentId required'})

    now = _now()
    try:
        table.update_item(
            Key={'TenantID': tenant_id, 'IncidentID': incident_id},
            UpdateExpression=(
                'SET #st = :closed, ClosedAt = :t, ClosedBy = :actor, '
                'CloseReason = :reason, LastAction = :act, LastActionAt = :t, '
                'Actions = list_append(if_not_exists(Actions, :empty), :entry)'
            ),
            ExpressionAttributeNames={'#st': 'Status'},
            ExpressionAttributeValues={
                ':closed': 'CLOSED',
                ':t':      now,
                ':actor':  actor,
                ':reason': reason,
                ':act':    'MANUAL_CLOSE',
                ':empty':  [],
                ':entry':  [{'action': 'MANUAL_CLOSE', 'actor': actor, 'reason': reason, 'at': now}],
            },
            ConditionExpression=Attr('TenantID').exists() & Attr('#st').eq('OPEN'),
        )
    except ddb.meta.client.exceptions.ConditionalCheckFailedException:
        return _r(409, {'error': 'Incident not found or already closed'})

    logger.info('INCIDENT_CLOSED id=%s actor=%s reason=%s', incident_id, actor, reason)
    return _r(200, {'ok': True, 'incident_id': incident_id, 'status': 'CLOSED'})
