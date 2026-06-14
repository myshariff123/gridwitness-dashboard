"""
GridWitness — MS-4: ms-telemetry-oracle
Carbon math. SHA-256 hash chain. WORM DynamoDB seal.
API key validation: audit-mode by default; enforcement-mode per-tenant flag.
"""
import json, os, hashlib, uuid, time, boto3, logging
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb      = boto3.resource('dynamodb', region_name='ca-central-1')
s3            = boto3.client('s3', region_name='ca-central-1')
tel_table     = dynamodb.Table(os.environ['TELEMETRY_TABLE'])
cache_table   = dynamodb.Table(os.environ['GRID_CACHE_TABLE'])
apikey_table  = dynamodb.Table(os.environ.get('APIKEY_TABLE', 'gw-api-keys-staging'))
tenants_table = dynamodb.Table(os.environ.get('TENANTS_TABLE', 'gw-tenants-staging'))
VAULT_BUCKET  = os.environ['VAULT_BUCKET']

FALLBACK_INTENSITY = {'AB': 510.0, 'BC': 15.0, 'QC': 2.0, 'ON': 40.0, 'DEFAULT': 300.0}


def _validate_and_touch_key(api_key: str, tenant_id: str) -> bool:
    """Returns True if key is valid. Updates LastUsedAt on success."""
    if not api_key:
        logger.warning('api_key_missing tenant=%s', tenant_id)
        return False
    if not api_key.startswith('gwk-'):
        logger.warning('api_key_invalid_format key=...%s tenant=%s', api_key[-6:], tenant_id)
        return False
    try:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        item = apikey_table.get_item(Key={'KeyHash': key_hash}).get('Item')
        if not item:
            logger.warning('api_key_unknown key=...%s tenant=%s', api_key[-6:], tenant_id)
            return False
        if not item.get('Active', True):
            logger.warning('api_key_revoked key=...%s tenant=%s', api_key[-6:], tenant_id)
            return False
        if item.get('TenantID') != tenant_id:
            logger.warning('api_key_tenant_mismatch key=...%s claimed=%s actual=%s',
                           api_key[-6:], tenant_id, item.get('TenantID'))
            return False
        apikey_table.update_item(
            Key={'KeyHash': key_hash},
            UpdateExpression='SET LastUsedAt = :ts',
            ExpressionAttributeValues={':ts': int(time.time())})
        logger.info('api_key_ok key=...%s tenant=%s', api_key[-6:], tenant_id)
        return True
    except Exception as e:
        logger.warning('api_key_lookup_error: %s', e)
        return False


def _get_enforcement_mode(tenant_id: str) -> bool:
    """Returns True if tenant has EnforcementMode enabled."""
    try:
        item = tenants_table.get_item(
            Key={'TenantID': tenant_id},
            ProjectionExpression='EnforcementMode'
        ).get('Item')
        return bool(item.get('EnforcementMode', False)) if item else False
    except Exception as e:
        logger.warning('enforcement_mode_lookup_error tenant=%s: %s', tenant_id, e)
        return False


def _normalise(payload: dict) -> dict:
    return {
        'tenant_id':      payload.get('TenantID')      or payload.get('tenant_id', ''),
        'source':         payload.get('Source')        or payload.get('source', 'unknown'),
        'actual_wattage': float(payload.get('Actual_Wattage') or payload.get('actual_wattage', 0)),
        'grid_id':        (payload.get('GridID') or payload.get('grid_id', 'AB')).upper(),
        'data_source':    payload.get('DataSource')    or payload.get('data_source', 'UNKNOWN'),
        'timestamp':      payload.get('Timestamp')     or datetime.now(timezone.utc).isoformat(),
        'pue_multiplier': float(payload.get('PUE_Multiplier') or payload.get('pue_multiplier', 1.15)),
        'api_key':        payload.get('api_key', ''),
    }


def _get_grid_intensity(grid_id: str) -> tuple:
    try:
        result = cache_table.query(
            KeyConditionExpression='GridID = :g',
            ExpressionAttributeValues={':g': grid_id},
            ScanIndexForward=False,
            Limit=5)
        items = result.get('Items', [])
        for item in items:
            q = item.get('DataQuality', '')
            if q and 'FALLBACK' not in q and 'STATIC' not in q and 'BASELINE' not in q:
                intensity = float(item['CarbonIntensity'])
                logger.info('Grid cache hit for %s: %s gCO2/kWh quality=%s', grid_id, intensity, q)
                return intensity, q
        if items:
            return float(items[0]['CarbonIntensity']), items[0].get('DataQuality', 'LIVE')
    except Exception as e:
        logger.warning('Grid cache miss for %s: %s', grid_id, e)
    fallback = FALLBACK_INTENSITY.get(grid_id, FALLBACK_INTENSITY['DEFAULT'])
    logger.warning('Using fallback intensity for %s: %s gCO2/kWh', grid_id, fallback)
    return fallback, 'FALLBACK_BASELINE'


def _sha256_hash(tenant_id, timestamp, wattage, grid_id, previous_hash):
    raw = f'{tenant_id}|{timestamp}|{wattage:.4f}|{grid_id}|{previous_hash}'
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _get_previous_hash(tenant_id, timestamp):
    try:
        result = tel_table.query(
            KeyConditionExpression='TenantID = :t AND #ts < :now',
            ExpressionAttributeNames={'#ts': 'Timestamp'},
            ExpressionAttributeValues={':t': tenant_id, ':now': timestamp},
            ScanIndexForward=False,
            Limit=1,
            ProjectionExpression='SHA256Hash')
        items = result.get('Items', [])
        return items[0]['SHA256Hash'] if items else 'GENESIS'
    except Exception:
        return 'GENESIS'


def _write_hash_chain_block(tenant_id, tx_id, sha256, timestamp,
                             wattage, grid_id, carbon_debt, previous_hash):
    date_prefix = timestamp[:10]
    key = f'hash-chain/{date_prefix}/{tenant_id}/{tx_id}.json'
    block = {
        'txid': tx_id, 'tenant_id': tenant_id, 'timestamp': timestamp,
        'sha256': sha256, 'previous_hash': previous_hash, 'wattage': wattage,
        'grid_id': grid_id, 'carbon_gco2': carbon_debt,
        'sealed_at': datetime.now(timezone.utc).isoformat(),
    }
    s3.put_object(
        Bucket=VAULT_BUCKET, Key=key,
        Body=json.dumps(block).encode('utf-8'),
        ContentType='application/json',
        ServerSideEncryption='aws:kms')


def _process_record(payload_str: str) -> dict:
    raw = json.loads(payload_str)
    p   = _normalise(raw)

    if not p['tenant_id']:
        raise ValueError('tenant_id is required')
    if p['actual_wattage'] <= 0:
        raise ValueError('Invalid wattage: ' + str(p['actual_wattage']))

    key_valid = _validate_and_touch_key(p['api_key'], p['tenant_id'])
    if not key_valid and _get_enforcement_mode(p['tenant_id']):
        logger.warning('ENFORCEMENT_REJECT tenant=%s reason=invalid_api_key', p['tenant_id'])
        return {'status': 'REJECTED', 'reason': 'enforcement_mode_invalid_key'}

    intensity, quality = _get_grid_intensity(p['grid_id'])
    carbon_debt = (p['actual_wattage'] * intensity * p['pue_multiplier']) / 1000.0
    previous_hash = _get_previous_hash(p['tenant_id'], p['timestamp'])
    tx_id  = str(uuid.uuid4())
    sha256 = _sha256_hash(p['tenant_id'], p['timestamp'],
                          p['actual_wattage'], p['grid_id'], previous_hash)

    item = {
        'TenantID': p['tenant_id'], 'Timestamp': p['timestamp'], 'TxID': tx_id,
        'Source': p['source'],
        'ActualWattage': Decimal(str(round(p['actual_wattage'], 4))),
        'GridID': p['grid_id'],
        'CarbonIntensity': Decimal(str(round(intensity, 4))),
        'CarbonDebt_gCO2': Decimal(str(round(carbon_debt, 6))),
        'PUE_Multiplier': Decimal(str(p['pue_multiplier'])),
        'SHA256Hash': sha256, 'PreviousHash': previous_hash,
        'DataSource': p['data_source'], 'DataQuality': quality,
        'RecordVersion': '1.0',
        'SealedAt': datetime.now(timezone.utc).isoformat(),
    }
    tel_table.put_item(Item=item)
    logger.info('WORM record sealed: %s tenant=%s sha256=%s...', tx_id, p['tenant_id'], sha256[:16])
    _write_hash_chain_block(p['tenant_id'], tx_id, sha256, p['timestamp'],
                             p['actual_wattage'], p['grid_id'], carbon_debt, previous_hash)
    return {'tx_id': tx_id, 'sha256': sha256[:16], 'status': 'SEALED'}


def lambda_handler(event, context):
    results, batch_failures = [], []
    for record in event.get('Records', []):
        msg_id = record.get('messageId', 'unknown')
        try:
            result = _process_record(record['body'])
            results.append({'messageId': msg_id, **result})
        except Exception as e:
            logger.error('Failed to process SQS record %s: %s', msg_id, e)
            batch_failures.append({'itemIdentifier': msg_id})
    logger.info('Batch complete: %d sealed, %d failed', len(results), len(batch_failures))
    if batch_failures:
        return {'batchItemFailures': batch_failures}
    return {'statusCode': 200, 'processed': len(results)}
