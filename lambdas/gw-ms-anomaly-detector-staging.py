"""gw-ms-anomaly-detector-staging — EventBridge every 15 min. Z-score anomaly detection per server."""
import json, os, statistics, logging
import boto3
from boto3.dynamodb.conditions import Key, Attr
from datetime import datetime, timezone, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION          = os.environ.get('AWS_REGION', 'ca-central-1')
TELEMETRY_TABLE = os.environ.get('TELEMETRY_TABLE', 'gw-telemetry-staging')
TENANTS_TABLE   = os.environ.get('TENANTS_TABLE', 'gw-tenants-staging')
INCIDENTS_QUEUE = os.environ.get('INCIDENTS_QUEUE',
    'https://sqs.ca-central-1.amazonaws.com/768949138583/gw-sqs-incidents-staging')

ddb          = boto3.resource('dynamodb', region_name=REGION)
sqs          = boto3.client('sqs', region_name=REGION)
tel_table    = ddb.Table(TELEMETRY_TABLE)
tenant_table = ddb.Table(TENANTS_TABLE)

def lambda_handler(event, context):
    tenants = tenant_table.scan(ProjectionExpression='TenantID').get('Items', [])
    total   = sum(check_tenant(t['TenantID']) for t in tenants)
    logger.info(f'Anomaly scan: {len(tenants)} tenants, {total} anomalies')
    return {'anomalies': total}

def check_tenant(tenant_id):
    cutoff  = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    records = tel_table.query(
        KeyConditionExpression=Key('TenantID').eq(tenant_id) & Key('Timestamp').gte(cutoff),
        ScanIndexForward=True, Limit=400,
    ).get('Items', [])
    if len(records) < 6:
        return 0

    by_source = {}
    for r in records:
        src = r.get('Source', 'unknown')
        w   = float(r.get('ActualWattage') or r.get('Actual_Wattage') or 0)
        if w > 0:
            by_source.setdefault(src, []).append(w)

    anomalies = 0
    for src, readings in by_source.items():
        if len(readings) < 6:
            continue
        baseline = readings[:-1]
        current  = readings[-1]
        mean     = statistics.mean(baseline)
        stdev    = statistics.stdev(baseline) if len(baseline) > 1 else 0
        if stdev < 2:
            continue
        z = (current - mean) / stdev
        if z > 3.0:
            sev = 'CRITICAL' if z > 4.5 else 'WARNING'
            _fire(tenant_id, src, current, mean, stdev, z, 'SPIKE', sev)
            anomalies += 1
            logger.warning(f'{tenant_id}/{src} SPIKE z={z:.1f} {current:.0f}W vs mean {mean:.0f}W')
        elif z < -2.5 and mean > 50:
            _fire(tenant_id, src, current, mean, stdev, z, 'DROP', 'WARNING')
            anomalies += 1
            logger.warning(f'{tenant_id}/{src} DROP z={z:.1f} {current:.0f}W vs mean {mean:.0f}W')
    return anomalies

def _fire(tenant_id, source, current, mean, stdev, z, kind, severity):
    msg = {
        'op': 'open_or_update', 'tenant_id': tenant_id, 'grid_id': 'AB',
        'metric': f'power_anomaly_{kind.lower()}',
        'value': current, 'threshold': mean + 3 * stdev,
        'severity': severity,
        'metadata': {'source': source, 'z_score': round(z, 2),
                     'mean_w': round(mean, 1), 'stdev_w': round(stdev, 1), 'kind': kind},
    }
    try:
        sqs.send_message(QueueUrl=INCIDENTS_QUEUE, MessageBody=json.dumps(msg))
    except Exception as e:
        logger.error(f'SQS send failed: {e}')
