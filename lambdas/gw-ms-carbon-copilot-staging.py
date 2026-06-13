"""
gw-ms-carbon-copilot-staging — Carbon Copilot AI assistant.
Calls Claude claude-sonnet-4-6 with tool use over GridWitness data.
POST /api/copilot/chat
Body: { "tenant_id": "...", "messages": [...], "stream": false }
"""
import json, os, logging, statistics, urllib.request, urllib.error
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone, timedelta
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION          = os.environ.get('AWS_REGION', 'ca-central-1')
TELEMETRY_TABLE = os.environ.get('TELEMETRY_TABLE', 'gw-telemetry-staging')
GRID_TABLE      = os.environ.get('GRID_TABLE', 'gw-grid-cache-staging')
INCIDENTS_TABLE = os.environ.get('INCIDENTS_TABLE', 'gw-incidents-staging')
TENANTS_TABLE   = os.environ.get('TENANTS_TABLE', 'gw-tenants-staging')
SCOPE1_TABLE    = os.environ.get('SCOPE1_TABLE', 'gw-scope1-staging')
MODEL           = os.environ.get('ANTHROPIC_MODEL', 'claude-sonnet-4-6')
SECRET_ID       = os.environ.get('ANTHROPIC_SECRET', 'gw/anthropic/api-key')

ddb = boto3.resource('dynamodb', region_name=REGION)
sm  = boto3.client('secretsmanager', region_name=REGION)

HDR = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

_api_key_cache = {}

def _get_api_key():
    if not _api_key_cache:
        _api_key_cache['k'] = sm.get_secret_value(SecretId=SECRET_ID)['SecretString']
    return _api_key_cache['k']

def _r(code, body):
    return {'statusCode': code, 'headers': HDR, 'body': json.dumps(body, default=str)}

SYSTEM = """You are Carbon Copilot, an AI sustainability advisor embedded in GridWitness — Alberta's first WORM-sealed carbon emissions monitoring platform for data centres and crypto mining operations.

You have real-time access to:
- Power telemetry from servers, ASIC miners, and GPU rigs (Redfish/BMC, nvidia-smi, edge agents)
- Alberta grid carbon intensity from AESO (live SMP data, updated every 5 minutes)
- WORM-sealed SHA-256 hash chain audit trail (OSFI B-15, ISO 14064-1, GHG Protocol compliant)
- Threshold breach incidents with peak tracking and automated response actions
- Scope 1 fuel usage records (diesel generators, natural gas backup)
- Predictive carbon scheduling based on 30-day historical AESO patterns

Alberta grid context: The Alberta grid runs 390-700 gCO2/kWh (coal and natural gas heavy). Nights and weekends trend lower as wind generation increases. A 100-watt server running 24h emits approximately 1.13 kg CO2/day at 470 gCO2/kWh average.

Your role:
- Answer questions about emissions, power consumption, and compliance status in plain English
- Identify trends, anomalies, and optimization opportunities with specific data citations
- Draft narrative sections for OSFI B-15, TCFD, and GHG Protocol compliance reports
- Recommend low-carbon windows for scheduling compute-intensive workloads
- Flag unusual power consumption patterns that may indicate hardware faults or security issues
- Calculate carbon debt for specific servers, time periods, or operations

Always cite specific data: timestamps, server names, watt values, hash references. If data is insufficient to answer confidently, say so clearly."""

TOOLS = [
    {
        "name": "query_telemetry",
        "description": "Query power telemetry and carbon emissions records from the WORM ledger. Returns server readings with watts, carbon intensity, and sealed hash chain entries.",
        "input_schema": {
            "type": "object",
            "properties": {
                "hours_back": {"type": "integer", "description": "Hours of history to fetch (default 24, max 720)"},
                "source_filter": {"type": "string", "description": "Filter to a specific server/miner name"},
                "limit": {"type": "integer", "description": "Max records (default 50, max 200)"},
            },
        },
    },
    {
        "name": "get_grid_status",
        "description": "Get current Alberta grid carbon intensity (gCO2/kWh), pool price ($/MWh), and data quality from AESO.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_incidents",
        "description": "List threshold breach incidents — carbon intensity or pool price exceeding configured limits.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["OPEN", "CLOSED", "all"], "description": "Filter by status (default: all)"},
                "limit": {"type": "integer", "description": "Max incidents to return (default 20)"},
            },
        },
    },
    {
        "name": "get_carbon_forecast",
        "description": "Predict Alberta grid carbon intensity for the next 24 hours based on 30-day historical time-of-day patterns. Returns hourly predictions and the 3 best low-carbon windows for scheduling workloads.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "detect_anomalies",
        "description": "Run statistical anomaly detection on recent power telemetry. Identifies servers with unusual consumption (>3 standard deviations) that may indicate hardware faults, cryptomining malware, or cooling failures.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_scope1",
        "description": "Retrieve recorded Scope 1 (direct) emissions from diesel generators, natural gas, and other fuel sources.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "generate_compliance_narrative",
        "description": "Generate a professional compliance narrative paragraph for OSFI B-15, TCFD, or GHG Protocol reports based on the period's telemetry data. Suitable for direct inclusion in regulatory filings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "framework": {"type": "string", "enum": ["OSFI_B15", "TCFD", "GHG_PROTOCOL", "ISO14064"], "description": "Regulatory framework for the narrative"},
                "period": {"type": "string", "description": "Reporting period (e.g. 'Q2 2026' or '2026-06')"},
            },
        },
    },
]

def lambda_handler(event, context):
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return _r(200, {})
    try:
        body      = json.loads(event.get('body') or '{}')
        tenant_id = body.get('tenant_id', '')
        messages  = body.get('messages', [])
        if not tenant_id:
            return _r(400, {'error': 'tenant_id required'})
        if not messages:
            return _r(400, {'error': 'messages required'})

        response_text, sources = run_copilot(tenant_id, messages)
        return _r(200, {'response': response_text, 'sources': sources})
    except Exception as e:
        logger.exception('Copilot error')
        return _r(500, {'error': str(e)})

def run_copilot(tenant_id, messages):
    api_key = _get_api_key()
    sources = []
    msgs    = [m for m in messages]

    for _ in range(8):  # max 8 tool-call rounds
        payload = {
            "model": MODEL,
            "max_tokens": 2048,
            "system": SYSTEM,
            "tools": TOOLS,
            "messages": msgs,
        }
        resp_body = _call_anthropic(api_key, payload)
        stop_reason = resp_body.get('stop_reason')
        content     = resp_body.get('content', [])

        if stop_reason == 'end_turn':
            text = ' '.join(c.get('text', '') for c in content if c.get('type') == 'text')
            return text, sources

        if stop_reason == 'tool_use':
            msgs.append({'role': 'assistant', 'content': content})
            tool_results = []
            for block in content:
                if block.get('type') != 'tool_use':
                    continue
                tool_name = block['name']
                tool_input = block.get('input', {})
                logger.info(f'Tool call: {tool_name} {json.dumps(tool_input)[:200]}')
                result, src = dispatch_tool(tenant_id, tool_name, tool_input)
                sources.extend(src)
                tool_results.append({
                    'type': 'tool_result',
                    'tool_use_id': block['id'],
                    'content': json.dumps(result, default=str)[:8000],
                })
            msgs.append({'role': 'user', 'content': tool_results})
            continue

        # Unexpected stop reason
        break

    text = ' '.join(
        c.get('text', '') for c in content if c.get('type') == 'text'
    ) if content else 'I could not complete the analysis.'
    return text, sources

def _call_anthropic(api_key, payload):
    data = json.dumps(payload).encode('utf-8')
    req  = urllib.request.Request(
        'https://api.anthropic.com/v1/messages',
        data=data,
        headers={
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=55) as resp:
        return json.loads(resp.read().decode('utf-8'))

def dispatch_tool(tenant_id, name, inp):
    """Execute a tool call and return (result_dict, sources_list)."""
    try:
        if name == 'query_telemetry':
            return _tool_telemetry(tenant_id, inp)
        elif name == 'get_grid_status':
            return _tool_grid()
        elif name == 'get_incidents':
            return _tool_incidents(tenant_id, inp)
        elif name == 'get_carbon_forecast':
            return _tool_forecast()
        elif name == 'detect_anomalies':
            return _tool_anomalies(tenant_id)
        elif name == 'get_scope1':
            return _tool_scope1(tenant_id)
        elif name == 'generate_compliance_narrative':
            return _tool_narrative(tenant_id, inp)
        else:
            return {'error': f'Unknown tool: {name}'}, []
    except Exception as e:
        logger.error(f'Tool {name} error: {e}')
        return {'error': str(e)}, []

def _tool_telemetry(tenant_id, inp):
    hours = min(int(inp.get('hours_back', 24)), 720)
    limit = min(int(inp.get('limit', 50)), 200)
    src_f = inp.get('source_filter')
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    table  = ddb.Table(TELEMETRY_TABLE)
    items  = table.query(
        KeyConditionExpression=Key('TenantID').eq(tenant_id) & Key('Timestamp').gte(cutoff),
        ScanIndexForward=False, Limit=limit,
    ).get('Items', [])
    if src_f:
        items = [i for i in items if src_f.lower() in str(i.get('Source', '')).lower()]

    records = []
    total_w = total_g = 0.0
    for r in items:
        w = float(r.get('ActualWattage') or r.get('Actual_Wattage') or 0)
        g = float(r.get('CarbonDebt_gCO2') or r.get('gCO2e') or 0)
        total_w += w; total_g += g
        records.append({
            'ts': str(r.get('Timestamp', r.get('SealedAt', ''))[:19]),
            'source': r.get('Source', ''), 'watts': round(w, 1),
            'ci_gco2_kwh': float(r.get('CarbonIntensity') or 0),
            'carbon_g': round(g, 4), 'grid': r.get('GridID', 'AB'),
            'data_source': r.get('DataSource', ''), 'quality': r.get('DataQuality', ''),
        })
    summary = {
        'records': records, 'count': len(records), 'period_hours': hours,
        'total_watts_avg': round(total_w / max(len(records), 1), 1),
        'total_carbon_g': round(total_g, 2),
        'total_carbon_kg': round(total_g / 1000, 4),
    }
    sources = [{'type': 'telemetry', 'count': len(records), 'period_hours': hours}]
    return summary, sources

def _tool_grid():
    table = ddb.Table(GRID_TABLE)
    items = table.query(
        KeyConditionExpression=Key('GridID').eq('AB'),
        ScanIndexForward=False, Limit=1,
    ).get('Items', [])
    if not items:
        return {'error': 'No grid data available'}, []
    ab = items[0]
    result = {
        'grid': 'AB', 'carbon_intensity_gco2_kwh': float(ab.get('CarbonIntensity', 0)),
        'pool_price_mwh': float(ab.get('PoolPrice', 0)),
        'data_quality': ab.get('DataQuality', ''), 'captured_at': str(ab.get('CapturedAt', '')),
        'context': 'Alberta grid runs 390-700 gCO2/kWh. Below 430 = clean, above 600 = high-carbon.',
    }
    return result, [{'type': 'grid_status', 'grid': 'AB'}]

def _tool_incidents(tenant_id, inp):
    status = inp.get('status', 'all')
    limit  = min(int(inp.get('limit', 20)), 50)
    table  = ddb.Table(INCIDENTS_TABLE)
    kwargs = dict(
        KeyConditionExpression=Key('TenantID').eq(tenant_id),
        ScanIndexForward=False, Limit=limit,
    )
    if status in ('OPEN', 'CLOSED'):
        kwargs['FilterExpression'] = Key('Status').eq(status)
    items = table.query(**kwargs).get('Items', [])
    incidents = [{
        'id': i.get('IncidentID', ''), 'status': i.get('Status', ''),
        'metric': i.get('Metric', ''), 'grid': i.get('GridID', 'AB'),
        'severity': i.get('Severity', ''), 'breach_value': float(i.get('BreachValue') or 0),
        'peak_value': float(i.get('PeakValue') or 0), 'threshold': float(i.get('Threshold') or 0),
        'opened_at': str(i.get('OpenedAt', '')), 'closed_at': str(i.get('ClosedAt', '')),
    } for i in items]
    return {'incidents': incidents, 'count': len(incidents), 'filter': status}, \
           [{'type': 'incidents', 'count': len(incidents)}]

def _tool_forecast():
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    table  = ddb.Table(GRID_TABLE)
    items  = table.query(
        KeyConditionExpression=Key('GridID').eq('AB') & Key('CapturedAt').gte(cutoff),
        ScanIndexForward=False, Limit=2000,
    ).get('Items', [])

    by_hour = {}
    for item in items:
        try:
            ts   = str(item.get('CapturedAt', ''))
            hour = int(ts[11:13]) if len(ts) > 13 else 0
            ci   = float(item.get('CarbonIntensity') or 0)
            if ci > 0:
                by_hour.setdefault(hour, []).append(ci)
        except Exception:
            pass

    now_h    = datetime.now(timezone.utc).hour
    forecast = []
    for i in range(24):
        h      = (now_h + i) % 24
        vals   = by_hour.get(h, [])
        avg    = round(statistics.mean(vals), 1) if vals else 470.0
        mst_h  = (h - 6) % 24  # MST = UTC-6 in summer
        label  = f"{mst_h:02d}:00 MST"
        forecast.append({
            'offset_hours': i, 'utc_hour': h, 'mst_label': label,
            'predicted_gco2_kwh': avg,
            'quality': 'LOW_CARBON' if avg < 420 else ('HIGH_CARBON' if avg > 560 else 'NORMAL'),
        })

    windows = []
    for start in range(20):
        window = forecast[start:start + 4]
        avg_ci = round(statistics.mean(w['predicted_gco2_kwh'] for w in window), 1)
        windows.append({
            'start_label': window[0]['mst_label'],
            'end_label':   window[-1]['mst_label'],
            'avg_gco2_kwh': avg_ci,
            'start_offset_hours': start,
        })
    windows.sort(key=lambda w: w['avg_gco2_kwh'])

    return {
        'hourly_forecast': forecast,
        'best_low_carbon_windows': windows[:3],
        'methodology': '30-day AESO historical time-of-day averages',
        'note': 'Predictions are based on historical patterns. Actual values vary with weather, demand, and generation mix.',
    }, [{'type': 'carbon_forecast', 'data_points': len(items)}]

def _tool_anomalies(tenant_id):
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
    table  = ddb.Table(TELEMETRY_TABLE)
    items  = table.query(
        KeyConditionExpression=Key('TenantID').eq(tenant_id) & Key('Timestamp').gte(cutoff),
        ScanIndexForward=True, Limit=400,
    ).get('Items', [])

    by_source = {}
    for r in items:
        src = r.get('Source', 'unknown')
        w   = float(r.get('ActualWattage') or r.get('Actual_Wattage') or 0)
        if w > 0:
            by_source.setdefault(src, []).append(w)

    anomalies = []
    for src, readings in by_source.items():
        if len(readings) < 5:
            continue
        baseline = readings[:-1]
        current  = readings[-1]
        mean     = statistics.mean(baseline)
        stdev    = statistics.stdev(baseline) if len(baseline) > 1 else 0
        if stdev < 2:
            continue
        z = (current - mean) / stdev
        if abs(z) > 2.5:
            anomalies.append({
                'source': src, 'current_watts': round(current, 1),
                'mean_watts': round(mean, 1), 'stdev_watts': round(stdev, 1),
                'z_score': round(z, 2),
                'type': 'SPIKE' if z > 0 else 'DROP',
                'severity': 'CRITICAL' if abs(z) > 4 else 'WARNING',
            })

    return {
        'anomalies': anomalies,
        'servers_checked': len(by_source),
        'period': 'last 4 hours',
        'method': 'Z-score >2.5 standard deviations from 4h rolling baseline',
    }, [{'type': 'anomaly_scan', 'servers': len(by_source)}]

def _tool_scope1(tenant_id):
    table = ddb.Table(SCOPE1_TABLE)
    items = table.query(
        KeyConditionExpression=Key('TenantID').eq(tenant_id),
        ScanIndexForward=False, Limit=100,
    ).get('Items', [])
    entries = [{
        'fuel_type': i.get('FuelType'), 'quantity': float(i.get('Quantity', 0)),
        'unit': i.get('Unit'), 'kg_co2e': float(i.get('kgCO2e', 0)),
        'source': i.get('Source'), 'period': f"{i.get('PeriodStart','')}–{i.get('PeriodEnd','')}",
    } for i in items]
    total_kg = sum(e['kg_co2e'] for e in entries)
    return {
        'entries': entries, 'total_kg_co2e': round(total_kg, 4),
        'total_t_co2e': round(total_kg / 1000, 6),
    }, [{'type': 'scope1', 'entries': len(entries)}]

def _tool_narrative(tenant_id, inp):
    framework = inp.get('framework', 'OSFI_B15')
    period    = inp.get('period', 'current period')
    # Pull summary data to include in narrative generation (handled by another Claude call)
    return {
        'instruction': f'Generate a {framework} compliance narrative for {period}. Use the telemetry data already retrieved in this conversation to populate specific numbers (total kWh, total gCO2e, average carbon intensity, number of threshold incidents, data quality percentage). The narrative should be suitable for direct inclusion in a regulatory filing.',
        'framework': framework, 'period': period,
    }, [{'type': 'narrative_request', 'framework': framework}]
