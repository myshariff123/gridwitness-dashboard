"""gw-ms-api-keys-staging — Per-tenant API key management (create / list / revoke)."""
import json, os, hashlib, secrets, time, logging
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ca-central-1')
TABLE  = os.environ.get('KEYS_TABLE', 'gw-api-keys-staging')

ddb   = boto3.resource('dynamodb', region_name=REGION)
table = ddb.Table(TABLE)

HDR = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-GW-API-Key',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
}

def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

def lambda_handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
    if method == 'OPTIONS':
        return _r(200, {})
    path   = event.get('rawPath', '')
    parts  = [p for p in path.split('/') if p]
    try:
        ti        = parts.index('tenants')
        tenant_id = parts[ti + 1]
        key_id    = parts[ti + 3] if len(parts) > ti + 3 else None
    except (ValueError, IndexError):
        return _r(400, {'error': 'Invalid path'})

    if method == 'GET':
        return _list(tenant_id)
    elif method == 'POST':
        body = json.loads(event.get('body') or '{}')
        return _create(tenant_id, body.get('label', 'default'))
    elif method == 'DELETE' and key_id:
        return _revoke(tenant_id, key_id)
    return _r(405, {'error': 'Method not allowed'})

def _list(tenant_id):
    items = table.query(
        IndexName='TenantID-index',
        KeyConditionExpression=Key('TenantID').eq(tenant_id),
        ScanIndexForward=False,
    ).get('Items', [])
    return _r(200, [{
        'key_id':     i['KeyID'],
        'label':      i.get('Label', ''),
        'created_at': int(i.get('CreatedAt', 0)),
        'last_used':  int(i.get('LastUsedAt', 0)),
        'active':     bool(i.get('Active', True)),
    } for i in items])

def _create(tenant_id, label):
    plaintext = f"gwk-{secrets.token_hex(24)}"
    key_hash  = hashlib.sha256(plaintext.encode()).hexdigest()
    key_id    = f"gwk_{secrets.token_hex(4)}"
    now       = int(time.time())
    table.put_item(Item={
        'KeyHash': key_hash, 'TenantID': tenant_id, 'KeyID': key_id,
        'Label': label[:64], 'CreatedAt': now, 'LastUsedAt': 0, 'Active': True,
    })
    logger.info(f'Created key {key_id} for {tenant_id}')
    return _r(201, {
        'key_id': key_id, 'plaintext_key': plaintext, 'label': label,
        'created_at': now,
        'warning': 'This is the only time the plaintext key will be shown.',
    })

def _revoke(tenant_id, key_id):
    items = table.query(
        IndexName='TenantID-index',
        KeyConditionExpression=Key('TenantID').eq(tenant_id),
    ).get('Items', [])
    target = next((i for i in items if i.get('KeyID') == key_id), None)
    if not target:
        return _r(404, {'error': 'Key not found'})
    table.update_item(
        Key={'KeyHash': target['KeyHash']},
        UpdateExpression='SET Active = :f, RevokedAt = :t',
        ExpressionAttributeValues={':f': False, ':t': int(time.time())},
    )
    logger.info(f'Revoked key {key_id} for {tenant_id}')
    return _r(200, {'revoked': True, 'key_id': key_id})
