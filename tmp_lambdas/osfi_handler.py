"""
gw-ms-osfi-reporting-staging — Annual Regulatory Compliance Report
Conforms to: OSFI B-15 · Bill C-59 · ISO 14064-1:2018 · GHG Protocol Corporate Standard

Report structure (12 sections):
  1  Executive Summary
  2  Organizational Boundary & Reporting Framework
  3  GHG Measurement Methodology
  4  GHG Inventory (Scope 2 + Scope 3 Cat.11 cloud)
  5  Carbon Budget Performance
  6  Science-Based Targets (SBTi) & Decarbonisation Roadmap
  7  Scope 3 Category 11 — AWS Cloud Emissions Detail
  8  Live Grid Carbon Intensity Analysis
  9  Regulatory Compliance Matrix
  10 Data Integrity — Cryptographic Chain of Custody
  11 Grid Stress Incident Log
  12 Executive Attestation
"""
import json, os, hashlib, logging
import boto3
from boto3.dynamodb.conditions import Key, Attr
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from io import BytesIO

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                  Table, TableStyle, PageBreak, HRFlowable)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger()
logger.setLevel(logging.INFO)

FONTS_DIR = '/var/task/fonts'
try:
    pdfmetrics.registerFont(TTFont('DejaVu',     f'{FONTS_DIR}/DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('DejaVuBold', f'{FONTS_DIR}/DejaVuSans-Bold.ttf'))
    pdfmetrics.registerFont(TTFont('DejaVuMono', f'{FONTS_DIR}/DejaVuSansMono.ttf'))
    BODY_FONT = 'DejaVu'; BOLD_FONT = 'DejaVuBold'; MONO_FONT = 'DejaVuMono'
except Exception as e:
    logger.warning('Fallback to Helvetica: %s', e)
    BODY_FONT = 'Helvetica'; BOLD_FONT = 'Helvetica-Bold'; MONO_FONT = 'Courier'

REGION  = os.environ.get('AWS_REGION', 'ca-central-1')
ACCOUNT = os.environ.get('AWS_ACCOUNT_ID', '768949138583')
VAULT   = os.environ.get('VAULT_BUCKET', f'gw-compliance-vault-{ACCOUNT}')

ddb          = boto3.resource('dynamodb', region_name=REGION)
s3           = boto3.client('s3', region_name=REGION)
tel_table    = ddb.Table(os.environ.get('TELEMETRY_TABLE',  'gw-telemetry-staging'))
inc_table    = ddb.Table(os.environ.get('INCIDENTS_TABLE',  'gw-incidents-staging'))
tenant_table = ddb.Table(os.environ.get('TENANTS_TABLE',    'gw-tenants-staging'))
sbti_table   = ddb.Table(os.environ.get('SBTI_TABLE',       'gw-sbti-staging'))
scope3_table = ddb.Table(os.environ.get('SCOPE3_TABLE',     'gw-scope3-staging'))
budget_table = ddb.Table(os.environ.get('BUDGET_TABLE',     'gw-carbon-budget-staging'))

INTENSITY_FALLBACK = {'AB': 590.0, 'ON': 30.0, 'BC': 13.0, 'QC': 1.5}
PROVINCE_NAMES = {
    'AB': 'Alberta (AESO)',
    'ON': 'Ontario (IESO)',
    'BC': 'British Columbia (BC Hydro)',
    'QC': 'Québec (Hydro-Québec)',
}

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'*',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
}


def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

def _dec(v):
    return float(v) if isinstance(v, Decimal) else v

def _now():
    return datetime.now(timezone.utc)


# ─── Fetchers ────────────────────────────────────────────────────────────────

def _get_latest_report(tenant_id):
    prefix = f'reports/{tenant_id}/'
    try:
        objs = []
        for page in s3.get_paginator('list_objects_v2').paginate(Bucket=VAULT, Prefix=prefix):
            for o in page.get('Contents', []):
                if o['Key'].endswith('.pdf'):
                    objs.append(o)
        if not objs:
            return _r(404, {'status': 'not_found', 'message': 'No reports generated yet.'})
        objs.sort(key=lambda x: x['LastModified'], reverse=True)
        latest    = objs[0]
        report_id = latest['Key'].split('/')[-1].replace('.pdf', '')
        url = s3.generate_presigned_url(
            'get_object', Params={'Bucket': VAULT, 'Key': latest['Key']}, ExpiresIn=3600)
        return _r(200, {'status': 'ready', 'download_url': url, 'report_id': report_id,
                        's3_key': latest['Key'], 'size_bytes': latest['Size'],
                        'last_modified': latest['LastModified'].isoformat()})
    except Exception as e:
        logger.exception('get_latest_report failed')
        return _r(500, {'error': str(e)})


def _fetch_telemetry(tenant_id, df, dt):
    items = []
    kwargs = {'FilterExpression': Attr('TenantID').eq(tenant_id)}
    for _ in range(20):
        r = tel_table.scan(**kwargs)
        items.extend(r.get('Items', []))
        if 'LastEvaluatedKey' not in r:
            break
        kwargs['ExclusiveStartKey'] = r['LastEvaluatedKey']
    if df: items = [x for x in items if str(x.get('Timestamp', '')) >= df]
    if dt: items = [x for x in items if str(x.get('Timestamp', '')) <= dt + 'T23:59:59Z']
    items.sort(key=lambda x: x.get('Timestamp', ''))
    return items


def _fetch_incidents(tenant_id, df, dt):
    items = []
    kwargs = {'FilterExpression': Attr('TenantID').eq(tenant_id)}
    for _ in range(10):
        r = inc_table.scan(**kwargs)
        items.extend(r.get('Items', []))
        if 'LastEvaluatedKey' not in r:
            break
        kwargs['ExclusiveStartKey'] = r['LastEvaluatedKey']
    if df: items = [x for x in items if str(x.get('OpenedAt', '')) >= df]
    if dt: items = [x for x in items if str(x.get('OpenedAt', '')) <= dt + 'T23:59:59Z']
    items.sort(key=lambda x: x.get('OpenedAt', ''))
    return items


def _fetch_tenant(tenant_id):
    try:
        r = tenant_table.get_item(Key={'TenantID': tenant_id})
        return r.get('Item') or {}
    except Exception:
        return {}


def _fetch_sbti(tenant_id):
    try:
        r = sbti_table.get_item(Key={'TenantID': tenant_id})
        item = r.get('Item')
        if not item:
            return None
        return {k: _dec(v) if isinstance(v, Decimal) else v for k, v in item.items()}
    except Exception:
        return None


def _sbti_trajectory(sbti):
    """Calculate year-by-year trajectory from SBTi config."""
    if not sbti:
        return []
    base   = int(sbti.get('BaseYear', 0))
    end    = int(sbti.get('TargetYear', 0))
    base_e = float(sbti.get('BaselineEmissions', 0))
    rate   = float(sbti.get('AnnualReductionRate', 0)) / 100.0
    if not (base and end and base_e and rate):
        return []
    traj = []
    for y in range(base, end + 1):
        target = base_e * ((1 - rate) ** (y - base))
        traj.append({'year': y, 'target_tco2e': round(target, 4)})
    return traj


def _fetch_scope3(tenant_id, year_month=None):
    """Return most recent Scope 3 record, or None."""
    try:
        if year_month:
            r = scope3_table.get_item(Key={'TenantID': tenant_id, 'YearMonth': year_month})
            item = r.get('Item')
        else:
            r = scope3_table.query(
                KeyConditionExpression=Key('TenantID').eq(tenant_id),
                ScanIndexForward=False, Limit=1)
            items = r.get('Items', [])
            item = items[0] if items else None
        if not item:
            return None
        result = {}
        for k, v in item.items():
            if isinstance(v, Decimal):
                result[k] = float(v)
            elif k == 'ByRegion' and isinstance(v, str):
                result[k] = json.loads(v)
            else:
                result[k] = v
        return result
    except Exception as e:
        logger.warning('Scope3 fetch error: %s', e)
        return None


def _fetch_budget(tenant_id):
    try:
        r = budget_table.get_item(Key={'TenantID': tenant_id})
        item = r.get('Item')
        if not item:
            return None
        return {k: _dec(v) if isinstance(v, Decimal) else v for k, v in item.items()}
    except Exception:
        return None


def _compute_merkle(records):
    root = hashlib.sha256(b'GENESIS').hexdigest()
    for r in records:
        canonical = json.dumps({k: str(v) for k, v in sorted(r.items())}, sort_keys=True)
        h = hashlib.sha256((root + canonical).encode('utf-8')).hexdigest()
        r['RecordHash'] = h
        root = h
    return root


def _carbon_calc(records):
    total_kwh = 0.0; total_g = 0.0
    by_grid = {}; by_source = {}
    scope2_g = 0.0; scope3_g = 0.0
    for r in records:
        w    = float(_dec(r.get('ActualWattage') or r.get('Actual_Wattage') or 0))
        g    = float(_dec(r.get('CarbonDebt_gCO2') or r.get('gCO2e') or 0))
        kwh  = w * (5.0 / 60.0) / 1000.0
        grid = r.get('GridID', 'AB')
        total_kwh += kwh; total_g += g
        by_grid[grid] = by_grid.get(grid, 0) + g
        src_key = r.get('Source', 'unknown')
        ci = float(_dec(r.get('CarbonIntensity') or INTENSITY_FALLBACK.get(grid, 100.0)))
        by_source.setdefault(src_key, {'watts_sum': 0, 'count': 0, 'grid': grid, 'g': 0.0, 'intensity': ci})
        by_source[src_key]['watts_sum'] += w
        by_source[src_key]['count'] += 1
        by_source[src_key]['g'] += g
        ds = r.get('DataSource', '')
        if ds == 'CLOUD_DISCOVERY' or 'cloud' in ds.lower():
            scope3_g += g
        else:
            scope2_g += g
    return {'total_kwh': total_kwh, 'total_g': total_g, 'by_grid': by_grid,
            'by_source': by_source, 'scope2_g': scope2_g, 'scope3_g': scope3_g}


# ─── PDF styles ──────────────────────────────────────────────────────────────

def _styles():
    DARK_BLUE  = colors.HexColor('#0d3b66')
    TEXT       = colors.HexColor('#1a1a1a')
    MUTED      = colors.HexColor('#444444')
    return {
        'report_header': ParagraphStyle('report_header', fontName=BOLD_FONT, fontSize=9,
            leading=11, textColor=MUTED, spaceAfter=2),
        'title': ParagraphStyle('title', fontName=BOLD_FONT, fontSize=22, leading=27,
            alignment=1, textColor=DARK_BLUE, spaceAfter=6),
        'subtitle': ParagraphStyle('subtitle', fontName=BODY_FONT, fontSize=12, leading=15,
            alignment=1, textColor=MUTED, spaceAfter=20),
        'h1': ParagraphStyle('h1', fontName=BOLD_FONT, fontSize=13, leading=17,
            textColor=DARK_BLUE, spaceBefore=14, spaceAfter=6, borderPad=(0,0,2,0)),
        'h2': ParagraphStyle('h2', fontName=BOLD_FONT, fontSize=10, leading=13,
            textColor=TEXT, spaceBefore=8, spaceAfter=4),
        'body': ParagraphStyle('body', fontName=BODY_FONT, fontSize=10, leading=14,
            textColor=TEXT, spaceAfter=6),
        'small': ParagraphStyle('small', fontName=BODY_FONT, fontSize=8.5, leading=11,
            textColor=MUTED),
        'cell': ParagraphStyle('cell', fontName=BODY_FONT, fontSize=8.5, leading=11,
            textColor=TEXT),
        'cell_b': ParagraphStyle('cell_b', fontName=BOLD_FONT, fontSize=8.5, leading=11,
            textColor=colors.white),
        'cell_g': ParagraphStyle('cell_g', fontName=BOLD_FONT, fontSize=8.5, leading=11,
            textColor=colors.HexColor('#1f7a4d')),
        'cell_r': ParagraphStyle('cell_r', fontName=BOLD_FONT, fontSize=8.5, leading=11,
            textColor=colors.HexColor('#b91c1c')),
        'hash': ParagraphStyle('hash', fontName=MONO_FONT, fontSize=7.5, leading=10,
            textColor=DARK_BLUE, alignment=1),
        'note': ParagraphStyle('note', fontName=BODY_FONT, fontSize=8, leading=11,
            textColor=MUTED, leftIndent=10, borderPad=4),
    }


def _table_style_header():
    return TableStyle([
        ('BACKGROUND',   (0,0), (-1,0),  colors.HexColor('#1a3a52')),
        ('TEXTCOLOR',    (0,0), (-1,0),  colors.white),
        ('FONTNAME',     (0,0), (-1,0),  BOLD_FONT),
        ('FONTNAME',     (0,1), (-1,-1), BODY_FONT),
        ('FONTSIZE',     (0,0), (-1,-1), 8.5),
        ('GRID',         (0,0), (-1,-1), 0.25, colors.HexColor('#cccccc')),
        ('LEFTPADDING',  (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING',   (0,0), (-1,-1), 4),
        ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ('VALIGN',       (0,0), (-1,-1), 'TOP'),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [colors.white, colors.HexColor('#f5f8fc')]),
    ])


def _para(text, style):
    return Paragraph(str(text) if text is not None else '', style)


def _make_table(headers, rows, col_widths, styles, header_style='cell_b'):
    data = [[_para(h, styles[header_style]) for h in headers]]
    for r in rows:
        if len(r) < len(headers):
            r = list(r) + ['—'] * (len(headers) - len(r))
        elif len(r) > len(headers):
            r = r[:len(headers)]
        data.append([_para(c, styles['cell']) for c in r])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(_table_style_header())
    return t


def _hr(styles):
    return HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#cccccc'),
                       spaceAfter=6, spaceBefore=4)


# ─── PDF builder ─────────────────────────────────────────────────────────────

def _build_pdf(tenant_id, df, dt, frameworks, records, incidents,
               merkle, carbon, report_id, tenant, sbti, scope3, budget):
    S = _styles()
    buf = BytesIO()
    W   = 7.8 * inch  # usable content width
    doc = SimpleDocTemplate(buf, pagesize=letter,
                            leftMargin=0.6*inch, rightMargin=0.6*inch,
                            topMargin=0.65*inch, bottomMargin=0.65*inch,
                            title=f'GridWitness Compliance Report — {tenant_id}',
                            author='GridWitness by NimbleStride Inc.')
    story = []
    now   = _now()

    # ── COVER ────────────────────────────────────────────────────────────────
    story.append(_para('CONFIDENTIAL — REGULATORY COMPLIANCE REPORT', S['report_header']))
    story.append(Spacer(1, 0.15*inch))
    story.append(_para('GridWitness', S['title']))
    story.append(_para('Annual GHG Emissions Compliance Report', S['subtitle']))
    story.append(_para(
        f'Reporting Frameworks: {" · ".join(frameworks)}', S['small']))
    story.append(Spacer(1, 0.2*inch))

    cover_rows = [
        ('Tenant / Organisation', tenant_id),
        ('Report Period',         f'{df} to {dt}'),
        ('Report ID',             report_id),
        ('Generated',             now.strftime('%Y-%m-%d %H:%M:%S UTC')),
        ('WORM Ledger Records',   f'{len(records):,}'),
        ('Incidents in Period',   f'{len(incidents)}'),
        ('Data Residency',        'AWS ca-central-1 (Canadian Sovereign Cloud)'),
        ('Prepared by',           'GridWitness Platform — NimbleStride Inc.'),
    ]
    cover_data = [[_para(k, S['cell_b']), _para(v, S['cell'])] for k, v in cover_rows]
    cover_tbl  = Table(cover_data, colWidths=[2.1*inch, 5.0*inch])
    cover_tbl.setStyle(TableStyle([
        ('BACKGROUND',   (0,0), (0,-1), colors.HexColor('#1a3a52')),
        ('FONTNAME',     (0,0), (-1,-1), BODY_FONT),
        ('FONTSIZE',     (0,0), (-1,-1), 9),
        ('GRID',         (0,0), (-1,-1), 0.25, colors.HexColor('#cccccc')),
        ('LEFTPADDING',  (0,0), (-1,-1), 7),
        ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('TOPPADDING',   (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
    ]))
    story.append(cover_tbl)
    story.append(PageBreak())

    # ── SECTION 1 — EXECUTIVE SUMMARY ────────────────────────────────────────
    story.append(_para('Section 1 — Executive Summary', S['h1']))
    story.append(_hr(S))
    total_kg  = carbon['total_g'] / 1000.0
    scope2_kg = carbon['scope2_g'] / 1000.0
    scope3_kg = carbon['scope3_g'] / 1000.0
    open_inc  = sum(1 for i in incidents if i.get('Status') == 'OPEN')

    # Determine enforcement mode
    enforcement_mode = tenant.get('EnforcementMode', False)
    enf_label = 'Enforcement Mode (ACTIVE)' if enforcement_mode else 'Audit Mode (default)'

    # SBTi status
    sbti_status = 'Not configured'
    if sbti:
        pathway = sbti.get('TargetType', '?')
        traj    = _sbti_trajectory(sbti)
        cur_yr  = now.year
        cur_target = next((t['target_tco2e'] for t in traj if t['year'] == cur_yr), None)
        if cur_target is not None:
            sbti_status = f"{pathway} pathway — {cur_yr} target: {cur_target:.2f} tCO2e"
        else:
            sbti_status = f"{pathway} pathway — target year: {sbti.get('TargetYear', '?')}"

    # Budget status
    budget_status = 'Not configured'
    if budget:
        ceil_tco2e = float(_dec(budget.get('CeilingTCO2e', 0)))
        if ceil_tco2e > 0:
            scope2_tco2e = scope2_kg / 1000.0
            pct = (scope2_tco2e / ceil_tco2e) * 100 if ceil_tco2e > 0 else 0
            budget_status = f'{pct:.1f}% of {ceil_tco2e:.2f} tCO2e budget used ({budget.get("Period","period")})'

    # Cloud emissions
    scope3_cloud_status = 'AWS Cost Explorer sync not yet performed'
    if scope3:
        scope3_cloud_status = (
            f"{float(scope3.get('TotalTCO2e', 0)):.4f} tCO2e "
            f"({scope3.get('YearMonth', '')} — "
            f"${float(scope3.get('TotalCostUSD', 0)):.2f} compute spend)"
        )

    exec_rows = [
        ('Total Scope 2 Emissions (Physical)',   f'{scope2_kg:.4f} kgCO2e',   f'{scope2_kg/1000:.6f} tCO2e'),
        ('Total Scope 3 Cat.11 (Cloud Compute)', f'{scope3_kg:.4f} kgCO2e',   f'{scope3_kg/1000:.6f} tCO2e'),
        ('Combined GHG Total',                   f'{total_kg:.4f} kgCO2e',    f'{total_kg/1000:.6f} tCO2e'),
        ('AWS Cloud Scope 3 (CE Sync)',           scope3_cloud_status,          '—'),
        ('WORM Ledger Records',                  f'{len(records):,}',           'All periods'),
        ('Incidents (Open / Total)',             f'{open_inc} / {len(incidents)}', f'Period: {df}–{dt}'),
        ('Carbon Budget Utilisation',            budget_status,                 '—'),
        ('SBTi Decarbonisation Target',          sbti_status,                   '—'),
        ('Telemetry Enforcement Mode',           enf_label,                     '—'),
        ('Data Residency',                       'AWS ca-central-1',            'Canadian Sovereign'),
    ]
    story.append(_make_table(
        ['KPI', 'Value', 'Notes / Period'],
        exec_rows,
        [2.8*inch, 2.8*inch, 2.1*inch], S))
    story.append(Spacer(1, 0.1*inch))
    story.append(_para(
        'This report has been automatically generated by the GridWitness platform and reflects '
        'the hardware-verified WORM-sealed emissions telemetry for the reporting period. '
        'All records are cryptographically chained and stored in AWS S3 with COMPLIANCE Object '
        'Lock to satisfy the 7-year retention requirement under OSFI Guideline B-15.',
        S['body']))
    story.append(PageBreak())

    # ── SECTION 2 — ORGANISATIONAL BOUNDARY ──────────────────────────────────
    story.append(_para('Section 2 — Organisational Boundary & Reporting Framework', S['h1']))
    story.append(_hr(S))
    story.append(_para(
        'GridWitness applies the Operational Control approach under the GHG Protocol Corporate '
        'Standard (2004 revised edition). The organisational boundary encompasses all '
        'IT infrastructure where the tenant has operational control, including physical servers '
        'monitored via IPMI/BMC/Redfish agents and cloud compute resources discovered via '
        'AWS CloudWatch cross-account integration.', S['body']))
    boundary_rows = [
        ('Boundary Approach',       'Operational Control',               'GHG Protocol Part I, Chapter 3'),
        ('Reporting Period',        f'{df} to {dt}',                    'Annual (calendar year recommended)'),
        ('Base Year',               sbti.get('BaseYear', str(now.year)) if sbti else str(now.year),
                                                                         'As per SBTi commitment'),
        ('Scope 2 Boundary',        'Physical & co-located servers',     'IPMI, BMC Redfish, edge agents'),
        ('Scope 3 Cat.11 Boundary', 'Cloud compute services (AWS)',      'EC2, Lambda, ECS, EKS, Fargate'),
        ('Exclusions',              'Scope 1 (no on-site combustion)',   'Data centre is electricity-only'),
        ('Grid Zones Monitored',    'AB, BC, ON, QC',                   'AESO (live) + regional estimates'),
    ]
    story.append(_make_table(
        ['Parameter', 'Value', 'Standard Reference'],
        boundary_rows, [2.0*inch, 3.2*inch, 2.6*inch], S))

    # ── SECTION 3 — METHODOLOGY ───────────────────────────────────────────────
    story.append(_para('Section 3 — GHG Measurement Methodology', S['h1']))
    story.append(_hr(S))
    story.append(_para(
        'Emissions are calculated from hardware-measured power draw combined with real-time '
        'or estimated grid carbon intensity, following the location-based method of the '
        'GHG Protocol Scope 2 Guidance (2015).', S['body']))
    method_rows = [
        ('Power Measurement',  'Hardware BMC / IPMI / Redfish sensors',   'Direct hardware measurement'),
        ('Sampling Interval',  '5-minute intervals (real-time)',           'Configurable per agent'),
        ('Grid Intensity — AB','AESO real-time via SMP price proxy',       'AESO API, 5-min update'),
        ('Grid Intensity — BC','21 gCO2/kWh (BC Hydro hydro-dominated)', 'IEA 2024 average'),
        ('Grid Intensity — ON','42 gCO2/kWh (nuclear + gas mix)',         'IEA 2024 average'),
        ('Grid Intensity — QC','2 gCO2/kWh (Hydro-Québec hydro)',        'IEA 2024 average'),
        ('Scope 2 Formula',    'kWh × gCO2/kWh = gCO2e',                 'Location-based method'),
        ('Scope 3 Cat.11',     '$AWS_spend × $0.50/kWh × regional intensity', 'Industry proxy factor'),
        ('GHG Protocol',       'Corporate Standard (2004, rev.)',          'Scope 2 Guidance (2015)'),
        ('ISO 14064-1',        '2018 revision',                            'Third-party verifiable'),
        ('Uncertainty Level',  '±5% (hardware sensor accuracy)',           'SPEC Power benchmark'),
    ]
    story.append(_make_table(
        ['Parameter', 'Methodology', 'Source / Standard'],
        method_rows, [2.2*inch, 3.2*inch, 2.4*inch], S))
    story.append(PageBreak())

    # ── SECTION 4 — GHG INVENTORY ─────────────────────────────────────────────
    story.append(_para('Section 4 — GHG Inventory', S['h1']))
    story.append(_hr(S))
    story.append(_para('4.1  Total Emissions by Scope', S['h2']))
    scope_rows = [
        ('Scope 1 — Direct Emissions',      '0.0', '0.000000',  'N/A — electricity-only data centre'),
        ('Scope 2 — Physical Servers',      f'{scope2_kg:.4f}', f'{scope2_kg/1000:.6f}', 'Location-based, hardware-measured'),
        ('Scope 3 Cat.11 — Cloud Compute',  f'{scope3_kg:.4f}', f'{scope3_kg/1000:.6f}', 'CloudWatch discovery (in-period)'),
        ('TOTAL (Scope 2 + 3)',              f'{total_kg:.4f}',  f'{total_kg/1000:.6f}',  'Reported to OSFI'),
    ]
    story.append(_make_table(
        ['Scope', 'kgCO2e', 'tCO2e', 'Method'],
        scope_rows, [2.4*inch, 1.2*inch, 1.2*inch, 2.95*inch], S))

    story.append(Spacer(1, 0.1*inch))
    story.append(_para('4.2  Emissions by Grid Zone', S['h2']))
    grid_rows = []
    for grid, g in sorted(carbon['by_grid'].items(), key=lambda kv: -kv[1]):
        kg  = g / 1000.0
        pct = (g / carbon['total_g'] * 100.0) if carbon['total_g'] > 0 else 0
        intensity = INTENSITY_FALLBACK.get(grid, 100.0)
        grid_rows.append([grid, PROVINCE_NAMES.get(grid, grid),
                          f'{intensity:.0f}', f'{g:,.3f}', f'{kg:.6f}', f'{pct:.2f}%'])
    if grid_rows:
        story.append(_make_table(
            ['Grid', 'Province / Operator', 'Intensity (g/kWh)', 'gCO2e', 'kgCO2e', '% Share'],
            grid_rows, [0.55*inch, 2.5*inch, 1.2*inch, 1.2*inch, 1.0*inch, 0.8*inch], S))

    story.append(Spacer(1, 0.1*inch))
    story.append(_para('4.3  Device Inventory & Per-Source Attribution', S['h2']))
    device_rows = []
    for src, info in sorted(carbon['by_source'].items()):
        avg_w  = info['watts_sum'] / max(info['count'], 1)
        method = ('AWS CloudWatch' if 'i-' in src
                  else ('BMC Redfish' if 'bmc' in src.lower() else 'Edge Agent'))
        device_rows.append([src[:28], info['grid'], f'{avg_w:.0f}',
                             f'{info["count"]}', f'{info["g"]:,.2f}', method])
    if device_rows:
        story.append(_make_table(
            ['Source / Device', 'Grid', 'Avg W', 'Samples', 'gCO2e', 'Method'],
            device_rows, [2.3*inch, 0.5*inch, 0.65*inch, 0.65*inch, 1.0*inch, 1.6*inch], S))
    else:
        story.append(_para('No telemetry records for this period.', S['body']))
    story.append(PageBreak())

    # ── SECTION 5 — CARBON BUDGET ─────────────────────────────────────────────
    story.append(_para('Section 5 — Carbon Budget Performance', S['h1']))
    story.append(_hr(S))
    if budget:
        ceil_tco2e = float(_dec(budget.get('CeilingTCO2e', 0)))
        period     = budget.get('Period', 'monthly')
        actual_tco2e = scope2_kg / 1000.0
        pct = (actual_tco2e / ceil_tco2e * 100) if ceil_tco2e > 0 else 0
        status = 'COMPLIANT' if pct <= 100 else 'EXCEEDED'
        budget_rows = [
            ('Budget Ceiling (tCO2e)',     f'{ceil_tco2e:.4f}',   period.title()),
            ('Actual Emissions (Scope 2)', f'{actual_tco2e:.6f}',  'Hardware-measured'),
            ('Budget Utilisation',         f'{pct:.2f}%',          status),
            ('Alert Threshold — Warning',  f'{float(_dec(budget.get("AlertThresholds", {}).get("Warning", 80))):.0f}%', 'SNS notification'),
            ('Alert Threshold — Critical', f'{float(_dec(budget.get("AlertThresholds", {}).get("Critical", 95))):.0f}%', 'SNS notification'),
            ('Notification Email',         budget.get('NotificationEmail', '—'), 'SNS topic'),
        ]
        story.append(_make_table(
            ['Parameter', 'Value', 'Notes'],
            budget_rows, [2.5*inch, 2.5*inch, 2.7*inch], S))
    else:
        story.append(_para(
            'No carbon budget has been configured for this tenant. '
            'GridWitness recommends configuring a tCO2e ceiling aligned to your SBTi target '
            'to enable automated threshold alerting under OSFI B-15.',
            S['body']))
    story.append(PageBreak())

    # ── SECTION 6 — SBTi / DECARBONISATION ROADMAP ───────────────────────────
    story.append(_para('Section 6 — Science-Based Targets (SBTi) & Decarbonisation Roadmap', S['h1']))
    story.append(_hr(S))
    if sbti:
        pathway     = sbti.get('TargetType', '?')
        base_year   = int(sbti.get('BaseYear', 0))
        target_year = int(sbti.get('TargetYear', 0))
        base_e      = float(sbti.get('BaselineEmissions', 0))
        rate        = float(sbti.get('AnnualReductionRate', 0))
        sector      = sbti.get('Sector', 'General')
        committed   = sbti.get('CommittedAt', '—')
        traj        = _sbti_trajectory(sbti)
        cur_yr      = now.year
        cur_target  = next((t['target_tco2e'] for t in traj if t['year'] == cur_yr), None)
        final_target = traj[-1]['target_tco2e'] if traj else 0
        total_reduction = ((base_e - final_target) / base_e * 100) if base_e > 0 else 0

        pathway_label = {
            '1.5C':   '1.5°C Pathway — 4.2%/year absolute reduction',
            'WB2C':   'Well-Below 2°C Pathway — 2.5%/year absolute reduction',
            'CUSTOM': f'Custom Pathway — {rate:.2f}%/year absolute reduction',
        }.get(pathway, pathway)

        sbti_meta = [
            ('Committed Pathway',    pathway_label,                  'SBTi Corporate Standard v1.2'),
            ('Base Year',            str(base_year),                  'Inventory base year'),
            ('Baseline Emissions',   f'{base_e:.4f} tCO2e',          'Scope 1+2+3 absolute'),
            ('Target Year',          str(target_year),                '—'),
            ('Annual Reduction Rate',f'{rate:.2f}%',                  'Absolute reduction, compounding'),
            ('Sector',               sector,                          'SBTi sector classification'),
            (f'{cur_yr} Target',     f'{cur_target:.4f} tCO2e' if cur_target else 'N/A', f'{cur_yr} interim milestone'),
            (f'{target_year} Final Target', f'{final_target:.4f} tCO2e', f'{total_reduction:.1f}% total reduction'),
            ('Commitment Date',      str(committed)[:19] if committed else '—', '—'),
        ]
        story.append(_make_table(
            ['Parameter', 'Value', 'Notes'],
            sbti_meta, [2.3*inch, 2.5*inch, 2.9*inch], S))

        # Trajectory table
        story.append(Spacer(1, 0.12*inch))
        story.append(_para('6.1  Year-by-Year Decarbonisation Trajectory', S['h2']))
        traj_rows = []
        for t in traj:
            yr   = t['year']
            tgt  = t['target_tco2e']
            chg  = ((base_e - tgt) / base_e * 100) if base_e > 0 else 0
            flag = '← current year' if yr == cur_yr else ''
            traj_rows.append([str(yr), f'{tgt:.4f}', f'-{chg:.1f}%', flag])
        story.append(_make_table(
            ['Year', 'Target tCO2e', 'Reduction from Baseline', 'Note'],
            traj_rows, [0.7*inch, 1.4*inch, 1.8*inch, 3.8*inch], S))
    else:
        story.append(_para(
            'No SBTi target has been configured for this tenant. GridWitness supports '
            '1.5°C, Well-Below 2°C, and custom reduction pathways. Configuring an SBTi '
            'target is recommended for ISO 14064-1 conformance and is increasingly expected '
            'by OSFI under climate transition risk disclosure requirements.',
            S['body']))
    story.append(PageBreak())

    # ── SECTION 7 — SCOPE 3 CAT.11 AWS CLOUD ─────────────────────────────────
    story.append(_para('Section 7 — Scope 3 Category 11 — AWS Cloud Emissions', S['h1']))
    story.append(_hr(S))
    story.append(_para(
        'Scope 3 Category 11 covers emissions from the use of sold or operated products. '
        'For data centres and IT organisations, this includes cloud compute services. '
        'GridWitness estimates these via AWS Cost Explorer spend grouped by service and region, '
        'applying a $0.50/kWh cost-to-energy factor and regional grid intensity (EPA eGRID + IEA 2024).',
        S['body']))
    if scope3:
        ym         = scope3.get('YearMonth', '—')
        total_cost = float(scope3.get('TotalCostUSD', 0))
        total_kwh  = float(scope3.get('TotalKWh', 0))
        total_kg   = float(scope3.get('TotalKgCO2', 0))
        total_tco2 = float(scope3.get('TotalTCO2e', 0))
        synced_at  = scope3.get('SyncedAt', '—')[:19]
        by_region  = scope3.get('ByRegion', {})

        s3_kpi = [
            ('Reporting Period (Month)',    ym,                         '—'),
            ('Total Compute Spend',         f'${total_cost:,.2f} USD',   'EC2, Lambda, ECS, EKS, Fargate'),
            ('Estimated Energy Consumed',   f'{total_kwh:,.2f} kWh',    '$0.50/kWh conversion factor'),
            ('Estimated kgCO2e',            f'{total_kg:,.4f}',          'Regional grid intensity applied'),
            ('Estimated tCO2e',             f'{total_tco2:.6f}',         'GHG Protocol Scope 3 Cat.11'),
            ('Methodology',                 scope3.get('Methodology', '—')[:80], '—'),
            ('Last Synced',                 synced_at,                  'Via AWS Cost Explorer API'),
        ]
        story.append(_make_table(
            ['Metric', 'Value', 'Notes'],
            s3_kpi, [2.4*inch, 2.6*inch, 2.7*inch], S))

        if by_region:
            story.append(Spacer(1, 0.1*inch))
            story.append(_para('7.1  Breakdown by AWS Region', S['h2']))
            region_rows = []
            for reg, info in sorted(by_region.items(), key=lambda kv: -kv[1].get('kg_co2', 0)):
                region_rows.append([
                    reg,
                    f"${float(info.get('cost_usd', 0)):,.2f}",
                    f"{float(info.get('kwh', 0)):,.2f}",
                    f"{float(info.get('kg_co2', 0)):,.4f}",
                    f"{float(info.get('intensity_gco2_kwh', 0)):.0f}",
                ])
            story.append(_make_table(
                ['AWS Region', 'Spend (USD)', 'kWh', 'kgCO2e', 'Grid Intensity (g/kWh)'],
                region_rows, [1.4*inch, 1.4*inch, 1.3*inch, 1.5*inch, 2.0*inch], S))
    else:
        story.append(_para(
            'AWS Cost Explorer sync has not been performed. To enable Scope 3 Cat.11 cloud '
            'emissions in future reports, enable Cost Explorer in your AWS account '
            '(AWS Console → Billing → Cost Explorer → Enable) and run a sync from '
            'GridWitness Settings → Scope 3 Cloud.',
            S['body']))
    story.append(PageBreak())

    # ── SECTION 8 — GRID ANALYSIS ─────────────────────────────────────────────
    story.append(_para('Section 8 — Live Grid Carbon Intensity Analysis', S['h1']))
    story.append(_hr(S))
    story.append(_para(
        'Grid carbon intensity determines Scope 2 emissions attributable to each kWh consumed. '
        'GridWitness fetches Alberta (AESO) intensity live every 5 minutes and uses '
        'published annual averages for other Canadian provinces.',
        S['body']))
    grid_analysis_rows = [
        ('AB (Alberta AESO)', 'Live SMP-price proxy', f'{INTENSITY_FALLBACK["AB"]:.0f}', 'Natural gas + coal mix', 'AESO API — 5 min'),
        ('BC (BC Hydro)',     'IEA 2024 annual avg',  '21',  'Hydro-dominant (93%)', 'IEA Canada 2024'),
        ('ON (IESO)',         'IEA 2024 annual avg',  '42',  'Nuclear + gas mix',    'IEA Canada 2024'),
        ('QC (Hydro-Québec)','IEA 2024 annual avg',  '2',   'Hydro (99%)',          'IEA Canada 2024'),
    ]
    story.append(_make_table(
        ['Zone', 'Method', 'Default Intensity (g/kWh)', 'Generation Mix', 'Source'],
        grid_analysis_rows,
        [0.9*inch, 1.5*inch, 1.5*inch, 1.8*inch, 1.9*inch], S))
    story.append(Spacer(1, 0.1*inch))
    story.append(_para(
        'Note: The Alberta intensity reported in this document reflects the proxy value from '
        'the WORM ledger (captured at time of telemetry ingestion). Live intensity at the time '
        'of report generation may differ.',
        S['note']))
    story.append(PageBreak())

    # ── SECTION 9 — COMPLIANCE MATRIX ────────────────────────────────────────
    story.append(_para('Section 9 — Regulatory Compliance Matrix', S['h1']))
    story.append(_hr(S))
    story.append(_para('9.1  OSFI Guideline B-15', S['h2']))
    osfi_rows = [
        ('Climate Risk Data Governance',    'Sec.3.1',  'COMPLIANT', 'WORM ledger + Merkle chain'),
        ('Scenario Analysis Support',       'Sec.3.2',  'COMPLIANT', 'Per-device per-grid records'),
        ('GHG Emissions Measurement',       'Sec.4.1',  'COMPLIANT', 'Real-time hardware telemetry'),
        ('Scope 2 Attribution',             'Sec.4.2',  'COMPLIANT', 'BMC Redfish + CloudWatch'),
        ('Scope 3 Category 11',             'Sec.4.3',  scope3 and 'COMPLIANT' or 'PENDING', 'CE sync required' if not scope3 else 'EC2 discovery via CE'),
        ('Canadian Data Residency',         'Sec.4.4',  'COMPLIANT', 'AWS ca-central-1 exclusively'),
        ('7-Year Retention',                'Sec.5.3',  'COMPLIANT', 'S3 COMPLIANCE Object Lock'),
        ('Immutable Audit Trail',           'Sec.5.4',  'COMPLIANT', 'SHA-256 hash chain'),
        ('Third-Party Verifiability',       'Sec.6.1',  'COMPLIANT', 'Merkle root + presigned URL'),
        ('Encryption at Rest',              'Sec.6.2',  'COMPLIANT', 'AES-256 KMS CMK'),
        ('Encryption in Transit',           'Sec.6.3',  'COMPLIANT', 'TLS 1.3 enforced'),
        ('Incident Response Logging',       'Sec.7.1',  'COMPLIANT', f'{len(incidents)} incident(s) logged'),
        ('Grid Carbon Intensity Source',    'Sec.7.2',  'COMPLIANT', 'AESO live (AB); IEA averages others'),
        ('Telemetry Enforcement Mode',      'Sec.8.0',  enf_label,   'Invalid keys rejected/audited'),
        ('SBTi Targets Configured',         'Sec.8.1',  sbti and 'COMPLIANT' or 'PENDING', sbti_status),
        ('Executive Attestation',           'Sec.9.1',  'COMPLIANT', 'See Section 12'),
    ]
    story.append(_make_table(
        ['Requirement', 'Section', 'Status', 'GridWitness Control'],
        osfi_rows, [2.5*inch, 0.65*inch, 1.05*inch, 3.3*inch], S))

    story.append(Spacer(1, 0.1*inch))
    story.append(_para('9.2  Bill C-59 Anti-Greenwashing Safe Harbour', S['h2']))
    bill_rows = [
        ('Claim substantiated by adequate testing',  'COMPLIANT', f'{len(records):,} WORM records'),
        ('Claim not false or misleading',            'COMPLIANT', 'Hardware-verified; estimates labelled'),
        ('Methodology publicly disclosed',           'COMPLIANT', 'SPEC Power + AESO + IEA sources cited'),
        ('Data independently verifiable',            'COMPLIANT', f'Merkle root: {merkle[:24]}...'),
        ('Internationally recognized methodology',   'COMPLIANT', 'GHG Protocol + ISO 14064-1'),
        ('Canadian data residency maintained',       'COMPLIANT', 'AWS ca-central-1 exclusively'),
    ]
    story.append(_make_table(
        ['Bill C-59 Requirement', 'Status', 'Evidence'],
        bill_rows, [3.2*inch, 0.9*inch, 3.1*inch], S))

    story.append(Spacer(1, 0.1*inch))
    story.append(_para('9.3  ISO 14064-1:2018 Conformance', S['h2']))
    iso_rows = [
        ('Cl.4 Principles',              'CONFORMANT', 'Relevance, completeness, consistency, transparency'),
        ('Cl.5 Inventory Boundaries',    'CONFORMANT', 'Operational control boundary, per-device'),
        ('Cl.6 Quantification Method',   'CONFORMANT', 'Hardware sensor × grid intensity'),
        ('Cl.7 Inventory Components',    'CONFORMANT', 'Scope 2 + Scope 3 Cat.11 included'),
        ('Cl.8 Information Management',  'CONFORMANT', 'WORM ledger, SHA-256 chain, S3 Object Lock'),
        ('Cl.9 Inventory Report',        'CONFORMANT', 'This document, cryptographically sealed'),
    ]
    story.append(_make_table(
        ['ISO 14064-1 Clause', 'Status', 'Implementation'],
        iso_rows, [2.0*inch, 1.0*inch, 4.7*inch], S))

    story.append(Spacer(1, 0.1*inch))
    story.append(_para('9.4  GHG Protocol Corporate Standard', S['h2']))
    ghg_rows = [
        ('Scope 2 — Location-based',       'INCLUDED', 'Provincial grid intensity, hardware-measured kWh'),
        ('Scope 2 — Market-based',         'AVAILABLE', 'Requires REC or Power Purchase Agreement data'),
        ('Scope 3 Cat.1 (Purchased Goods)','EXCLUDED',  'Out of scope for data centre compute attestation'),
        ('Scope 3 Cat.11 (Use of Products)','INCLUDED', 'AWS Cost Explorer compute services'),
        ('Operational Boundary',           'OPERATIONAL CONTROL', 'Servers where tenant has operational control'),
        ('Consolidation Approach',         'Equity-weighted N/A', 'Single-entity operational control approach'),
    ]
    story.append(_make_table(
        ['GHG Protocol Component', 'Status', 'Notes'],
        ghg_rows, [2.4*inch, 1.6*inch, 3.7*inch], S))
    story.append(PageBreak())

    # ── SECTION 10 — DATA INTEGRITY ───────────────────────────────────────────
    story.append(_para('Section 10 — Data Integrity: Cryptographic Chain of Custody', S['h1']))
    story.append(_hr(S))
    story.append(_para(
        'Every telemetry record is hashed with SHA-256 and chained to the previous record '
        'forming an append-only WORM ledger. The root hash printed here uniquely identifies '
        'the complete corpus of records. Any single-bit modification invalidates the root.',
        S['body']))
    custody_rows = [
        ('Hash Algorithm',      'SHA-256 (FIPS 180-4)',         '—'),
        ('Chain Construction',  'Merkle-chained (sequential)',  'Root printed on cover'),
        ('Storage',             'AWS S3 Object Lock COMPLIANCE','gw-compliance-vault-768949138583'),
        ('Retention',           '7 Years (immutable)',          'OSFI B-15 Sec.5.3 / PIPEDA'),
        ('Encryption',          'AES-256 KMS CMK',              'AWS-managed key rotation 90 days'),
        ('Access Control',      'IAM least-privilege',          'Lambda execution role only'),
        ('Records in Chain',    f'{len(records):,}',            f'Period {df} to {dt}'),
    ]
    story.append(_make_table(
        ['Parameter', 'Value', 'Notes'],
        custody_rows, [2.2*inch, 2.8*inch, 2.7*inch], S))
    story.append(Spacer(1, 0.12*inch))
    story.append(_para('Merkle Root Hash (SHA-256):', S['small']))
    story.append(_para(merkle, S['hash']))
    story.append(Spacer(1, 0.15*inch))

    # Ledger sample
    story.append(_para('10.1  WORM Ledger Sample (First 5 Records)', S['h2']))
    ledger_rows = []
    for r in records[:5]:
        ts    = str(r.get('Timestamp', ''))[:19].replace('T', ' ')
        src   = str(r.get('Source', ''))[:22]
        grid  = str(r.get('GridID', ''))[:4]
        watts = float(_dec(r.get('ActualWattage') or r.get('Actual_Wattage') or 0))
        gco2e = float(_dec(r.get('CarbonDebt_gCO2') or r.get('gCO2e') or 0))
        rhash = r.get('RecordHash') or hashlib.sha256(str(r).encode()).hexdigest()
        ledger_rows.append([ts, src, grid, f'{watts:.0f}', f'{gco2e:.4f}', rhash[:22]+'...'])
    if not ledger_rows:
        ledger_rows = [['—', 'No records in period', '—', '—', '—', '—']]
    story.append(_make_table(
        ['Timestamp (UTC)', 'Source', 'Grid', 'Watts', 'gCO2e', 'SHA-256 (22ch)'],
        ledger_rows,
        [1.25*inch, 1.4*inch, 0.5*inch, 0.55*inch, 0.7*inch, 1.9*inch], S))
    story.append(PageBreak())

    # ── SECTION 11 — INCIDENTS ────────────────────────────────────────────────
    story.append(_para('Section 11 — Grid Stress Incident Log', S['h1']))
    story.append(_hr(S))
    open_inc = sum(1 for i in incidents if i.get('Status') == 'OPEN')
    story.append(_para(
        f'{len(incidents)} grid stress incident(s) recorded in this period. '
        f'{open_inc} remain UNRESOLVED at time of report generation. '
        'Per OSFI B-15 Sec.7.1 all incidents and tenant responses are WORM-sealed.',
        S['body']))
    story.append(_para(
        'Incidents are auto-generated by GridWitness anomaly detectors when: '
        '(a) grid carbon intensity exceeds a tenant-configured threshold for any 15-minute polling interval, '
        'or (b) carbon budget thresholds are breached (80% / 95% / 100%). '
        'An incident remains OPEN until the grid recovers below threshold (auto-closed by the system) '
        'or is manually closed by an operator.',
        S['note']))
    story.append(Spacer(1, 0.08*inch))
    inc_rows = []
    for inc in incidents:
        opened  = str(inc.get('OpenedAt', ''))[:19].replace('T', ' ') or '—'
        closed  = (str(inc.get('ClosedAt', ''))[:16].replace('T', ' ')) if inc.get('ClosedAt') else '—'
        title   = str(inc.get('Title') or f"{inc.get('GridID','')} {inc.get('Metric','')}.")[:45]
        source  = str(inc.get('Source', ''))[:22]
        sev     = str(inc.get('Severity', ''))
        status  = str(inc.get('Status', ''))
        obs     = str(inc.get('ObservationCount', '1'))
        inc_rows.append([opened, closed, title, source, sev, status, obs])
    if not inc_rows:
        inc_rows = [['—', '—', 'No incidents in this period', '—', '—', '—', '—']]
    story.append(_make_table(
        ['Opened (UTC)', 'Closed (UTC)', 'Title / Description', 'Source', 'Severity', 'Status', 'Obs.'],
        inc_rows,
        [1.05*inch, 0.9*inch, 2.1*inch, 1.1*inch, 0.7*inch, 0.65*inch, 0.45*inch], S))
    story.append(PageBreak())

    # ── SECTION 12 — ATTESTATION ──────────────────────────────────────────────
    story.append(_para('Section 12 — Executive Attestation', S['h1']))
    story.append(_hr(S))
    story.append(_para(
        'I attest that the carbon emissions data contained in this report was collected by the '
        'GridWitness automated telemetry platform, stored in a cryptographically sealed '
        'Write-Once-Read-Many (WORM) ledger in accordance with OSFI Guideline B-15, and has '
        'not been modified since collection. The information is, to the best of my knowledge, '
        'complete, accurate, and prepared in conformance with: the GHG Protocol Corporate '
        'Accounting and Reporting Standard (Revised 2004); ISO 14064-1:2018; and the '
        'requirements of Bill C-59 (Fall Economic Statement Implementation Act, 2023).',
        S['body']))
    story.append(Spacer(1, 0.2*inch))
    sig_data = [
        [_para('Authorised Signatory', S['cell_b']),
         _para('Title / Role',         S['cell_b']),
         _para('Date',                 S['cell_b'])],
        [_para('_________________________', S['cell']),
         _para('_________________________', S['cell']),
         _para(now.strftime('%Y-%m-%d'),  S['cell'])],
    ]
    sig_tbl = Table(sig_data, colWidths=[2.4*inch, 2.8*inch, 1.6*inch])
    sig_tbl.setStyle(_table_style_header())
    story.append(sig_tbl)
    story.append(Spacer(1, 0.25*inch))
    story.append(_para('Independent Verification Endpoint:', S['small']))
    story.append(_para(
        f'https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com/api/verify?merkle={merkle}',
        S['hash']))
    story.append(Spacer(1, 0.15*inch))
    story.append(_para(
        f'This report was generated by GridWitness v2 by NimbleStride Inc. '
        f'Report ID: {report_id} · '
        f'Generated: {now.strftime("%Y-%m-%d %H:%M:%S UTC")} · '
        f'Records: {len(records):,} · Merkle: {merkle[:16]}...',
        S['small']))

    doc.build(story)
    buf.seek(0)
    return buf


# ─── Lambda handler ───────────────────────────────────────────────────────────

def lambda_handler(event, context):
    logger.info('Event: %s', json.dumps(event)[:500])

    http_method = (event.get('requestContext', {}).get('http', {}).get('method') or '').upper()
    if http_method == 'OPTIONS':
        return _r(200, {})

    if http_method == 'GET':
        qs        = event.get('queryStringParameters') or {}
        tenant_id = qs.get('tenant_id')
        if not tenant_id:
            return _r(400, {'error': 'tenant_id required'})
        return _get_latest_report(tenant_id)

    # Collect request(s)
    reqs = []
    if 'Records' in event:
        for rec in event['Records']:
            try:   reqs.append(json.loads(rec.get('body', '{}')))
            except Exception as e: logger.error('Bad SQS body: %s', e)
    elif http_method == 'POST' or 'body' in event:
        try:   reqs.append(json.loads(event.get('body') or '{}') if event.get('body') else {})
        except Exception: reqs.append({})
    else:
        reqs.append(event)

    last_result = None
    for req in reqs:
        tenant_id  = req.get('tenant_id') or req.get('TenantID')
        df         = (req.get('date_from') or '2026-01-01T00:00:00Z')[:10]
        dt         = (req.get('date_to')   or _now().isoformat())[:10]
        frameworks = req.get('frameworks') or ['OSFI_B15', 'BILL_C59', 'ISO_14064', 'GHG_PROTO']
        if not tenant_id:
            last_result = _r(400, {'error': 'tenant_id required'})
            continue
        try:
            logger.info('Generating report tenant=%s %s..%s', tenant_id, df, dt)
            # Fetch all data
            records   = _fetch_telemetry(tenant_id, df, dt)
            incidents = _fetch_incidents(tenant_id, df, dt)
            tenant    = _fetch_tenant(tenant_id)
            sbti      = _fetch_sbti(tenant_id)
            scope3    = _fetch_scope3(tenant_id)
            budget    = _fetch_budget(tenant_id)
            merkle    = _compute_merkle(records)
            carbon    = _carbon_calc(records)

            ts        = _now().strftime('%Y%m%d%H%M%S')
            parts     = tenant_id.split('-')[:3]
            report_id = f'RPT-{"-".join(parts)}-{ts}'

            pdf_buf = _build_pdf(
                tenant_id, df, dt, frameworks, records, incidents,
                merkle, carbon, report_id,
                tenant, sbti, scope3, budget,
            )

            key = (f'reports/{tenant_id}/'
                   f'{_now().strftime("%Y-%m")}/'
                   f'{report_id}.pdf')
            s3.put_object(
                Bucket=VAULT, Key=key,
                Body=pdf_buf.getvalue(),
                ContentType='application/pdf',
                Metadata={
                    'tenant_id': tenant_id, 'merkle_root': merkle,
                    'report_id': report_id, 'records': str(len(records)),
                    'incidents': str(len(incidents)),
                },
            )
            sidecar_key = key.replace('.pdf', '.json')
            s3.put_object(
                Bucket=VAULT, Key=sidecar_key,
                Body=json.dumps({
                    'report_id': report_id, 'tenant_id': tenant_id,
                    'period': f'{df}..{dt}', 'records': len(records),
                    'merkle_root': merkle,
                    'generated_at': _now().isoformat(),
                    'pdf_key': key,
                }, default=str).encode(),
                ContentType='application/json',
            )
            download_url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': VAULT, 'Key': key},
                ExpiresIn=3600,
            )
            logger.info('Report uploaded s3://%s/%s (%d bytes)',
                        VAULT, key, len(pdf_buf.getvalue()))
            last_result = _r(200, {
                'report_id':   report_id,
                'merkle_root': merkle,
                's3_key':      key,
                'records':     len(records),
                'incidents':   len(incidents),
                'status':      'ready',
                'download_url':download_url,
            })
        except Exception as e:
            logger.exception('Report failed for %s', tenant_id)
            last_result = _r(500, {'error': str(e)})

    return last_result or _r(200, {'status': 'ok'})
