"""
gw-ms-incident-manager — Grid Stress Incident Lifecycle Manager
═══════════════════════════════════════════════════════════════════════

Responsibilities:
  1. OPEN incident on threshold breach detected by Grid Oracle
     (deduplicates: only one open incident per tenant+grid+metric)
  2. CLOSE incident automatically when metric returns below threshold
  3. RECORD tenant actions (Acknowledge, K8s scale-down, Manual reduction)
  4. STAMP every lifecycle event to WORM ledger (SHA-256 hash chain to S3)
  5. NOTIFY tenant via SNS email on open and close
  6. LIST incidents for dashboard

Routes / triggers (via API Gateway and SQS):
  - SQS message from Grid Oracle  → open_or_update_incident
  - GET    /api/incidents          → list_incidents
  - POST   /api/incidents/{id}/action → record_action
  - POST   /api/incidents/{id}/close  → manual close (force)

WORM Ledger format:
  s3://gw-compliance-vault-.../incidents/{tenant}/{YYYY-MM}/{IncidentID}-{seq}.json
  Each record includes:
    - prev_hash       (SHA-256 of previous event in chain)
    - event_hash      (SHA-256 of this event)
    - tenant_id
    - incident_id
    - event_type      (OPENED|ACTION|CLOSED|AUTO_CLOSED)
    - timestamp
    - actor           (system|user_email)
    - metadata        (full event payload)
═══════════════════════════════════════════════════════════════════════
"""
import os
import json
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─── Resources ──────────────────────────────────────────────────────
dynamodb         = boto3.resource("dynamodb", region_name="ca-central-1")
s3               = boto3.client("s3", region_name="ca-central-1")
sns              = boto3.client("sns", region_name="ca-central-1")

INCIDENTS_TABLE  = os.environ.get("INCIDENTS_TABLE",  "gw-incidents-staging")
TENANTS_TABLE    = os.environ.get("TENANTS_TABLE",    "gw-tenants-staging")
VAULT_BUCKET     = os.environ.get("VAULT_BUCKET",     "gw-compliance-vault-768949138583")
ALERTS_TOPIC_ARN = os.environ.get("ALERTS_TOPIC_ARN", "")

inc_table        = dynamodb.Table(INCIDENTS_TABLE)
tenant_table     = dynamodb.Table(TENANTS_TABLE)


# ════════════════════════════════════════════════════════════════════
# CORS helpers
# ════════════════════════════════════════════════════════════════════
CORS_HEADERS = {
    "Content-Type":                 "application/json",
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Tenant-ID",
}


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers":    CORS_HEADERS,
        "body":       json.dumps(body, default=_json_default),
    }


def _json_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    return str(obj)


# ════════════════════════════════════════════════════════════════════
# WORM Ledger — SHA-256 hash chain to S3
# ════════════════════════════════════════════════════════════════════
def _get_last_hash(tenant_id: str, incident_id: str) -> str:
    """Return the most recent event hash for this incident, or genesis."""
    try:
        prefix = f"incidents/{tenant_id}/"
        resp = s3.list_objects_v2(
            Bucket=VAULT_BUCKET,
            Prefix=prefix,
        )
        # Filter by this incident_id and find newest
        objects = [o for o in resp.get("Contents", []) if incident_id in o["Key"]]
        if not objects:
            return "0" * 64  # genesis hash
        latest = sorted(objects, key=lambda x: x["LastModified"], reverse=True)[0]
        body   = s3.get_object(Bucket=VAULT_BUCKET, Key=latest["Key"])["Body"].read()
        prev   = json.loads(body)
        return prev.get("event_hash", "0" * 64)
    except Exception as e:
        logger.warning(f"Hash chain lookup failed: {e} — using genesis")
        return "0" * 64


def _next_seq(tenant_id: str, incident_id: str) -> int:
    """Return next sequence number for this incident's ledger entries."""
    try:
        prefix = f"incidents/{tenant_id}/"
        resp = s3.list_objects_v2(Bucket=VAULT_BUCKET, Prefix=prefix)
        objects = [o for o in resp.get("Contents", []) if incident_id in o["Key"]]
        return len(objects) + 1
    except Exception:
        return 1


def _stamp_to_worm(tenant_id: str, incident_id: str, event_type: str,
                   actor: str, metadata: dict) -> dict:
    """Append a WORM-sealed event to the hash chain. Returns the sealed record."""
    timestamp = datetime.now(timezone.utc).isoformat()
    seq       = _next_seq(tenant_id, incident_id)
    prev_hash = _get_last_hash(tenant_id, incident_id)

    payload = {
        "tenant_id":  tenant_id,
        "incident_id": incident_id,
        "event_type": event_type,
        "timestamp":  timestamp,
        "actor":      actor,
        "sequence":   seq,
        "prev_hash":  prev_hash,
        "metadata":   metadata,
    }

    canonical = json.dumps(payload, sort_keys=True, default=_json_default)
    event_hash = hashlib.sha256(canonical.encode()).hexdigest()
    payload["event_hash"] = event_hash

    month     = timestamp[:7]
    s3_key    = f"incidents/{tenant_id}/{month}/{incident_id}-{seq:04d}.json"
    s3.put_object(
        Bucket=VAULT_BUCKET,
        Key=s3_key,
        Body=json.dumps(payload, default=_json_default).encode(),
        ContentType="application/json",
        ServerSideEncryption="aws:kms",
        Metadata={
            "tenant-id":   tenant_id,
            "incident-id": incident_id,
            "event-type":  event_type,
            "seq":         str(seq),
        },
    )
    logger.info(f"WORM-stamped {event_type} for {incident_id} (seq {seq}, hash {event_hash[:16]}...)")
    return payload


# ════════════════════════════════════════════════════════════════════
# Tenant lookup — get alert email + thresholds
# ════════════════════════════════════════════════════════════════════
def _get_tenant_alert_config(tenant_id: str) -> dict:
    """Return tenant's alert email and per-grid thresholds."""
    try:
        resp = tenant_table.get_item(Key={"TenantID": tenant_id})
        item = resp.get("Item", {})
        return {
            "alert_email": item.get("AlertEmail", item.get("AdminEmail", "")),
            "thresholds":  item.get("GridThresholds", {}),
            "org_name":    item.get("OrganizationName", tenant_id),
        }
    except Exception as e:
        logger.warning(f"Tenant lookup failed for {tenant_id}: {e}")
        return {"alert_email": "", "thresholds": {}, "org_name": tenant_id}


# ════════════════════════════════════════════════════════════════════
# Notifications — SNS email
# ════════════════════════════════════════════════════════════════════
def _notify(tenant_id: str, subject: str, message: str):
    if not ALERTS_TOPIC_ARN:
        logger.warning("ALERTS_TOPIC_ARN not configured — skipping SNS notify")
        return
    try:
        sns.publish(
            TopicArn=ALERTS_TOPIC_ARN,
            Subject=subject[:100],
            Message=message,
            MessageAttributes={
                "tenant_id": {"DataType": "String", "StringValue": tenant_id},
            },
        )
        logger.info(f"SNS notify sent: {subject}")
    except Exception as e:
        logger.error(f"SNS publish failed: {e}")


# ════════════════════════════════════════════════════════════════════
# Incident operations
# ════════════════════════════════════════════════════════════════════
def _find_open_incident(tenant_id: str, grid_id: str, metric: str) -> dict:
    """Return open incident matching tenant+grid+metric, or None."""
    try:
        resp = inc_table.query(
            IndexName="TenantID-Status-index",
            KeyConditionExpression=Key("TenantID").eq(tenant_id) & Key("Status").eq("OPEN"),
        )
        for item in resp.get("Items", []):
            if item.get("GridID") == grid_id and item.get("Metric") == metric:
                return item
        return None
    except ClientError as e:
        logger.error(f"Query open incidents failed: {e}")
        return None


def open_or_update_incident(payload: dict) -> dict:
    """Called by Grid Oracle on threshold breach. Idempotent — only one open per tenant+grid+metric."""
    tenant_id    = payload["tenant_id"]
    grid_id      = payload["grid_id"]
    metric       = payload["metric"]               # e.g. "carbon_intensity" | "load_pct" | "price_mwh"
    breach_value = float(payload["value"])
    threshold    = float(payload["threshold"])
    severity     = payload.get("severity", "WARNING")

    existing = _find_open_incident(tenant_id, grid_id, metric)
    if existing:
        # Update peak value if exceeded
        peak = float(existing.get("PeakValue", breach_value))
        if breach_value > peak:
            inc_table.update_item(
                Key={"TenantID": tenant_id, "IncidentID": existing["IncidentID"]},
                UpdateExpression="SET PeakValue = :v, LastObservedAt = :t, ObservationCount = ObservationCount + :one",
                ExpressionAttributeValues={
                    ":v":   Decimal(str(breach_value)),
                    ":t":   datetime.now(timezone.utc).isoformat(),
                    ":one": 1,
                },
            )
            logger.info(f"Updated peak for incident {existing['IncidentID']}: {breach_value}")
        return {"action": "updated_existing", "incident_id": existing["IncidentID"]}

    # Create new incident
    incident_id = f"INC-{tenant_id[:8]}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    now         = datetime.now(timezone.utc).isoformat()

    item = {
        "TenantID":         tenant_id,
        "IncidentID":       incident_id,
        "GridID":           grid_id,
        "Metric":           metric,
        "Status":           "OPEN",
        "Severity":         severity,
        "BreachValue":      Decimal(str(breach_value)),
        "PeakValue":        Decimal(str(breach_value)),
        "Threshold":        Decimal(str(threshold)),
        "OpenedAt":         now,
        "LastObservedAt":   now,
        "ObservationCount": 1,
        "LastAction":       "none",
        "ActionsTaken":     [],
    }
    inc_table.put_item(Item=item)

    sealed = _stamp_to_worm(tenant_id, incident_id, "OPENED",
                            actor="grid-oracle",
                            metadata={
                                "grid_id":       grid_id,
                                "metric":        metric,
                                "breach_value":  breach_value,
                                "threshold":     threshold,
                                "severity":      severity,
                            })

    cfg = _get_tenant_alert_config(tenant_id)
    if cfg["alert_email"]:
        _notify(tenant_id,
                f"[GridWitness] Grid Stress Incident OPENED — {grid_id} {metric}",
                f"""A grid stress incident has been opened for {cfg['org_name']}.

Incident ID:    {incident_id}
Grid:           {grid_id}
Metric:         {metric}
Current Value:  {breach_value}
Your Threshold: {threshold}
Severity:       {severity}
Opened At:      {now}

This incident is WORM-sealed to the immutable ledger.
Hash:           {sealed['event_hash']}

Review and take action: https://gridwitness-dashboard.vercel.app/incidents

All actions (or inaction) are recorded for OSFI B-15 \u00a77.1 audit evidence.
""")

    logger.info(f"Opened incident {incident_id}")
    return {"action": "opened", "incident_id": incident_id, "sealed_hash": sealed["event_hash"]}


def auto_close_if_recovered(payload: dict) -> dict:
    """Grid Oracle sends this when metric returns below threshold."""
    tenant_id = payload["tenant_id"]
    grid_id   = payload["grid_id"]
    metric    = payload["metric"]
    value     = float(payload["value"])

    existing = _find_open_incident(tenant_id, grid_id, metric)
    if not existing:
        return {"action": "no_open_incident"}

    incident_id = existing["IncidentID"]
    now         = datetime.now(timezone.utc).isoformat()

    inc_table.update_item(
        Key={"TenantID": tenant_id, "IncidentID": incident_id},
        UpdateExpression="SET #s = :c, ClosedAt = :t, ClosureValue = :v, ClosureReason = :r",
        ExpressionAttributeNames={"#s": "Status"},
        ExpressionAttributeValues={
            ":c": "CLOSED",
            ":t": now,
            ":v": Decimal(str(value)),
            ":r": "AUTO_CLOSED_BELOW_THRESHOLD",
        },
    )

    sealed = _stamp_to_worm(tenant_id, incident_id, "AUTO_CLOSED",
                            actor="grid-oracle",
                            metadata={
                                "closure_value":  value,
                                "closure_reason": "metric returned below threshold",
                            })

    cfg = _get_tenant_alert_config(tenant_id)
    if cfg["alert_email"]:
        _notify(tenant_id,
                f"[GridWitness] Incident CLOSED — {grid_id} {metric}",
                f"""Grid stress incident {incident_id} has auto-closed.

The metric ({metric}) has returned below your configured threshold.

Incident ID:    {incident_id}
Closure Value:  {value}
Closure Reason: metric returned below threshold
Closed At:      {now}
WORM Hash:      {sealed['event_hash']}

This closure is sealed to the immutable ledger and will appear in the
next OSFI B-15 compliance report.
""")

    return {"action": "auto_closed", "incident_id": incident_id, "sealed_hash": sealed["event_hash"]}


def record_action(tenant_id: str, incident_id: str, action: str,
                  actor_email: str, notes: str = "") -> dict:
    """Record a tenant action: Acknowledge | K8s_Scale_Down | Manual_Power_Reduction."""
    valid_actions = {"Acknowledge", "K8s_Scale_Down", "Manual_Power_Reduction"}
    if action not in valid_actions:
        raise ValueError(f"Invalid action {action}. Must be one of {valid_actions}")

    now = datetime.now(timezone.utc).isoformat()
    inc_table.update_item(
        Key={"TenantID": tenant_id, "IncidentID": incident_id},
        UpdateExpression=(
            "SET LastAction = :a, LastActionAt = :t, "
            "ActionsTaken = list_append(if_not_exists(ActionsTaken, :empty), :new)"
        ),
        ExpressionAttributeValues={
            ":a":     action,
            ":t":     now,
            ":empty": [],
            ":new":   [{"action": action, "at": now, "by": actor_email, "notes": notes}],
        },
    )

    sealed = _stamp_to_worm(tenant_id, incident_id, "ACTION",
                            actor=actor_email,
                            metadata={"action": action, "notes": notes})

    return {"action": "recorded", "incident_id": incident_id, "sealed_hash": sealed["event_hash"]}


def list_incidents(tenant_id: str, status_filter: str = "") -> list:
    """Return all incidents for a tenant, optionally filtered by Status."""
    try:
        if status_filter:
            resp = inc_table.query(
                IndexName="TenantID-Status-index",
                KeyConditionExpression=Key("TenantID").eq(tenant_id) & Key("Status").eq(status_filter),
            )
        else:
            resp = inc_table.query(
                IndexName="TenantID-OpenedAt-index",
                KeyConditionExpression=Key("TenantID").eq(tenant_id),
                ScanIndexForward=False,  # newest first
                Limit=50,
            )
        return resp.get("Items", [])
    except ClientError as e:
        logger.error(f"List incidents failed: {e}")
        return []


# ════════════════════════════════════════════════════════════════════
# Entry point — handles SQS, API Gateway, and direct invoke
# ════════════════════════════════════════════════════════════════════
def lambda_handler(event, context):
    logger.info(f"Event keys: {list(event.keys())}")

    # ─── SQS event from Grid Oracle ───────────────────────────────
    if "Records" in event and event["Records"] and event["Records"][0].get("eventSource") == "aws:sqs":
        results = []
        failures = []
        for record in event["Records"]:
            try:
                payload = json.loads(record["body"])
                op = payload.get("op", "open_or_update")
                if op == "open_or_update":
                    r = open_or_update_incident(payload)
                elif op == "auto_close":
                    r = auto_close_if_recovered(payload)
                else:
                    raise ValueError(f"Unknown op: {op}")
                results.append(r)
            except Exception as e:
                logger.error(f"Failed processing SQS record: {e}")
                failures.append({"itemIdentifier": record.get("messageId")})
        return {"batchItemFailures": failures}

    # ─── API Gateway HTTP event ────────────────────────────────────
    path   = event.get("rawPath", "")
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    params = event.get("queryStringParameters", {}) or {}

    if method == "OPTIONS":
        return _response(200, {})

    try:
        # GET /api/incidents?tenant_id=...&status=OPEN
        if method == "GET" and "/api/incidents" in path:
            tenant_id     = params.get("tenant_id")
            status_filter = params.get("status", "")
            if not tenant_id:
                return _response(400, {"error": "tenant_id required"})
            items = list_incidents(tenant_id, status_filter)
            return _response(200, {"incidents": items, "count": len(items)})

        # POST /api/incidents/{id}/action
        if method == "POST" and "/action" in path:
            body        = json.loads(event.get("body", "{}"))
            tenant_id   = body.get("tenant_id")
            incident_id = body.get("incident_id")
            action      = body.get("action")
            actor       = body.get("actor_email", "system")
            notes       = body.get("notes", "")
            if not all([tenant_id, incident_id, action]):
                return _response(400, {"error": "tenant_id, incident_id, action required"})
            r = record_action(tenant_id, incident_id, action, actor, notes)
            return _response(200, r)

        # POST /api/incidents/{id}/close (manual force-close)
        if method == "POST" and "/close" in path:
            body        = json.loads(event.get("body", "{}"))
            tenant_id   = body.get("tenant_id")
            incident_id = body.get("incident_id")
            actor       = body.get("actor_email", "system")
            reason      = body.get("reason", "manual_close")
            now = datetime.now(timezone.utc).isoformat()
            inc_table.update_item(
                Key={"TenantID": tenant_id, "IncidentID": incident_id},
                UpdateExpression="SET #s = :c, ClosedAt = :t, ClosureReason = :r",
                ExpressionAttributeNames={"#s": "Status"},
                ExpressionAttributeValues={":c": "CLOSED", ":t": now, ":r": reason},
            )
            sealed = _stamp_to_worm(tenant_id, incident_id, "CLOSED",
                                    actor=actor,
                                    metadata={"reason": reason})
            return _response(200, {"action": "closed", "sealed_hash": sealed["event_hash"]})

        return _response(404, {"error": f"Unknown route {method} {path}"})

    except Exception as e:
        logger.exception(f"Unhandled error: {e}")
        return _response(500, {"error": str(e)})
