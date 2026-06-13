# GridWitness

> Hardware-verified carbon telemetry · WORM-sealed audit trail · OSFI B-15 / Bill C-59 compliant

GridWitness is a compliance-grade carbon emissions monitoring platform for Canadian data centres and financial institutions. Every power draw reading is sealed into an immutable cryptographic ledger, grid carbon intensity is pulled live from AESO, and one-click PDF reports are generated for regulators and auditors.

---

## Live Environment

| Resource | Value |
|---|---|
| Dashboard | `https://16-174-1-7.nip.io` |
| API Gateway | `https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com` |
| AWS Region | `ca-central-1` (Montreal — Canadian sovereign cloud) |
| Stage | Staging |
| SSL | Let's Encrypt via nip.io (`16-174-1-7.nip.io`) |

---

## Architecture

```
Browser → Next.js 14 (App Router) on EC2 + nginx + PM2
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
- Deployment instructions: Quick Test (curl), Linux, Docker, AWS EC2, Windows Server
- Polls telemetry API every 15 s to detect first record from agent

### Scope 1 Manual Entry
- `POST /api/tenants/{id}/scope1` — fuel type, quantity, emission factor, kgCO2e
- Records stored in `gw-scope1-staging`; feeds into Carbon Budget Scope 1 total

---

## Under Development 🔨

### Onboarding → Cognito End-to-End
**Goal:** Self-serve signup creates Cognito user + tenant DynamoDB record + API key in one flow; user gets temp password email and can log in immediately.

- ✅ Onboarding 3-step UI
- ✅ `gw-ms-tenant-provisioning-staging` Lambda (writes tenant to DynamoDB)
- ⏳ Lambda doesn't yet create Cognito user or generate API key
- ⏳ Onboarding page generates tenant ID client-side instead of calling the Lambda

### UI/UX Enterprise Redesign
**Goal:** Settings with tabbed navigation (one section visible at a time), Monitor page with better data hierarchy, Nav with clearer active states and icons.

- ⏳ Settings tab nav (General | Agent | Integrations | API Keys | Carbon Budget | Team)
- ⏳ Monitor layout reorder (grid intensity in KPI row, compact regions row)
- ⏳ Improved Nav with status indicators

---

## Pipeline 🗺️

| Feature | Priority | Notes |
|---|---|---|
| Science-Based Targets + Decarbonisation Roadmap | High | Reduction trajectory vs SBTi benchmarks |
| Scope 3 AWS Cloud (Cost Explorer API) | High | Cloud carbon via same-account Cost Explorer |
| Telemetry enforcement mode | Medium | Per-tenant flag to reject invalid API keys |
| Multi-Entity Org Hierarchy + RBAC | Medium | Cognito Groups, parent/child tenants |
| Peer Benchmarking | Medium | Needs industry benchmark dataset |
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
NEXT_PUBLIC_APP_URL=https://16-174-1-7.nip.io
```

---

## Deploy to EC2

```bash
ssh -i ~/Downloads/gw-deploy-key.pem ubuntu@16.174.1.7
cd /home/ubuntu/gridwitness-dashboard
git pull origin main && npm run build && pm2 restart gridwitness-dashboard
```

---

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
