"""
gw-ms-ifrs-s2-report-staging
Generates an IFRS S2 (ISSB) Climate-related Disclosures PDF report.

Route: POST /api/tenants/{tenantId}/ifrs-s2/report
Returns: { report_id, s3_key, download_url, generated_at }

PDF Structure follows IFRS S2 (June 2023) paragraph order:
  Cover Page
  Paragraph Cross-Reference Index
  1. Governance (S2.6 – S2.9)
  2. Strategy (S2.10 – S2.22)
     2a. Risks & Opportunities
     2b. Transition Plan
     2c. Scenario Analysis
     2d. Climate Resilience
  3. Risk Management (S2.23 – S2.25)
  4. Metrics & Targets (S2.26 – S2.44)
     4a. Cross-Industry Metric Categories (A–G)
     4b. Industry-Based Metrics (SASB TC-SI)
     4c. GHG Emissions (Scope 1/2/3)
     4d. Internal Carbon Price
     4e. Remuneration & Capital Deployment
     4f. Climate-Related Targets & SBTi
  Appendix A: Scope 3 Category Materiality
  Appendix B: GHG Methodology & Data Sources
  Attestation
"""
import json, os, io, logging
from datetime import datetime, timezone, date
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION  = os.environ.get('AWS_REGION',   'ca-central-1')
BUCKET  = os.environ.get('S3_BUCKET',    'gw-compliance-vault-768949138583')

ddb = boto3.resource('dynamodb', region_name=REGION)
s3  = boto3.client('s3', region_name=REGION)

TENANTS_T  = ddb.Table(os.environ.get('TENANTS_TABLE',   'gw-tenants-staging'))
TCFD_T     = ddb.Table(os.environ.get('TCFD_TABLE',      'gw-tcfd-staging'))
IFRS_S2_T  = ddb.Table(os.environ.get('IFRS_S2_TABLE',   'gw-ifrs-s2-staging'))
SCOPE1_T   = ddb.Table(os.environ.get('SCOPE1_TABLE',    'gw-scope1-staging'))
SCOPE3_T   = ddb.Table(os.environ.get('SCOPE3_TABLE',    'gw-scope3-staging'))
SBTI_T     = ddb.Table(os.environ.get('SBTI_TABLE',      'gw-sbti-staging'))
BUDGET_T   = ddb.Table(os.environ.get('BUDGET_TABLE',    'gw-carbon-budget-staging'))
TELEM_T    = ddb.Table(os.environ.get('TELEMETRY_TABLE', 'gw-telemetry-staging'))
RECS_T     = ddb.Table(os.environ.get('RECS_TABLE',      'gw-recs-staging'))
OFFSETS_T  = ddb.Table(os.environ.get('OFFSETS_TABLE',   'gw-offsets-staging'))

CERTIFIED_BODIES = {'EcoLogo','Green-e','I-REC','TIGR','RE100','IREC'}

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
}

CARBON_PRICE = {2023:65,2024:80,2025:95,2026:110,2027:125,2028:140,2029:155,2030:170}

# ── Colours ───────────────────────────────────────────────────────────────────
GW_DARK   = colors.HexColor('#0a0f1a')
GW_PANEL  = colors.HexColor('#111827')
GW_BORDER = colors.HexColor('#1f2937')
GW_WHITE  = colors.white
GW_MUTED  = colors.HexColor('#6b7280')

# IFRS S2 uses ISSB blue palette (distinct from TCFD green)
ISSB_BLUE  = colors.HexColor('#1d4ed8')
ISSB_LIGHT = colors.HexColor('#3b82f6')
ISSB_BG    = colors.HexColor('#0c1b3a')
ISSB_PANEL = colors.HexColor('#0f2044')

STATUS_COLOR = {
    'COMPLETE':    colors.HexColor('#22c55e'),
    'PARTIAL':     colors.HexColor('#f59e0b'),
    'NOT_STARTED': colors.HexColor('#4b5563'),
}

# ── Fonts ─────────────────────────────────────────────────────────────────────
def _register_fonts():
    for base in ['/var/task/fonts', '/tmp/fonts',
                 '/usr/share/fonts/truetype/dejavu']:
        if os.path.exists(os.path.join(base, 'DejaVuSans.ttf')):
            try:
                pdfmetrics.registerFont(TTFont('DV',     os.path.join(base, 'DejaVuSans.ttf')))
                pdfmetrics.registerFont(TTFont('DV-B',   os.path.join(base, 'DejaVuSans-Bold.ttf')))
                pdfmetrics.registerFont(TTFont('DV-M',   os.path.join(base, 'DejaVuSansMono.ttf')))
                return 'DV', 'DV-B', 'DV-M'
            except Exception:
                pass
    return 'Helvetica', 'Helvetica-Bold', 'Courier'

F, FB, FM = _register_fonts()

# ── Styles ────────────────────────────────────────────────────────────────────
def _S(name, **kw):
    return ParagraphStyle(name, fontName=kw.pop('fn', F),
                          textColor=kw.pop('tc', GW_WHITE), **kw)

ST = {
    'cover_title': _S('ct', fn=FB, fontSize=30, tc=ISSB_LIGHT, leading=34, spaceAfter=6),
    'cover_sub':   _S('cs', fn=FB, fontSize=13, tc=GW_WHITE,   spaceAfter=4),
    'cover_meta':  _S('cm', fontSize=9,  tc=GW_MUTED,  spaceAfter=3),
    'issb_tag':    _S('it', fn=FB, fontSize=8,  tc=ISSB_LIGHT),
    'h1':    _S('h1', fn=FB, fontSize=14, tc=ISSB_LIGHT, spaceBefore=8, spaceAfter=4),
    'h2':    _S('h2', fn=FB, fontSize=11, tc=ISSB_LIGHT, spaceBefore=6, spaceAfter=3),
    'h3':    _S('h3', fn=FB, fontSize=9,  tc=GW_WHITE,   spaceBefore=4, spaceAfter=2),
    'para_ref': _S('pr', fn=FM, fontSize=7, tc=ISSB_LIGHT),
    'body':  _S('b',  fontSize=8.5, tc=GW_WHITE,  leading=13, spaceAfter=5),
    'label': _S('lb', fn=FB, fontSize=7,  tc=GW_MUTED),
    'cap':   _S('cp', fontSize=7,  tc=GW_MUTED,  leading=10),
    'mono':  _S('mo', fn=FM, fontSize=8,  tc=ISSB_LIGHT),
    'kpi_v': _S('kv', fn=FB, fontSize=16, tc=ISSB_LIGHT),
    'kpi_l': _S('kl', fontSize=7,  tc=GW_MUTED),
    'tbl_h': _S('th', fn=FB, fontSize=7.5, tc=ISSB_LIGHT),
    'tbl_c': _S('tc', fontSize=8,   tc=GW_WHITE, leading=11),
    'attest':_S('at', fontSize=8,   tc=GW_MUTED, leading=12),
    'cimc_label': _S('cl', fn=FB, fontSize=8, tc=GW_WHITE),
    'cimc_val':   _S('cv', fn=FB, fontSize=13, tc=ISSB_LIGHT),
}

def _TS(extra=None):
    base = [
        ('BACKGROUND',   (0,0), (-1,0),  ISSB_PANEL),
        ('TEXTCOLOR',    (0,0), (-1,0),  ISSB_LIGHT),
        ('FONTNAME',     (0,0), (-1,0),  FB),
        ('FONTSIZE',     (0,0), (-1,-1), 8),
        ('BACKGROUND',   (0,1), (-1,-1), GW_DARK),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [GW_DARK, GW_PANEL]),
        ('TEXTCOLOR',    (0,1), (-1,-1), GW_WHITE),
        ('GRID',         (0,0), (-1,-1), 0.3, GW_BORDER),
        ('TOPPADDING',   (0,0), (-1,-1), 4),
        ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ('LEFTPADDING',  (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]
    return TableStyle(base + (extra or []))

# ── Page decorators ───────────────────────────────────────────────────────────
def _cover_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ISSB_BG)
    canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    canvas.setFillColor(ISSB_PANEL)
    canvas.rect(0, letter[1]-2*inch, letter[0], 2*inch, fill=1, stroke=0)
    canvas.setFillColor(ISSB_BLUE)
    canvas.rect(0, letter[1]-2.04*inch, letter[0], 0.04*inch, fill=1, stroke=0)
    canvas.restoreState()

def _page_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(GW_DARK)
    canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    canvas.setFillColor(GW_MUTED)
    canvas.setFont(F, 7)
    canvas.drawString(0.5*inch, 0.35*inch,
        'IFRS S2 Climate-related Disclosures  |  GridWitness  |  CONFIDENTIAL')
    canvas.drawRightString(8*inch, 0.35*inch, f'Page {doc.page}')
    # ISSB stripe on left margin
    canvas.setFillColor(ISSB_BLUE)
    canvas.rect(0, 0, 0.06*inch, letter[1], fill=1, stroke=0)
    canvas.restoreState()

def _on_page(canvas, doc):
    if doc.page == 1:
        _cover_bg(canvas, doc)
    else:
        _page_bg(canvas, doc)

# ── Data fetchers ─────────────────────────────────────────────────────────────
def _get_tenant(tid):
    try: return TENANTS_T.get_item(Key={'TenantID': tid}).get('Item') or {}
    except: return {}

def _get_tcfd(tid):
    try:
        r = TCFD_T.query(KeyConditionExpression=Key('TenantID').eq(tid))
        return {i['Section']: i for i in r.get('Items', [])}
    except: return {}

def _get_s2(tid):
    try:
        r = IFRS_S2_T.query(KeyConditionExpression=Key('TenantID').eq(tid))
        return {i['Section']: i for i in r.get('Items', [])}
    except: return {}

def _get_sbti(tid):
    try: return SBTI_T.get_item(Key={'TenantID': tid}).get('Item') or {}
    except: return {}

def _get_budget(tid, year):
    try: return BUDGET_T.get_item(Key={'TenantID': tid, 'BudgetYear': str(year)}).get('Item') or {}
    except: return {}

def _scope1_tco2(tid, year):
    try:
        r = SCOPE1_T.query(KeyConditionExpression=Key('TenantID').eq(tid),
                           FilterExpression=Attr('Year').eq(str(year)))
        return sum(float(i.get('kgCO2e',0)) for i in r.get('Items',[])) / 1000
    except: return 0.0

def _scope2_tco2(tid, year):
    try:
        r = TELEM_T.scan(FilterExpression=Attr('TenantID').eq(tid) & Attr('Source').ne('CLOUD_DISCOVERY'))
        return sum(float(i.get('CO2e_g',0)) for i in r.get('Items',[])
                   if str(i.get('Timestamp',''))[:4] == str(year)) / 1_000_000
    except: return 0.0

def _scope3_items(tid, year):
    try:
        r = SCOPE3_T.query(KeyConditionExpression=Key('TenantID').eq(tid),
                           FilterExpression=Attr('YearMonth').begins_with(str(year)))
        return r.get('Items', [])
    except: return []

def _grid_cache():
    try:
        G = ddb.Table('gw-grid-cache-staging')
        return {z: float(G.get_item(Key={'ZoneID':z}).get('Item',{}).get('CarbonIntensity',0))
                for z in ['AB','BC','ON','QC']}
    except: return {'AB':0,'BC':21,'ON':42,'QC':2}

# ── Defaults ──────────────────────────────────────────────────────────────────
DEFAULT_TCFD = {
    'GOVERNANCE': {'GovernanceStatement':'','BoardCommittee':False,'BoardCommitteeName':'',
                   'ExecutiveCompensation':False,'CSO':False,'CSOName':'',
                   'AuditCommitteeScope':False,'MeetingsPerYear':4},
    'STRATEGY':   {'TimeHorizons':{'short':'','medium':'','long':''},
                   'ScenarioAnalysis':{'risks':{},'scenarios':[]},
                   'StrategyStatement':''},
    'RISK_MGMT':  {'IdentificationProcess':'','AssessmentProcess':'','ManagementProcess':'',
                   'MonitoringFrequency':'','IntegrationStatement':'','RiskAppetiteStatement':''},
    'METRICS_CONFIG': {'BaselineYear':2019,'TargetYear':2030,
                       'TemperatureAlignment':'1.5C','AdditionalTargets':[]},
}
DEFAULT_S2 = {
    'IFRS_CONFIG': {'TransitionPlanAdopted':False,'InternalCarbonPrice':None,
                    'RemunerationLinked':False,'RemunerationPct':0,
                    'ClimateOpportunityRevenuePct':0,
                    'ClimateResilienceNarrative':'',
                    'Scope2Method':'MARKET_BASED','Scope3Materiality':{}},
    'CAPITAL_DEPLOYMENT': {'TotalCapExCAD':0,'CapExClimateAlignedCAD':0,
                            'TotalOpExCAD':0,'OpExClimateAlignedCAD':0,'CapExNarrative':''},
    'SASB_METRICS': {'SASBSector':'TC-SI','SASBSectorLabel':'Software & IT Services',
                     'TC_SI_130a1_EnergyConsumed_GJ':0,'TC_SI_130a1_PctRenewable':0,
                     'TC_SI_130a2_Scope1_tCO2e':0,'DataCenterPUE':0},
}

def _sec(d, k): return {**DEFAULT_TCFD.get(k, DEFAULT_S2.get(k, {})), **d.get(k, {})}

# ── PDF builder ───────────────────────────────────────────────────────────────
def _fetch_market_scope2(tid: str, year: int, s2_location_t: float) -> dict:
    """Market-based Scope 2 = location minus retired REC MWh × Alberta grid factor."""
    try:
        r = RECS_T.query(
            KeyConditionExpression=Key('TenantID').eq(tid),
            FilterExpression=Attr('Status').eq('RETIRED') & Attr('RetiredFor').eq(year)
                             & Attr('Deleted').ne(True)
        )
        items = r.get('Items', [])
        mwh   = sum(float(i.get('MWh', 0)) for i in items)
        c59   = len(items) > 0 and all(i.get('CertifiedBy') in CERTIFIED_BODIES for i in items)
        market_t = max(0.0, s2_location_t - mwh * 0.5)
        return {'market_t': market_t, 'mwh': mwh, 'count': len(items), 'bill_c59': c59}
    except Exception as e:
        logger.warning('recs fetch: %s', e)
        return {'market_t': s2_location_t, 'mwh': 0.0, 'count': 0, 'bill_c59': False}


def _fetch_offsets_net(tid: str, year: int, gross_market_t: float) -> dict:
    """Net position = gross market-based minus retired verified offsets."""
    try:
        r = OFFSETS_T.query(
            KeyConditionExpression=Key('TenantID').eq(tid),
            FilterExpression=Attr('Status').eq('RETIRED') & Attr('RetiredFor').eq(year)
                             & Attr('Deleted').ne(True)
        )
        items    = r.get('Items', [])
        off_t    = sum(float(i.get('QuantityTco2', 0)) for i in items)
        net_t    = max(0.0, gross_market_t - off_t)
        return {'offsets_t': off_t, 'net_t': net_t, 'count': len(items), 'net_zero': net_t < 0.01}
    except Exception as e:
        logger.warning('offsets fetch: %s', e)
        return {'offsets_t': 0.0, 'net_t': gross_market_t, 'count': 0, 'net_zero': False}


def _build(tid, tenant, tcfd, s2, s1, s2_em, s3_items, sbti, budget, grid, recs_dat=None, off_dat=None):
    now     = datetime.now(timezone.utc)
    year    = date.today().year
    org     = tenant.get('OrgName', tid)
    rpt_id  = f'IFRS-S2-{tid[:12]}-{now.strftime("%Y%m%d%H%M%S")}'

    gov  = _sec(tcfd, 'GOVERNANCE')
    strat= _sec(tcfd, 'STRATEGY')
    risk = _sec(tcfd, 'RISK_MGMT')
    met  = _sec(tcfd, 'METRICS_CONFIG')
    cfg  = _sec(s2,   'IFRS_CONFIG')
    cap  = _sec(s2,   'CAPITAL_DEPLOYMENT')
    sasb = _sec(s2,   'SASB_METRICS')

    s3_tco2  = sum(float(i.get('TotalKgCO2',0)) for i in s3_items) / 1000
    recs_dat = recs_dat or {}
    off_dat  = off_dat  or {}
    s2_mkt   = float(recs_dat.get('market_t', s2_em))
    recs_mwh = float(recs_dat.get('mwh', 0))
    bill_c59 = bool(recs_dat.get('bill_c59', False))
    off_t    = float(off_dat.get('offsets_t', 0))
    net_zero = bool(off_dat.get('net_zero', False))
    total    = s1 + s2_em + s3_tco2          # location-based gross
    gross_m  = s1 + s2_mkt + s3_tco2         # market-based gross
    net_t    = float(off_dat.get('net_t', gross_m))
    price    = CARBON_PRICE.get(year, 110)
    tax_exp  = total * price

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
        topMargin=0.65*inch, bottomMargin=0.6*inch,
        leftMargin=0.7*inch, rightMargin=0.6*inch,
        title=f'IFRS S2 Climate Disclosure — {org}',
        author='GridWitness Platform')

    story = []

    # ── Cover ─────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1.5*inch))
    story.append(Paragraph('ISSB / IFRS Foundation', ST['issb_tag']))
    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph('IFRS S2 Climate-related<br/>Disclosures Report', ST['cover_title']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(org, ST['cover_sub']))
    story.append(Spacer(1, 0.25*inch))
    for k, v in [
        ('Report ID',     rpt_id),
        ('Reporting Year',str(year)),
        ('Generated',     now.strftime('%B %d, %Y  %H:%M UTC')),
        ('Standard',      'IFRS S2 Climate-related Disclosures (ISSB, June 2023)'),
        ('Jurisdiction',  'Canada — aligned to OSFI Guideline B-15'),
        ('SASB Sector',   sasb.get('SASBSectorLabel','Software & IT Services')),
        ('Temperature',   f'{met.get("TemperatureAlignment","1.5C")} pathway'),
        ('Verification',  cfg.get('VerificationLevel','Management assertion')),
    ]:
        story.append(Paragraph(f'<b>{k}:</b>  {v}', ST['cover_meta']))
    story.append(Spacer(1, 0.3*inch))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        'Prepared in accordance with IFRS S2 Climate-related Disclosures (effective January 2024). '
        'Satisfies OSFI Guideline B-15 TCFD-aligned disclosure requirements for federally regulated '
        'financial institutions operating in Canada. Cross-reference index on next page.',
        ST['cap']))
    story.append(PageBreak())

    # ── Paragraph cross-reference index ──────────────────────────────────────
    story.append(Paragraph('Paragraph Cross-Reference Index', ST['h1']))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        'This index maps each IFRS S2 disclosure requirement to the relevant section of this report.',
        ST['cap']))
    story.append(Spacer(1, 0.08*inch))

    idx_data = [['Para', 'Requirement', 'Report Section', 'Status']]
    para_groups = [
        ('S2.6–S2.9',  'Governance',       '§1 Governance'),
        ('S2.10–S2.14','Risks & Opportunities','§2a Strategy'),
        ('S2.15–S2.16','Transition Plan',   '§2b Strategy'),
        ('S2.17–S2.19','Scenario Analysis', '§2c Strategy'),
        ('S2.20–S2.22','Climate Resilience','§2d Strategy'),
        ('S2.23–S2.25','Risk Management',   '§3 Risk Management'),
        ('S2.29–S2.32','GHG Emissions',     '§4c Metrics'),
        ('S2.34',       'Internal Carbon Price','§4d Metrics'),
        ('S2.35–S2.36','Remuneration & CapEx','§4e Metrics'),
        ('S2.37',       'Opportunities',    '§4e Metrics'),
        ('S2.38',       'SASB Metrics',     '§4b Metrics'),
        ('S2.39–S2.44','Targets & Progress','§4f Metrics'),
    ]
    for para_id, req, section in para_groups:
        idx_data.append([para_id, req, section, '✓'])
    story.append(Table(idx_data,
        colWidths=[1*inch, 2.2*inch, 2*inch, 2*inch],
        style=_TS()))
    story.append(PageBreak())

    # ── §1 Governance ─────────────────────────────────────────────────────────
    story.append(Paragraph('§1  Governance  [IFRS S2 paras 6–9]', ST['h1']))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.1*inch))

    def yn(v): return 'Yes' if v else 'No'

    story.append(Paragraph('S2.6–S2.9  Board and Management Oversight', ST['h2']))
    gov_data = [
        ['Element', 'Disclosure', 'Para'],
        ['Board Climate Committee',           yn(gov.get('BoardCommittee')),  'S2.7'],
        ['Committee Name',                    gov.get('BoardCommitteeName','—'), 'S2.7'],
        ['Board Meetings on Climate per Year',str(gov.get('MeetingsPerYear',4)), 'S2.7'],
        ['Climate in Executive Compensation', yn(gov.get('ExecutiveCompensation')), 'S2.9'],
        ['Chief Sustainability Officer',      yn(gov.get('CSO')),             'S2.8'],
        ['CSO Name / Title',                  gov.get('CSOName','—'),         'S2.8'],
        ['Audit Committee Climate Scope',     yn(gov.get('AuditCommitteeScope')), 'S2.9'],
        ['Board Climate Risk Policy',         yn(gov.get('ClimateRiskPolicy')), 'S2.9'],
    ]
    story.append(Table(gov_data, colWidths=[3*inch, 3*inch, 1.2*inch], style=_TS()))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph('S2.6  Governance Narrative', ST['h3']))
    story.append(Paragraph(gov.get('GovernanceStatement','Not yet configured.'), ST['body']))
    story.append(PageBreak())

    # ── §2 Strategy ───────────────────────────────────────────────────────────
    story.append(Paragraph('§2  Strategy  [IFRS S2 paras 10–22]', ST['h1']))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.1*inch))

    # 2a — Risks & Opportunities
    story.append(Paragraph('§2a  Climate-Related Risks and Opportunities  [S2.10–S2.14]', ST['h2']))
    sa    = strat.get('ScenarioAnalysis', {})
    risks = sa.get('risks', {})
    if risks:
        ro_data = [['Risk / Opportunity', 'Category', 'Type', '1.5°C', '2°C', '4°C']]
        for rk, rv in risks.items():
            ro_data.append([
                rv.get('label', rk),
                rv.get('category','Transition'),
                'Transition' if rv.get('category','Transition') == 'Transition' else 'Physical',
                rv.get('1.5C_NZE','—'), rv.get('2C_SPS','—'), rv.get('4C_BAU','—'),
            ])
        story.append(Table(ro_data,
            colWidths=[2.4*inch, 0.9*inch, 0.9*inch, 1*inch, 1*inch, 1*inch],
            style=_TS()))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph('S2.13  Impact on Business Model and Value Chain', ST['h3']))
    story.append(Paragraph(strat.get('StrategyStatement','Not yet configured.'), ST['body']))
    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph('S2.14  Anticipated Financial Effects', ST['h3']))
    story.append(Paragraph(
        f'Based on {year} YTD emissions of {total:,.1f} tCO₂e and the federal carbon price of '
        f'${price}/tCO₂e, the estimated annual carbon tax exposure is ${tax_exp:,.0f} CAD. '
        f'Under the statutory price schedule, exposure rises to ${total * CARBON_PRICE.get(2030,170):,.0f} CAD '
        f'by 2030 (flat emissions scenario).',
        ST['body']))

    # 2b — Transition Plan
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph('§2b  Transition Plan  [S2.15–S2.16]', ST['h2']))
    if cfg.get('TransitionPlanAdopted'):
        story.append(Paragraph(
            f'Transition plan adopted in {cfg.get("TransitionPlanYear","—")}. '
            f'{cfg.get("TransitionPlanNarrative","")}', ST['body']))
        if met.get('AdditionalTargets'):
            for t in met['AdditionalTargets']:
                story.append(Paragraph(f'• {t.get("name","")}: {t.get("target","")} — {t.get("status","")}', ST['body']))
    else:
        story.append(Paragraph(
            'A formal transition plan has not yet been adopted. The organisation is working '
            'toward SBTi validation and intends to publish a transition plan aligned to IFRS S2 '
            'para. 15 by the end of the next reporting period.',
            ST['body']))

    # 2c — Scenario Analysis
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph('§2c  Scenario Analysis  [S2.17–S2.19]', ST['h2']))
    scens = sa.get('scenarios', [])
    if scens:
        sc_data = [['Scenario', 'Description', 'Aligned To']]
        sc_meta = {
            '1.5C_NZE': ('1.5°C NZE 2050', 'Net zero by 2050; rapid policy tightening; carbon price to $170+/tCO₂e', 'IEA NZE 2050, IPCC AR6 SSP1-1.9'),
            '2C_SPS':   ('2°C Stated Policies', 'Current pledges fulfilled; moderate transition; partial decarbonisation', 'IEA SPS, IPCC AR6 SSP1-2.6'),
            '4C_BAU':   ('4°C Business as Usual', 'No new policy; high physical risk by 2050; stranded asset risk', 'IPCC AR6 SSP5-8.5'),
        }
        for s in scens:
            sid = s.get('id', '')
            m   = sc_meta.get(sid, (s.get('label',''), '', ''))
            sc_data.append([m[0], m[1], m[2]])
        story.append(Table(sc_data, colWidths=[1.5*inch, 3.4*inch, 2.3*inch], style=_TS()))
    story.append(Spacer(1, 0.06*inch))
    story.append(Paragraph(
        'S2.19  Analytical scope: 10-year strategic planning horizon. Key inputs: provincial grid '
        'carbon intensity (AESO/ECCC), federal carbon price schedule (GGPPA), SBTi reduction '
        'trajectory, and GridWitness live telemetry data.',
        ST['cap']))

    # 2d — Climate Resilience
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph('§2d  Climate Resilience  [S2.20–S2.22]', ST['h2']))
    story.append(Paragraph(
        cfg.get('ClimateResilienceNarrative') or
        'Climate resilience assessment conducted annually. The organisation is assessed as '
        'resilient under a 1.5°C and 2°C scenario within the strategic planning horizon. '
        'Significant adaptation measures would be required under a 4°C scenario.',
        ST['body']))
    story.append(PageBreak())

    # ── §3 Risk Management ────────────────────────────────────────────────────
    story.append(Paragraph('§3  Risk Management  [IFRS S2 paras 23–25]', ST['h1']))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.1*inch))
    for pid, label, field in [
        ('S2.23','Risk Identification & Assessment','IdentificationProcess'),
        ('S2.24','Risk Management Process','ManagementProcess'),
        ('S2.25','Integration with Enterprise Risk Management','IntegrationStatement'),
    ]:
        story.append(Paragraph(f'{pid}  {label}', ST['h2']))
        story.append(Paragraph(risk.get(field,'Not yet configured.'), ST['body']))
    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph('Monitoring Frequency', ST['h3']))
    story.append(Paragraph(risk.get('MonitoringFrequency','15-minute automated grid checks.'), ST['body']))
    story.append(PageBreak())

    # ── §4 Metrics & Targets ──────────────────────────────────────────────────
    story.append(Paragraph('§4  Metrics and Targets  [IFRS S2 paras 26–44]', ST['h1']))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.1*inch))

    # 4a — Cross-Industry Metric Categories
    story.append(Paragraph('§4a  Cross-Industry Metric Categories (CIMC)  [S2.27–S2.37]', ST['h2']))
    story.append(Paragraph(
        'IFRS S2 requires seven cross-industry metric categories. The following table summarises '
        'each category and this organisation\'s current disclosure status.',
        ST['cap']))
    story.append(Spacer(1, 0.06*inch))

    cap_aligned_pct = (
        round(float(cap.get('CapExClimateAlignedCAD',0)) / float(cap.get('TotalCapExCAD',1)) * 100, 1)
        if float(cap.get('TotalCapExCAD',0)) > 0 else 0
    )
    cimc_data = [
        ['Cat', 'CIMC Metric',              'This Report', 'Para'],
        ['A',   'GHG Emissions (Abs + Int)',f'{total:,.1f} tCO₂e total', 'S2.29–32'],
        ['B',   'Transition Risk Exposure',  '7 risk factors assessed',  'S2.27'],
        ['C',   'Physical Risk Exposure',    '2 physical risks assessed', 'S2.27'],
        ['D',   'Climate Opportunities',
         f'{cfg.get("ClimateOpportunityRevenuePct",0)}% revenue',        'S2.37'],
        ['E',   'Capital Deployment',
         f'{cap_aligned_pct}% CapEx climate-aligned' if float(cap.get('TotalCapExCAD',0)) > 0 else 'Not yet disclosed', 'S2.36'],
        ['F',   'Internal Carbon Price',
         f'${cfg.get("InternalCarbonPrice","—")}/tCO₂e' if cfg.get('InternalCarbonPrice') else 'Not applicable', 'S2.34'],
        ['G',   'Remuneration Linkage',
         f'{cfg.get("RemunerationPct",0)}% of comp linked' if cfg.get('RemunerationLinked') else 'Not yet implemented', 'S2.35'],
    ]
    story.append(Table(cimc_data, colWidths=[0.4*inch,2.4*inch,3*inch,0.8*inch], style=_TS()))
    story.append(Spacer(1, 0.1*inch))

    # 4b — SASB
    story.append(Paragraph(f'§4b  Industry-Based Metrics (SASB {sasb.get("SASBSector","TC-SI")})  [S2.38]', ST['h2']))
    story.append(Paragraph(
        f'Sector: {sasb.get("SASBSectorLabel","Software & IT Services")}. '
        'Metrics per SASB Sustainability Accounting Standard for Software & IT Services (TC-SI).',
        ST['cap']))
    story.append(Spacer(1, 0.06*inch))
    sasb_data = [
        ['SASB Code', 'Metric', 'Value', 'Unit'],
        ['TC-SI-130a.1', 'Total energy consumed',
         f'{sasb.get("TC_SI_130a1_EnergyConsumed_GJ",0):,.0f}', 'GJ'],
        ['TC-SI-130a.1', '% renewable energy',
         f'{sasb.get("TC_SI_130a1_PctRenewable",0):.0f}', '%'],
        ['TC-SI-130a.1', '% grid electricity',
         f'{sasb.get("TC_SI_130a1_PctGridElectricity",100):.0f}', '%'],
        ['TC-SI-130a.2', 'Scope 1 GHG emissions',
         f'{s1:,.1f}', 'tCO₂e'],
        ['TC-SI-130a.2', '% under emissions regulations',
         f'{sasb.get("TC_SI_130a2_PctUnderRegulations",100):.0f}', '%'],
        ['TC-SI-230a.2', '% revenue — low-carbon products',
         f'{sasb.get("TC_SI_230a2_LowCarbonRevenuePct",0):.0f}', '%'],
        ['TC-SI-Data',   'Data centre PUE (avg)',
         f'{sasb.get("DataCenterPUE",0):.2f}' if sasb.get("DataCenterPUE",0) > 0 else 'N/A', 'ratio'],
    ]
    story.append(Table(sasb_data, colWidths=[1.4*inch,3*inch,1.4*inch,1.4*inch], style=_TS()))
    story.append(Spacer(1, 0.1*inch))

    # 4c — GHG Emissions
    story.append(Paragraph('§4c  GHG Emissions  [S2.29–S2.32]', ST['h2']))
    total_rows = 4 + (1 if recs_mwh > 0 else 0) + (1 if off_t > 0 else 0)
    em_extra = [
        ('FONTNAME',   (0, total_rows), (-1, total_rows), FB),
        ('TEXTCOLOR',  (0, total_rows), (-1, total_rows), ISSB_LIGHT),
        ('BACKGROUND', (0, total_rows), (-1, total_rows), ISSB_PANEL),
    ]
    em_data = [
        ['Scope', 'Description', f'{year} (tCO₂e)', 'Method', 'Carbon Tax (CAD)'],
        ['Scope 1', 'Direct fuel combustion',
         f'{s1:,.1f}', 'GHG Protocol', f'${s1*price:,.0f}'],
        ['Scope 2 (Location)', 'Purchased electricity — grid intensity',
         f'{s2_em:,.1f}', 'Location-based', f'${s2_em*price:,.0f}'],
        ['Scope 3 Cat.11', 'Use of sold products / cloud',
         f'{s3_tco2:,.1f}', 'CE API + GHG Protocol', f'${s3_tco2*price:,.0f}'],
    ]
    if recs_mwh > 0:
        c59_label = ' ✓ Bill C-59' if bill_c59 else ''
        em_data.append([
            'Scope 2 (Market)', f'After {recs_mwh:,.1f} MWh RECs retired{c59_label}',
            f'{s2_mkt:,.1f}', 'Market-based (GHG Protocol S2)', f'${s2_mkt*price:,.0f}',
        ])
    if off_t > 0:
        nz_label = ' — Net-Zero Ready' if net_zero else ''
        em_data.append([
            'NET POSITION', f'After {off_t:,.1f} tCO₂e verified offsets{nz_label}',
            f'{net_t:,.1f}', 'Verified carbon offsets', f'${net_t*price:,.0f}',
        ])
    gross_label = 'GROSS (Market)' if recs_mwh > 0 else 'TOTAL'
    em_data.append([gross_label, 'Scope 1 + Scope 2 (Market) + Scope 3',
                    f'{gross_m:,.1f}', '—', f'${gross_m*price:,.0f}'])
    story.append(Table(em_data,
        colWidths=[1.1*inch,2.4*inch,1.0*inch,1.5*inch,1.2*inch],
        style=_TS(em_extra)))
    story.append(Spacer(1, 0.06*inch))
    cap_lines = [
        f'S2.32  GHG Intensity: {total/max(1,total)*1000:.1f} kgCO₂e per MWh (location-based gross). '
        f'Absolute intensity disclosure. Revenue-based intensity not yet disclosed (S2.32 option).'
    ]
    if bill_c59:
        cap_lines.append('Bill C-59 (CCPA) Compliant: all retired RECs certified by an approved body (EcoLogo / I-REC / Green-e / TIGR / RE100 / IREC).')
    if net_zero:
        cap_lines.append('Net-Zero Ready: verified offsets retire residual emissions to < 0.01 tCO₂e.')
    story.append(Paragraph('  '.join(cap_lines), ST['cap']))

    # Current grid intensities
    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph('Provincial Grid Carbon Intensity (Location-Based Scope 2 Reference)', ST['h3']))
    gi_data = [['Province', 'Intensity (gCO₂e/kWh)', 'Source', 'Used for Scope 2 Market-Based']]
    for z, v in sorted(grid.items()):
        gi_data.append([z, f'{v:.0f}', 'AESO / ECCC', 'Grid factor reference'])
    story.append(Table(gi_data, colWidths=[1*inch,2*inch,2*inch,2.2*inch], style=_TS()))
    story.append(Spacer(1, 0.1*inch))

    # 4d-e — Internal Carbon Price, Remuneration, CapEx
    story.append(Paragraph('§4d  Internal Carbon Price  [S2.34]', ST['h2']))
    if cfg.get('InternalCarbonPrice'):
        story.append(Paragraph(
            f'An internal carbon price of ${cfg["InternalCarbonPrice"]}/tCO₂e '
            f'({cfg.get("InternalCarbonPriceCurrency","CAD")}) is applied to '
            f'{cfg.get("InternalCarbonPriceScope","Scope 1 and 2 emissions")} '
            'for internal investment decisions and budget planning.',
            ST['body']))
    else:
        story.append(Paragraph(
            'An internal carbon price has not yet been formally adopted. The organisation '
            'references the federal statutory carbon price ($110/tCO₂e in 2026) when '
            'evaluating climate-related investment decisions.',
            ST['body']))

    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph('§4e  Remuneration and Capital Deployment  [S2.35–S2.36]', ST['h2']))
    rem_cap_data = [
        ['Element', 'Disclosure'],
        ['Remuneration linked to climate targets', 'Yes' if cfg.get('RemunerationLinked') else 'Not yet implemented'],
        ['% of compensation linked', f'{cfg.get("RemunerationPct",0)}%'],
        ['Total CapEx (reporting year)', f'${float(cap.get("TotalCapExCAD",0)):,.0f} CAD'],
        ['CapEx climate-aligned',
         f'${float(cap.get("CapExClimateAlignedCAD",0)):,.0f} CAD ({cap_aligned_pct}%)'],
        ['Total OpEx (reporting year)', f'${float(cap.get("TotalOpExCAD",0)):,.0f} CAD'],
        ['OpEx climate-aligned',
         f'${float(cap.get("OpExClimateAlignedCAD",0)):,.0f} CAD'],
    ]
    story.append(Table(rem_cap_data, colWidths=[3.4*inch,3.8*inch], style=_TS()))
    story.append(Spacer(1, 0.1*inch))

    # 4f — Targets
    story.append(Paragraph('§4f  Climate-Related Targets  [S2.39–S2.44]', ST['h2']))
    targets = met.get('AdditionalTargets', [])
    if sbti or targets:
        tgt_data = [['Target', 'Baseline', 'Goal', 'Year', 'Validated By', 'Status']]
        if sbti:
            tgt_data.append([
                f'Scope 1+2 GHG Reduction ({sbti.get("Scope12ReductionPct",46):.0f}%)',
                str(sbti.get('BaseYear', met.get('BaselineYear',2019))),
                f'-{sbti.get("AnnualReductionRate",4.2):.1f}%/yr',
                str(sbti.get('TargetYear', 2030)),
                'SBTi',
                sbti.get('CommitmentStatus','COMMITTED'),
            ])
        for t in targets:
            tgt_data.append([t.get('name',''), str(met.get('BaselineYear',2019)),
                             t.get('target',''), str(met.get('TargetYear',2030)),
                             'Internal', t.get('status','—')])
        story.append(Table(tgt_data,
            colWidths=[2.1*inch,0.7*inch,0.9*inch,0.6*inch,0.9*inch,1*inch],
            style=_TS()))
    else:
        story.append(Paragraph('No formal climate targets yet configured.', ST['body']))
    story.append(PageBreak())

    # ── Appendix A: Scope 3 Materiality ──────────────────────────────────────
    story.append(Paragraph('Appendix A  —  Scope 3 Category Materiality Assessment', ST['h1']))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.08*inch))
    mat = cfg.get('Scope3Materiality', {})
    cat_labels = {
        'Cat1_purchased_goods':'Cat 1: Purchased goods and services',
        'Cat2_capital_goods':'Cat 2: Capital goods',
        'Cat3_fuel_energy':'Cat 3: Fuel- and energy-related activities',
        'Cat4_upstream_transport':'Cat 4: Upstream transportation',
        'Cat5_waste':'Cat 5: Waste generated in operations',
        'Cat6_business_travel':'Cat 6: Business travel',
        'Cat7_employee_commute':'Cat 7: Employee commuting',
        'Cat8_upstream_leased':'Cat 8: Upstream leased assets',
        'Cat9_downstream_transport':'Cat 9: Downstream transportation',
        'Cat10_processing':'Cat 10: Processing of sold products',
        'Cat11_use_of_sold':'Cat 11: Use of sold products / cloud services',
        'Cat12_end_of_life':'Cat 12: End-of-life treatment',
        'Cat13_downstream_leased':'Cat 13: Downstream leased assets',
        'Cat14_franchises':'Cat 14: Franchises',
        'Cat15_investments':'Cat 15: Investments',
    }
    mat_data = [['Scope 3 Category', 'Material', 'Rationale']]
    for k, label in cat_labels.items():
        is_mat = mat.get(k, k in ['Cat3_fuel_energy','Cat11_use_of_sold'])
        rationale = {
            'Cat3_fuel_energy':  'Grid electricity emissions tracked via GridWitness telemetry',
            'Cat11_use_of_sold': 'Cloud discovery pipeline tracks customer compute emissions',
        }.get(k, 'Below quantitative materiality threshold' if not is_mat else 'Assessed as material')
        mat_data.append([label, 'Yes' if is_mat else 'No', rationale])
    story.append(Table(mat_data, colWidths=[2.8*inch,0.6*inch,3.8*inch], style=_TS()))
    story.append(Spacer(1, 0.12*inch))

    # ── Appendix B: Methodology ───────────────────────────────────────────────
    story.append(Paragraph('Appendix B  —  GHG Methodology and Data Sources', ST['h1']))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.08*inch))
    meth_data = [
        ['Data Stream', 'Source', 'Standard', 'Frequency', 'Integrity'],
        ['AB Grid Intensity',   'AESO live API',          'GGPPA/Environment Canada', '5-min', 'SHA-256 hash'],
        ['BC/ON/QC Intensity',  'ECCC factors',           'GHG Protocol',             'Annual', 'SHA-256 hash'],
        ['Scope 1 Emissions',   'Facility records',       'GHG Protocol / ISO 14064', 'Monthly','SHA-256 hash'],
        ['Scope 2 Emissions',   'GridWitness telemetry',  'GHG Protocol',             '15-min', 'Merkle tree'],
        ['Scope 3 Cat.11',      'Cloud CE APIs',          'GHG Protocol Scope 3',     'Monthly','SHA-256 hash'],
        ['Carbon Budget',       'Board-approved budget',  'Internal',                 'Annual', 'S3 Object Lock'],
    ]
    story.append(Table(meth_data,
        colWidths=[1.5*inch,1.7*inch,1.7*inch,0.8*inch,1.5*inch],
        style=_TS()))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        'All records are stored in an append-only Merkle-tree audit trail on Amazon S3 with '
        'Object Lock (COMPLIANCE mode, 7-year retention) to support third-party assurance '
        'and regulatory audit. GHG Protocol Corporate Standard applied for Scope 1 and 2. '
        'Scope 3 GHG Protocol supplemental guidance applied for Category 11.',
        ST['body']))
    story.append(PageBreak())

    # ── Attestation ───────────────────────────────────────────────────────────
    story.append(Paragraph('Attestation', ST['h1']))
    story.append(HRFlowable(width='100%', thickness=1, color=ISSB_BLUE))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        f'The Board of Directors of {org} confirms that this IFRS S2 Climate-related '
        f'Disclosures Report for the {year} reporting year has been prepared in accordance '
        'with IFRS S2 Climate-related Disclosures (ISSB, June 2023), effective January 2024. '
        'The information contained in this report is accurate and complete to the best of the '
        'Board\'s knowledge, based on data collected and validated by the GridWitness platform. '
        f'\n\nReport ID: {rpt_id}  |  Generated: {now.strftime("%B %d, %Y")}',
        ST['attest']))
    story.append(Spacer(1, 0.35*inch))
    for line in [
        '_' * 42 + '        ' + '_' * 42,
        'Board Chair / CEO                              Chief Financial Officer',
        '', '_' * 42,
        'Chief Sustainability Officer (if applicable)',
        '', f'Date: {now.strftime("%B %d, %Y")}',
    ]:
        story.append(Paragraph(line, ST['attest']))

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    return buf.getvalue(), rpt_id

# ── Lambda handler ────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    method  = event.get('requestContext',{}).get('http',{}).get('method','POST').upper()
    path_p  = event.get('pathParameters') or {}
    qs      = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': HDR, 'body': '{}'}
    if method != 'POST':
        return {'statusCode': 405, 'headers': HDR, 'body': json.dumps({'error':'Method not allowed'})}

    tid  = path_p.get('tenantId') or qs.get('tenant_id') or ''
    if not tid:
        return {'statusCode': 400, 'headers': HDR, 'body': json.dumps({'error':'tenantId required'})}

    year = int(qs.get('year', date.today().year))
    logger.info('IFRS S2 report: tenant=%s year=%d', tid, year)

    tenant  = _get_tenant(tid)
    tcfd    = _get_tcfd(tid)
    s2      = _get_s2(tid)
    sbti    = _get_sbti(tid)
    budget  = _get_budget(tid, year)
    grid    = _grid_cache()
    s1       = _scope1_tco2(tid, year)
    s2_em    = _scope2_tco2(tid, year)
    s3_items = _scope3_items(tid, year)
    recs_dat = _fetch_market_scope2(tid, year, s2_em)
    gross_m  = s1 + recs_dat['market_t'] + sum(float(i.get('TotalKgCO2',0)) for i in s3_items) / 1000
    off_dat  = _fetch_offsets_net(tid, year, gross_m)

    pdf, rpt_id = _build(tid, tenant, tcfd, s2, s1, s2_em, s3_items, sbti, budget, grid,
                         recs_dat=recs_dat, off_dat=off_dat)

    key = f'ifrs-s2-reports/{tid}/{rpt_id}.pdf'
    s3.put_object(Bucket=BUCKET, Key=key, Body=pdf, ContentType='application/pdf',
                  Metadata={'TenantID': tid, 'ReportID': rpt_id, 'Framework': 'IFRS-S2'})
    url = s3.generate_presigned_url('get_object',
              Params={'Bucket':BUCKET,'Key':key}, ExpiresIn=3600)

    logger.info('IFRS S2 report uploaded: %s (%d KB)', key, len(pdf)//1024)
    return {
        'statusCode': 200,
        'headers': HDR,
        'body': json.dumps({
            'report_id':    rpt_id,
            'framework':    'IFRS-S2',
            's3_key':       key,
            'download_url': url,
            'size_kb':      round(len(pdf)/1024, 1),
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'tenant_id':    tid,
            'year':         year,
        }),
    }
