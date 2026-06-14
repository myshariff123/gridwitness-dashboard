"""
gw-ms-anomaly-detector-staging — EventBridge every 15 min.

Two detection modes:
  1. Grid Carbon Intensity threshold monitoring
     - Reads current intensity per zone from gw-grid-cache-staging
     - Compares against each tenant's GridThresholds.{ZONE}.carbon
     - Intensity > threshold  → open_or_update incident (OPEN, sustained until resolved)
     - Intensity <= threshold → auto_close any lingering open incident
     - Incidents stay OPEN until grid returns below threshold (not time-limited)

  2. Device Power Anomaly detection (Z-score)
     - Z > 3.0 → SPIKE anomaly
     - Z < -2.5 and mean > 50W → DROP anomaly
"""
import json, os, statistics, logging
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION          = os.environ.get('AWS_REGION', 'ca-central-1')
TELEMETRY_TABLE = os.environ.get('TELEMETRY_TABLE', 'gw-telemetry-staging')
TENANTS_TABLE   = os.environ.get('TENANTS_TABLE', 'gw-tenants-staging')
GRID_CACHE_TABLE= os.environ.get('GRID_CACHE_TABLE', 'gw-grid-cache-staging')
INCIDENTS_QUEUE = os.environ.get('INCIDENTS_QUEUE',
    'https://sqs.ca-central-1.amazonaws.com/768949138583/gw-sqs-incidents-staging')

ddb          = boto3.resource('dynamodb', region_name=REGION)
sqs          = boto3.client('sqs', region_name=REGION)
tel_table    = ddb.Table(TELEMETRY_TABLE)
tenant_table = ddb.Table(TENANTS_TABLE)
grid_table   = ddb.Table(GRID_CACHE_TABLE)

GRID_ZONES = ['AB', 'BC', 'ON', 'QC']


def lambda_handler(event, context):
    # Step 1: Get current grid intensities (one DynamoDB call per zone, shared across tenants)
    intensities = _get_grid_intensities()
    logger.info('Grid intensities: %s', intensities)

    # Step 2: Scan all tenants for thresholds and IDs
    tenants = tenant_table.scan(
        ProjectionExpression='TenantID, GridThresholds'
    ).get('Items', [])

    grid_events    = 0
    power_anomalies = 0

    for t in tenants:
        tid = t['TenantID']
        grid_events     += check_grid_thresholds(tid, t.get('GridThresholds', {}), intensities)
        power_anomalies += check_power_anomalies(tid)

    logger.info('Scan complete: %d tenants, %d grid events, %d power anomalies',
                len(tenants), grid_events, power_anomalies)
    return {'tenants': len(tenants), 'grid_events': grid_events, 'power_anomalies': power_anomalies}


# ─── Grid Intensity Lookup ────────────────────────────────────────────────────

def _get_grid_intensities() -> dict:
    """Read the most recent carbon intensity for each monitored grid zone."""
    result = {}
    for zone in GRID_ZONES:
        try:
            resp  = grid_table.query(
                KeyConditionExpression=Key('GridID').eq(zone),
                ScanIndexForward=False,
                Limit=1,
            )
            items = resp.get('Items', [])
            if items:
                result[zone] = float(items[0]['CarbonIntensity'])
        except Exception as e:
            logger.warning('Grid cache miss for %s: %s', zone, e)
    return result


def _grid_severity(value: float, threshold: float) -> str:
    ratio = value / threshold if threshold > 0 else 0
    if ratio >= 1.5:
        return 'CRITICAL'
    if ratio >= 1.2:
        return 'HIGH'
    return 'MEDIUM'


# ─── Grid Threshold Monitoring ────────────────────────────────────────────────

def check_grid_thresholds(tenant_id: str, thresholds: dict, intensities: dict) -> int:
    """
    For each zone the tenant has a carbon threshold:
    - intensity > threshold  → fire open_or_update (creates/sustains an OPEN incident)
    - intensity <= threshold → fire auto_close (resolves any open incident for this zone)

    The incident manager deduplicates: only one OPEN incident exists per
    (tenant_id, grid_id, metric='carbon_intensity_gco2_kwh') at any time.
    Returns count of breach events fired.
    """
    breaches = 0
    for zone, intensity in intensities.items():
        zone_cfg = thresholds.get(zone, {})
        if not zone_cfg:
            continue
        carbon_threshold = float(zone_cfg.get('carbon', 0))
        if carbon_threshold <= 0:
            continue

        if intensity > carbon_threshold:
            pct_over = ((intensity - carbon_threshold) / carbon_threshold) * 100
            msg = {
                'op':          'open_or_update',
                'tenant_id':   tenant_id,
                'grid_id':     zone,
                'metric':      'carbon_intensity_gco2_kwh',
                'value':       intensity,
                'threshold':   carbon_threshold,
                'severity':    _grid_severity(intensity, carbon_threshold),
                'source':      'GRID_THRESHOLD_MONITOR',
                'title':       f'{zone} grid carbon intensity exceeding threshold',
                'description': (
                    f'{zone} grid is currently {intensity:.0f} gCO2/kWh — '
                    f'{pct_over:.1f}% above your configured threshold of '
                    f'{carbon_threshold:.0f} gCO2/kWh. '
                    f'This incident remains OPEN until grid intensity '
                    f'returns below {carbon_threshold:.0f} gCO2/kWh.'
                ),
            }
            _sqs_send(msg)
            breaches += 1
            logger.warning('GRID_BREACH tenant=%s zone=%s intensity=%.0f threshold=%.0f',
                           tenant_id, zone, intensity, carbon_threshold)
        else:
            # Intensity within bounds — auto-close any open incident
            _sqs_send({
                'op':        'auto_close',
                'tenant_id': tenant_id,
                'grid_id':   zone,
                'metric':    'carbon_intensity_gco2_kwh',
                'value':     intensity,
            })

    return breaches


# ─── Device Power Anomaly Detection (Z-score) ────────────────────────────────

def check_power_anomalies(tenant_id: str) -> int:
    """Z-score anomaly detection on per-device wattage over the last 3 hours."""
    cutoff  = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    records = tel_table.query(
        KeyConditionExpression=Key('TenantID').eq(tenant_id) & Key('Timestamp').gte(cutoff),
        ScanIndexForward=True,
        Limit=400,
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
            _fire_power(tenant_id, src, current, mean, stdev, z, 'SPIKE',
                        'CRITICAL' if z > 4.5 else 'WARNING')
            anomalies += 1
        elif z < -2.5 and mean > 50:
            _fire_power(tenant_id, src, current, mean, stdev, z, 'DROP', 'WARNING')
            anomalies += 1

    return anomalies


def _fire_power(tenant_id, source, current, mean, stdev, z, kind, severity):
    _sqs_send({
        'op':          'open_or_update',
        'tenant_id':   tenant_id,
        'grid_id':     'AB',
        'metric':      f'power_anomaly_{kind.lower()}',
        'value':       current,
        'threshold':   mean + 3 * stdev,
        'severity':    severity,
        'source':      'POWER_ANOMALY_DETECTOR',
        'title':       f'Power {kind.lower()} detected: {source}',
        'description': (
            f'Device {source} shows a power {kind.lower()} '
            f'(z-score: {z:.1f}). '
            f'Current reading: {current:.0f}W vs 3-hour mean of {mean:.0f}W '
            f'(±{stdev:.0f}W).'
        ),
        'metadata': {
            'source': source, 'z_score': round(z, 2),
            'mean_w': round(mean, 1), 'stdev_w': round(stdev, 1), 'kind': kind,
        },
    })


def _sqs_send(payload: dict):
    try:
        sqs.send_message(QueueUrl=INCIDENTS_QUEUE, MessageBody=json.dumps(payload))
    except Exception as e:
        logger.error('SQS send failed: %s', e)
