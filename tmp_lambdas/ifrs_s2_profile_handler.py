"""
gw-ms-ifrs-s2-profile-staging
IFRS S2 (ISSB) specific profile — GET and PUT per section.

Routes:
  GET /api/tenants/{tenantId}/ifrs-s2/profile
      Returns IFRS S2 config + paragraph-by-paragraph compliance status
      computed from TCFD profile + IFRS S2 specific stored fields.
  PUT /api/tenants/{tenantId}/ifrs-s2/profile/{section}
      Section keys: IFRS_CONFIG | CAPITAL_DEPLOYMENT | SASB_METRICS

IFRS S2 paragraphs tracked:
  Governance:      S2.6 – S2.9
  Strategy:        S2.10 – S2.22
  Risk Management: S2.23 – S2.25
  Metrics/Targets: S2.26 – S2.44
"""
import json, os, logging
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION  = os.environ.get('AWS_REGION', 'ca-central-1')
ddb     = boto3.resource('dynamodb', region_name=REGION)
s2_t    = ddb.Table(os.environ.get('IFRS_S2_TABLE', 'gw-ifrs-s2-staging'))
tcfd_t  = ddb.Table(os.environ.get('TCFD_TABLE',    'gw-tcfd-staging'))
ten_t   = ddb.Table(os.environ.get('TENANTS_TABLE', 'gw-tenants-staging'))
scope3_t= ddb.Table(os.environ.get('SCOPE3_TABLE',  'gw-scope3-staging'))
sbti_t  = ddb.Table(os.environ.get('SBTI_TABLE',    'gw-sbti-staging'))

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,PUT,OPTIONS',
}

# ── Default IFRS S2 specific sections ─────────────────────────────────────────

DEFAULT_IFRS_CONFIG = {
    'Section': 'IFRS_CONFIG',
    'TransitionPlanAdopted': False,
    'TransitionPlanYear': None,
    'TransitionPlanNarrative': '',
    'ClimateResilienceNarrative': (
        'The organisation assesses climate resilience annually through scenario analysis '
        'aligned to IEA NZE 2050 (1.5°C), IEA Stated Policies (2°C), and BAU (4°C) pathways, '
        'covering a 10-year strategic planning horizon.'
    ),
    'InternalCarbonPrice': None,
    'InternalCarbonPriceScope': '',
    'InternalCarbonPriceCurrency': 'CAD',
    'RemunerationLinked': False,
    'RemunerationPct': 0,
    'RemunerationNarrative': '',
    'ClimateOpportunityRevenuePct': 0,
    'ClimateOpportunityNarrative': '',
    'Scope3Materiality': {
        'Cat1_purchased_goods':     False,
        'Cat2_capital_goods':       False,
        'Cat3_fuel_energy':         True,
        'Cat4_upstream_transport':  False,
        'Cat5_waste':               False,
        'Cat6_business_travel':     False,
        'Cat7_employee_commute':    False,
        'Cat8_upstream_leased':     False,
        'Cat9_downstream_transport':False,
        'Cat10_processing':         False,
        'Cat11_use_of_sold':        True,
        'Cat12_end_of_life':        False,
        'Cat13_downstream_leased':  False,
        'Cat14_franchises':         False,
        'Cat15_investments':        False,
    },
    'Scope2Method': 'MARKET_BASED',
    'VerificationLevel': 'MANAGEMENT_ASSERTION',
}

DEFAULT_CAPITAL = {
    'Section': 'CAPITAL_DEPLOYMENT',
    'TotalCapExCAD': 0,
    'CapExClimateAlignedCAD': 0,
    'TotalOpExCAD': 0,
    'OpExClimateAlignedCAD': 0,
    'CapExNarrative': (
        'Capital expenditure aligned to the transition plan includes investments in '
        'energy-efficient infrastructure, renewable energy contracts, and grid monitoring '
        'technology to reduce Scope 2 emissions.'
    ),
    'ReportingYear': 2026,
}

DEFAULT_SASB = {
    'Section': 'SASB_METRICS',
    'SASBSector': 'TC-SI',
    'SASBSectorLabel': 'Technology & Communications — Software & IT Services',
    'TC_SI_130a1_EnergyConsumed_GJ': 0,
    'TC_SI_130a1_PctRenewable': 0,
    'TC_SI_130a1_PctGridElectricity': 100,
    'TC_SI_130a2_Scope1_tCO2e': 0,
    'TC_SI_130a2_PctUnderRegulations': 100,
    'TC_SI_230a2_LowCarbonRevenuePct': 0,
    'DataCenterPUE': 0,
    'WaterWithdrawn_m3': 0,
    'Notes': '',
}

DEFAULTS = {
    'IFRS_CONFIG':        DEFAULT_IFRS_CONFIG,
    'CAPITAL_DEPLOYMENT': DEFAULT_CAPITAL,
    'SASB_METRICS':       DEFAULT_SASB,
}

# ── IFRS S2 paragraph catalogue ───────────────────────────────────────────────
PARAGRAPHS = [
    # Governance
    {'id':'S2.6',  'group':'Governance',      'title':'Board oversight description',
     'requirement':'Describe board oversight of climate risks and opportunities.'},
    {'id':'S2.7',  'group':'Governance',      'title':'Board committee for climate',
     'requirement':'Name the committee(s) with climate oversight responsibility; meeting frequency.'},
    {'id':'S2.8',  'group':'Governance',      'title':'Management role',
     'requirement':'Describe management role in assessing and managing climate risks.'},
    {'id':'S2.9',  'group':'Governance',      'title':'Climate in governance processes',
     'requirement':'Describe how climate considerations are integrated into strategy and business model.'},
    # Strategy
    {'id':'S2.10', 'group':'Strategy',        'title':'Climate risks and opportunities identified',
     'requirement':'Disclose climate-related risks and opportunities expected to affect the entity.'},
    {'id':'S2.11', 'group':'Strategy',        'title':'Categorise as transition or physical risk',
     'requirement':'Classify each risk as transition or physical; characterise as acute or chronic.'},
    {'id':'S2.12', 'group':'Strategy',        'title':'Time horizons defined',
     'requirement':'Define short, medium, and long-term time horizons used in assessment.'},
    {'id':'S2.13', 'group':'Strategy',        'title':'Impact on business model / value chain',
     'requirement':'Describe current and anticipated effects on business model and value chain.'},
    {'id':'S2.14', 'group':'Strategy',        'title':'Financial effects',
     'requirement':'Disclose anticipated financial effects (revenues, costs, assets, liabilities) of climate risks.'},
    {'id':'S2.15', 'group':'Strategy',        'title':'Transition plan (if adopted)',
     'requirement':'If a transition plan has been adopted, disclose its key elements and alignment to 1.5°C.'},
    {'id':'S2.16', 'group':'Strategy',        'title':'Transition plan progress',
     'requirement':'Disclose metrics used to monitor transition plan progress.'},
    {'id':'S2.17', 'group':'Strategy',        'title':'Scenario analysis conducted',
     'requirement':'Disclose how scenario analysis was used to assess climate resilience.'},
    {'id':'S2.18', 'group':'Strategy',        'title':'Scenarios used',
     'requirement':'Identify scenarios used; explain why they are relevant (aligned to IPCC/IEA pathways).'},
    {'id':'S2.19', 'group':'Strategy',        'title':'Scope of scenario analysis',
     'requirement':'Disclose the time horizon, assumptions, and analytical inputs used.'},
    {'id':'S2.20', 'group':'Strategy',        'title':'Climate resilience of strategy',
     'requirement':'Disclose conclusion on climate resilience of strategy and business model.'},
    # Risk Management
    {'id':'S2.23', 'group':'Risk Management', 'title':'Risk identification & assessment process',
     'requirement':'Describe process for identifying and assessing climate-related risks.'},
    {'id':'S2.24', 'group':'Risk Management', 'title':'Risk management process',
     'requirement':'Describe process for managing climate-related risks (prioritisation, mitigation).'},
    {'id':'S2.25', 'group':'Risk Management', 'title':'Integration with overall risk management',
     'requirement':'Describe how climate risk processes integrate with overall risk management.'},
    # Metrics & Targets
    {'id':'S2.29', 'group':'Metrics & Targets','title':'Scope 1 GHG emissions',
     'requirement':'Disclose absolute Scope 1 in tCO₂e; methodology (GHG Protocol/ISO 14064).'},
    {'id':'S2.30', 'group':'Metrics & Targets','title':'Scope 2 GHG emissions',
     'requirement':'Disclose market-based and location-based Scope 2 in tCO₂e.'},
    {'id':'S2.31', 'group':'Metrics & Targets','title':'Scope 3 GHG emissions',
     'requirement':'Disclose Scope 3 by category; state which categories included and materiality rationale.'},
    {'id':'S2.32', 'group':'Metrics & Targets','title':'GHG intensity',
     'requirement':'Disclose GHG intensity (tCO₂e per unit of revenue or physical output).'},
    {'id':'S2.34', 'group':'Metrics & Targets','title':'Internal carbon price',
     'requirement':'If applicable, disclose internal carbon price used in decision-making ($/tCO₂e).'},
    {'id':'S2.35', 'group':'Metrics & Targets','title':'Remuneration tied to climate',
     'requirement':'Disclose whether executive remuneration is linked to climate targets and % of compensation.'},
    {'id':'S2.36', 'group':'Metrics & Targets','title':'Capital deployment',
     'requirement':'Disclose CapEx/OpEx aligned to climate transition plan (absolute and %).'},
    {'id':'S2.37', 'group':'Metrics & Targets','title':'Climate-related opportunities',
     'requirement':'Disclose % revenue/assets exposed to climate-related opportunities.'},
    {'id':'S2.38', 'group':'Metrics & Targets','title':'Industry-based (SASB) metrics',
     'requirement':'Disclose sector-specific metrics per SASB Sustainability Accounting Standards.'},
    {'id':'S2.39', 'group':'Metrics & Targets','title':'Climate targets disclosed',
     'requirement':'Disclose each climate-related target: metric, baseline, target value, year.'},
    {'id':'S2.40', 'group':'Metrics & Targets','title':'Scope of emissions target',
     'requirement':'If GHG target set, disclose Scope 1/2/3 coverage and excluded emissions.'},
    {'id':'S2.41', 'group':'Metrics & Targets','title':'Third-party validation of target',
     'requirement':'Disclose whether targets are validated by a third party (e.g. SBTi).'},
    {'id':'S2.42', 'group':'Metrics & Targets','title':'Progress against targets',
     'requirement':'Disclose current performance vs. each climate target in absolute and % terms.'},
]

# ── Compliance scorer ─────────────────────────────────────────────────────────

def _score_paragraphs(tcfd_secs: dict, s2_secs: dict, has_scope3: bool, has_sbti: bool) -> list:
    gov  = tcfd_secs.get('GOVERNANCE', {})
    strat= tcfd_secs.get('STRATEGY', {})
    risk = tcfd_secs.get('RISK_MGMT', {})
    met  = tcfd_secs.get('METRICS_CONFIG', {})
    cfg  = s2_secs.get('IFRS_CONFIG', {})
    cap  = s2_secs.get('CAPITAL_DEPLOYMENT', {})
    sasb = s2_secs.get('SASB_METRICS', {})

    def _ok(v):  return 'COMPLETE' if v else 'NOT_STARTED'
    def _str(v): return 'COMPLETE' if v and str(v).strip() else 'NOT_STARTED'
    def _pct(v): return 'COMPLETE' if float(v or 0) > 0 else 'PARTIAL'

    results = []
    for para in PARAGRAPHS:
        pid = para['id']
        status, note = 'NOT_STARTED', ''

        if   pid == 'S2.6':  status,note = _str(gov.get('GovernanceStatement')),  'Governance statement present' if gov.get('GovernanceStatement') else 'Add governance statement'
        elif pid == 'S2.7':  status,note = ('COMPLETE' if gov.get('BoardCommittee') and gov.get('BoardCommitteeName') else 'PARTIAL' if gov.get('BoardCommittee') else 'NOT_STARTED'), ('Committee: ' + gov.get('BoardCommitteeName','—') if gov.get('BoardCommittee') else 'Configure board committee')
        elif pid == 'S2.8':  status,note = _str(gov.get('GovernanceStatement')), 'Management role described' if gov.get('GovernanceStatement') else 'Add management role'
        elif pid == 'S2.9':  status,note = _ok(gov.get('AuditCommitteeScope')), 'Audit committee scope configured' if gov.get('AuditCommitteeScope') else 'Enable audit committee scope'
        elif pid == 'S2.10': status,note = ('COMPLETE' if strat.get('ScenarioAnalysis',{}).get('risks') else 'NOT_STARTED'), f'{len(strat.get("ScenarioAnalysis",{}).get("risks",{}))} risks identified'
        elif pid == 'S2.11': status,note = ('COMPLETE' if strat.get('ScenarioAnalysis',{}).get('risks') else 'NOT_STARTED'), 'Transition + physical categorised'
        elif pid == 'S2.12': th = strat.get('TimeHorizons',{}); status,note = ('COMPLETE' if all([th.get(k) for k in ['short','medium','long']]) else 'NOT_STARTED'), 'All three horizons defined'
        elif pid == 'S2.13': status,note = _str(strat.get('StrategyStatement')), 'Strategy impact narrative present'
        elif pid == 'S2.14': status,note = 'PARTIAL', 'Financial effect quantification via carbon tax calculator'
        elif pid == 'S2.15': status,note = (_ok(cfg.get('TransitionPlanAdopted')), f'Plan adopted {cfg.get("TransitionPlanYear","—")}') if cfg.get('TransitionPlanAdopted') else ('NOT_STARTED', 'No transition plan adopted yet')
        elif pid == 'S2.16': status,note = ('PARTIAL' if met.get('AdditionalTargets') else 'NOT_STARTED'), 'Progress tracked via SBTi targets' if met.get('AdditionalTargets') else 'Add transition plan metrics'
        elif pid == 'S2.17': sa = strat.get('ScenarioAnalysis',{}); status,note = ('COMPLETE' if sa.get('risks') else 'NOT_STARTED'), f'{len(sa.get("scenarios",[]))} scenarios analysed'
        elif pid == 'S2.18': status,note = 'COMPLETE' if strat.get('ScenarioAnalysis',{}).get('scenarios') else 'NOT_STARTED', 'IEA NZE/SPS/BAU pathways used'
        elif pid == 'S2.19': status,note = 'PARTIAL', '10-year horizon; assumptions in strategy statement'
        elif pid == 'S2.20': status,note = _str(cfg.get('ClimateResilienceNarrative')), 'Resilience narrative present'
        elif pid == 'S2.23': status,note = _str(risk.get('IdentificationProcess')), 'Identification process documented'
        elif pid == 'S2.24': status,note = _str(risk.get('ManagementProcess')), 'Management process documented'
        elif pid == 'S2.25': status,note = _str(risk.get('IntegrationStatement')), 'ERM integration documented'
        elif pid == 'S2.29': status,note = 'COMPLETE', 'Scope 1 tracked in GridWitness'
        elif pid == 'S2.30': status,note = 'COMPLETE', 'Scope 2 tracked via telemetry pipeline'
        elif pid == 'S2.31': status,note = ('COMPLETE' if has_scope3 else 'PARTIAL'), 'Scope 3 Cat.11 cloud tracked' if has_scope3 else 'Enable cloud emissions discovery'
        elif pid == 'S2.32': status,note = 'COMPLETE', 'kgCO₂e/MWh intensity metric configured'
        elif pid == 'S2.34': status,note = ('COMPLETE' if cfg.get('InternalCarbonPrice') else 'NOT_STARTED'), f'${cfg["InternalCarbonPrice"]}/tCO₂e configured' if cfg.get('InternalCarbonPrice') else 'Set internal carbon price'
        elif pid == 'S2.35': status,note = (_ok(cfg.get('RemunerationLinked')), f'{cfg.get("RemunerationPct",0)}% of comp linked') if cfg.get('RemunerationLinked') else ('NOT_STARTED', 'No remuneration linkage configured')
        elif pid == 'S2.36': status,note = ('COMPLETE' if cap.get('TotalCapExCAD',0) > 0 else 'NOT_STARTED'), f'${cap.get("CapExClimateAlignedCAD",0):,.0f} climate-aligned CapEx' if cap.get('TotalCapExCAD',0) > 0 else 'Add CapEx data'
        elif pid == 'S2.37': status,note = ('COMPLETE' if cfg.get('ClimateOpportunityRevenuePct',0) > 0 else 'NOT_STARTED'), f'{cfg.get("ClimateOpportunityRevenuePct",0)}% revenue from climate opportunities'
        elif pid == 'S2.38': status,note = ('COMPLETE' if sasb.get('TC_SI_130a1_EnergyConsumed_GJ',0) > 0 else 'PARTIAL'), f'SASB {sasb.get("SASBSector","TC-SI")} metrics {'entered' if sasb.get("TC_SI_130a1_EnergyConsumed_GJ",0) > 0 else "partially configured"}'
        elif pid == 'S2.39': status,note = ('COMPLETE' if met.get('AdditionalTargets') else 'NOT_STARTED'), f'{len(met.get("AdditionalTargets",[]))} targets configured'
        elif pid == 'S2.40': status,note = 'COMPLETE', 'Scope 1+2+3 coverage documented'
        elif pid == 'S2.41': status,note = ('COMPLETE' if has_sbti else 'NOT_STARTED'), 'SBTi validated' if has_sbti else 'No third-party validation'
        elif pid == 'S2.42': status,note = ('COMPLETE' if has_sbti else 'PARTIAL'), 'Progress vs SBTi trajectory tracked'

        results.append({**para, 'status': status, 'note': note})

    return results

# ── DynamoDB helpers ──────────────────────────────────────────────────────────

def _load_s2(tid):
    try:
        r = s2_t.query(KeyConditionExpression=Key('TenantID').eq(tid))
        return {i['Section']: i for i in r.get('Items', [])}
    except Exception as e:
        logger.warning('IFRS S2 DDB read: %s', e)
        return {}

def _load_tcfd(tid):
    try:
        r = tcfd_t.query(KeyConditionExpression=Key('TenantID').eq(tid))
        return {i['Section']: i for i in r.get('Items', [])}
    except Exception as e:
        logger.warning('TCFD DDB read: %s', e)
        return {}

def _has_scope3(tid):
    try:
        r = scope3_t.query(
            KeyConditionExpression=Key('TenantID').eq(tid),
            Limit=1,
        )
        return len(r.get('Items', [])) > 0
    except Exception:
        return False

def _has_sbti(tid):
    try:
        r = sbti_t.get_item(Key={'TenantID': tid})
        return bool(r.get('Item'))
    except Exception:
        return False

def _merge_s2(stored):
    out = {}
    for key, default in DEFAULTS.items():
        out[key] = {**default, **stored.get(key, {})}
    return out

def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

def _now():
    return datetime.now(timezone.utc).isoformat()

# ── Handler ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method  = event.get('requestContext', {}).get('http', {}).get('method', 'GET').upper()
    path_p  = event.get('pathParameters') or {}
    qs      = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return _r(200, {})

    tenant_id = path_p.get('tenantId') or qs.get('tenant_id') or ''
    section   = (path_p.get('section') or '').upper()

    if not tenant_id:
        return _r(400, {'error': 'tenantId required'})

    if method == 'GET':
        stored_s2   = _load_s2(tenant_id)
        stored_tcfd = _load_tcfd(tenant_id)
        s2_secs     = _merge_s2(stored_s2)
        has_s3      = _has_scope3(tenant_id)
        has_sbti    = _has_sbti(tenant_id)

        paragraphs  = _score_paragraphs(stored_tcfd, s2_secs, has_s3, has_sbti)
        complete    = sum(1 for p in paragraphs if p['status'] == 'COMPLETE')
        partial     = sum(1 for p in paragraphs if p['status'] == 'PARTIAL')
        total       = len(paragraphs)
        score       = round((complete + partial * 0.5) / total * 100)

        return _r(200, {
            'tenant_id':        tenant_id,
            'sections':         s2_secs,
            'tcfd_sections':    stored_tcfd,
            'paragraphs':       paragraphs,
            'compliance': {
                'score':       score,
                'complete':    complete,
                'partial':     partial,
                'not_started': total - complete - partial,
                'total':       total,
            },
            'as_of': _now(),
        })

    if method == 'PUT' and section in DEFAULTS:
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        item = {'TenantID': tenant_id, 'Section': section, 'UpdatedAt': _now(), **body}
        s2_t.put_item(Item=item)
        logger.info('ifrs_s2_profile_update tenant=%s section=%s', tenant_id, section)
        return _r(200, {'ok': True, 'section': section})

    return _r(405, {'error': 'Method not allowed'})
