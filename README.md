# GridWitness

> Hardware-verified carbon telemetry · WORM-sealed audit trail · OSFI B-15 / Bill C-59 compliant

GridWitness is a compliance-grade carbon emissions monitoring platform for Canadian data centres and financial institutions. Every power draw reading is sealed into an immutable cryptographic ledger, grid carbon intensity is pulled live from AESO, and one-click PDF reports are generated for regulators and auditors.

---

## Live Environment

| Resource | Value |
|---|---|
| Dashboard | `https://www.gridwitness.ca` |
| API Gateway | `https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com` |
| AWS Region | `ca-central-1` (Montreal — Canadian sovereign cloud) |
| Stage | Production (Vercel) |
| SSL | Vercel managed TLS (automatic) |

---

## Architecture

```
Browser → Next.js 14 (App Router) on Vercel (Edge Network, www.gridwitness.ca)
             │
             ├── AWS Cognito (SSO login, custom:tenant_id claim)
             │
             └── HTTP API Gateway v2 (rdof7lrwfj)
                      │
                      ├── POST /api/telemetry/live  ──→ SQS ──→ gw-ms-telemetry-oracle-staging (ingest)
                      ├── GET  /api/telemetry/live  ──→ gw-ms-telemetry-live-staging (read)
                      ├── GET  /api/grid/status     ──→ gw-ms-grid-status-staging (AESO live)
                      ├── POST /api/tenant/provision──→ gw-ms-tenant-provisioning-staging
                      ├── *   /api/tenants/{id}/*   ──→ various microservice Lambdas
                      ├── POST /api/reports/generate──→ gw-ms-osfi-reporting-staging (PDF)
                      ├── GET  /api/reports/latest  ──→ gw-ms-osfi-reporting-staging
                      ├── *   /api/incidents/*      ──→ gw-ms-incident-manager-staging
                      └── *   /api/tenants/{id}/budget ──→ gw-ms-carbon-budget-staging
```

### DynamoDB Tables

| Table | PK | SK | Purpose |
|---|---|---|---|
| `gw-tenants-staging` | TenantID | — | Tenant registry, org info |
| `gw-telemetry-staging` | TenantID | Timestamp | WORM-sealed power/carbon records |
| `gw-grid-cache-staging` | GridID | — | AESO live grid intensity cache |
| `gw-incidents-staging` | TenantID | IncidentID | Grid stress + budget breach incidents |
| `gw-api-keys-staging` | KeyHash | — | SHA-256 hashed API keys |
| `gw-scope1-staging` | TenantID | RecordedAt | Direct (Scope 1) emission records |
| `gw-carbon-budget-staging` | TenantID | — | Monthly/quarterly tCO2e budgets |
| `gw-sbti-staging` | TenantID | — | Science-Based emission reduction targets |
| `gw-scope3-staging` | TenantID | YearMonth | Scope 3 Cat.11 AWS cloud carbon estimates |

---

## What's Built ✅

### Authentication
- **Cognito SSO** — Hosted UI with authorization code flow, `custom:tenant_id` claim
- **Session cookie** — `gw_session` (ID token, 8h), set by `/auth/callback`
- **Route guard middleware** — All routes protected; public paths: `/auth`, `/onboarding`, `/verify`, `/health`
- **Sign-out** — `/auth/logout` clears cookie, redirects to login

### Telemetry Pipeline
- **Ingest** — `POST /api/telemetry/live` → API GW direct SQS → `gw-ms-telemetry-oracle-staging`
- **Read** — `GET /api/telemetry/live` → `gw-ms-telemetry-live-staging`
- **API key validation** — Audit-mode SHA-256 validation + `LastUsedAt` update on both paths
- **`api_key` in POST body** — API GW → SQS can't forward headers; key embedded in JSON
- **WORM ledger** — Records append-only; oracle Lambda computes carbon and seals

### Live Monitor (`/monitor`)
- Real-time device table — power draw, type, grid, carbon, last-seen age
- KPI cards: Net Carbon, Active Devices, Telemetry Records
- Carbon Trend Sparkline (24 × 60-min buckets)
- Alberta AESO grid intensity widget (LIVE / fallback) with pool price and thresholds
- Other Canadian Regions panel (BC, ON, QC)
- **Carbon Budget widget** — inline progress bar, burn rate, breach warning (hidden when no budget set)
- Auto-refresh every 30 s

### Settings (`/settings`)
- Tenant info + AESO API live status
- Grid alert thresholds (carbon / load / price) per grid region
- AWS auto-discovery (cross-account IAM role wiring)
- Agent scripts — Redfish, GPU, ASIC, PowerShell, Bash, Docker (all include `api_key` in body)
- **Scope 1 / BMS Integration** — Manual entry + BMS webhook tab with Python bridge scripts (REST / Modbus / MQTT)
- Webhook configuration
- API key management (create, list, revoke, copy)
- Team, branding, notifications
- **Carbon Budget** — tCO2e ceiling, period (monthly/quarterly), thresholds (80/95/100%), notification email, live status, burn rate, projected breach date

### Carbon Budget & Breach Alerts
- `gw-carbon-budget-staging` DynamoDB table
- `gw-ms-carbon-budget-staging` Lambda — GET / PUT / DELETE + live status (Scope 1 + Scope 2 from WORM ledger)
- `gw-ms-budget-monitor-staging` Lambda — EventBridge hourly: checks all tenant budgets, creates incidents, sends SNS
- `gw-budget-monitor-hourly` EventBridge rule (rate: 1 hour)
- `AlertsFired` map prevents duplicate alerts per period per threshold
- SNS → `support@nimblestride.ca`

### OSFI Evidence Package (`/compliance`)
- `gw-ms-osfi-reporting-staging` Lambda — reportlab PDF, 9 sections, DejaVu fonts bundled
- **PDF sections:** Cover · Cryptographic Chain of Custody · GHG Summary · Device Inventory · OSFI B-15 Compliance Matrix · Bill C-59 Safe Harbour · ISO 14064-1 · GHG Protocol · Ledger Sample + Incidents + Executive Attestation
- Merkle SHA-256 chain across all telemetry records (root printed on cover)
- Uploaded to `gw-compliance-vault-768949138583` S3 (Object Lock COMPLIANCE, 7-year retention)
- Presigned download URL returned synchronously (~25 s for 14,000+ records)
- `GET /api/reports/latest?tenant_id=X` — fetch presigned URL for most recent PDF

### Incidents (`/incidents`)
- Auto-generated by carbon budget monitor (MEDIUM at 80%, HIGH at 95%, CRITICAL at 100%+)
- Auto-generated by grid anomaly detector (carbon intensity breaches)
- Manual acknowledge, close with reason, full audit trail of actions

### Onboarding (`/onboarding`)
- 3-step wizard: Org info → Deploy agent → Verify connection
- `gw-ms-tenant-provisioning-staging` Lambda: creates Cognito user, DynamoDB tenant record, and hashed API key atomically
- Temp password emailed to org admin via Cognito; user logs in immediately after provisioning
- Deployment instructions: Quick Test (curl), Linux, Docker, AWS EC2, Windows Server
- Polls telemetry API every 15 s to detect first record from agent

### Scope 1 Manual Entry
- `POST /api/tenants/{id}/scope1` — fuel type, quantity, emission factor, kgCO2e
- Records stored in `gw-scope1-staging`; feeds into Carbon Budget Scope 1 total

### Telemetry Enforcement Mode (`/settings → Enforcement`)
- Per-tenant flag `EnforcementMode` in `gw-tenants-staging`
- **Audit mode** (default): invalid API keys logged as WARNING, records still processed
- **Enforcement mode**: records with invalid/missing API keys silently discarded; `ENFORCEMENT_REJECT` logged
- Toggle via `GET/PUT /api/tenants/{tenantId}/enforcement` → `gw-ms-enforcement-staging` Lambda
- Oracle Lambda (`gw-ms-telemetry-oracle-staging`) checks flag per-message

### Science-Based Targets + Decarbonisation Roadmap (`/settings → SBTi Targets`)
- Per-tenant SBTi targets stored in `gw-sbti-staging` DynamoDB table
- Supports 1.5°C pathway (4.2%/yr), Well-Below 2°C (2.5%/yr), and custom rates
- Lambda calculates full trajectory from base year to target year
- Trajectory visualization: year-by-year progress bars showing tCO2e vs baseline
- `GET/PUT /api/tenants/{tenantId}/sbti` → `gw-ms-sbti-staging` Lambda

### Scope 3 AWS Cloud Emissions (`/settings → Scope 3 Cloud`)
- Estimates Scope 3 Category 11 cloud emissions from AWS compute spend
- Uses AWS Cost Explorer `GetCostAndUsage` grouped by region and service
- Applies `$0.50/kWh` cost-to-energy factor + regional grid intensity (EPA eGRID + IEA 2024)
- Covers: EC2, Lambda, ECS, EKS, Fargate
- Results cached in `gw-scope3-staging` (PK: TenantID, SK: YearMonth)
- Supports cross-account role assumption for multi-account tenants
- `GET /api/tenants/{tenantId}/scope3`, `POST /api/tenants/{tenantId}/scope3/sync` → `gw-ms-scope3-staging` Lambda
- **Requires:** AWS Cost Explorer enabled in account (one-time setup)

---

## Under Development 🔨

### Cost Explorer Setup (Scope 3 prerequisite)
To enable Scope 3 AWS Cloud syncs, activate Cost Explorer once per AWS account:
**AWS Console → Billing & Cost Management → Cost Explorer → Enable Cost Explorer**
Data becomes available approximately 24 hours after activation.

---

## Pipeline 🗺️

| Feature | Priority | Notes |
|---|---|---|
| Multi-Entity Org Hierarchy + RBAC | Medium | Cognito Groups, parent/child tenants |
| Peer Benchmarking | Medium | Needs industry benchmark dataset |
| Scope 3 Cat. 4 (Supplier Emissions) | Medium | Supplier carbon reporting intake form |
| Net-Zero Dashboard view | Medium | Consolidated Scope 1+2+3 vs targets |
| AWS Marketplace listing | Low | Waiting on AWS approval |

---

## Local Development

```bash
git clone https://github.com/myshariff123/gridwitness-dashboard.git
cd gridwitness-dashboard
npm install
cp .env.local.example .env.local   # fill in values below
npm run dev                         # → http://localhost:3000
```

### Required `.env.local`

```env
NEXT_PUBLIC_API_URL=https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ca-central-1_IcSJiRC6e
NEXT_PUBLIC_COGNITO_CLIENT_ID=4hpe00jpi8mlkntjkh8vkckqhv
NEXT_PUBLIC_COGNITO_DOMAIN=gw-auth-staging-768949138583.auth.ca-central-1.amazoncognito.com
NEXT_PUBLIC_COGNITO_REGION=ca-central-1
NEXT_PUBLIC_APP_URL=https://www.gridwitness.ca
```

---

## Deploy to Vercel

Deployments are **automatic** — push to `main` and Vercel builds and deploys within ~2 minutes.

> **Required:** The GitHub repo must be **public** (GitHub → Settings → Danger Zone → Change visibility → Make public) so Vercel Hobby Plan accepts commits from co-authors.

```bash
git add <files>
git commit -m "your message"
git push origin main
# → Vercel auto-deploys to https://www.gridwitness.ca
```

**Vercel project:** nimble-stride-s-projects / gridwitness-dashboard
**Custom domain:** `www.gridwitness.ca` and `gridwitness.ca` (added in Vercel → Domains)
**GoDaddy DNS records required:**

| Type | Name | Value |
|---|---|---|
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `cname.vercel-dns.com` |

## Lambda Reference

| Lambda | Trigger | Purpose |
|---|---|---|
| `gw-ms-telemetry-oracle-staging` | SQS | Ingest, carbon calc, WORM seal, api_key audit |
| `gw-ms-telemetry-live-staging` | API GW GET | Read telemetry, api_key audit |
| `gw-grid-oracle-lambda-staging` | API GW + schedule | AESO live grid intensity |
| `gw-ms-carbon-budget-staging` | API GW | Budget CRUD + live Scope 1+2 status |
| `gw-ms-budget-monitor-staging` | EventBridge 1h | Threshold check, incident creation, SNS |
| `gw-ms-incident-manager-staging` | API GW | Incident CRUD + actions |
| `gw-ms-osfi-reporting-staging` | API GW POST/GET | PDF report generation + S3 presigned URL |
| `gw-ms-tenant-provisioning-staging` | API GW POST | Tenant creation in DynamoDB |
| `gw-ms-api-keys-staging` | API GW | API key CRUD (hash-keyed) |
| `gw-ms-scope1-staging` | API GW | Scope 1 manual entry |
| `gw-ms-anomaly-detector-staging` | Schedule | Grid incident auto-generation |
| `gw-ms-enforcement-staging` | API GW GET/PUT | Per-tenant enforcement mode toggle |
| `gw-ms-sbti-staging` | API GW GET/PUT | SBTi target + trajectory calculation |
| `gw-ms-scope3-staging` | API GW GET/POST | Scope 3 Cat.11 AWS cloud carbon sync |

---

## Compliance Posture

| Standard | Status | Notes |
|---|---|---|
| OSFI Guideline B-15 | ✅ Compliant | WORM ledger, real-time carbon, PDF evidence |
| Bill C-59 Anti-Greenwashing | ✅ Compliant | Hardware-verified, methodology disclosed |
| ISO 14064-1:2018 | ✅ Compliant | Scope 2 + Scope 3 Cat. 11 |
| GHG Protocol Corporate | ✅ Compliant | Location-based Scope 2 |
| Canadian Data Sovereignty | ✅ Compliant | AWS ca-central-1 exclusively |
| Encryption at Rest | ✅ AES-256 KMS | DynamoDB + S3 |
| Encryption in Transit | ✅ TLS 1.3 | Enforced at API GW + nginx |
| Audit Trail Retention | ✅ 7 years | S3 Object Lock COMPLIANCE mode |

---

*GridWitness by NimbleStride Inc. · support@nimblestride.ca*
