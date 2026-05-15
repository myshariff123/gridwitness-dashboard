# GridWitness Dashboard

Frontend for the GridWitness ESG compliance platform.
Built with Next.js 14 · Tailwind CSS · Recharts · AWS Cognito.

## Live Backend
- API: `https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com`
- Cognito: `ca-central-1_IcSJiRC6e`
- Region: `ca-central-1` (Canadian sovereign)

---

## Deploy to Vercel (5 minutes)

### Step 1 — Push to GitHub
```bash
cd gridwitness-dashboard
git init
git add .
git commit -m "Initial GridWitness dashboard"
git remote add origin https://github.com/myshariff123/gridwitness-dashboard.git
git push -u origin main
```

### Step 2 — Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New Project**
3. Select the `gridwitness-dashboard` repository
4. Click **Deploy** — Vercel auto-detects Next.js

### Step 3 — Add Environment Variables
In Vercel → Project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://rdof7lrwfj.execute-api.ca-central-1.amazonaws.com` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `ca-central-1_IcSJiRC6e` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `4hpe00jpi8mlkntjkh8vkckqhv` |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | `gw-auth-staging-768949138583.auth.ca-central-1.amazoncognito.com` |
| `NEXT_PUBLIC_COGNITO_REGION` | `ca-central-1` |
| `NEXT_PUBLIC_APP_URL` | `https://app.gridwitness.ca` (or your Vercel URL) |

### Step 4 — Custom Domain (optional)
In Vercel → Project → Settings → Domains, add `app.gridwitness.ca`
Then add a CNAME record at your DNS provider:
```
app.gridwitness.ca → cname.vercel-dns.com
```

### Step 5 — Update Cognito Callback URLs
In AWS Console → Cognito → User Pool → App clients → `gw-api-client-staging`:
Add your Vercel URL to the callback URLs list:
- `https://your-project.vercel.app/auth/callback`
- `https://app.gridwitness.ca/auth/callback`

---

## Run Locally

```bash
npm install
npm run dev
# Open http://localhost:3000
```

---

## Pages

| Route | Description |
|---|---|
| `/auth` | Login via Cognito hosted UI |
| `/monitor` | Live telemetry dashboard |
| `/settings` | Integration & onboarding centre |
| `/compliance` | Auditor portal — generate OSFI B-15 PDFs |

---

## Architecture Notes
- Auth is PKCE flow — no client secrets stored in the browser
- All API calls go to the live API Gateway in ca-central-1
- Telemetry data shown is from mock data mirroring the WORM ledger structure
- Replace mock data in `lib/api.ts` with real GET endpoint calls as they are added

---

NimbleStride Inc. · Edmonton, Alberta · support@nimblestride.ca
