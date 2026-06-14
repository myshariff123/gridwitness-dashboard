"""
gw-ms-filing-calendar-staging
Manages regulatory filing deadlines for each tenant.

Routes:
  GET  /api/tenants/{tenantId}/calendar                  → list all deadlines
  PUT  /api/tenants/{tenantId}/calendar/{deadlineId}     → update status/notes
  POST /api/tenants/{tenantId}/calendar                  → add custom deadline

DynamoDB: gw-filing-calendar-staging (PK: TenantID, SK: DeadlineID)
Preset deadlines are computed dynamically from the current year + tenant
fiscal year end, then merged with stored overrides (status, filed date, notes).
"""
import json, os, uuid, logging
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ca-central-1')
ddb    = boto3.resource('dynamodb', region_name=REGION)
cal_t  = ddb.Table(os.environ.get('CALENDAR_TABLE', 'gw-filing-calendar-staging'))
ten_t  = ddb.Table(os.environ.get('TENANTS_TABLE',  'gw-tenants-staging'))

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS',
}

FRAMEWORKS = {
    'GHGRP':   {'label': 'GHGRP',       'color': 'green',  'mandatory': True},
    'OSFI_B15':{'label': 'OSFI B-15',   'color': 'blue',   'mandatory': True},
    'TCFD':    {'label': 'TCFD',         'color': 'purple', 'mandatory': False},
    'CDP':     {'label': 'CDP',          'color': 'teal',   'mandatory': False},
    'IFRS_S2': {'label': 'IFRS S2',     'color': 'indigo', 'mandatory': False},
    'CARBON':  {'label': 'Carbon Price', 'color': 'yellow', 'mandatory': True},
    'CUSTOM':  {'label': 'Custom',       'color': 'gray',   'mandatory': False},
}


def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

def _now_str():
    return datetime.now(timezone.utc).isoformat()

def _days_remaining(due_date_str: str) -> int:
    try:
        due = date.fromisoformat(due_date_str[:10])
        return (due - date.today()).days
    except Exception:
        return 999


def _deadline_status(due_str: str, filed: bool, waived: bool) -> str:
    if filed:   return 'FILED'
    if waived:  return 'WAIVED'
    days = _days_remaining(due_str)
    if days < 0:   return 'OVERDUE'
    if days <= 14: return 'DUE_SOON'
    return 'UPCOMING'


# ─── Preset deadline catalogue ────────────────────────────────────────────────

def _next_annual_date(month: int, day: int) -> str:
    """Return next occurrence of MM-DD on or after today."""
    today = date.today()
    target = date(today.year, month, day)
    if target < today:
        target = date(today.year + 1, month, day)
    return target.isoformat()


def _fiscal_year_end_date(fy_end: str, year: int) -> date:
    """Parse MM-DD fiscal year end and return the date for given year."""
    try:
        m, d = map(int, fy_end.split('-'))
        return date(year, m, d)
    except Exception:
        return date(year, 12, 31)


def _preset_deadlines(fy_end: str = '12-31') -> list:
    """Generate this-year and next-year regulatory deadline entries."""
    today  = date.today()
    year   = today.year
    items  = []

    # 1. GHGRP — June 1 each year (reports prior calendar year)
    for yr in [year, year + 1]:
        due = date(yr, 6, 1)
        items.append({
            'DeadlineID':  f'GHGRP-{yr}',
            'Framework':   'GHGRP',
            'Title':       f'GHGRP Annual Emissions Report ({yr - 1} calendar year)',
            'Description': (
                'Environment and Climate Change Canada — Greenhouse Gas Reporting Program. '
                f'File {yr - 1} calendar year emissions if facility exceeded 10,000 tCO₂e. '
                'Report covers Scope 1 direct emissions from fuel combustion.'
            ),
            'DueDate':     due.isoformat(),
            'Preset':      True,
            'Priority':    'MANDATORY',
        })

    # 2. OSFI B-15 — 90 days after fiscal year end
    for yr in [year, year + 1]:
        fye  = _fiscal_year_end_date(fy_end, yr)
        due  = fye + timedelta(days=90)
        items.append({
            'DeadlineID':  f'OSFI_B15-{yr}',
            'Framework':   'OSFI_B15',
            'Title':       f'OSFI B-15 Climate Risk Disclosure (FY {yr})',
            'Description': (
                'OSFI Guideline B-15 Annual Climate Risk Disclosure. Due 90 days after fiscal '
                f'year end ({fye.isoformat()}). Requires GHG emissions inventory, TCFD-aligned '
                'governance disclosures, and board attestation.'
            ),
            'DueDate':     due.isoformat(),
            'Preset':      True,
            'Priority':    'MANDATORY',
        })

    # 3. TCFD — 120 days after fiscal year end
    for yr in [year, year + 1]:
        fye  = _fiscal_year_end_date(fy_end, yr)
        due  = fye + timedelta(days=120)
        items.append({
            'DeadlineID':  f'TCFD-{yr}',
            'Framework':   'TCFD',
            'Title':       f'TCFD Annual Climate Disclosure (FY {yr})',
            'Description': (
                'Task Force on Climate-related Financial Disclosures (TCFD) annual report. '
                'Four pillars: Governance, Strategy, Risk Management, Metrics & Targets. '
                f'Due 120 days after fiscal year end ({fye.isoformat()}).'
            ),
            'DueDate':     due.isoformat(),
            'Preset':      True,
            'Priority':    'RECOMMENDED',
        })

    # 4. CDP — July 31 each year (submission window Apr–Jul)
    for yr in [year, year + 1]:
        due = date(yr, 7, 31)
        items.append({
            'DeadlineID':  f'CDP-{yr}',
            'Framework':   'CDP',
            'Title':       f'CDP Climate Change Response ({yr})',
            'Description': (
                f'CDP (formerly Carbon Disclosure Project) annual climate questionnaire. '
                f'Submission window: April 1 – July 31, {yr}. '
                'Covers Scope 1, 2, 3 emissions, climate targets, and governance.'
            ),
            'DueDate':     date(yr, 7, 31).isoformat(),
            'Preset':      True,
            'Priority':    'RECOMMENDED',
        })

    # 5. IFRS S2 — 90 days after fiscal year end
    for yr in [year, year + 1]:
        fye  = _fiscal_year_end_date(fy_end, yr)
        due  = fye + timedelta(days=90)
        items.append({
            'DeadlineID':  f'IFRS_S2-{yr}',
            'Framework':   'IFRS_S2',
            'Title':       f'IFRS S2 Climate-Related Disclosures (FY {yr})',
            'Description': (
                'ISSB IFRS S2 Climate-related Disclosures — mandatory for Canadian public '
                'companies effective January 2024. Requires cross-industry metrics (absolute '
                'Scope 1+2+3), transition risk exposure, physical risk exposure, and SASB '
                'sector-specific metrics for data centres.'
            ),
            'DueDate':     due.isoformat(),
            'Preset':      True,
            'Priority':    'MANDATORY_FOR_PUBLIC',
        })

    # 6. Carbon price annual reconciliation — March 31
    for yr in [year, year + 1]:
        due = date(yr, 3, 31)
        items.append({
            'DeadlineID':  f'CARBON-{yr}',
            'Framework':   'CARBON',
            'Title':       f'Canada Carbon Levy Annual Reconciliation ({yr})',
            'Description': (
                'Federal carbon levy annual return under the Greenhouse Gas Pollution Pricing '
                f'Act. Covers {yr - 1} calendar year direct fuel combustion (Scope 1). '
                f'Carbon price: ${_price_for_year(yr - 1)}/tCO₂e.'
            ),
            'DueDate':     due.isoformat(),
            'Preset':      True,
            'Priority':    'MANDATORY',
        })

    return sorted(items, key=lambda x: x['DueDate'])


def _price_for_year(yr: int) -> int:
    schedule = {2023:65, 2024:80, 2025:95, 2026:110, 2027:125, 2028:140, 2029:155, 2030:170}
    return schedule.get(yr, 170)


def _get_tenant_fiscal_year(tenant_id: str) -> str:
    try:
        r = ten_t.get_item(Key={'TenantID': tenant_id},
                            ProjectionExpression='FiscalYearEnd')
        item = r.get('Item') or {}
        return item.get('FiscalYearEnd', '12-31') or '12-31'
    except Exception:
        return '12-31'


def _load_overrides(tenant_id: str) -> dict:
    """Load stored overrides keyed by DeadlineID."""
    try:
        r = cal_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id))
        return {i['DeadlineID']: i for i in r.get('Items', [])}
    except Exception as e:
        logger.warning('Calendar DDB read error: %s', e)
        return {}


def _merge(preset: list, overrides: dict) -> list:
    """Merge preset deadlines with stored overrides + custom deadlines."""
    preset_ids = set()
    result     = []
    for p in preset:
        did   = p['DeadlineID']
        preset_ids.add(did)
        over  = overrides.get(did, {})
        filed  = over.get('Status') == 'FILED'
        waived = over.get('Status') == 'WAIVED'
        status = _deadline_status(p['DueDate'], filed, waived)
        entry  = {**p, **{
            'Status':       status,
            'FiledAt':      over.get('FiledAt'),
            'Notes':        over.get('Notes', ''),
            'ReminderDays': over.get('ReminderDays', [30, 14, 7]),
            'DaysRemaining':_days_remaining(p['DueDate']),
            'FrameworkMeta':FRAMEWORKS.get(p['Framework'], FRAMEWORKS['CUSTOM']),
        }}
        result.append(entry)

    # Custom deadlines not in presets
    for did, item in overrides.items():
        if did in preset_ids or not item.get('Custom'):
            continue
        filed  = item.get('Status') == 'FILED'
        waived = item.get('Status') == 'WAIVED'
        due    = item.get('DueDate', '')
        status = _deadline_status(due, filed, waived)
        result.append({
            'DeadlineID':   did,
            'Framework':    'CUSTOM',
            'Title':        item.get('Title', 'Custom Deadline'),
            'Description':  item.get('Description', ''),
            'DueDate':      due,
            'Priority':     item.get('Priority', 'CUSTOM'),
            'Preset':       False,
            'Custom':       True,
            'Status':       status,
            'FiledAt':      item.get('FiledAt'),
            'Notes':        item.get('Notes', ''),
            'ReminderDays': item.get('ReminderDays', [30, 14, 7]),
            'DaysRemaining':_days_remaining(due),
            'FrameworkMeta':FRAMEWORKS['CUSTOM'],
        })

    return sorted(result, key=lambda x: x['DueDate'])


# ─── Lambda handler ───────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method   = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    raw_path = event.get('rawPath', '')
    path_p   = event.get('pathParameters') or {}
    qs       = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return _r(200, {})

    tenant_id   = path_p.get('tenantId') or qs.get('tenant_id') or ''
    deadline_id = path_p.get('deadlineId') or ''

    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    # GET — list deadlines
    if method == 'GET':
        fy_end    = _get_tenant_fiscal_year(tenant_id)
        presets   = _preset_deadlines(fy_end)
        overrides = _load_overrides(tenant_id)
        deadlines = _merge(presets, overrides)

        upcoming  = sum(1 for d in deadlines if d['Status'] in ('UPCOMING', 'DUE_SOON'))
        overdue   = sum(1 for d in deadlines if d['Status'] == 'OVERDUE')
        filed     = sum(1 for d in deadlines if d['Status'] == 'FILED')

        return _r(200, {
            'tenant_id':    tenant_id,
            'fiscal_year_end': fy_end,
            'deadlines':    deadlines,
            'summary': {
                'total':    len(deadlines),
                'upcoming': upcoming,
                'overdue':  overdue,
                'filed':    filed,
            },
        })

    # PUT — update deadline status / notes
    if method == 'PUT' and deadline_id:
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        status       = body.get('status', 'FILED').upper()
        notes        = body.get('notes', '')
        reminder_days = body.get('reminder_days', [30, 14, 7])
        now          = _now_str()

        item = {
            'TenantID':    tenant_id,
            'DeadlineID':  deadline_id,
            'Status':      status,
            'Notes':       notes,
            'ReminderDays':reminder_days,
            'UpdatedAt':   now,
        }
        if status == 'FILED':
            item['FiledAt'] = body.get('filed_at') or now

        cal_t.put_item(Item=item)
        logger.info('calendar_update tenant=%s deadline=%s status=%s',
                    tenant_id, deadline_id, status)
        return _r(200, {'ok': True, 'deadline_id': deadline_id, 'status': status})

    # POST — add custom deadline
    if method == 'POST' and not deadline_id:
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        title    = body.get('title', '').strip()
        due_date = body.get('due_date', '')
        if not title or not due_date:
            return _r(400, {'error': 'title and due_date required'})

        did  = f'CUSTOM-{uuid.uuid4().hex[:8].upper()}'
        item = {
            'TenantID':    tenant_id,
            'DeadlineID':  did,
            'Title':       title,
            'Description': body.get('description', ''),
            'DueDate':     due_date,
            'Framework':   'CUSTOM',
            'Priority':    body.get('priority', 'CUSTOM'),
            'Status':      'UPCOMING',
            'Custom':      True,
            'ReminderDays':body.get('reminder_days', [30, 14, 7]),
            'Notes':       body.get('notes', ''),
            'CreatedAt':   _now_str(),
        }
        cal_t.put_item(Item=item)
        logger.info('calendar_custom tenant=%s id=%s due=%s', tenant_id, did, due_date)
        return _r(201, {'ok': True, 'deadline_id': did})

    return _r(405, {'error': 'Method not allowed'})
