"""
GridWitness — Enforcement Settings
GET/PUT per-tenant enforcement mode flag.
Routes: GET/PUT /api/tenants/{tenantId}/enforcement
"""
import json, os, boto3, logging
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb      = boto3.resource('dynamodb', region_name='ca-central-1')
tenants_table = dynamodb.Table(os.environ.get('TENANTS_TABLE', 'gw-tenants-staging'))

HDR = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
}

def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body)}


def lambda_handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    if method == 'OPTIONS':
        return _r(200, {})

    path_params = event.get('pathParameters') or {}
    tenant_id = path_params.get('tenantId') or ''

    if not tenant_id:
        return _r(400, {'error': 'tenantId path parameter required'})

    if method == 'GET':
        item = tenants_table.get_item(
            Key={'TenantID': tenant_id},
            ProjectionExpression='TenantID, EnforcementMode, EnforcementUpdatedAt',
        ).get('Item')
        if not item:
            return _r(404, {'error': 'Tenant not found'})
        return _r(200, {
            'tenant_id': tenant_id,
            'enforcement_mode': bool(item.get('EnforcementMode', False)),
            'updated_at': item.get('EnforcementUpdatedAt'),
        })

    if method == 'PUT':
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        enabled = bool(body.get('enforcement_mode', False))
        now = datetime.now(timezone.utc).isoformat()

        tenants_table.update_item(
            Key={'TenantID': tenant_id},
            UpdateExpression='SET EnforcementMode = :m, EnforcementUpdatedAt = :t',
            ExpressionAttributeValues={':m': enabled, ':t': now},
        )

        logger.info('enforcement_mode_updated tenant=%s enabled=%s', tenant_id, enabled)
        return _r(200, {
            'tenant_id': tenant_id,
            'enforcement_mode': enabled,
            'updated_at': now,
            'message': 'Enforcement mode enabled — invalid API keys will be rejected' if enabled
                       else 'Audit mode enabled — invalid API keys are logged but not rejected',
        })

    return _r(405, {'error': 'Method not allowed'})
