"""ms-telemetry-live — Returns last 500 records sorted newest-first.
API key validation: audit-mode (log missing/invalid, never reject).
Valid keys get LastUsedAt updated in gw-api-keys-staging.
"""
import json, os, logging, time, hashlib
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ca-central-1')
ddb = boto3.resource('dynamodb', region_name=REGION)
tel_table    = ddb.Table(os.environ.get('TELEMETRY_TABLE',  'gw-telemetry-staging'))
cache_table  = ddb.Table(os.environ.get('GRID_CACHE_TABLE', 'gw-grid-cache-staging'))
apikey_table = ddb.Table(os.environ.get('APIKEY_TABLE',     'gw-api-keys-staging'))

INTENSITY_FALLBACK = {'AB': 590.0, 'ON': 30.0, 'BC': 13.0, 'QC': 1.5}
MAX_RECORDS = 500


def _intensity_for(grid_id):
    try:
        r = cache_table.get_item(Key={'GridID': grid_id}).get('Item') or {}
        v = r.get('CurrentIntensity')
        if v is not None:
            return float(v)
    except Exception:
        pass
    return INTENSITY_FALLBACK.get(grid_id, 100.0)


def _dec(v):
    return float(v) if isinstance(v, Decimal) else v


def _response(sc, body):
    return {
        'statusCode': sc,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET,OPTIONS',
        },
        'body': json.dumps(body, default=_dec),
    }


def _validate_api_key(api_key: str, tenant_id: str) -> bool:
    """
    Look up api_key in gw-api-keys-staging by SHA-256 hash (primary key = KeyHash).
    Returns True if the key exists, is Active, and belongs to tenant_id.
    Side-effect: updates LastUsedAt on success.
    Never raises — failures are treated as invalid.
    """
    if not api_key or not api_key.startswith('gwk-'):
        return False
    try:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        item = apikey_table.get_item(Key={'KeyHash': key_hash}).get('Item')
        if not item:
            return False
        if not item.get('Active', True):
            return False
        # Key must belong to the requesting tenant
        if item.get('TenantID') != tenant_id:
            logger.warning('api_key_tenant_mismatch key=...%s claimed=%s actual=%s',
                           api_key[-6:], tenant_id, item.get('TenantID'))
            return False
        # Update last-used timestamp (best-effort)
        try:
            apikey_table.update_item(
                Key={'KeyHash': key_hash},
                UpdateExpression='SET LastUsedAt = :ts',
                ExpressionAttributeValues={':ts': int(time.time())},
            )
        except Exception:
            pass
        return True
    except Exception as e:
        logger.warning('api_key_lookup_error: %s', e)
        return False


def lambda_handler(event, context):
    method = (event.get('requestContext', {}).get('http', {}).get('method')
              or event.get('httpMethod') or 'GET').upper()
    if method == 'OPTIONS':
        return _response(200, {'ok': True})

    # ── API key audit ────────────────────────────────────────────────────────
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    api_key = headers.get('x-gw-api-key', '')
    qs = event.get('queryStringParameters') or {}
    tenant_id = qs.get('tenant_id', '')

    if not api_key:
        logger.warning('api_key_missing tenant=%s ip=%s',
                       tenant_id,
                       event.get('requestContext', {}).get('http', {}).get('sourceIp', '?'))
    else:
        key_valid = _validate_api_key(api_key, tenant_id)
        if key_valid:
            logger.info('api_key_ok key=...%s tenant=%s', api_key[-6:], tenant_id)
        else:
            logger.warning('api_key_invalid key=...%s tenant=%s', api_key[-6:], tenant_id)
    # ── (audit-mode: always continue processing) ─────────────────────────────

    try:
        if not tenant_id:
            return _response(400, {'error': 'tenant_id required'})

        items = []
        kwargs = {'FilterExpression': Attr('TenantID').eq(tenant_id)}
        for _ in range(10):
            r = tel_table.scan(**kwargs)
            items.extend(r.get('Items', []))
            if 'LastEvaluatedKey' not in r:
                break
            kwargs['ExclusiveStartKey'] = r['LastEvaluatedKey']
            if len(items) >= MAX_RECORDS * 2:
                break

        items.sort(key=lambda x: x.get('Timestamp', ''), reverse=True)
        items = items[:MAX_RECORDS]

        for it in items:
            if it.get('gCO2e') in (None, 0, '0', '0.0'):
                w = float(it.get('Actual_Wattage') or 0)
                g = _intensity_for(it.get('GridID', ''))
                it['gCO2e'] = round(w * (5 / 60) * g / 1000, 4)
            for k, v in list(it.items()):
                it[k] = _dec(v)

        total_count = 0
        count_kwargs = {
            'FilterExpression': Attr('TenantID').eq(tenant_id),
            'Select': 'COUNT',
        }
        for _ in range(20):
            cr = tel_table.scan(**count_kwargs)
            total_count += cr.get('Count', 0)
            if 'LastEvaluatedKey' not in cr:
                break
            count_kwargs['ExclusiveStartKey'] = cr['LastEvaluatedKey']

        return _response(200, {'records': items, 'total_in_ledger': total_count})

    except Exception as e:
        logger.exception('telemetry-live error')
        return _response(500, {'error': str(e)})
