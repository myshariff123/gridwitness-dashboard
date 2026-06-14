"""
gw-ms-filing-reminder-staging — EventBridge daily trigger.

Scans all tenants' regulatory deadlines, fires SNS email reminders
at 30 / 14 / 7 days before each deadline (one notification per window,
de-duplicated by storing the sent window in DynamoDB).

Reminder email content:
  Subject: [GridWitness] {Framework} deadline in {N} days — {Title}
  Body: due date, description, action link
"""
import json, os, logging
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION    = os.environ.get('AWS_REGION',       'ca-central-1')
SNS_ARN   = os.environ.get('SNS_ARN',
    'arn:aws:sns:ca-central-1:768949138583:gw-data-layer-alerts-staging')
APP_URL   = os.environ.get('APP_URL',          'https://16-174-1-7.nip.io')

ddb   = boto3.resource('dynamodb', region_name=REGION)
sns   = boto3.client('sns', region_name=REGION)
cal_t = ddb.Table(os.environ.get('CALENDAR_TABLE', 'gw-filing-calendar-staging'))
ten_t = ddb.Table(os.environ.get('TENANTS_TABLE',  'gw-tenants-staging'))

# Parallel to filing_calendar_handler — kept minimal to avoid import dependency
CARBON_PRICE_SCHEDULE = {
    2023:65, 2024:80, 2025:95, 2026:110, 2027:125, 2028:140, 2029:155, 2030:170,
}


def _get_tenants() -> list:
    items = []
    kwargs = {'ProjectionExpression': 'TenantID, FiscalYearEnd, NotificationEmail, GridThresholds'}
    for _ in range(20):
        r = ten_t.scan(**kwargs)
        items.extend(r.get('Items', []))
        if 'LastEvaluatedKey' not in r:
            break
        kwargs['ExclusiveStartKey'] = r['LastEvaluatedKey']
    return items


def _load_calendar(tenant_id: str) -> dict:
    """Returns {DeadlineID: item} for stored overrides."""
    try:
        r = cal_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id))
        return {i['DeadlineID']: i for i in r.get('Items', [])}
    except Exception as e:
        logger.warning('Cal DDB error for %s: %s', tenant_id, e)
        return {}


def _fy_end_date(fy_end: str, year: int) -> date:
    try:
        m, d = map(int, (fy_end or '12-31').split('-'))
        return date(year, m, d)
    except Exception:
        return date(year, 12, 31)


def _preset_due_dates(fy_end: str) -> list:
    """Return list of {DeadlineID, DueDate, Framework, Title} for current+next year."""
    today = date.today()
    year  = today.year
    out   = []

    for yr in [year, year + 1]:
        # GHGRP — June 1
        out.append({'DeadlineID': f'GHGRP-{yr}',    'DueDate': date(yr, 6, 1),
                    'Framework': 'GHGRP',    'Title': f'GHGRP Annual Emissions Report ({yr-1})'})
        # OSFI B-15 — 90 days after FYE
        fye = _fy_end_date(fy_end, yr)
        out.append({'DeadlineID': f'OSFI_B15-{yr}', 'DueDate': fye + timedelta(days=90),
                    'Framework': 'OSFI_B15', 'Title': f'OSFI B-15 Climate Risk Disclosure (FY {yr})'})
        # TCFD — 120 days after FYE
        out.append({'DeadlineID': f'TCFD-{yr}',     'DueDate': fye + timedelta(days=120),
                    'Framework': 'TCFD',     'Title': f'TCFD Annual Disclosure (FY {yr})'})
        # CDP — July 31
        out.append({'DeadlineID': f'CDP-{yr}',      'DueDate': date(yr, 7, 31),
                    'Framework': 'CDP',      'Title': f'CDP Climate Response ({yr})'})
        # IFRS S2 — 90 days after FYE
        out.append({'DeadlineID': f'IFRS_S2-{yr}',  'DueDate': fye + timedelta(days=90),
                    'Framework': 'IFRS_S2',  'Title': f'IFRS S2 Climate Disclosures (FY {yr})'})
        # Carbon reconciliation — Mar 31
        out.append({'DeadlineID': f'CARBON-{yr}',   'DueDate': date(yr, 3, 31),
                    'Framework': 'CARBON',   'Title': f'Carbon Levy Annual Return ({yr})'})

    return out


def _reminder_windows(due: date) -> list:
    """Return active reminder windows (30/14/7 days) for a due date."""
    today  = date.today()
    days   = (due - today).days
    active = []
    for w in [30, 14, 7]:
        if 0 <= days <= w:
            active.append(w)
    return active


def _already_sent(override: dict, window: int) -> bool:
    sent = override.get('RemindersSent') or []
    return f'{window}d' in sent


def _mark_sent(tenant_id: str, deadline_id: str, override: dict, window: int):
    sent = list(override.get('RemindersSent') or [])
    if f'{window}d' not in sent:
        sent.append(f'{window}d')
    cal_t.update_item(
        Key={'TenantID': tenant_id, 'DeadlineID': deadline_id},
        UpdateExpression='SET RemindersSent = :s, UpdatedAt = :t',
        ExpressionAttributeValues={
            ':s': sent,
            ':t': datetime.now(timezone.utc).isoformat(),
        },
    )


def _send_reminder(tenant_id: str, email: str, deadline: dict, window: int):
    due     = deadline['DueDate']
    title   = deadline['Title']
    fw      = deadline['Framework']
    days    = (due - date.today()).days
    cal_url = f'{APP_URL}/calendar?tenant_id={tenant_id}'

    subject = f'[GridWitness] {fw} filing in {days} day{"s" if days != 1 else ""} — {title}'
    message = (
        f'GridWitness Regulatory Filing Reminder\n'
        f'{'='*50}\n\n'
        f'Deadline : {title}\n'
        f'Framework: {fw}\n'
        f'Due Date : {due.isoformat()}\n'
        f'Days Left: {days}\n\n'
        f'View your compliance calendar:\n{cal_url}\n\n'
        f'This is an automated reminder from GridWitness.\n'
        f'Tenant: {tenant_id}\n'
    )
    try:
        sns.publish(TopicArn=SNS_ARN, Subject=subject[:100], Message=message)
        logger.info('REMINDER_SENT tenant=%s deadline=%s window=%dd email=%s',
                    tenant_id, deadline['DeadlineID'], window, email)
    except Exception as e:
        logger.error('SNS publish failed: %s', e)


def lambda_handler(event, context):
    tenants = _get_tenants()
    logger.info('Checking %d tenants for upcoming filing deadlines', len(tenants))
    sent_total = 0

    for t in tenants:
        tid   = t['TenantID']
        email = (t.get('NotificationEmail')
                 or (t.get('GridThresholds') or {}).get('email')
                 or 'support@nimblestride.ca')
        fy_end    = t.get('FiscalYearEnd', '12-31') or '12-31'
        overrides = _load_calendar(tid)
        presets   = _preset_due_dates(fy_end)

        # Also check custom deadlines
        custom = [
            {'DeadlineID': did, 'DueDate': date.fromisoformat(i['DueDate'][:10]),
             'Framework': 'CUSTOM', 'Title': i.get('Title', 'Custom')}
            for did, i in overrides.items()
            if i.get('Custom') and i.get('DueDate')
        ]

        for dl in presets + custom:
            did    = dl['DeadlineID']
            due    = dl['DueDate'] if isinstance(dl['DueDate'], date) else date.fromisoformat(dl['DueDate'])
            over   = overrides.get(did, {})

            # Skip if already filed or waived
            if over.get('Status') in ('FILED', 'WAIVED'):
                continue

            reminder_days = over.get('ReminderDays', [30, 14, 7])
            windows       = _reminder_windows(due)

            for w in windows:
                if w not in reminder_days:
                    continue
                if _already_sent(over, w):
                    continue
                _send_reminder(tid, email, {**dl, 'DueDate': due}, w)
                _mark_sent(tid, did, over, w)
                # refresh override for next window check
                over = _load_calendar(tid).get(did, over)
                sent_total += 1

    logger.info('Filing reminder scan complete — %d reminders sent', sent_total)
    return {'tenants_scanned': len(tenants), 'reminders_sent': sent_total}
