import json, os, subprocess, boto3, re
from datetime import datetime, timezone, timedelta
from decimal import Decimal

TABLE = os.environ.get('GRID_CACHE_TABLE', 'gw-grid-cache-staging')
AESO_KEY = os.environ.get('AESO_API_KEY', '')
EM_TOKEN = os.environ.get('ELECTRICITY_MAPS_TOKEN', '')
AESO_BASE = 'https://apimgw.aeso.ca'
dynamo = boto3.resource('dynamodb', region_name='ca-central-1')
table = dynamo.Table(TABLE)

def curl_get(url, headers=None, timeout=12):
    cmd = ['curl', '-s', '--max-time', str(timeout), '--connect-timeout', '8',
           '--tlsv1.2', '-A', 'GridWitness/1.0',
           '-w', '\n__HTTP_CODE__%{http_code}']
    for k, v in (headers or {}).items():
        cmd += ['-H', f'{k}: {v}']
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout+3)
    if r.returncode == 6:
        raise RuntimeError('DNS_FAIL')
    if r.returncode not in (0, 28):
        raise RuntimeError(f'CURL_EXIT_{r.returncode}')
    body, _, code_line = r.stdout.rpartition('\n__HTTP_CODE__')
    http_code = int(code_line.strip() or '0')
    if http_code in (401, 403):
        raise RuntimeError('AUTH_FAIL')
    if http_code == 0 or http_code >= 400:
        raise RuntimeError(f'HTTP_{http_code}')
    return body

def aeso_headers():
    return {'API-KEY': AESO_KEY, 'Cache-Control': 'no-cache'}

def smp_to_intensity(smp):
    # Alberta merit order: wind/hydro -> cogen -> CCGT -> SCGT -> coal peakers
    if smp is None: return None
    if smp <= 15:  return 390.0   # wind + cogen dominant
    if smp <= 30:  return 430.0   # gas base load + renewables
    if smp <= 60:  return 470.0   # gas cycling
    if smp <= 100: return 520.0   # gas peaking
    if smp <= 200: return 600.0   # coal / emergency gas
    return 700.0                   # max demand / coal peak

def try_aeso_smp():
    if not AESO_KEY:
        return None, None, 'NO_KEY'
    # AESO uses Mountain Prevailing Time (UTC-6) for date params
    mpt_date = (datetime.now(timezone.utc) - timedelta(hours=6)).strftime('%Y-%m-%d')
    try:
        raw = curl_get(
            f'{AESO_BASE}/public/systemmarginalprice-api/v1.1/price/systemMarginalPrice?startDate={mpt_date}',
            headers=aeso_headers())
        data = json.loads(raw)
        rows = data.get('return', {}).get('System Marginal Price Report', [])
        if not rows:
            print(f'AESO SMP: empty response for MPT date {mpt_date}')
            return None, None, 'AESO_EMPTY'
        latest = rows[0]  # sorted newest first
        smp = float(latest.get('system_marginal_price', 0) or 0)
        intensity = smp_to_intensity(smp)
        print(f'AESO SMP: {smp} $/MWh -> CI estimate {intensity} gCO2/kWh (MPT {mpt_date})')
        return intensity, smp, 'AESO_SMP_LIVE'
    except Exception as e:
        print(f'AESO SMP failed: {e}')
        return None, None, str(e)[:20]

def try_aeso_pool_price():
    if not AESO_KEY:
        return None, 'NO_KEY'
    mpt_date = (datetime.now(timezone.utc) - timedelta(hours=6)).strftime('%Y-%m-%d')
    try:
        raw = curl_get(
            f'{AESO_BASE}/public/poolprice-api/v1.1/price/poolPrice?startDate={mpt_date}',
            headers=aeso_headers())
        data = json.loads(raw)
        rows = data.get('return', {}).get('Pool Price Report', [])
        if not rows:
            return None, 'AESO_EMPTY'
        latest = rows[0]
        # Use actual pool_price if available, else forecast
        price = latest.get('pool_price') or latest.get('forecast_pool_price') or '0'
        return float(price or 0), 'AESO_POOL'
    except Exception as e:
        print(f'AESO pool price failed: {e}')
        return None, str(e)[:20]

def try_electricity_maps():
    if not EM_TOKEN:
        return None, 'NO_TOKEN'
    try:
        raw = curl_get(
            'https://api.electricitymap.org/v3/carbon-intensity/latest?zone=CA-AB',
            headers={'auth-token': EM_TOKEN})
        data = json.loads(raw)
        ci = data.get('carbonIntensity')
        if ci is not None:
            return float(ci), 'ELECTRICITY_MAPS'
    except Exception as e:
        print(f'Electricity Maps failed: {e}')
    return None, 'EM_ERROR'

def time_estimate():
    mt_hour = (datetime.now(timezone.utc).hour - 6) % 24
    if   mt_hour < 6:  return 390.0
    elif mt_hour < 10: return 480.0
    elif mt_hour < 16: return 430.0
    elif mt_hour < 21: return 520.0
    return 460.0

def write_grid(grid_id, intensity, price, quality, source):
    now = datetime.now(timezone.utc).isoformat()
    table.put_item(Item={
        'GridID':           grid_id,
        'CapturedAt':       now,
        'CarbonIntensity':  Decimal(str(round(intensity, 2))),
        'CurrentIntensity': Decimal(str(round(intensity, 2))),
        'PoolPrice':        Decimal(str(round(price or 0, 4))),
        'Source':           source,
        'DataQuality':      quality,
        'UpdatedAt':        now,
    })
    print(f'Grid cache: {grid_id} CI={intensity:.1f} price={price or 0} quality={quality}')


TENANTS_TABLE    = os.environ.get('TENANTS_TABLE', 'gw-tenants-staging')
INCIDENTS_QUEUE  = os.environ.get('INCIDENTS_QUEUE',
    'https://sqs.ca-central-1.amazonaws.com/768949138583/gw-sqs-incidents-staging')

sqs          = boto3.client('sqs', region_name='ca-central-1')
tenant_table = boto3.resource('dynamodb', region_name='ca-central-1').Table(TENANTS_TABLE)

# Metric key → human label used as incident Metric field
METRIC_LABELS = {
    'carbon_intensity': 'carbon_intensity',
    'pool_price':       'pool_price',
}

def _send_incident_event(op, tenant_id, grid_id, metric, value, threshold=None, severity=None):
    msg = {'op': op, 'tenant_id': tenant_id, 'grid_id': grid_id,
           'metric': metric, 'value': value}
    if threshold is not None:
        msg['threshold'] = threshold
    if severity is not None:
        msg['severity'] = severity
    try:
        sqs.send_message(
            QueueUrl=INCIDENTS_QUEUE,
            MessageBody=json.dumps(msg),
            MessageGroupId=f'{tenant_id}-{grid_id}-{metric}',
        ) if INCIDENTS_QUEUE.endswith('.fifo') else sqs.send_message(
            QueueUrl=INCIDENTS_QUEUE,
            MessageBody=json.dumps(msg),
        )
    except Exception as e:
        print(f'SQS send failed for {tenant_id} {metric}: {e}')

def check_thresholds(live_grid):
    """
    Scan all tenants, compare live grid metrics against stored thresholds.
    Send open_or_update when breached, auto_close when recovered.
    live_grid = {'AB': {'carbon_intensity': 430.0, 'pool_price': 13.82}, ...}
    """
    try:
        resp = tenant_table.scan(
            ProjectionExpression='TenantID, GridThresholds',
        )
        tenants = resp.get('Items', [])
    except Exception as e:
        print(f'Tenant scan failed: {e}')
        return

    for tenant in tenants:
        tenant_id  = tenant.get('TenantID', '')
        thresholds = tenant.get('GridThresholds', {})
        if not tenant_id or not thresholds:
            continue

        for grid_id, live_metrics in live_grid.items():
            grid_thresh = thresholds.get(grid_id)
            if not grid_thresh:
                continue

            # carbon_intensity threshold
            carbon_thresh = float(grid_thresh.get('carbon', 999999) or 999999)
            live_ci = live_metrics.get('carbon_intensity')
            if live_ci is not None:
                if live_ci > carbon_thresh:
                    severity = 'CRITICAL' if live_ci > carbon_thresh * 1.2 else 'WARNING'
                    _send_incident_event('open_or_update', tenant_id, grid_id,
                                         'carbon_intensity', live_ci, carbon_thresh, severity)
                    print(f'Incident BREACH: {tenant_id} {grid_id} carbon {live_ci:.1f} > {carbon_thresh}')
                else:
                    _send_incident_event('auto_close', tenant_id, grid_id,
                                         'carbon_intensity', live_ci)

            # pool_price threshold
            price_thresh = float(grid_thresh.get('price', 999999) or 999999)
            live_price = live_metrics.get('pool_price')
            if live_price is not None:
                if live_price > price_thresh:
                    severity = 'CRITICAL' if live_price > price_thresh * 1.5 else 'WARNING'
                    _send_incident_event('open_or_update', tenant_id, grid_id,
                                         'pool_price', live_price, price_thresh, severity)
                    print(f'Incident BREACH: {tenant_id} {grid_id} price {live_price:.2f} > {price_thresh}')
                else:
                    _send_incident_event('auto_close', tenant_id, grid_id,
                                         'pool_price', live_price)


# IESO emission factors (gCO2/kWh) — IPCC/NEB sources
IESO_CI_FACTORS = {
    'NUCLEAR': 12, 'HYDRO': 4, 'WIND': 11,
    'SOLAR': 41, 'GAS': 370, 'BIOFUEL': 230, 'OTHER': 200,
}
IESO_URL = 'http://reports.ieso.ca/public/GenOutputbyFuelHourly/PUB_GenOutputbyFuelHourly.xml'

def try_ieso_ontario():
    """Fetch tail of IESO hourly fuel mix XML, return weighted CI for last available hour."""
    try:
        cmd = [
            'curl', '-sL', '--max-time', '15', '--connect-timeout', '8',
            '--tlsv1.2', '-A', 'GridWitness/1.0',
            '--range', '-40000',        # last ~40 KB — covers >1 full day of hourly data
            IESO_URL,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=18)
        if r.returncode not in (0, 28):
            print(f'IESO curl exit {r.returncode}')
            return None, 'IESO_CURL_ERR'

        xml = r.stdout
        blocks = re.findall(r'<HourlyData>(.*?)</HourlyData>', xml, re.DOTALL)
        if not blocks:
            print('IESO: no HourlyData blocks in tail')
            return None, 'IESO_PARSE_ERR'

        # Use the last complete hour (most recent published)
        last = blocks[-1]
        fuels = dict(re.findall(
            r'<Fuel>(\w+)</Fuel>.*?<Output>(\d+)</Output>', last, re.DOTALL
        ))
        fuel_mw = {k: int(v) for k, v in fuels.items()}
        total_mw = sum(fuel_mw.values())
        if total_mw < 1000:             # sanity check — ON grid is always >8 GW
            print(f'IESO: implausible total {total_mw} MW, skipping')
            return None, 'IESO_LOW_TOTAL'

        weighted_ci = sum(
            fuel_mw.get(f, 0) * IESO_CI_FACTORS.get(f, 200) for f in fuel_mw
        ) / total_mw

        hour_m = re.search(r'<Hour>(\d+)</Hour>', last)
        hour = int(hour_m.group(1)) if hour_m else 0
        pct_clean = 100 * (fuel_mw.get('NUCLEAR',0) + fuel_mw.get('HYDRO',0) + fuel_mw.get('WIND',0) + fuel_mw.get('SOLAR',0)) / total_mw
        print(f'IESO ON: hour={hour} total={total_mw}MW CI={weighted_ci:.1f} gCO2/kWh clean={pct_clean:.0f}% fuel={fuel_mw}')
        return round(weighted_ci, 1), 'IESO_LIVE'

    except Exception as e:
        print(f'IESO ON failed: {e}')
        return None, str(e)[:30]

def lambda_handler(event, context):
    ab_intensity = None
    ab_price = None
    ab_quality = 'FALLBACK'
    ab_source = 'ESTIMATED'

    # 1. Try AESO SMP (real-time, every few minutes)
    ci, smp, q = try_aeso_smp()
    if ci is not None:
        ab_intensity = ci
        ab_quality = 'AESO_SMP_LIVE'
        ab_source = f'AESO_SMP_{smp:.2f}$/MWh'
        # Pool price: call AESO at most once per clock hour (settles hourly).
        # Cache last fetched price in a dedicated DynamoDB row to avoid 288 calls/day.
        try:
            from decimal import Decimal as _Dec
            _now_h = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
            _PRICE_KEY = {'GridID': 'AB_PRICE_META', 'CapturedAt': 'v1'}
            _meta = table.get_item(Key=_PRICE_KEY).get('Item', {})
            if _meta.get('Hour') == _now_h and _meta.get('PoolPrice') not in (None, '', 0):
                ab_price = float(_meta['PoolPrice'])
                print(f'Pool price cache HIT: {ab_price:.2f} $/MWh (hour {_now_h})')
            else:
                pool_price, _ = try_aeso_pool_price()
                ab_price = pool_price or smp
                table.put_item(Item={
                    **_PRICE_KEY,
                    'Hour': _now_h,
                    'PoolPrice': _Dec(str(ab_price or 0)),
                    'FetchedAt': datetime.now(timezone.utc).isoformat(),
                })
                print(f'Pool price API call: {ab_price} $/MWh (cached for hour {_now_h})')
        except Exception as _pe:
            print(f'Pool price cache error: {_pe} — calling API directly')
            pool_price, _ = try_aeso_pool_price()
            ab_price = pool_price or smp

    # 2. Fallback: Electricity Maps
    if ab_intensity is None:
        ci, q = try_electricity_maps()
        if ci is not None:
            ab_intensity = ci
            ab_quality = 'ELECTRICITY_MAPS_LIVE'
            ab_source = 'ElectricityMaps/CA-AB'

    # 3. Fallback: time-of-day heuristic
    if ab_intensity is None:
        ab_intensity = time_estimate()
        ab_quality = 'TIME_ESTIMATED'
        ab_source = 'TIME_HEURISTIC'

    write_grid('AB', ab_intensity, ab_price or 0, ab_quality, ab_source)
    write_grid('BC', 15.0, 0, 'ESTIMATED', 'BC_Hydro_Est')
    on_ci, on_q = try_ieso_ontario()
    if on_ci is not None:
        write_grid('ON', on_ci, 0, 'IESO_LIVE', 'IESO/GenOutputbyFuelHourly')
    else:
        write_grid('ON', 40.0, 0, 'ESTIMATED', 'IESO_Est_' + on_q)
    write_grid('QC',  2.0, 0, 'ESTIMATED', 'HydroQC_Est')

    # Check thresholds for all active tenants and fire incident events
    check_thresholds({
        'AB': {'carbon_intensity': float(ab_intensity), 'pool_price': float(ab_price or 0)},
        'BC': {'carbon_intensity': 15.0},
        'ON': {'carbon_intensity': float(on_ci or 40.0)},
        'QC': {'carbon_intensity': 2.0},
    })

    return {'statusCode': 200, 'body': json.dumps({
        'ab_intensity': float(ab_intensity),
        'ab_price': float(ab_price or 0),
        'ab_quality': ab_quality,
        'ab_source': ab_source,
    })}
