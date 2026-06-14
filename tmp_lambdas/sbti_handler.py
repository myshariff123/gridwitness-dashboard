"""
GridWitness — Science-Based Targets (SBTi)
GET/PUT emission reduction targets aligned with SBTi benchmarks.
Route: GET/PUT /api/tenants/{tenantId}/sbti
"""
import json, os, boto3, logging
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb', region_name='ca-central-1')
table    = dynamodb.Table(os.environ.get('SBTI_TABLE', 'gw-sbti-staging'))

HDR = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
}

# SBTi standard annual absolute reduction rates
SBTI_RATES = {
    '1.5C':   4.2,   # 1.5°C pathway
    'WB2C':   2.5,   # Well-Below 2°C pathway
    'CUSTOM': None,  # user-defined
}


def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body)}


def _dec_to_float(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


def _calc_trajectory(baseline_tco2e: float, base_year: int,
                     target_year: int, annual_rate_pct: float) -> list:
    trajectory = []
    for year in range(base_year, target_year + 1):
        yrs = year - base_year
        target_em = baseline_tco2e * ((1 - annual_rate_pct / 100) ** yrs)
        trajectory.append({'year': year, 'target_tco2e': round(target_em, 4)})
    return trajectory


def lambda_handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    if method == 'OPTIONS':
        return _r(200, {})

    path_params = event.get('pathParameters') or {}
    tenant_id = path_params.get('tenantId') or (event.get('queryStringParameters') or {}).get('tenant_id') or ''

    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    if method == 'GET':
        item = table.get_item(Key={'TenantID': tenant_id}).get('Item')
        if not item:
            return _r(404, {'error': 'No SBTi target configured'})

        base_year    = int(item.get('BaseYear', 2024))
        target_year  = int(item.get('TargetYear', 2030))
        baseline     = float(item.get('BaselineEmissions', 0))
        target_type  = item.get('TargetType', 'WB2C')
        annual_rate  = float(item.get('AnnualReductionRate',
                                      SBTI_RATES.get(target_type, 2.5) or 2.5))

        trajectory = _calc_trajectory(baseline, base_year, target_year, annual_rate)

        current_year   = datetime.now(timezone.utc).year
        current_target = next((t['target_tco2e'] for t in trajectory if t['year'] == current_year), None)
        final_target   = trajectory[-1]['target_tco2e'] if trajectory else None

        # Total reduction %
        total_reduction_pct = round((1 - (final_target / baseline)) * 100, 1) if baseline and final_target else 0

        return _r(200, {
            'tenant_id':            tenant_id,
            'base_year':            base_year,
            'baseline_tco2e':       baseline,
            'target_year':          target_year,
            'target_type':          target_type,
            'annual_rate_pct':      annual_rate,
            'sector':               item.get('Sector', 'Data Centres'),
            'committed_at':         item.get('CommittedAt'),
            'updated_at':           item.get('UpdatedAt'),
            'trajectory':           trajectory,
            'current_target_tco2e': current_target,
            'final_target_tco2e':   final_target,
            'total_reduction_pct':  total_reduction_pct,
        })

    if method == 'PUT':
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        target_type = body.get('target_type', 'WB2C')
        if target_type not in SBTI_RATES:
            return _r(400, {'error': 'target_type must be 1.5C, WB2C, or CUSTOM'})

        # For CUSTOM, user must supply annual_reduction_rate
        if target_type == 'CUSTOM' and 'annual_reduction_rate' not in body:
            return _r(400, {'error': 'annual_reduction_rate required for CUSTOM target_type'})

        default_rate = SBTI_RATES[target_type] or float(body.get('annual_reduction_rate', 2.5))
        annual_rate  = float(body.get('annual_reduction_rate', default_rate) or default_rate)

        now  = datetime.now(timezone.utc).isoformat()
        item = {
            'TenantID':           tenant_id,
            'BaseYear':           int(body.get('base_year', 2024)),
            'BaselineEmissions':  Decimal(str(float(body.get('baseline_tco2e', 0)))),
            'TargetYear':         int(body.get('target_year', 2030)),
            'TargetType':         target_type,
            'AnnualReductionRate': Decimal(str(annual_rate)),
            'Sector':             body.get('sector', 'Data Centres'),
            'CommittedAt':        body.get('committed_at', now),
            'UpdatedAt':          now,
        }
        table.put_item(Item=item)
        logger.info('sbti_target_saved tenant=%s type=%s rate=%.1f%%', tenant_id, target_type, annual_rate)
        return _r(200, {'status': 'saved', 'tenant_id': tenant_id,
                        'target_type': target_type, 'annual_rate_pct': annual_rate})

    if method == 'DELETE':
        table.delete_item(Key={'TenantID': tenant_id})
        return _r(200, {'status': 'deleted', 'tenant_id': tenant_id})

    return _r(405, {'error': 'Method not allowed'})
