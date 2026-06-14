"""
GridWitness — Scope 3 AWS Cloud Emissions (Category 11)
Syncs with AWS Cost Explorer to estimate cloud carbon per region.
Route: GET /api/tenants/{tenantId}/scope3
       POST /api/tenants/{tenantId}/scope3/sync
"""
import json, os, boto3, logging
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb      = boto3.resource('dynamodb', region_name='ca-central-1')
table         = dynamodb.Table(os.environ.get('SCOPE3_TABLE', 'gw-scope3-staging'))
tenants_table = dynamodb.Table(os.environ.get('TENANTS_TABLE', 'gw-tenants-staging'))

HDR = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

# Regional grid intensity (gCO2/kWh) — EPA eGRID + IEA 2024 data
REGION_INTENSITY = {
    'us-east-1':      380.0,
    'us-east-2':      440.0,
    'us-west-1':      170.0,
    'us-west-2':      130.0,
    'ca-central-1':    28.0,
    'eu-west-1':      290.0,
    'eu-west-2':      225.0,
    'eu-central-1':   310.0,
    'eu-north-1':      11.0,
    'ap-southeast-1': 430.0,
    'ap-southeast-2': 640.0,
    'ap-northeast-1': 470.0,
    'ap-northeast-2': 415.0,
    'ap-south-1':     700.0,
    'sa-east-1':       74.0,
    'DEFAULT':         400.0,
}

# Scope 3 Cat.11 cost-to-energy conversion: $1 USD compute ≈ 0.5 kWh
# Based on AWS average power efficiency per dollar of compute spend.
COST_TO_KWH = 0.5

COMPUTE_SERVICES = [
    'Amazon Elastic Compute Cloud - Compute',
    'AWS Lambda',
    'Amazon Elastic Container Service',
    'Amazon Elastic Kubernetes Service',
    'Amazon Fargate',
]


def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body)}


def _get_tenant_role(tenant_id: str) -> str | None:
    try:
        item = tenants_table.get_item(
            Key={'TenantID': tenant_id},
            ProjectionExpression='AwsIntegration',
        ).get('Item', {})
        aws = item.get('AwsIntegration', {})
        role = aws.get('CrossAccountRoleArn')
        if isinstance(role, dict):
            role = role.get('S')
        return role or None
    except Exception as e:
        logger.warning('Failed to get role for tenant %s: %s', tenant_id, e)
        return None


def _get_ce_client(role_arn: str | None):
    if role_arn:
        sts = boto3.client('sts', region_name='us-east-1')
        try:
            creds = sts.assume_role(
                RoleArn=role_arn,
                RoleSessionName='gw-scope3-sync',
                DurationSeconds=900,
            )['Credentials']
            return boto3.client(
                'ce', region_name='us-east-1',
                aws_access_key_id=creds['AccessKeyId'],
                aws_secret_access_key=creds['SecretAccessKey'],
                aws_session_token=creds['SessionToken'])
        except Exception as e:
            logger.warning('STS assume role failed: %s — falling back to own account', e)
    return boto3.client('ce', region_name='us-east-1')


def _month_range(year_month: str) -> tuple:
    year, month = map(int, year_month.split('-'))
    from_date = f'{year}-{month:02d}-01'
    if month == 12:
        to_date = f'{year + 1}-01-01'
    else:
        to_date = f'{year}-{month + 1:02d}-01'
    return from_date, to_date


def _sync_scope3(tenant_id: str, year_month: str, role_arn: str | None) -> dict:
    from_date, to_date = _month_range(year_month)
    ce = _get_ce_client(role_arn)

    resp = ce.get_cost_and_usage(
        TimePeriod={'Start': from_date, 'End': to_date},
        Granularity='MONTHLY',
        Metrics=['AmortizedCost'],
        GroupBy=[
            {'Type': 'DIMENSION', 'Key': 'REGION'},
            {'Type': 'DIMENSION', 'Key': 'SERVICE'},
        ],
        Filter={'Dimensions': {'Key': 'SERVICE', 'Values': COMPUTE_SERVICES}},
    )

    by_region = {}
    total_cost_usd = 0.0
    total_kwh      = 0.0
    total_kg_co2   = 0.0

    for result in resp.get('ResultsByTime', []):
        for group in result.get('Groups', []):
            region  = group['Keys'][0]
            service = group['Keys'][1]
            cost    = float(group['Metrics']['AmortizedCost']['Amount'])
            if cost <= 0:
                continue

            intensity = REGION_INTENSITY.get(region, REGION_INTENSITY['DEFAULT'])
            kwh       = cost * COST_TO_KWH
            kg_co2    = (kwh * intensity) / 1000.0

            total_cost_usd += cost
            total_kwh      += kwh
            total_kg_co2   += kg_co2

            if region not in by_region:
                by_region[region] = {
                    'cost_usd': 0.0, 'kwh': 0.0, 'kg_co2': 0.0,
                    'intensity_gco2_kwh': intensity, 'services': {},
                }
            by_region[region]['cost_usd'] += cost
            by_region[region]['kwh']      += kwh
            by_region[region]['kg_co2']   += kg_co2
            by_region[region]['services'][service] = (
                by_region[region]['services'].get(service, 0.0) + cost
            )

    clean_regions = {
        r: {
            'cost_usd':           round(v['cost_usd'], 2),
            'kwh':                round(v['kwh'], 2),
            'kg_co2':             round(v['kg_co2'], 4),
            'intensity_gco2_kwh': v['intensity_gco2_kwh'],
            'services':           {s: round(c, 2) for s, c in v['services'].items()},
        }
        for r, v in by_region.items()
    }

    return {
        'tenant_id':       tenant_id,
        'year_month':      year_month,
        'total_cost_usd':  round(total_cost_usd, 2),
        'total_kwh':       round(total_kwh, 2),
        'total_kg_co2':    round(total_kg_co2, 4),
        'total_tco2e':     round(total_kg_co2 / 1000, 6),
        'by_region':       clean_regions,
        'methodology':     (
            'Scope 3 Category 11 — AWS Cost Explorer compute spend, '
            '$0.50/kWh conversion factor, regional grid intensity from EPA eGRID + IEA 2024'
        ),
    }


def lambda_handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    if method == 'OPTIONS':
        return _r(200, {})

    path_params = event.get('pathParameters') or {}
    qs          = event.get('queryStringParameters') or {}
    raw_path    = event.get('rawPath', '')

    tenant_id  = path_params.get('tenantId') or qs.get('tenant_id') or ''
    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    if method == 'GET':
        year_month = qs.get('year_month') or datetime.now(timezone.utc).strftime('%Y-%m')
        cached = table.get_item(Key={'TenantID': tenant_id, 'YearMonth': year_month}).get('Item')
        if not cached:
            return _r(404, {'error': 'No data for this period — run a sync first',
                            'hint': 'POST /api/tenants/{tenantId}/scope3/sync'})
        result = {}
        for k, v in cached.items():
            if isinstance(v, Decimal):
                result[k] = float(v)
            elif k == 'ByRegion':
                result[k] = json.loads(v)
            else:
                result[k] = v
        return _r(200, result)

    if method == 'POST' and raw_path.endswith('/sync'):
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        year_month = body.get('year_month') or datetime.now(timezone.utc).strftime('%Y-%m')
        role_arn   = _get_tenant_role(tenant_id)

        try:
            result = _sync_scope3(tenant_id, year_month, role_arn)
        except Exception as e:
            err_str = str(e)
            logger.error('Scope3 sync failed tenant=%s: %s', tenant_id, err_str)
            if 'not enabled for cost explorer' in err_str.lower():
                return _r(400, {
                    'error': 'Cost Explorer is not enabled for this AWS account.',
                    'setup_required': True,
                    'instructions': (
                        'To enable: AWS Console → Billing & Cost Management → '
                        'Cost Explorer → Enable Cost Explorer. '
                        'Data becomes available after 24 hours.'
                    ),
                })
            if 'AccessDenied' in err_str or 'not authorized' in err_str.lower():
                return _r(403, {
                    'error': 'Access denied to Cost Explorer.',
                    'hint': 'Ensure the Lambda role has ce:GetCostAndUsage permission.',
                })
            return _r(500, {'error': err_str})

        # Cache to DynamoDB
        item = {
            'TenantID':      tenant_id,
            'YearMonth':     year_month,
            'TotalCostUSD':  Decimal(str(result['total_cost_usd'])),
            'TotalKWh':      Decimal(str(result['total_kwh'])),
            'TotalKgCO2':    Decimal(str(result['total_kg_co2'])),
            'TotalTCO2e':    Decimal(str(result['total_tco2e'])),
            'ByRegion':      json.dumps(result['by_region']),
            'Methodology':   result['methodology'],
            'SyncedAt':      datetime.now(timezone.utc).isoformat(),
        }
        table.put_item(Item=item)
        logger.info('scope3_synced tenant=%s month=%s tco2e=%s',
                    tenant_id, year_month, result['total_tco2e'])
        return _r(200, result)

    return _r(405, {'error': 'Method not allowed'})
