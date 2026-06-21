"""
gw-ms-attestation-staging
Digital board attestation — email → click → cryptographic seal in S3.

Routes (tenant-scoped):
  POST /api/tenants/{tenantId}/attestations          → create request + send email
  GET  /api/tenants/{tenantId}/attestations          → list attestations

Routes (public, token-based — for board member email link):
  GET  /api/attestations/{token}                     → load attestation for review
  POST /api/attestations/{token}/seal                → confirm + create SHA-256 seal

Seal artifact stored in S3 Object Lock COMPLIANCE:
  attestations/{TenantID}/{AttestationID}/seal.json
"""
import json, os, hashlib, uuid, logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION  = os.environ.get('AWS_REGION',   'ca-central-1')
BUCKET  = os.environ.get('S3_BUCKET',    'gw-compliance-vault-768949138583')
APP_URL = os.environ.get('APP_URL',      'https://gridwitness.ca')
SNS_ARN = os.environ.get('SNS_ARN',      'arn:aws:sns:ca-central-1:768949138583:gw-data-layer-alerts-staging')
SES_FROM= os.environ.get('SES_FROM',     '')  # optional: verified SES sender

ddb      = boto3.resource('dynamodb', region_name=REGION)
s3       = boto3.client('s3',         region_name=REGION)
sns      = boto3.client('sns',        region_name=REGION)
attest_t  = ddb.Table(os.environ.get('ATTESTATIONS_TABLE', 'gw-attestations-staging'))
tenants_t = ddb.Table(os.environ.get('TENANTS_TABLE',      'gw-tenants-staging'))
calendar_t= ddb.Table(os.environ.get('CALENDAR_TABLE',     'gw-filing-calendar-staging'))

# Map from report type labels → calendar framework tags (partial match)
REPORT_TO_FRAMEWORK = {
    'OSFI B-15': 'OSFI', 'OSFI': 'OSFI',
    'TCFD': 'TCFD',
    'IFRS S2': 'IFRS', 'ISSB': 'IFRS',
    'GHG Protocol': 'GHG_PROTO', 'ISO 14064': 'ISO_14064',
    'Annual ESG': 'CDP',
}

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
}

SEAL_RETENTION_YEARS = 7

def _r(code, body): return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}
def _now(): return datetime.now(timezone.utc).isoformat()

def _retain_until():
    return (datetime.now(timezone.utc) + timedelta(days=365 * SEAL_RETENTION_YEARS)).isoformat()

def _token(): return uuid.uuid4().hex

def _attest_id(): return f'ATT-{uuid.uuid4().hex[:8].upper()}'

# ── DynamoDB ──────────────────────────────────────────────────────────────────

def _list_attestations(tenant_id: str) -> list:
    try:
        r = attest_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id))
        items = sorted(r.get('Items', []), key=lambda x: x.get('RequestedAt',''), reverse=True)
        return items
    except Exception as e:
        logger.warning('attest list: %s', e)
        return []

def _get_by_token(token: str) -> dict | None:
    """Scan for the attestation with this token (GSI in production; scan for MVP)."""
    try:
        r = attest_t.scan(FilterExpression=Attr('AttestationToken').eq(token))
        items = r.get('Items', [])
        return items[0] if items else None
    except Exception as e:
        logger.warning('attest token lookup: %s', e)
        return None

# ── Email ─────────────────────────────────────────────────────────────────────

def _send_email(to_email: str, to_name: str, org: str,
                attestation_id: str, report_type: str, report_id: str,
                link: str) -> bool:
    subject = f'[GridWitness] Board Attestation Required — {report_type} Disclosure'
    body = f"""Dear {to_name},

You have been requested to attest to the accuracy of {org}'s {report_type} Climate Risk Disclosure.

REPORT DETAILS
  Report Type : {report_type}
  Report ID   : {report_id}
  Attestation : {attestation_id}

To review the disclosure and provide your digital attestation, please click the link below:

  {link}

This link is unique to you. Upon clicking "I Attest", a cryptographic seal (SHA-256) will be
generated and stored immutably in the GridWitness compliance vault (AWS S3 Object Lock,
COMPLIANCE mode, 7-year retention) to satisfy OSFI Guideline B-15 Section 5.3 governance
requirements.

If you did not expect this request, please contact your compliance team.

— GridWitness Regulatory Platform
  Tenant: {org}
"""
    # Try SES first (requires verified sender)
    if SES_FROM:
        try:
            ses = boto3.client('ses', region_name=REGION)
            ses.send_email(
                Source=SES_FROM,
                Destination={'ToAddresses': [to_email]},
                Message={
                    'Subject': {'Data': subject},
                    'Body':    {'Text': {'Data': body}},
                },
            )
            logger.info('Attestation email sent via SES: %s', to_email)
            return True
        except Exception as e:
            logger.warning('SES failed, falling back to SNS: %s', e)

    # Fallback: SNS (broadcasts to all topic subscribers)
    try:
        sns.publish(
            TopicArn=SNS_ARN,
            Subject=subject[:100],
            Message=body,
        )
        logger.info('Attestation notification sent via SNS')
        return True
    except Exception as e:
        logger.error('Email/SNS send failed: %s', e)
        return False

# ── Seal ──────────────────────────────────────────────────────────────────────

def _create_seal(item: dict, ip: str, user_agent: str) -> tuple[str, str]:
    """
    Build canonical attestation data, SHA-256 hash it, upload to S3 Object Lock.
    Returns (seal_hash, s3_key).
    """
    sealed_at = _now()
    seal_data = {
        'attestation_id':   item['AttestationID'],
        'tenant_id':        item['TenantID'],
        'report_id':        item.get('ReportID', ''),
        'report_type':      item.get('ReportType', ''),
        'attester_name':    item.get('AttesterName', ''),
        'attester_email':   item.get('AttesterEmail', ''),
        'attester_title':   item.get('AttesterTitle', ''),
        'org_name':         item.get('OrgName', ''),
        'sealed_at':        sealed_at,
        'attestation_token':item.get('AttestationToken', ''),
        'attester_ip':      ip,
        'attester_ua':      user_agent[:200] if user_agent else '',
        'platform':         'GridWitness',
        'standard':         'OSFI B-15 s5.3 / TCFD / IFRS S2',
        'seal_version':     '1.0',
    }
    canonical   = json.dumps(seal_data, sort_keys=True, ensure_ascii=False)
    seal_hash   = hashlib.sha256(canonical.encode()).hexdigest()
    seal_record = {**seal_data, 'seal_hash': seal_hash, 'seal_method': 'SHA-256',
                   'canonical_input': canonical}

    s3_key = f'attestations/{item["TenantID"]}/{item["AttestationID"]}/seal.json'
    s3.put_object(
        Bucket=BUCKET, Key=s3_key,
        Body=json.dumps(seal_record, indent=2, default=str).encode(),
        ContentType='application/json',
        ObjectLockMode='COMPLIANCE',
        ObjectLockRetainUntilDate=_retain_until(),
        Metadata={
            'AttestationID': item['AttestationID'],
            'TenantID':      item['TenantID'],
            'SealHash':      seal_hash,
            'Framework':     'OSFI-B15-TCFD-IFRS-S2',
        },
    )
    logger.info('Seal created: %s  hash=%s', s3_key, seal_hash[:16])
    return seal_hash, s3_key

# ── Auto-file calendar deadline when attestation is sealed ────────────────────

def _auto_file_calendar(tenant_id: str, report_type: str, seal_hash: str):
    """
    After sealing, find the nearest UPCOMING/DUE_SOON calendar deadline whose
    Framework matches this report type and mark it FILED automatically.
    """
    framework_tag = None
    for key, tag in REPORT_TO_FRAMEWORK.items():
        if key.upper() in report_type.upper():
            framework_tag = tag
            break
    if not framework_tag:
        return

    try:
        r = calendar_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id))
        candidates = [
            i for i in r.get('Items', [])
            if i.get('Status') in ('UPCOMING', 'DUE_SOON', 'OVERDUE')
            and framework_tag.lower() in i.get('Framework', '').lower()
        ]
        if not candidates:
            return
        # Pick the soonest upcoming deadline
        candidates.sort(key=lambda x: x.get('DueDate', ''))
        target = candidates[0]
        calendar_t.update_item(
            Key={'TenantID': tenant_id, 'DeadlineID': target['DeadlineID']},
            UpdateExpression='SET #s = :s, FiledAt = :fa, FiledNote = :fn',
            ExpressionAttributeNames={'#s': 'Status'},
            ExpressionAttributeValues={
                ':s':  'FILED',
                ':fa': _now(),
                ':fn': f'Auto-filed on attestation seal {seal_hash[:16]}',
            },
        )
        logger.info('Calendar auto-filed: %s %s → %s (framework=%s)',
                    tenant_id, target['DeadlineID'], target.get('Title'), framework_tag)
    except Exception as e:
        logger.warning('Calendar auto-file failed (non-critical): %s', e)

# ── Handler ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method   = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    raw_path = event.get('rawPath', '')
    path_p   = event.get('pathParameters') or {}
    qs       = event.get('queryStringParameters') or {}
    src_ip   = (event.get('requestContext', {}).get('http', {}).get('sourceIp') or
                event.get('requestContext', {}).get('identity', {}).get('sourceIp', ''))
    ua       = (event.get('requestContext', {}).get('http', {}).get('userAgent') or
                event.get('headers', {}).get('user-agent', ''))

    if method == 'OPTIONS':
        return _r(200, {})

    # ── Public token routes ───────────────────────────────────────────────────
    token = path_p.get('token') or qs.get('token') or ''

    # Public GET: /api/attestations/{token}
    if token and method == 'GET' and 'seal' not in raw_path:
        item = _get_by_token(token)
        if not item:
            return _r(404, {'error': 'Attestation not found'})
        if item.get('Status') == 'SEALED':
            return _r(200, {'attestation': item, 'already_sealed': True})
        return _r(200, {'attestation': item, 'already_sealed': False})

    # Public POST: /api/attestations/{token}/seal
    if token and method == 'POST' and 'seal' in raw_path:
        item = _get_by_token(token)
        if not item:
            return _r(404, {'error': 'Attestation not found'})
        if item.get('Status') == 'SEALED':
            return _r(409, {'error': 'Already sealed', 'seal_hash': item.get('SealHash')})

        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        if not body.get('confirmed'):
            return _r(400, {'error': 'confirmed: true required'})

        sealed_at = _now()
        seal_hash, s3_key = _create_seal({**item}, src_ip, ua)

        attest_t.update_item(
            Key={'TenantID': item['TenantID'], 'AttestationID': item['AttestationID']},
            UpdateExpression='SET #s = :s, SealHash = :h, SealS3Key = :k, SealedAt = :t',
            ExpressionAttributeNames={'#s': 'Status'},
            ExpressionAttributeValues={
                ':s': 'SEALED', ':h': seal_hash, ':k': s3_key, ':t': sealed_at,
            },
        )
        logger.info('Attestation SEALED: %s %s', item['TenantID'], item['AttestationID'])

        # Auto-file matching calendar deadline
        _auto_file_calendar(item['TenantID'], item.get('ReportType', ''), seal_hash)

        return _r(200, {
            'ok':             True,
            'attestation_id': item['AttestationID'],
            'status':         'SEALED',
            'seal_hash':      seal_hash,
            'sealed_at':      sealed_at,
            's3_key':         s3_key,
        })

    # ── Tenant-scoped routes ──────────────────────────────────────────────────
    tenant_id = path_p.get('tenantId') or qs.get('tenant_id') or ''
    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    # GET: list attestations
    if method == 'GET':
        items = _list_attestations(tenant_id)
        return _r(200, {'tenant_id': tenant_id, 'attestations': items, 'count': len(items)})

    # POST: create attestation request
    if method == 'POST':
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        attester_email = body.get('attester_email', '').strip()
        attester_name  = body.get('attester_name', '').strip()
        report_type    = body.get('report_type', 'OSFI B-15').strip()
        report_id      = body.get('report_id', '').strip()
        summary        = body.get('summary', '').strip()
        attester_title = body.get('attester_title', '').strip()

        if not attester_email:
            return _r(400, {'error': 'attester_email required'})

        # Get org name
        try:
            tenant = tenants_t.get_item(Key={'TenantID': tenant_id}).get('Item') or {}
            org_name = tenant.get('OrgName', tenant_id)
        except Exception:
            org_name = tenant_id

        token      = _token()
        attest_id  = _attest_id()
        link       = f'{APP_URL}/attest?token={token}'
        now        = _now()

        item = {
            'TenantID':        tenant_id,
            'AttestationID':   attest_id,
            'AttestationToken':token,
            'ReportType':      report_type,
            'ReportID':        report_id,
            'AttesterEmail':   attester_email,
            'AttesterName':    attester_name,
            'AttesterTitle':   attester_title,
            'OrgName':         org_name,
            'Summary':         summary,
            'Status':          'PENDING',
            'RequestedAt':     now,
            'AttestationLink': link,
        }
        attest_t.put_item(Item=item)

        email_sent = _send_email(
            attester_email, attester_name or attester_email,
            org_name, attest_id, report_type, report_id, link,
        )

        logger.info('Attestation created: %s %s → %s', tenant_id, attest_id, attester_email)
        return _r(201, {
            'ok':              True,
            'attestation_id':  attest_id,
            'status':          'PENDING',
            'attestation_link':link,
            'email_sent':      email_sent,
            'token':           token,
        })

    return _r(405, {'error': 'Method not allowed'})
