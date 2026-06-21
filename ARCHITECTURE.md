# GridWitness Platform — Architecture & Feature Reference

> **Audience:** Software architects, backend engineers, DevOps, technical reviewers.
> **Purpose:** Single source of truth for what is built, how it works, and what is coming next.
> **Maintenance:** Update this file with every feature addition, schema change, or infrastructure change.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Technology Stack](#2-technology-stack)
3. [Infrastructure Map](#3-infrastructure-map)
4. [DynamoDB Schema Reference](#4-dynamodb-schema-reference)
5. [Lambda Microservices](#5-lambda-microservices)
6. [API Gateway Routes](#6-api-gateway-routes)
7. [Frontend Pages](#7-frontend-pages)
8. [Data Flow Diagrams](#8-data-flow-diagrams)
9. [Security Model](#9-security-model)
10. [Regulatory Compliance Mapping](#10-regulatory-compliance-mapping)
11. [Feature Inventory — Built](#11-feature-inventory--built)
12. [Feature Inventory — Pipeline](#12-feature-inventory--pipeline)
13. [Known Limitations](#13-known-limitations)
14. [Deployment Runbook](#14-deployment-runbook)
15. [Change Log](#15-change-log)

---

## 1. Platform Overview

**GridWitness** is a real-time, hardware-anchored greenhouse gas (GHG) emissions accounting and regulatory disclosure platform targeting Canadian mid-market organizations operating under:

- OSFI Guideline B-15 (Climate Risk Management, effective Jan 2024)
- Bill C-59 / Canadian Competition Act anti-greenwashing provisions (June 2024)
- CSA NI 51-107 climate disclosure rules
- IFRS S2 / CSDS 2 (CSSB, effective for fiscal years beginning Jan 2025)
- TCFD framework (embedded in CSA mandatory rules)
- Alberta TIER (Technology Innovation and Emissions Reduction)
- GHG Protocol Corporate Standard + Scope 2 Guidance

**Primary differentiators vs. enterprise incumbents (IBM Envizi, Salesforce Net Zero Cloud, Watershed):**

| Capability | GridWitness | Enterprise incumbents |
|---|---|---|
| Hardware-level power telemetry (BMC Redfish, GPU, ASIC) | Yes — agent-based, per-device | No — invoice/bill upload only |
| WORM immutable ledger with SHA-256 hash chain | Yes — DynamoDB + S3 Object Lock | No — mutable database records |
| Live AESO grid carbon intensity compositing | Yes — 5-min polling, per-record CO₂e | No — monthly grid average |
| Digital board attestation with cryptographic seal | Yes — SHA-256, S3 Object Lock COMPLIANCE, 7yr | E-signature only (no hash seal) |
| Alberta TIER + Bill C-59 specific logic | Yes — REC certification validation, C59 flag | No — US/EU generic |
| Price point | Mid-market (SaaS) | $300K–$800K/yr, requires SI implementation |

---

## 2. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS | `'use client'` components throughout; dark theme |
| Hosting | EC2 `t3.small`, ca-central-1, Ubuntu 22.04 | PM2 process manager, nginx reverse proxy; live at **gridwitness.ca** |
| Auth | Amazon Cognito User Pool | SSO, JWT session cookie `gw_session` (8h TTL), middleware route guard |
| API | AWS API Gateway HTTP v2 (`rdof7lrwfj`) | PayloadFormatVersion 2.0, `$default` stage |
| Compute | AWS Lambda Python 3.12 | All microservices serverless; reportlab layer for PDF |
| Database | Amazon DynamoDB | 15 tables, all `*-staging` suffix; ca-central-1 |
| Storage | Amazon S3 (`gw-compliance-vault-768949138583`) | Object Lock COMPLIANCE mode, 7-year retention for seals/PDFs |
| Messaging | Amazon SNS (`gw-data-layer-alerts-staging`) | Budget alerts, attestation notifications |
| Scheduling | Amazon EventBridge | Budget monitor (1h), grid oracle (5min), filing reminders (daily) |
| Telemetry ingest | SQS → Lambda Oracle | Async, WORM-sealed on write; hash chain maintained |
| PDF generation | reportlab 4.x | Lambda layer `gw-reportlab-layer-staging:3` |
| Version control | GitHub (`myshariff123/gridwitness-dashboard`) | Main branch; deploy via git push + SSH pull |
| IaC | Manual AWS CLI / Python deploy scripts | No Terraform yet |

**Environment variables pattern:**
- `NEXT_PUBLIC_API_URL` — API Gateway base URL (set in Next.js build)
- All Lambda env vars default to `*-staging` table/queue names
- Anthropic API key stored in AWS Secrets Manager (`gw/anthropic/api-key`) — **never in code or Lambda env vars**

---

## 3. Infrastructure Map

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  Next.js 14 (EC2 16.174.1.7, nginx, PM2)               │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────┐
│  API Gateway HTTP v2 (rdof7lrwfj.execute-api...)        │
│  $default stage · CORS * · PayloadFormat 2.0           │
└──┬──────────────────────────────────────────────────────┘
   │ Lambda proxy integrations
   ▼
┌──────────────────────────────────────────────────────────────────┐
│  Lambda Microservices (Python 3.12, ca-central-1)                │
│                                                                  │
│  Telemetry Oracle ──► DynamoDB gw-telemetry-staging (WORM)      │
│  Grid Oracle ───────► DynamoDB gw-grid-cache-staging             │
│  Budget Monitor ────► DynamoDB gw-carbon-budget-staging          │
│  Incident Manager ──► DynamoDB gw-incidents-staging              │
│  TCFD Report ───────► S3 (PDF) + DynamoDB gw-tcfd-staging        │
│  IFRS S2 Report ────► S3 (PDF) + DynamoDB gw-ifrs-s2-staging     │
│  Attestation ───────► S3 (seal.json, Object Lock) + DDB          │
│  Emissions Summary ─► DDB (multi-table read, canonical output)   │
│  REC Tracker ───────► DynamoDB gw-recs-staging                   │
│  Offset Registry ───► DynamoDB gw-offsets-staging                │
│  OSFI Report ───────► S3 (PDF) + telemetry/scope1/scope3/sbti    │
│  Filing Calendar ───► DynamoDB gw-filing-calendar-staging        │
└──────────────────────────────────────────────────────────────────┘

EventBridge Rules:
  rate(5 minutes)  → gw-grid-oracle-lambda-staging (AESO live)
  rate(1 hour)     → gw-ms-budget-monitor-staging (threshold check)
  rate(1 day)      → gw-ms-filing-reminder-staging (deadline alerts)

Telemetry Ingest (agent → platform):
  Agent (Redfish/GPU/ASIC/OS) → POST /api/telemetry/live
                               → SQS → Oracle Lambda
                               → DynamoDB (WORM) + S3 hash chain

S3 Bucket: gw-compliance-vault-768949138583
  /attestations/{TenantID}/{AttestationID}/seal.json  (Object Lock COMPLIANCE, 7yr)
  /tcfd-reports/{TenantID}/{ReportID}.pdf             (Object Lock GOVERNANCE)
  /ifrs-s2-reports/{TenantID}/{ReportID}.pdf
  /osfi-reports/{TenantID}/{ReportID}.pdf
```

---

## 4. DynamoDB Schema Reference

> All tables in `ca-central-1`. Suffix: `-staging`.

### gw-tenants-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | `GW-{ORG}-{8hex}` |
| Fields | | OrgName, Industry, Province, City, EmployeeCount, RevenueCAD, FiscalYearEnd, PrimaryContact, CreatedAt |

### gw-telemetry-staging *(WORM — IAM deny UpdateItem/DeleteItem)*
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `Timestamp` | String | ISO 8601 UTC |
| Fields | | Source, InfraType, GridID, Actual_Wattage, CarbonDebt_gCO2, CO2e_g, gCO2e, DataSource |
| Hash chain | `HashChain`, `PrevHash` | SHA-256 over canonical record |

**Important:** Scope 2 scan reads `CarbonDebt_gCO2 || CO2e_g || gCO2e` (any present field). Filter by `DataSource != CLOUD_DISCOVERY` to exclude Scope 3 cloud records.

### gw-scope1-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `RecordedAt` | String | ISO 8601 |
| Fields | | FuelType, Quantity, Unit, kgCO2e, Year, Notes, PeriodStart, PeriodEnd |

### gw-scope3-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `YearMonth` | String | `"2026-06"` format (**not** PeriodStart) |
| Fields | | Category, Source, TotalKgCO2, ComputeHours, Notes |

### gw-tcfd-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `Section` | String | `GOVERNANCE` \| `STRATEGY` \| `RISK_MGMT` \| `METRICS_CONFIG` |
| Fields | | Section-specific JSON fields |

### gw-ifrs-s2-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `Section` | String | `IFRS_CONFIG` \| `SASB_METRICS` \| `CAPITAL_DEPLOYMENT` |

### gw-incidents-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `IncidentID` | String | `INC-{8hex}` |
| Fields | | Source, GridID, Metric, Severity (CRITICAL/HIGH/MEDIUM/WARNING), Status (OPEN/CLOSED), BreachValue, PeakValue, Threshold, ObservationCount, OpenedAt, ClosedAt, LastAction, LastActionAt |

### gw-attestations-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `AttestationID` | String | `ATT-{8hex}` |
| Fields | | AttestationToken (UUID hex), ReportType, ReportID, AttesterEmail, AttesterName, AttesterTitle, OrgName, Summary, Status (PENDING/SEALED), SealHash (SHA-256 hex, 64 chars), SealS3Key, SealedAt, RequestedAt, AttestationLink |

### gw-recs-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `RECID` | String | `REC-{8hex}` |
| Fields | | Type (BUNDLED/UNBUNDLED/PPA/VPPA), Provider, CertificateNo, CertifiedBy (EcoLogo/Green-e/I-REC/TIGR/RE100/IREC), MWh, VintageYear, FuelType, Province, PricePerMwh, Status (ACTIVE/RETIRED), RetiredFor (year int), Deleted (bool) |

### gw-offsets-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `OffsetID` | String | `OFF-{8hex}` |
| Fields | | Registry (GOLD_STANDARD/VCS/TIER/ACR/CAR/ECOTRUST/OBIN/CUSTOM), SerialNo, ProjectName, ProjectType, QuantityTco2, VintageYear, Country, PricePerTco2, CoRegistryUrl, Status (ACTIVE/RETIRED), RetiredFor (year int), Deleted (bool) |

### gw-filing-calendar-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| SK: `DeadlineID` | String | `CAL-{YYYY}-{CODE}` |
| Fields | | Title, Framework (OSFI/TCFD/IFRS/TIER/GHG_PROTO/ISO_14064/CDP), DueDate, Status (UPCOMING/DUE_SOON/OVERDUE/FILED), Priority (MANDATORY/VOLUNTARY), Notes, FiledAt, FiledNote |

### gw-carbon-budget-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| Fields | | AnnualBudgetKg (int), PeriodType (monthly/quarterly), Year, Thresholds ([80,95,100] pct), notification_email |

### gw-sbti-staging
| Key | Type | Values |
|---|---|---|
| PK: `TenantID` | String | |
| Fields | | TargetType (1.5C/WB2C/CUSTOM), TargetYear, BaselineYear, BaselineEmissionsTco2, AnnualReductionRate, Scope12ReductionPct, Scope3ReductionPct, CommittedAt, CertificationStatus (COMMITTED/APPROVED/SUBMITTED) |

---

## 5. Lambda Microservices

| Function Name | Trigger | Route(s) | Key Tables |
|---|---|---|---|
| `gw-ms-telemetry-oracle-staging` | SQS (ingest) | — | gw-telemetry-staging |
| `gw-ms-telemetry-live-staging` | API GW | GET /api/telemetry | gw-telemetry-staging |
| `gw-grid-oracle-lambda-staging` | EventBridge 5min | — | gw-grid-cache-staging (AESO) |
| `gw-ms-grid-status-staging` | API GW | GET /api/grid-status | gw-grid-cache-staging |
| `gw-ms-carbon-budget-staging` | API GW | GET/PUT/DELETE /api/tenants/{id}/budget | gw-carbon-budget-staging |
| `gw-ms-budget-monitor-staging` | EventBridge 1h | — | gw-carbon-budget-staging, gw-incidents-staging, SNS |
| `gw-ms-incident-manager-staging` | API GW | GET/PUT /api/tenants/{id}/incidents | gw-incidents-staging |
| `gw-ms-anomaly-detector-staging` | API GW (trigger) | — | gw-telemetry-staging, gw-incidents-staging |
| `gw-ms-osfi-reporting-staging` | API GW | POST /api/tenants/{id}/osfi-report | S3, telemetry, scope1, scope3, sbti, budget, incidents |
| `gw-ms-tcfd-profile-staging` | API GW | GET/PUT /api/tenants/{id}/tcfd/profile[/{section}] | gw-tcfd-staging |
| `gw-ms-tcfd-report-staging` | API GW | POST /api/tenants/{id}/tcfd/report | gw-tcfd-staging, telemetry, scope1, scope3, recs, offsets, sbti, S3 |
| `gw-ms-ifrs-s2-profile-staging` | API GW | GET/PUT /api/tenants/{id}/ifrs-s2/profile[/{section}] | gw-ifrs-s2-staging |
| `gw-ms-ifrs-s2-report-staging` | API GW | POST /api/tenants/{id}/ifrs-s2/report | gw-ifrs-s2-staging, telemetry, scope1, scope3, recs, offsets, sbti, S3 |
| `gw-ms-attestation-staging` | API GW | POST/GET /api/tenants/{id}/attestations, /api/attestations/{token}, POST /api/attestations/{token}/seal | gw-attestations-staging, gw-tenants-staging, gw-filing-calendar-staging, S3 |
| `gw-ms-rec-tracker-staging` | API GW | GET/POST /api/tenants/{id}/recs, PUT /{recId}, GET /recs/scope2 | gw-recs-staging, gw-telemetry-staging |
| `gw-ms-offset-registry-staging` | API GW | GET/POST /api/tenants/{id}/offsets, PUT /{offsetId}, GET /offsets/net-position | gw-offsets-staging |
| `gw-ms-emissions-summary-staging` | API GW | GET /api/tenants/{id}/emissions-summary | telemetry, scope1, scope3, recs, offsets, sbti, budget |
| `gw-ms-carbon-tax-staging` | API GW | GET /api/tenants/{id}/carbon-tax | telemetry, scope1, scope3, sbti |
| `gw-ms-scope1-staging` | API GW | GET/POST /api/tenants/{id}/scope1 | gw-scope1-staging |
| `gw-ms-scope3-staging` | API GW | GET/POST /api/tenants/{id}/scope3, POST /scope3/sync | gw-scope3-staging |
| `gw-ms-sbti-staging` | API GW | GET/PUT /api/tenants/{id}/sbti | gw-sbti-staging |
| `gw-ms-enforcement-staging` | API GW | GET/PUT /api/tenants/{id}/enforcement | gw-tenants-staging |
| `gw-ms-filing-calendar-staging` | API GW | GET/POST/PUT /api/tenants/{id}/calendar | gw-filing-calendar-staging |
| `gw-ms-filing-reminder-staging` | EventBridge daily | — | gw-filing-calendar-staging, SNS |
| `gw-ms-tenant-provisioning-staging` | API GW | POST /api/tenants | gw-tenants-staging, Cognito, gw-api-keys-staging |
| `gw-ms-api-keys-staging` | API GW | GET/POST/DELETE /api/tenants/{id}/keys | gw-api-keys-staging |

**reportlab layer:** `arn:aws:lambda:ca-central-1:768949138583:layer:gw-reportlab-layer-staging:3`
Applied to: tcfd-report, ifrs-s2-report, osfi-reporting.

---

## 6. API Gateway Routes

Base URL: `https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com`

```
GET    /api/telemetry?tenant_id=&limit=
GET    /api/grid-status

POST   /api/telemetry/live                           # agent ingest

GET    /api/tenants/{tenantId}/budget
PUT    /api/tenants/{tenantId}/budget
DELETE /api/tenants/{tenantId}/budget
GET    /api/tenants/{tenantId}/thresholds
PUT    /api/tenants/{tenantId}/thresholds

GET    /api/tenants/{tenantId}/incidents[?status=OPEN|CLOSED]
PUT    /api/tenants/{tenantId}/incidents/{incidentId}

POST   /api/tenants/{tenantId}/osfi-report

GET    /api/tenants/{tenantId}/tcfd/profile
PUT    /api/tenants/{tenantId}/tcfd/profile/{section}
POST   /api/tenants/{tenantId}/tcfd/report

GET    /api/tenants/{tenantId}/ifrs-s2/profile
PUT    /api/tenants/{tenantId}/ifrs-s2/profile/{section}
POST   /api/tenants/{tenantId}/ifrs-s2/report

POST   /api/tenants/{tenantId}/attestations
GET    /api/tenants/{tenantId}/attestations
GET    /api/attestations/{token}
POST   /api/attestations/{token}/seal

GET    /api/tenants/{tenantId}/recs
POST   /api/tenants/{tenantId}/recs
PUT    /api/tenants/{tenantId}/recs/{recId}
GET    /api/tenants/{tenantId}/recs/scope2?year=

GET    /api/tenants/{tenantId}/offsets
POST   /api/tenants/{tenantId}/offsets
PUT    /api/tenants/{tenantId}/offsets/{offsetId}
GET    /api/tenants/{tenantId}/offsets/net-position?year=

GET    /api/tenants/{tenantId}/emissions-summary?year=

GET    /api/tenants/{tenantId}/carbon-tax?year=

GET    /api/tenants/{tenantId}/scope1
POST   /api/tenants/{tenantId}/scope1

GET    /api/tenants/{tenantId}/scope3
POST   /api/tenants/{tenantId}/scope3/sync

GET    /api/tenants/{tenantId}/sbti
PUT    /api/tenants/{tenantId}/sbti

GET    /api/tenants/{tenantId}/enforcement
PUT    /api/tenants/{tenantId}/enforcement

GET    /api/tenants/{tenantId}/calendar
POST   /api/tenants/{tenantId}/calendar
PUT    /api/tenants/{tenantId}/calendar/{deadlineId}

GET    /api/tenants/{tenantId}/keys
POST   /api/tenants/{tenantId}/keys
DELETE /api/tenants/{tenantId}/keys/{keyId}
```

---

## 7. Frontend Pages

| Route | Description | Key Data Sources |
|---|---|---|
| `/` | Public marketing landing page — hero, feature grid, how-it-works, CTA. No auth required. | — |
| `/onboarding` | 3-step tenant wizard: org details → agent deploy → verify | tenant provisioning Lambda |
| `/monitor` | Live telemetry stream, AB grid intensity, carbon budget burn rate, Verified Emissions strip (gross/market/net) | telemetry, grid-status, budget, emissions-summary |
| `/incidents` | WORM-sealed incidents grouped by source; live threshold bars using tenant settings (not hardcoded) | incidents, grid-status, thresholds |
| `/compliance` | Report generation (OSFI/TCFD/ISO), WORM seal display, Board Attestation section | osfi-report, attestations, filing-calendar |
| `/tcfd` | TCFD four-pillar profile, metrics strip, PDF generation with Board Attestation CTA | tcfd/profile, carbon-tax |
| `/ifrs-s2` | IFRS S2 32-paragraph tracker, SASB metrics, PDF with Board Attestation CTA | ifrs-s2/profile, carbon-tax |
| `/settings` | 12-tab configuration hub | See Section 11 |
| `/calendar` | Regulatory filing deadlines, status tracking | filing-calendar |
| `/copilot` | AI assistant | Anthropic API (via Secrets Manager) |
| `/attest` | Public board attestation page (no auth), token-gated | attestations Lambda |
| `/verify` | Public attestation verification | attestations Lambda |
| `/auth`, `/auth/callback`, `/auth/logout` | Cognito SSO flow | Cognito |

---

## 8. Data Flow Diagrams

### Telemetry Ingest (Real-Time Scope 2)
```
Physical Device (server/GPU/ASIC)
  → Agent reads watts (BMC Redfish / nvidia-smi / CGMiner API)
  → POST /api/telemetry/live with {TenantID, api_key, Actual_Wattage, GridID, DataSource}
  → SQS queue
  → Oracle Lambda:
      1. Validate API key (SHA-256 lookup in gw-api-keys-staging)
      2. Read current grid intensity from gw-grid-cache-staging[GridID]
      3. Compute CO2e_g = Wattage × (interval_minutes/60) × grid_intensity_gCO2perKwh / 1000
      4. SHA-256 hash over canonical record + PrevHash → HashChain
      5. DynamoDB put_item (conditional: attribute_not_exists Timestamp)
      6. Append hash to S3 chain file
  → Monitor page (30s refresh) reads latest records
```

### Emissions Summary Calculation (Canonical)
```
GET /api/tenants/{tenantId}/emissions-summary?year=YYYY
  → Scope 1: gw-scope1-staging query (TenantID, RecordedAt between year)
  → Scope 2 (location): gw-telemetry-staging scan with pagination (CarbonDebt_gCO2, year filter)
  → Scope 3: gw-scope3-staging query (TenantID, YearMonth begins_with year)
  → RECs: gw-recs-staging query (Status=RETIRED, RetiredFor=year, Deleted!=True)
       Scope 2 (market) = max(0, Scope2_location − retired_MWh × 0.50 tCO2e/MWh)
       Bill C-59 flag: all retired RECs must have CertifiedBy in {EcoLogo, Green-e, I-REC, TIGR, RE100, IREC}
  → Offsets: gw-offsets-staging query (Status=RETIRED, RetiredFor=year, Deleted!=True)
       Net = max(0, gross_market − retired_offsets_tCO2e)
  → Returns: scope1_t, scope2_location_t, scope2_market_t, scope3_t, gross_t, gross_market_t, net_t,
             carbon_tax_gross/market/net, budget_pct_used, sbti_note, bill_c59_compliant, net_zero_ready
```

### Board Attestation Flow
```
Compliance officer → POST /api/tenants/{id}/attestations {attester_email, report_type, ...}
  → Lambda creates ATT-{id} record in gw-attestations-staging (Status: PENDING)
  → Email sent to board member with link: {APP_URL}/attest?token={uuid_hex}

Board member clicks link → GET /api/attestations/{token}
  → Public page /attest renders disclosure summary

Board member checks box → POST /api/attestations/{token}/seal {confirmed: true}
  → Lambda builds canonical seal: {attestation_id, tenant_id, attester info, report, sealed_at, IP, UA}
  → SHA-256(canonical_json) → seal_hash (64-char hex)
  → S3 put_object: attestations/{TenantID}/{AttestationID}/seal.json
      ObjectLockMode: COMPLIANCE, RetainUntilDate: now + 7 years
  → DynamoDB update: Status=SEALED, SealHash, SealS3Key, SealedAt
  → _auto_file_calendar(): find nearest matching UPCOMING/DUE_SOON deadline → mark FILED
```

---

## 9. Security Model

### Authentication & Authorization
- **Cognito User Pool:** `ca-central-1_IcSJiRC6e`, Client `4hpe00jpi8mlkntjkh8vkckqhv`
- Session cookie: `gw_session` (JWT, 8h TTL)
- Middleware: all routes except `/auth/*`, `/attest`, `/verify`, `/onboarding` require valid session
- Tenant isolation: all Lambda queries include `TenantID` as partition key — cross-tenant access not possible at DB level

### API Key Scheme
- Format: `gwk-{48 hex chars}` (52 chars total)
- Stored as `SHA-256(key)` in `gw-api-keys-staging` — plaintext never persisted
- GSI `TenantID-index`: enables per-tenant key listing
- `key_id`: `gwk_{8hex}` — display reference only

### Telemetry Enforcement Mode
- **Audit (default):** invalid keys logged as WARNING, record still written
- **Enforcement:** invalid keys silently discarded (SQS ACK prevents retry, no DynamoDB write)
- Toggle: Settings → Enforcement tab → PUT `/api/tenants/{id}/enforcement`

### Immutability Guarantees
- DynamoDB: IAM policy denies `dynamodb:UpdateItem` and `dynamodb:DeleteItem` on `gw-telemetry-staging`
- S3 attestation seals: `ObjectLockMode: COMPLIANCE` — **cannot be deleted by any AWS principal including root** for 7 years
- Hash chain: each telemetry record's `HashChain` field is SHA-256 over (canonical record + PrevHash), enabling tamper detection

### Secrets
- Anthropic API key: AWS Secrets Manager `gw/anthropic/api-key` — **never in code, Lambda env vars, or logs**

---

## 10. Regulatory Compliance Mapping

| Feature | Regulation | How it satisfies the requirement |
|---|---|---|
| WORM telemetry ledger | OSFI B-15 §7.1 — data governance | Immutable records, hash-chained, auditable by third parties |
| OSFI B-15 PDF report | OSFI B-15 — annual disclosure | 9-section PDF: governance, strategy, risk, metrics, Merkle root, incident log |
| Board attestation + S3 Object Lock seal | OSFI B-15 §5.3 — board governance | SHA-256 sealed, 7-year COMPLIANCE-mode retention, non-repudiation via IP+UA |
| Bill C-59 REC certification check | CCPA §74.01 — substantiate environmental claims | Validates certifying body (EcoLogo/I-REC/Green-e/TIGR/RE100/IREC); flags non-compliant RECs |
| Market-based Scope 2 calculation | GHG Protocol Scope 2 Guidance | location − (retired MWh × 0.50 tCO2e/MWh Alberta grid factor) |
| TCFD PDF — 4 pillars | CSA NI 51-107, TCFD framework | Governance, Strategy (time horizons + scenario analysis), Risk Mgmt, Metrics & Targets |
| IFRS S2 / CSDS 2 PDF | IFRS S2 §6–§44, CSDS 2 | Paragraphs S2.6–S2.44, SASB TC-SI overlay, GHG inventory with market-based + net rows |
| Net position calculation | GHG Protocol + TCFD | gross_market − verified_offsets; net_zero_ready flag when net < 0.01 tCO2e |
| SBTi target tracking | Science Based Targets initiative | 1.5C / WB2C pathways, annual reduction trajectory, Settings integration |
| Carbon tax liability | GGPPA federal backstop | Statutory price schedule 2023–2030; gross/market/net tax calculated |
| Filing calendar auto-filing | OSFI, CSA, TIER deadlines | Calendar deadline marked FILED automatically when attestation is sealed |

---

## 11. Feature Inventory — Built

### Core Infrastructure
- [x] Multi-tenant DynamoDB architecture (TenantID partition key on all tables)
- [x] Cognito SSO with JWT middleware route guard
- [x] SQS-gated telemetry ingest pipeline with Oracle Lambda
- [x] SHA-256 hash chain on telemetry records
- [x] WORM enforcement via DynamoDB IAM deny policy
- [x] S3 Object Lock COMPLIANCE vault (7-year retention)
- [x] API key management (hashed, per-tenant, revocable)
- [x] Tenant provisioning wizard (Cognito user + tenant + API key in one atomic operation)
- [x] EventBridge scheduling (grid oracle 5min, budget monitor 1h, filing reminders daily)
- [x] SNS alert routing

### Emissions Accounting
- [x] Scope 2 (location-based): hardware telemetry × live AESO grid intensity
- [x] Scope 1 (direct): manual entry with ECCC NRI emission factors (6 fuel types)
- [x] Scope 1 (BMS): REST / Modbus / MQTT integration scripts
- [x] Scope 3 Category 11: AWS Cost Explorer cloud carbon sync
- [x] Market-based Scope 2: location − (retired REC MWh × 0.50 tCO2e/MWh)
- [x] Net position: gross market − verified offsets
- [x] Canonical emissions summary microservice (`/emissions-summary`)
- [x] Carbon tax liability (GGPPA schedule, gross/market/net)

### Agent & Hardware Telemetry
- [x] Redfish/BMC agent (Dell, HP, Supermicro — actual PSU watts)
- [x] GPU Mining agent (nvidia-smi + rocm-smi)
- [x] ASIC Mining agent (Antminer + Whatsminer)
- [x] Linux CPU load agent (bash)
- [x] Windows CPU load agent (PowerShell)
- [x] Docker container agent
- [x] Kubernetes DaemonSet agent
- [x] Live AESO grid intensity (5-min polling, composite into per-record CO2e)

### Monitoring & Incidents
- [x] Live Monitor page (30s refresh, device stream, AB grid panel)
- [x] Verified Emissions strip on Monitor (gross/market/net, auto-updated)
- [x] Carbon Budget: tCO2e ceiling, burn-rate projection, breach date forecast
- [x] Budget alert thresholds (3 levels: 80%, 95%, 100%)
- [x] WORM-sealed incident creation (budget breach + grid anomaly)
- [x] Incident management (acknowledge, escalate, close, export CSV)
- [x] Live threshold panel using tenant-configured thresholds (not hardcoded)
- [x] Carbon Trend sparkline (24h bucket chart)

### Regulatory Reporting
- [x] OSFI B-15 PDF (9 sections, Merkle chain, S3 Object Lock GOVERNANCE)
- [x] TCFD PDF (4 pillars, scenario analysis, GHG inventory, market-based Scope 2 + net)
- [x] IFRS S2 / CSDS 2 PDF (§S2.6–S2.44, SASB TC-SI, GHG table with market + net)
- [x] Board Digital Attestation (SHA-256 seal, S3 Object Lock COMPLIANCE 7yr, auto-file calendar)
- [x] Filing Calendar (deadlines, DUE_SOON alerts, FILED status, auto-file on attestation seal)
- [x] TCFD + IFRS S2 pages: "Request Board Attestation →" CTA post-PDF
- [x] Compliance page: Board Attestation section (list + form + auto pre-fill from report CTA)

### Market Instruments
- [x] REC Tracker (bundled/unbundled/PPA/VPPA, certification body validation, Bill C-59 flag)
- [x] Carbon Offset Registry (8 registries: Gold Standard, VCS, TIER, ACR, CAR, Ecotrust, OBIN, Custom)
- [x] Market-based Scope 2 widget (location vs market, reduction %, Bill C-59 badge)
- [x] Net position widget (gross market/offsets retired/net tCO2e/reduction %)

### Targets & Strategy
- [x] SBTi target configuration (1.5C / WB2C / Custom, baseline year, annual reduction rate)
- [x] SBTi trajectory calculation (annual target line vs actual)
- [x] TCFD four-pillar profile editor (Governance, Strategy, Risk Mgmt, Metrics)
- [x] IFRS S2 profile editor (IFRS config, SASB metrics, Capital deployment)

### Administration
- [x] Grid alert threshold configuration (carbon/load/price per province)
- [x] Enforcement mode toggle (audit vs strict)
- [x] Scope 3 AWS cloud sync
- [x] API key management (create, copy, revoke)
- [x] AI Co-Pilot (Anthropic Claude, Secrets Manager key)
- [x] Webhook configuration
- [x] Team management

---

## 12. Feature Inventory — Pipeline

*Ordered by regulatory urgency and business value.*

### Near-Term (0–3 months)
- [ ] **Co-Pilot live context:** wire `/emissions-summary` response into every Co-Pilot message so the AI has real-time gross/market/net numbers, budget status, and open deadlines
- [ ] **OSFI PDF market-based Scope 2:** current OSFI report uses location-based only; update to include market-based + net rows matching TCFD/IFRS S2 pattern
- [ ] **Compliance Mission Control:** restructure Compliance page as a grid showing OSFI / TCFD / IFRS S2 status tiles with last-generated date, completeness score, and next deadline
- [ ] **Scope 3 Category 4 (Supplier Emissions):** intake form for supply chain data (spend × industry EEIO factor)
- [ ] **Pagination on TCFD/IFRS S2 profile Lambdas:** low risk now (small tables), required for multi-year tenants

### Medium-Term (3–6 months)
- [ ] **Multi-entity org hierarchy:** parent/child tenant model, Cognito Groups for RBAC
- [ ] **Peer benchmarking:** industry carbon intensity comparison (requires benchmark dataset)
- [ ] **TIER compliance module:** Alberta large-emitter compliance report, offset obligation calculator
- [ ] **Scope 3 Category 15 (Financed Emissions):** PCAF methodology for financial institutions
- [ ] **Net-Zero Dashboard:** consolidated Scope 1+2+3 vs SBTi trajectory, single-screen view
- [ ] **AWS Marketplace listing:** self-serve procurement for AWS customers

### Long-Term (6–12 months)
- [ ] **RSA/KMS board attestation:** upgrade from UUID token to KMS-signed cryptographic identity
- [ ] **Third-party GHG verification workflow:** auditor portal, locked reporting period, verification statement upload
- [ ] **Provincial expansion:** BC Hydro, IESO (Ontario) grid integrations for non-Alberta tenants
- [ ] **ERCOT integration (Texas):** expand to US market after 3+ Canadian paying customers
- [ ] **Automated CSA filing:** machine-readable XBRL climate disclosure output for TSX reporting issuers
- [ ] **Mobile app:** field data entry for Scope 1 (fuel receipts, fleet)

---

## 13. Known Limitations

| Limitation | Impact | Workaround |
|---|---|---|
| AWS Cost Explorer not enabled on all accounts | Scope 3 Cat.11 cloud sync returns "User not enabled" error | Enable CE in AWS Billing console (24h activation); or enter Scope 3 manually |
| AESO generation-mix endpoint not in subscription | Grid intensity is derived from SMP price proxy, not measured generation mix | SMP-based proxy is within ±5% of actual intensity for Alberta; documented in report footnotes |
| Agent packages at `packages.gridwitness.ca` not live | Linux/Docker agent install scripts fail (package server not set up) | Use Quick Test curl command or deploy scripts directly |
| No DynamoDB pagination on TCFD/IFRS S2 profile queries | Could miss records if a tenant accumulates >1MB of profile data (unlikely at current scale) | Tables are small; pagination not yet needed |
| No Terraform / CDK IaC | Infrastructure managed via ad-hoc Python deploy scripts | Reproducible but not auditable via IaC; migration to CDK planned |
| No automated test suite | Regressions require manual verification | Add Jest (frontend) + pytest (Lambda) as part of CI pipeline |

---

## 14. Deployment Runbook

### Standard Code Deploy
```bash
# Local: commit and push
git add <files>
git commit -m "your message"
git push origin main

# EC2: pull, build, restart
ssh -i ~/Downloads/gw-deploy-key.pem ubuntu@16.174.1.7
cd ~/gridwitness-dashboard
git pull origin main
npm run build
pm2 restart gridwitness-dashboard
pm2 list   # verify status: online
```

### Lambda Deploy (from local Windows)
```bash
# SCP handler to EC2
scp -i ~/Downloads/gw-deploy-key.pem \
    /c/Users/myous/Desktop/gridwitness-dashboard/tmp_lambdas/<handler>.py \
    ubuntu@16.174.1.7:/tmp/

# SSH + zip + deploy
ssh -i ~/Downloads/gw-deploy-key.pem ubuntu@16.174.1.7
cd /tmp
zip <handler>.zip <handler>.py
aws lambda update-function-code --region ca-central-1 \
  --function-name gw-ms-<name>-staging \
  --zip-file fileb://<handler>.zip \
  --query FunctionArn --output text
```

### IAM Role
Lambda execution role: `arn:aws:iam::768949138583:role/gw-lambda-execution-role-staging`

### Key AWS IDs
- Account: `768949138583`
- Region: `ca-central-1`
- API Gateway: `rdof7lrwfj`
- S3 vault: `gw-compliance-vault-768949138583`
- Cognito Pool: `ca-central-1_IcSJiRC6e`
- SNS: `arn:aws:sns:ca-central-1:768949138583:gw-data-layer-alerts-staging`
- reportlab layer: `arn:aws:lambda:ca-central-1:768949138583:layer:gw-reportlab-layer-staging:3`

---

## 15. Change Log

| Date | Version | Change Summary |
|---|---|---|
| 2026-06-20 | 1.2 | Domain migrated to gridwitness.ca; public marketing landing page added at `/`; middleware updated to allow `/` and `/attest` without auth |
| 2026-06-19 | 1.0 | Initial ARCHITECTURE.md — full feature inventory, schema reference, data flow diagrams |
| 2026-06-14 | — | God-mode cross-tab integration: Verified Emissions strip on Monitor, Board Attestation CTAs on TCFD/IFRS S2, Compliance pre-fill from URL |
| 2026-06-14 | — | Bug fix: Scope 3 Lambda queries used PeriodStart; corrected to YearMonth. Scope 2 scan pagination added. |
| 2026-06-14 | — | Incidents page: live threshold fetch from Settings API replaces hardcoded DEFAULT_GRID_THRESHOLDS |
| 2026-06-12 | — | Deployed: Attestation (auto-file calendar), TCFD report (market Scope 2 + net), IFRS S2 report (same), Emissions Summary microservice |
| 2026-06-11 | — | Deployed: REC Tracker, Carbon Offset Registry, Board Attestation, Settings tabs (RECs + Offsets), Compliance Board Attestation section |

---

*Maintained by the GridWitness engineering team. Update this file before closing any PR that changes infrastructure, schema, APIs, or features.*
