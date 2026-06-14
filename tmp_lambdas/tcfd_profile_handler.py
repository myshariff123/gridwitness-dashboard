"""
gw-ms-tcfd-profile-staging
TCFD four-pillar qualitative profile — GET and PUT per section.

Routes:
  GET /api/tenants/{tenantId}/tcfd/profile
      Returns all four pillar sections merged with defaults, plus per-pillar completeness scores.
  PUT /api/tenants/{tenantId}/tcfd/profile/{section}
      Overwrites one section: GOVERNANCE | STRATEGY | RISK_MGMT | METRICS_CONFIG
"""
import json, os, logging
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ca-central-1')
ddb    = boto3.resource('dynamodb', region_name=REGION)
tcfd_t = ddb.Table(os.environ.get('TCFD_TABLE', 'gw-tcfd-staging'))

HDR = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Methods':'GET,PUT,OPTIONS',
}

# ── Default four-pillar content ───────────────────────────────────────────────

DEFAULT_GOVERNANCE = {
    'Section': 'GOVERNANCE',
    'BoardCommittee': False,
    'BoardCommitteeName': '',
    'MeetingsPerYear': 4,
    'ExecutiveCompensation': False,
    'CSO': False,
    'CSOName': '',
    'AuditCommitteeScope': False,
    'ClimateRiskPolicy': False,
    'GovernanceStatement': (
        'The Board of Directors maintains oversight of climate-related risks and opportunities '
        'through its Risk Committee. Management provides quarterly updates on climate metrics, '
        'GHG emissions performance, and regulatory compliance status.'
    ),
}

DEFAULT_STRATEGY = {
    'Section': 'STRATEGY',
    'TimeHorizons': {
        'short':  '0–3 years: Carbon price escalation ($110→$125/tCO₂e), OSFI B-15 compliance deadlines, grid intensity volatility across AB/BC/ON/QC.',
        'medium': '3–10 years: Mandatory IFRS S2 disclosures, SBTi 1.5°C target pathway, renewable energy procurement and PPA sourcing.',
        'long':   '10+ years: Physical climate risks from chronic grid stress and wildfire disruption, systemic grid decarbonisation, net-zero pathway execution.',
    },
    'ScenarioAnalysis': {
        'scenarios': [
            {'id': '1.5C_NZE', 'label': '1.5°C (IEA NZE 2050)', 'description': 'Net Zero by 2050 — rapid policy tightening, aggressive carbon pricing', 'color': 'green'},
            {'id': '2C_SPS',   'label': '2°C (IEA Stated Policies)', 'description': 'Moderate transition — current policies maintained and extended', 'color': 'yellow'},
            {'id': '4C_BAU',   'label': '4°C (Business as Usual)', 'description': 'No new climate policy — high physical risk by 2050', 'color': 'red'},
        ],
        'risks': {
            'policy_carbon': {
                'label': 'Policy — Carbon Price Escalation', 'category': 'Transition',
                'description': 'Federal GGPPA carbon price rises from $110 (2026) to $170/tCO₂e (2030) and beyond; higher exposure under ambitious policy.',
                '1.5C_NZE': 'HIGH', '2C_SPS': 'HIGH', '4C_BAU': 'MEDIUM',
            },
            'policy_disclosure': {
                'label': 'Policy — OSFI B-15 / IFRS S2 Disclosure', 'category': 'Transition',
                'description': 'Mandatory climate risk disclosures tighten under ambitious scenarios; compliance burden increases with regulatory convergence.',
                '1.5C_NZE': 'HIGH', '2C_SPS': 'HIGH', '4C_BAU': 'LOW',
            },
            'technology_grid': {
                'label': 'Technology — Grid Decarbonisation Pace', 'category': 'Transition',
                'description': 'Rapid grid decarbonisation in 1.5°C scenario reduces Scope 2 emissions but requires faster adaptation of energy sourcing strategy.',
                '1.5C_NZE': 'MEDIUM', '2C_SPS': 'LOW', '4C_BAU': 'LOW',
            },
            'market_energy': {
                'label': 'Market — Energy Cost Volatility', 'category': 'Transition',
                'description': 'Energy price spikes from fossil fuel phase-out (1.5°C/2°C) or stranded asset repricing (4°C) increase operating cost uncertainty.',
                '1.5C_NZE': 'MEDIUM', '2C_SPS': 'MEDIUM', '4C_BAU': 'HIGH',
            },
            'reputation_esg': {
                'label': 'Reputation — ESG Investor Scrutiny', 'category': 'Transition',
                'description': 'Investor and customer expectations for climate action are highest under BAU when peers accelerate and laggards face divestment pressure.',
                '1.5C_NZE': 'LOW', '2C_SPS': 'MEDIUM', '4C_BAU': 'HIGH',
            },
            'physical_acute': {
                'label': 'Physical — Acute (Wildfire / Heat Events)', 'category': 'Physical',
                'description': 'Wildfire smoke and extreme heat events disrupt Alberta grid reliability and data centre cooling. Incident frequency rises with warming.',
                '1.5C_NZE': 'LOW', '2C_SPS': 'MEDIUM', '4C_BAU': 'HIGH',
            },
            'physical_chronic': {
                'label': 'Physical — Chronic (Grid Stress / Hydro)', 'category': 'Physical',
                'description': 'Long-term drought reduces BC/QC hydro capacity; increased cooling loads stress grid capacity. Systemic risk compounds with each degree of warming.',
                '1.5C_NZE': 'LOW', '2C_SPS': 'MEDIUM', '4C_BAU': 'CRITICAL',
            },
        },
    },
    'StrategyStatement': (
        'Climate-related risks and opportunities are integrated into strategic planning across '
        'three time horizons. The organisation has identified transition risks (policy, technology, '
        'market, reputation) and physical risks (acute and chronic) through scenario analysis '
        'aligned to IEA NZE 2050, IEA Stated Policies, and a 4°C business-as-usual pathway. '
        'The highest-priority risks are federal carbon price escalation and OSFI B-15 disclosure '
        'obligations, both assessed HIGH under 1.5°C and 2°C scenarios.'
    ),
}

DEFAULT_RISK_MGMT = {
    'Section': 'RISK_MGMT',
    'IdentificationProcess': (
        'Climate-related risks are identified through continuous 15-minute grid carbon intensity '
        'monitoring across AB, BC, ON, and QC provinces via the GridWitness telemetry pipeline. '
        'Automated anomaly detection flags exceedances of tenant-defined carbon thresholds, '
        'generating incidents for operational and compliance review. Annual physical risk '
        'assessments are conducted by the Sustainability function.'
    ),
    'AssessmentProcess': (
        'Operational risk severity is assessed on a three-tier scale derived from threshold '
        'exceedance magnitude: MEDIUM (<1.2× threshold), HIGH (1.2–1.5× threshold), and CRITICAL '
        '(>1.5× threshold). Financial exposure is quantified using the federal statutory carbon '
        'price schedule ($110–$170/tCO₂e, 2026–2030). Strategic risks are assessed annually '
        'using a likelihood × financial impact matrix across three scenario pathways.'
    ),
    'ManagementProcess': (
        'Active incidents are tracked in real-time on the GridWitness Incidents dashboard. '
        'Grid carbon intensity incidents remain open until intensity recovers below the configured '
        'threshold. Each incident records duration, peak intensity, ObservationCount, and '
        'authorised actions with timestamps. Incidents are escalated to the Risk Committee '
        'when open duration exceeds 4 hours or when CRITICAL severity is triggered.'
    ),
    'MonitoringFrequency': '15-minute automated grid intensity checks with real-time incident generation; daily digest and 30/14/7-day regulatory filing reminders',
    'IntegrationStatement': (
        'Climate risk monitoring is integrated into the Enterprise Risk Management framework. '
        'Climate metrics (grid carbon intensity, GHG emissions, carbon budget utilisation, '
        'active incident count) are reported quarterly to the Board Risk Committee alongside '
        'operational and cybersecurity risk updates. The GridWitness platform serves as the '
        'system of record for climate risk data used in OSFI B-15, TCFD, CDP, and IFRS S2 filings.'
    ),
    'RiskAppetiteStatement': (
        'The organisation maintains a LOW risk appetite for regulatory compliance breaches and '
        'a MEDIUM risk appetite for grid carbon intensity exceedances, with defined thresholds '
        'per province aligned to SBTi Scope 2 market-based targets. Carbon budget utilisation '
        'above 80% triggers a mandatory review of energy procurement strategy.'
    ),
}

DEFAULT_METRICS_CONFIG = {
    'Section': 'METRICS_CONFIG',
    'BaselineYear': 2019,
    'TargetYear': 2030,
    'TemperatureAlignment': '1.5C',
    'IntensityMetric': 'kgCO2e_per_MWh',
    'RevenueIntensity': False,
    'AdditionalTargets': [
        {'name': '100% Renewable Electricity', 'target': '100% by 2030', 'status': 'In progress'},
        {'name': 'Carbon Neutral Operations',   'target': '2028',         'status': 'Planned'},
        {'name': 'Scope 3 Cat.11 Reduction',    'target': '50% by 2030', 'status': 'In progress'},
    ],
    'MetricsNarrative': (
        'Scope 1, 2, and 3 Category 11 emissions are tracked monthly using the GridWitness '
        'telemetry and discovery pipeline. Grid carbon intensity data is sourced from AESO '
        '(live, 5-minute interval) and Environment and Climate Change Canada (BC, ON, QC). '
        'All data is hashed and stored in a Merkle-tree audit trail on S3 Object Lock '
        '(COMPLIANCE mode, 7-year retention) for third-party verification.'
    ),
}

DEFAULTS = {
    'GOVERNANCE':     DEFAULT_GOVERNANCE,
    'STRATEGY':       DEFAULT_STRATEGY,
    'RISK_MGMT':      DEFAULT_RISK_MGMT,
    'METRICS_CONFIG': DEFAULT_METRICS_CONFIG,
}

# ── Completeness scoring ──────────────────────────────────────────────────────

def _governance_score(g: dict) -> int:
    checks = [
        bool(g.get('BoardCommittee')),
        bool(g.get('BoardCommitteeName')),
        bool(g.get('ExecutiveCompensation') is not None),
        bool(g.get('CSO') is not None),
        bool(g.get('AuditCommitteeScope') is not None),
        bool(g.get('ClimateRiskPolicy') is not None),
        bool(g.get('GovernanceStatement', '').strip()),
        bool(g.get('MeetingsPerYear')),
    ]
    return round(sum(checks) / len(checks) * 100)

def _strategy_score(s: dict) -> int:
    th = s.get('TimeHorizons', {})
    sa = s.get('ScenarioAnalysis', {})
    score = 0
    if th.get('short') and th.get('medium') and th.get('long'): score += 30
    if sa.get('risks') and len(sa.get('risks', {})) >= 5:       score += 40
    if s.get('StrategyStatement', '').strip():                   score += 30
    return score

def _risk_score(r: dict) -> int:
    fields = [
        'IdentificationProcess', 'AssessmentProcess', 'ManagementProcess',
        'MonitoringFrequency', 'IntegrationStatement', 'RiskAppetiteStatement',
    ]
    filled = sum(1 for f in fields if r.get(f, '').strip())
    return round(filled / len(fields) * 100)

def _metrics_score(m: dict) -> int:
    score = 0
    if m.get('BaselineYear'):              score += 20
    if m.get('TargetYear'):                score += 20
    if m.get('TemperatureAlignment'):      score += 20
    if m.get('IntensityMetric'):           score += 20
    if m.get('AdditionalTargets'):         score += 20
    return score

def _overall_score(sections: dict) -> int:
    scores = [
        _governance_score(sections.get('GOVERNANCE', {})),
        _strategy_score(sections.get('STRATEGY', {})),
        _risk_score(sections.get('RISK_MGMT', {})),
        _metrics_score(sections.get('METRICS_CONFIG', {})),
    ]
    return round(sum(scores) / len(scores))

# ── DynamoDB ──────────────────────────────────────────────────────────────────

def _load_all(tenant_id: str) -> dict:
    try:
        r = tcfd_t.query(KeyConditionExpression=Key('TenantID').eq(tenant_id))
        return {item['Section']: item for item in r.get('Items', [])}
    except Exception as e:
        logger.warning('TCFD DDB read error: %s', e)
        return {}

def _merge(stored: dict) -> dict:
    sections = {}
    for key, default in DEFAULTS.items():
        s = stored.get(key, {})
        if key == 'STRATEGY' and s:
            # Deep-merge ScenarioAnalysis so stored overrides individual risk entries
            merged = {**default, **s}
            default_sa = default.get('ScenarioAnalysis', {})
            stored_sa  = s.get('ScenarioAnalysis', {})
            merged['ScenarioAnalysis'] = {**default_sa, **stored_sa}
            sections[key] = merged
        else:
            sections[key] = {**default, **s}
    return sections

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
        stored   = _load_all(tenant_id)
        sections = _merge(stored)
        gov   = _governance_score(sections['GOVERNANCE'])
        strat = _strategy_score(sections['STRATEGY'])
        risk  = _risk_score(sections['RISK_MGMT'])
        met   = _metrics_score(sections['METRICS_CONFIG'])
        overall = round((gov + strat + risk + met) / 4)

        return _r(200, {
            'tenant_id': tenant_id,
            'sections':  sections,
            'completeness': {
                'governance':     gov,
                'strategy':       strat,
                'risk_mgmt':      risk,
                'metrics_config': met,
                'overall':        overall,
            },
            'as_of': _now(),
        })

    if method == 'PUT' and section in DEFAULTS:
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return _r(400, {'error': 'Invalid JSON'})

        item = {'TenantID': tenant_id, 'Section': section, 'UpdatedAt': _now(), **body}
        tcfd_t.put_item(Item=item)
        logger.info('tcfd_profile_update tenant=%s section=%s', tenant_id, section)
        return _r(200, {'ok': True, 'section': section})

    if method == 'PUT' and not section:
        return _r(400, {'error': 'section path parameter required (GOVERNANCE|STRATEGY|RISK_MGMT|METRICS_CONFIG)'})

    return _r(405, {'error': 'Method not allowed'})
