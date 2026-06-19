# GridWitness — Customer Setup & Configuration Guide

> **Who this guide is for:** The person at your organization responsible for setting up GridWitness. This could be your CFO, VP of Sustainability, Chief Risk Officer, or IT Manager. No technical background is required. Every field is explained in plain language.
>
> **Goal:** Walk through every screen and every input box so the platform produces accurate, auditable reports that satisfy OSFI B-15, Bill C-59, TCFD, and IFRS S2 regulatory requirements. Numbers that come from incomplete setup lead to zeros or defaults in reports — which could be questioned during a regulator's review. Taking 30–60 minutes to fill in these settings correctly pays off every time you generate a disclosure.
>
> **Maintenance:** Update this guide whenever new settings tabs or fields are added to the platform.

---

## Table of Contents

1. [Before You Start — What You Will Need](#1-before-you-start--what-you-will-need)
2. [Onboarding — Creating Your Account](#2-onboarding--creating-your-account)
3. [Settings Tab: Overview](#3-settings-tab-overview)
4. [Settings Tab: Agent & Scope 1 (Direct Fuel)](#4-settings-tab-agent--scope-1-direct-fuel)
5. [Settings Tab: Grid Alert Thresholds](#5-settings-tab-grid-alert-thresholds)
6. [Settings Tab: Integrations & API Keys](#6-settings-tab-integrations--api-keys)
7. [Settings Tab: Carbon Budget](#7-settings-tab-carbon-budget)
8. [Settings Tab: SBTi Targets](#8-settings-tab-sbti-targets)
9. [Settings Tab: Scope 3 — AWS Cloud Emissions](#9-settings-tab-scope-3--aws-cloud-emissions)
10. [Settings Tab: Carbon Tax](#10-settings-tab-carbon-tax)
11. [Settings Tab: RECs & PPAs](#11-settings-tab-recs--ppas)
12. [Settings Tab: Carbon Offsets](#12-settings-tab-carbon-offsets)
13. [Settings Tab: Enforcement Mode](#13-settings-tab-enforcement-mode)
14. [TCFD Profile — Filling In the Four Pillars](#14-tcfd-profile--filling-in-the-four-pillars)
15. [IFRS S2 Profile — Filling In the Disclosure Fields](#15-ifrs-s2-profile--filling-in-the-disclosure-fields)
16. [Compliance — Generating Reports and Attestations](#16-compliance--generating-reports-and-attestations)
17. [Regulatory Filing Calendar](#17-regulatory-filing-calendar)
18. [Checklist — Minimum Setup for a Compliant Report](#18-checklist--minimum-setup-for-a-compliant-report)

---

## 1. Before You Start — What You Will Need

Gather this information before you sit down to configure the platform. Having it ready will make the setup much faster.

| What you need | Where to find it |
|---|---|
| Your organization's legal name and CRA Business Number | Corporate registration documents |
| Province/territory of primary operations | Office/facility address |
| Fiscal year-end month (e.g., December 31) | Audited financial statements |
| Number of employees and annual revenue (CAD) | HR records, annual report |
| Your baseline year's total GHG emissions (tCO₂e) | Previous GHG audit report or consultant estimate |
| Your most recent monthly natural gas bill (or metered GJ consumption) | Utilities |
| Your most recent diesel purchase records (litres) | Fuel receipts |
| Any Renewable Energy Certificate (REC) paperwork | From your renewable energy supplier |
| Any carbon offset certificates you have purchased | From your offset registry (Gold Standard, Verra VCS, Alberta TIER, etc.) |
| Your SBTi commitment letter (if you have committed) | Corporate sustainability documents |
| AWS account access (for Scope 3 cloud carbon sync) | AWS Console (Billing → Cost Explorer) |

---

## 2. Onboarding — Creating Your Account

When you first log in, the platform runs a three-step onboarding wizard.

### Step 1: Organization Details

**Organization Name**
Enter your full legal organization name exactly as it appears on your CRA registration. This name appears on every regulatory report and board attestation.

**Industry**
Select the category that best describes your primary business (e.g., Financial Services, Data Centres, Oil & Gas, Mining, Technology). This affects which regulatory frameworks are highlighted as most relevant.

**Province**
Select the province where your primary operations are located. For Alberta operations this is especially important: the platform reads Alberta AESO grid data for your Scope 2 emissions calculations. If you operate in multiple provinces, choose your highest-emission location.

**City**
Your city of operations. Used in report headers.

**Employee Count**
Your approximate headcount at the time of onboarding. This is used in IFRS S2 and TCFD disclosures as context for your organization's scale.

**Annual Revenue (CAD)**
Your previous fiscal year's revenue in Canadian dollars. Used to contextualize emissions intensity (tCO₂e per million CAD of revenue) in reports.

**Fiscal Year End**
The last month of your fiscal year (e.g., "December 31" or "March 31"). This determines which months are included when you generate annual reports.

**Primary Contact Email**
The email address of the person who should receive system alerts (budget breach notifications, deadline reminders, attestation requests). You can change this later.

### Step 2: Deploy an Agent

This step installs a small script on one of your servers or computers. The agent reads how much electricity your hardware is consuming (in watts) and sends that reading to the platform automatically every few minutes. This is what enables real-time Scope 2 emissions tracking without waiting for monthly utility bills.

**Choose your agent type based on your hardware:**

- **Redfish/BMC** — For enterprise servers (Dell PowerEdge, HP ProLiant, Supermicro). Reads actual power draw from the server's built-in power management chip. Most accurate.
- **GPU Mining** — For NVIDIA or AMD GPU arrays (cryptocurrency mining, AI training).
- **ASIC Miner** — For Bitcoin/cryptocurrency ASICs (Antminer, Whatsminer).
- **Linux** — For any Linux server or workstation. Reads CPU load as a proxy for power consumption.
- **Windows** — For Windows servers. Same approach, using PowerShell.
- **Docker** — For containerized workloads. Deploy as a sidecar.
- **Kubernetes** — For cluster deployments. Deploy as a DaemonSet.

Copy the script shown on screen and paste it into your server's terminal. The script runs once, installs itself, and sends your API key with each reading.

**API Key:** The wizard generates this automatically. Keep a copy somewhere safe — you will need it if you add more agents later. If you lose it, you can generate a new one under Settings → Integrations & API Keys.

### Step 3: Verify

The platform shows a green "Live Telemetry Received" confirmation when your first agent reading arrives. If you do not see this within 5 minutes, check that the agent script is running and that your firewall allows outbound HTTPS to the platform's API address.

---

## 3. Settings Tab: Overview

The Overview tab shows a summary of your current configuration: tenant ID, industry, province, and a list of which tabs still need to be filled in. Think of it as your setup checklist. Items shown with a grey dot need your attention before reports will be complete.

---

## 4. Settings Tab: Agent & Scope 1 (Direct Fuel)

This is one of the most important tabs. It handles two things:

1. **Agent scripts** — deploy additional hardware monitoring agents beyond the one set up during onboarding.
2. **Scope 1 entries** — manually record fuel combustion (natural gas, diesel, propane, etc.) that your agents cannot measure automatically.

### Why Scope 1 matters for your reports

Scope 1 covers direct burning of fossil fuels on-site: heating your building with natural gas, running a diesel backup generator, fuelling a company vehicle fleet, propane forklifts, and so on. Most Canadian regulatory frameworks require you to disclose Scope 1. It is also directly subject to the federal carbon price (GGPPA), so missing entries mean your carbon tax liability will appear lower than it really is — a discrepancy that regulators will spot when they compare your utility bills to your disclosure.

### Adding a Scope 1 Record

**Fuel Type**
Choose from the dropdown: Diesel, Natural Gas, Propane, Heavy Fuel Oil, Gasoline, or Coal. The emission factor applied automatically per the ECCC National Inventory Report 2024 (e.g., natural gas = 1.96 kgCO₂e/GJ, diesel = 2.68 kgCO₂e/L).

**Quantity**
Enter how much fuel was consumed. The unit displayed changes to match the fuel type:
- Natural Gas: GJ (gigajoules). You can find this on your gas utility bill. Bill typically shows m³ — divide by 0.037 to get GJ. Or ask your supplier for the GJ figure directly.
- Diesel: Litres. Use your fuel purchase receipts.
- Propane: Litres. Use your propane delivery receipts.
- HFO (Heavy Fuel Oil): Litres.
- Gasoline: Litres.
- Coal: Metric tonnes.

**Period Start / Period End (optional)**
If this entry covers a specific time period (e.g., January fuel bill), enter the start and end dates. These are used for annual and quarterly report period filtering. If you leave them blank, the RecordedAt timestamp (the moment you click Save) is used.

**Notes (optional)**
Free-text. Write something descriptive like "Building heating — January 2026 SHM Building" or "Emergency generator test — April 20." These notes appear in the raw data export and can help auditors understand each entry.

### Tip: How often to enter Scope 1 records

Monthly is ideal — enter each natural gas bill and each diesel fuel receipt as soon as they arrive. This keeps your year-to-date numbers current and prevents a large manual catch-up at year-end.

### BMS Integration (Building Management System)

If your building already has a BMS (Johnson Controls, Honeywell, Siemens, etc.) that tracks gas and fuel consumption via REST API or Modbus, the BMS Integration tab shows connection scripts that can feed readings automatically. Talk to your facilities IT team to connect this.

---

## 5. Settings Tab: Grid Alert Thresholds

These are the numbers that define when the platform raises an alarm about your local electricity grid. They directly control what shows up on the Incidents page and whether you see alert badges on the Monitor screen.

### Carbon Alert (gCO₂/kWh)
This is the carbon intensity of the electricity grid measured in grams of CO₂ per kilowatt-hour.

- **What to enter:** The threshold above which you consider the grid "dirty" and want to be alerted. For Alberta (AESO), the typical range is 400–700 gCO₂/kWh depending on gas versus coal generation mix. A value of 600 is a reasonable starting point.
- **Why it matters:** When the live grid intensity exceeds this value, an incident is created automatically. You can use these incidents in your OSFI B-15 and TCFD reports as evidence of climate risk monitoring. If you leave this at the default, you may get too many (or too few) alerts, making the incident log look noisy or empty.

### Load Alert (% capacity)
This is the grid load as a percentage of total available generation capacity.

- **What to enter:** The percentage above which you consider the grid under strain. 85% is common industry practice. Above this level, there is elevated risk of emergency generation (typically gas peakers) coming online, which increases grid intensity sharply.
- **Why it matters:** Alerts at high load help you shift non-critical compute workloads to off-peak hours, which lowers your real-time Scope 2 emissions and demonstrates active carbon management in TCFD Strategy disclosures.

### Price Alert ($/MWh)
The electricity spot price threshold in dollars per megawatt-hour.

- **What to enter:** The price above which electricity is unusually expensive. For Alberta Power Pool, $100/MWh is moderate; $200/MWh signals high-demand or supply stress conditions. Use a value that reflects your organization's tolerance for energy cost exposure.
- **Why it matters:** High prices correlate with high carbon intensity in Alberta. This alert helps your operations team make decisions about timing energy-intensive work.

---

## 6. Settings Tab: Integrations & API Keys

### API Keys

API keys are how your agents authenticate when they send telemetry readings to the platform.

**Create a new key**
Click "Create API Key." The full key (format: `gwk-{48 characters}`) is shown only once. Copy it immediately and save it in a secure place (password manager or secrets vault). The platform stores only a hash of the key — it cannot show you the plaintext again.

**Key Label**
Give the key a memorable name: "Rack A Server Room", "GPU Farm Floor 2", "Backup Generator Monitor." This helps you know which agent is using which key when you review the key list.

**Revoking a key**
If an agent device is decommissioned, click the trash icon next to its key to revoke it. Revoked keys stop working immediately — any agent using that key will stop being able to send data.

**How many keys to create**
One key per physical location or team is a reasonable approach. Do not share a single key across dozens of devices if you want to be able to selectively revoke access. There is no cost to creating additional keys.

---

## 7. Settings Tab: Carbon Budget

The Carbon Budget is your organization's self-declared annual greenhouse gas ceiling — the maximum total tCO₂e you are committing to emit in a given year. Setting this correctly is important because:

1. The Monitor page shows a real-time burn-rate gauge against this budget.
2. The platform sends automated email alerts when you hit 80%, 95%, and 100%.
3. Your OSFI B-15 and TCFD reports reference the budget as your internal carbon governance mechanism.
4. The Carbon Tax tab uses it to project when you will exceed your self-imposed ceiling.

### Budget (tCO₂e)

Enter your annual Scope 1 + Scope 2 + Scope 3 emissions ceiling in metric tonnes of CO₂ equivalent. If you have never calculated this before, use last year's total verified emissions as a starting point. If you have an SBTi commitment, use the SBTi-derived target for this year (the SBTi tab will calculate this for you after you fill in your baseline).

**Example:** If your 2025 verified emissions were 42.5 tCO₂e and you want to reduce 10%, enter 38.3 tCO₂e as your 2026 budget.

### Period Type

- **Monthly:** The budget is divided into 12 equal slices. The alert fires when your monthly slice is exceeded, then resets.
- **Quarterly:** Divided into 4 slices.
- **Annual (recommended):** The full year is tracked as one period. Most disclosure frameworks measure annually, so this aligns with how your reports are generated.

### Notification Email

The email address that receives budget breach alerts. This can be different from the primary contact set during onboarding — for example, you might want the CFO or VP of Sustainability to receive these directly.

### Thresholds

The platform alerts you at three levels: 80% (early warning), 95% (imminent breach), and 100% (ceiling hit). These are set by default and do not need to be changed unless you want different trigger points.

---

## 8. Settings Tab: SBTi Targets

The Science Based Targets initiative (SBTi) provides a methodology for setting emissions reduction targets that are scientifically aligned with limiting global warming. Many companies voluntarily commit to SBTi; under OSFI B-15 and IFRS S2, you are required to disclose whether you have a target and its pathway.

Filling in this tab is what unlocks the "Decarbonisation Trajectory" chart and allows your TCFD and IFRS S2 reports to show your annual reduction pathway rather than "target not configured."

### Target Pathway

Choose one of three options:

- **1.5°C Pathway (4.2% per year):** The most aggressive reduction pathway, aligned with limiting warming to 1.5°C above pre-industrial levels. Required if you have formally committed to SBTi's 1.5°C corporate standard or are a financial institution following OSFI best practice guidance.
- **Well-Below 2°C (2.5% per year):** A moderately aggressive target, aligned with the Paris Agreement's "well-below 2°C" goal. Acceptable for many sectors but less defensible in a financial sector regulatory context post-2025.
- **Custom Rate:** Enter your own annual percentage reduction if you have a board-approved target that differs from the standard pathways (e.g., 3.5% per year because of a specific board resolution or sector-specific SBTi pathway).

### Base Year

The year against which your reduction target is measured. This should be the year of your first verified GHG inventory — typically 2019 or 2022. If you are newly forming your baseline, use the current year's full-year emissions once you have them.

**Important:** Once you set a base year and begin regulatory reporting, changing it will require a restatement explanation in your disclosures. Choose carefully.

### Baseline Emissions (tCO₂e)

Your total verified Scope 1 + Scope 2 + Scope 3 emissions in the base year, in metric tonnes of CO₂ equivalent.

**Where to find this:** Your GHG audit report from your independent verifier (e.g., MNP, KPMG, Deloitte sustainability practice). If you have never had a GHG audit, use your best estimate based on utility bills and fuel receipts for the base year, and have it verified by a qualified consultant before formal regulatory filing.

**Example:** If your 2022 total emissions were 48.2 tCO₂e, enter 48.2.

### Target Year

The year by which you will achieve the target percentage reduction. Most SBTi commitments use 2030 as the target year. OSFI B-15 encourages 2030 interim targets and 2050 net-zero commitments.

### Sector

Describe your sector in the text field (e.g., "Data Centres", "Financial Services", "Mining"). This appears in report headers and clarifies which SBTi sector guidance applies.

### After saving

The platform immediately calculates and displays a year-by-year decarbonisation trajectory, showing your allowed emissions ceiling for each year from now until the target year. This table flows directly into TCFD Section 4 (Metrics & Targets) and IFRS S2 paragraph S2.29.

---

## 9. Settings Tab: Scope 3 — AWS Cloud Emissions

Scope 3 Category 11 covers emissions from your cloud computing usage. If your organization uses AWS (Amazon Web Services), the platform can automatically retrieve your monthly cloud spend and convert it to estimated CO₂e using regional grid intensity factors.

### Month

Select the year and month you want to pull data for. Start with the most recent completed month.

### Sync from AWS

Click "Sync from AWS." This calls the AWS Cost Explorer API using your platform's IAM role and reads your compute spend by AWS region.

**If you see an error "Cost Explorer not enabled":** This is a one-time setup step in your AWS account. Log in to the AWS Console → Billing Dashboard → Cost Explorer → Enable. It takes approximately 24 hours to activate. Come back the next day and click Sync again.

**What the sync produces:**
- Your total AWS compute spend in USD for the selected month
- An estimate of kWh consumed, derived from AWS regional average power usage effectiveness (PUE) and server utilization benchmarks
- A breakdown of CO₂e by AWS region, using each region's published grid intensity factor

### Why this matters for your reports

Scope 3 is increasingly required in disclosures. IFRS S2 requires disclosure of material Scope 3 categories. Cloud compute is the dominant Scope 3 source for most technology and financial services companies. A Scope 3 figure of zero in your report will prompt questions from auditors and regulators — it looks like you simply did not measure it.

### Limitation to note

The cloud carbon estimate is an approximation. AWS does not provide exact hardware-level energy data for shared infrastructure. The methodology is documented in each report as "AWS Cost Explorer + regional intensity factor estimate" so auditors understand its nature. For a more precise figure, consider purchasing AWS's Customer Carbon Footprint Tool report from your AWS account team.

---

## 10. Settings Tab: Carbon Tax

This tab is read-only — it automatically calculates your carbon tax liability using your emissions data from other tabs. You do not need to enter anything here. But understanding what it shows is important for your CFO and board.

### What you see

**YTD Liability:** Your year-to-date carbon tax exposure in Canadian dollars, calculated as:
`(Scope 1 kgCO₂e + Scope 2 kgCO₂e + Scope 3 kgCO₂e) ÷ 1000 × $/tCO₂e for current year`

For 2026 the carbon price is $95/tCO₂e under the federal GGPPA schedule. For 2030 it reaches $170/tCO₂e.

**Annualised Liability:** Projects your YTD figure to a full-year estimate based on how far through the year you are.

**2030 Exposure (flat):** Shows what your carbon tax bill will be in 2030 if you make no emissions reductions (flat scenario). This is an important number to show your board — it makes the financial case for decarbonisation concrete.

**SBTi Path toggle:** If you have filled in the SBTi Targets tab, you can toggle to the "SBTi Path" view. This shows your projected carbon tax liability year-by-year if you successfully reduce emissions along your SBTi trajectory. The savings between the flat and SBTi scenarios (shown in the green banner at the bottom) is the financial benefit of your decarbonisation investment.

### What flows into reports

The OSFI B-15, TCFD, and IFRS S2 PDFs all include your carbon tax liability figures in their metrics sections. This is a required disclosure under OSFI B-15 Section 6 (Financial Impacts) and IFRS S2 paragraph S2.29.

---

## 11. Settings Tab: RECs & PPAs

A Renewable Energy Certificate (REC) represents 1 megawatt-hour (MWh) of renewable electricity generated and delivered to the grid. When you purchase and retire a certified REC, you are legally claiming that the electricity behind that certificate was renewable — which reduces your Scope 2 emissions under the GHG Protocol's market-based method.

Under Bill C-59 (Canada's anti-greenwashing law, effective June 2024), you can only make public net-zero or renewable energy claims if your RECs are certified by a recognized body. The platform enforces this automatically.

### When to use this tab

- You have purchased green power from your utility and received REC certificates.
- You have a Power Purchase Agreement (PPA) with a renewable energy developer.
- You have purchased I-RECs or EcoLogo-certified certificates independently.

### Adding a REC

**Type**
Choose the instrument type:
- **REC:** Standard standalone renewable energy certificate.
- **PPA:** Power Purchase Agreement — long-term contract with a renewable generator.
- **VPPA:** Virtual Power Purchase Agreement — financial contract, no physical delivery.
- **BUNDLED_REC:** REC comes bundled with the electricity supply.
- **UNBUNDLED_REC:** REC purchased separately from the electricity.
- **GREEN_TARIFF:** Utility green power program.

If you are unsure, ask your renewable energy supplier. The most common in Canada is a standalone REC or a Bundled REC.

**MWh (required)**
The megawatt-hours covered by this certificate. Enter the number exactly as it appears on the certificate. One REC = 1 MWh.

**Provider**
The name of the company that issued the certificate (e.g., "Enel Green Power Canada", "TransAlta Renewables", "AltaLink").

**Certificate No.**
The unique serial number printed on your REC certificate or confirmation email. This is critical for audit purposes — if a regulator asks for proof, this is what they will verify against the registry.

**Certified By (required for Bill C-59 compliance)**
The certifying body that issued the REC. Choose from:
- **EcoLogo** — Canadian government-backed standard (now Underwriters Laboratories EcoLogo). Valid in Canada.
- **Green-e** — US-based, widely recognized, acceptable in Canada.
- **I-REC** — International REC Standard. Used globally.
- **TIGR** — Tradeable Instruments for Global Renewables. Used in North America.
- **RE100** — Used by companies in the RE100 corporate renewable energy initiative.
- **IREC** — A variant of I-REC. Used in some US/Canadian contexts.

The platform checks that the certifying body is on this recognized list. If your REC was issued by a body not on this list, it will be flagged as "Not Bill C-59 Compliant" — meaning you cannot make public net-zero claims based on it without additional documentation.

**Fuel Type**
The energy source: solar, wind, hydro, geothermal, biomass, or tidal. Select what matches your certificate.

**Vintage Year**
The year the electricity was generated. This must match your reporting year for the REC to count toward your current year's Scope 2 reduction. For 2026 reporting, you need 2025 or 2026 vintage RECs.

**Province**
The Canadian province where the generation occurred. Enter AB for Alberta, BC for British Columbia, etc.

**Price/MWh (optional)**
What you paid per MWh for the certificate in CAD. Optional, but useful for tracking your renewable energy investment.

### Retiring a REC

A REC only counts toward your Scope 2 market-based calculation if it is "retired" — permanently cancelled in the registry so no one else can use it. After adding a REC, click the "Retire" button next to it. The platform will mark it retired for the current year.

**Once a REC is retired, it cannot be unretired.** Do not retire a REC until you are ready to apply it to a specific year's reporting.

### What happens after retirement

The Market-Based Scope 2 summary at the top of this tab updates automatically:
- **Location-Based tCO₂e:** Your total Scope 2 based on grid emissions (this does not change)
- **Market-Based tCO₂e:** Location-based minus (retired MWh × 0.50 tCO₂e/MWh Alberta grid factor)
- **Reduction %:** How much you have reduced your Scope 2 through RECs
- **Bill C-59:** COMPLIANT or NOT COMPLIANT depending on your certifying body

These numbers flow directly into all PDF reports. Both the location-based and market-based figures appear side-by-side in TCFD and IFRS S2 reports as required by GHG Protocol Scope 2 Guidance.

---

## 12. Settings Tab: Carbon Offsets

Carbon offsets are verified reductions in greenhouse gas emissions that occur somewhere in the world — a reforestation project, a methane capture system, a clean cookstove program. When you purchase and retire an offset, you are compensating for emissions that you have not yet been able to eliminate at the source.

Offsets are separate from RECs (which address electricity specifically). Offsets can be used to bring your total Scope 1 + Scope 2 + Scope 3 net position toward zero.

**Important:** Offsets should complement, not replace, actual emissions reductions. Regulators and the SBTi do not allow offsets to count toward your science-based reduction targets — they are only valid as a separate disclosure of net position.

### Adding a Carbon Offset

**Registry (required)**
The organization that issues and tracks the offset credit. Choose from:
- **Gold Standard** — High-quality voluntary offset standard, widely respected globally. Best choice for public claims.
- **Verra VCS** — Verified Carbon Standard, the most widely used voluntary carbon market registry.
- **Alberta TIER** — Alberta's provincial offset system. Specifically relevant if you operate in Alberta and owe TIER compliance obligations.
- **ACR** — American Carbon Registry. US-focused but accepted in Canada.
- **CAR** — Climate Action Reserve. US-focused.
- **EcoTrust CA** — Canadian focus.
- **Ontario Carbon (OBIN)** — Ontario-focused.
- **Custom** — For other registries not on the list. Use only if you have a clear audit trail.

**Quantity (tCO₂e) (required)**
The number of tonnes of CO₂ equivalent the offset represents. Enter exactly as it appears on your retirement certificate.

**Serial Number**
The registry serial or certificate number. Essential for audit evidence — an auditor will cross-reference this against the registry's public database. Enter it exactly.

**Project Name**
The name of the specific project your offset comes from (e.g., "British Columbia Improved Forest Management", "Kenya Cookstoves Initiative"). This appears in reports as evidence that the offset is real and traceable.

**Project Type**
Choose the category that best describes the project:
- reforestation, afforestation, improved forest management, soil carbon, methane capture, renewable energy, cookstoves, blue carbon, direct air capture, avoided deforestation.

**Vintage Year**
The year the emissions reduction occurred. For reporting year 2026, you should use vintage 2025 or 2026 offsets.

**Country**
Two-letter ISO country code (e.g., CA for Canada, KE for Kenya, BR for Brazil). Where the offset project is located.

**Price/tCO₂e (CAD) (optional)**
What you paid per tonne. For your own records and cost tracking.

**Registry URL (optional)**
The direct link to your credit on the registry's public database (e.g., `https://registry.verra.org/...`). Providing this link in reports gives auditors direct one-click verification.

### Retiring an Offset

Same as RECs — click "Retire" to permanently apply the offset to the current year. Once retired, it cannot be re-used.

### What happens after retirement

The Net Emissions Position panel at the top of the tab updates:
- **Gross tCO₂e:** Your total emissions before offsets
- **Offsets Retired:** How many tCO₂e you have cancelled
- **Net tCO₂e:** Gross minus offsets
- **Reduction %:** Your net reduction achieved
- **Net-Zero Ready:** A green badge appears if your net position is less than 0.01 tCO₂e — meaning you can credibly claim net-zero for the year

These figures appear in TCFD and IFRS S2 PDF reports in the GHG inventory table as a separate "NET POSITION" row. This is what auditors, investors, and regulators check when evaluating your net-zero claim.

---

## 13. Settings Tab: Enforcement Mode

This setting controls what happens when an agent sends data using an invalid or expired API key.

**Audit Mode (default — use when setting up)**
Invalid API keys are logged as a warning, but the data is still recorded. Use this mode during your initial rollout while you are getting all agents connected correctly. It is forgiving of configuration mistakes.

**Enforcement Mode (use in production)**
Invalid API keys are silently rejected. No data is written to the ledger. This prevents unauthorized devices from injecting data into your immutable audit trail. Once all your agents are confirmed working, switch to Enforcement Mode.

**When to switch:** After you have confirmed via the Monitor page that all your agents are reporting successfully and all API keys are valid. Once switched, any misconfigured agent stops sending data — which will show as a gap in your telemetry stream.

---

## 14. TCFD Profile — Filling In the Four Pillars

Navigate to the TCFD page (top navigation). After generating your first report, you will see the four TCFD pillars: Governance, Strategy, Risk Management, and Metrics & Targets. Each section has fields that flow directly into your TCFD PDF report.

### Pillar 1: Governance

**Board Committee**
Does your board have a committee responsible for overseeing climate-related risks? Toggle yes/no.

**Board Committee Name**
If yes, what is it called? (e.g., "Risk and Environment Committee", "Audit and Sustainability Committee"). Enter the exact committee name as it appears in your board charter or annual report.

**Executive Compensation Linked**
Is climate performance a factor in your executive compensation plan? Toggle yes/no. OSFI B-15 and TCFD expect this for higher-category FRFIs.

**CSO / Chief Sustainability Officer**
Does your organization have a designated executive responsible for climate risk? Toggle yes/no.

**Audit Committee Scope**
Has your audit committee formally included climate financial risk in its mandate? Toggle yes/no.

**Climate Risk Policy**
Do you have a documented climate risk management policy approved by the board? Toggle yes/no.

### Pillar 2: Strategy

**Time Horizons — Short / Medium / Long**
Describe your climate-related risks and opportunities across three time horizons. Write in plain sentences — these appear verbatim in the PDF.

- **Short (0–3 years):** E.g., "Federal carbon price rising to $110/tCO₂e by 2026 creates direct fuel cost exposure. TIER compliance obligations managed through offset purchase."
- **Medium (3–10 years):** E.g., "Transition to 50% renewable electricity by 2030 via long-term PPA. SBTi 46% reduction target by 2030."
- **Long (10+ years):** E.g., "Net-zero Scope 1 and 2 by 2040. Physical risk adaptation of Calgary data centre to extreme heat events by 2035."

**Scenario Analysis**
Have you conducted scenario analysis? Toggle yes/no.

**Scenarios Used**
Which scenarios did you use? (e.g., "NGFS Orderly, Disorderly, and Hot House World" or "IEA Net-Zero 2050 and Stated Policies"). Enter what matches your most recent climate risk assessment.

### Pillar 3: Risk Management

**Identification Process**
How does your organization identify climate-related risks? Write 2–4 sentences. Example: "Quarterly enterprise risk register review with climate lens. Physical risks assessed for flood and extreme heat exposure at our Calgary facility. Transition risks assessed against federal carbon price schedule through 2030."

**Assessment Process**
How do you assess these risks? Example: "NGFS scenario analysis across three pathways. Financial impact quantification via Monte Carlo simulation on carbon tax liability. Physical risk: $2.1M asset exposure to acute flood events estimated by our P&C insurer."

**Management Process**
How do you manage climate risks day-to-day? Example: "Monthly carbon budget alerts via GridWitness platform. Real-time hardware telemetry triggers incident escalation when grid carbon intensity exceeds threshold. Board climate KPIs included in executive compensation review."

**Monitoring Frequency**
How often do you review climate risks? Example: "Real-time monitoring via GridWitness telemetry. Monthly management reporting. Annual board-level disclosure. Annual third-party GHG verification by MNP LLP."

### Pillar 4: Metrics & Targets

**Baseline Year**
The year your reduction target is measured from (same as SBTi Base Year in Settings).

**Target Year**
The year by which you achieve the target (typically 2030).

**Temperature Alignment**
1.5C or WB2C (Well-Below 2°C), matching your SBTi pathway.

**Internal Carbon Price (CAD/tCO₂e)**
The shadow carbon price your organization uses for internal capital allocation decisions. Many companies use the current or projected government price ($95–$170/tCO₂e). Using an internal price aligned to government policy signals strong governance to OSFI.

**Reduction Target %**
Your total percentage reduction target by the target year (e.g., 46% by 2030 for a 1.5°C pathway starting from 2022).

---

## 15. IFRS S2 Profile — Filling In the Disclosure Fields

Navigate to the IFRS S2 page. This covers three sections.

### Section 1: IFRS Configuration

**Scope 2 Method**
Choose MARKET_BASED if you have RECs (which you should, given you have set up the RECs tab). Choose LOCATION_BASED if you have no market instruments. This controls which Scope 2 figure appears in your primary IFRS S2 GHG table.

**Internal Carbon Price (CAD/tCO₂e)**
Same as the TCFD field — the shadow price used for internal decisions. Enter the same value you used in TCFD for consistency.

**Internal Carbon Price Scope**
Describe which emissions the internal price applies to. Example: "Scope 1 and Scope 2 emissions." or "All direct emissions above 1 tCO₂e per month."

**Disclosure Period**
The time period your disclosure covers. Example: "Annual fiscal year ending December 31."

**Materiality Threshold**
The threshold below which a category of emissions is considered immaterial and excluded. Example: "5% of total operating expenses." This is a judgment call — talk to your auditor if unsure.

### Section 2: SASB Metrics (Technology Sector)

These are Technology & Communications sector metrics from the Sustainability Accounting Standards Board (SASB). They appear in IFRS S2 reports for data centre and technology companies.

**Data Centre PUE**
Power Usage Effectiveness: total data centre energy ÷ IT equipment energy. A PUE of 1.0 means 100% efficient (impossible in practice). Industry average is ~1.58. Best-in-class is 1.2–1.3.

*Where to find it:* Ask your data centre facilities manager. It is typically measured by the BMS. If you manage a colocation space, ask your colo provider for their published PUE.

**Server Utilization (%)**
Average CPU utilization across your server fleet. 50–70% is typical for well-managed infrastructure. Higher utilization means each watt of electricity does more work, reducing emissions per unit of output.

*Where to find it:* Your monitoring tool (Datadog, Prometheus, CloudWatch) can provide this. Ask your IT operations team for the average monthly figure.

**% of Operations Under Emissions Regulations**
What percentage of your operations are in jurisdictions covered by carbon pricing or emissions reporting regulations? For Alberta-based operations, this is 100%. For operations spanning regulated and unregulated jurisdictions, calculate the percentage by revenue or headcount.

**Renewable Energy %**
What percentage of your total electricity consumption came from renewable sources (either through RECs or direct renewable procurement)? The platform calculates this automatically once your RECs are set up — enter the same figure here for consistency.

### Section 3: Capital Deployment

**Green CapEx (CAD)**
Capital expenditure in the current year directly tied to climate or sustainability goals. Examples: LED lighting retrofits, solar panel installation, energy-efficient server replacement, EV fleet conversion, building insulation upgrades.

**Green CapEx Description**
Describe each investment briefly. Example: "LED retrofit $45K Q1 completed, server consolidation $85K Q2–Q3 in progress, solar feasibility study $50K Q4."

**Climate Risk CapEx %**
What percentage of total capital expenditure this year was influenced by climate risk? Include both adaptation (physical risk: flood barriers, cooling upgrades) and mitigation (renewable energy, efficiency). Typical range for a mid-market company newly addressing climate risk is 5–15%.

**Climate OpEx (CAD)**
Operating expenditures directly tied to climate: GHG monitoring platform (like GridWitness itself), offset procurement, staff training on climate risk, sustainability consultant fees.

**Climate OpEx Description**
Brief list of each expense. Example: "GridWitness platform $18K, carbon offset purchases $24K, ESG staff training $8K."

---

## 16. Compliance — Generating Reports and Attestations

### Generating a PDF Report

Navigate to the Compliance page. Select the report type:
- **OSFI B-15:** For federally regulated financial institutions (banks, insurers, credit unions, trust companies). Nine sections including Merkle root hash chain and incident log.
- **TCFD:** Task Force on Climate-related Financial Disclosures. Four-pillar framework.
- **ISO 14064-1:** International GHG inventory standard. More technical, suitable for manufacturing or resource companies.

Click "Generate Report." The platform pulls all your configured data — Scope 1, 2, and 3 emissions, SBTi trajectory, carbon tax liability, RECs, offsets, governance fields, and risk disclosures — and produces a PDF within 10–30 seconds.

**If the report shows zeros:** Go back and verify that your Scope 1 records are entered, your agents are reporting telemetry, your Scope 3 sync has been run, and your TCFD/IFRS S2 profile sections are saved.

The report URL is a time-limited download link (valid for 1 hour). Download the PDF immediately and store it in your document management system.

### Board Attestation

After generating a TCFD or IFRS S2 report, you will see a "Request Board Attestation →" link below the download button. This is the digital sign-off workflow.

**Step 1:** Click "Request Board Attestation." On the Compliance page, a form opens pre-filled with the report type.

**Fields to fill in:**
- **Attester Name:** The full legal name of the board member, executive, or signing officer who will attest to the disclosure. Example: "Dr. Sarah Kim."
- **Attester Title:** Their official title. Example: "Chair, Risk and Environment Committee" or "Chief Risk Officer."
- **Attester Email:** The email address where they will receive the attestation link. This must be a valid, monitored email — the link is single-use and time-sensitive.
- **Report Type:** Pre-filled from the report you just generated (TCFD, IFRS S2, or OSFI).
- **Summary:** A short statement of what is being attested. Example: "I confirm that the TCFD disclosure for fiscal year 2026 accurately reflects our organization's climate risk governance, strategy, and metrics to the best of my knowledge."

**Step 2:** Click "Send Link." The attester receives an email with a link to a secure page showing the disclosure summary.

**Step 3:** The attester clicks the link, reads the summary, and confirms by checking the acknowledgment box. The platform creates a SHA-256 cryptographic seal of the attestation record, stores it in a tamper-proof vault (AWS S3 Object Lock COMPLIANCE mode, 7-year retention), and marks the corresponding filing calendar deadline as FILED.

**What you receive:** A sealed attestation with a reference hash (shown as first 8 characters ... last 8 characters of a 64-character code). You can copy this hash using the copy button and store it in your board minutes as proof of attestation. The seal cannot be deleted or altered by anyone — not even the platform administrators.

---

## 17. Regulatory Filing Calendar

Navigate to the Calendar page. The platform pre-populates the regulatory deadlines most relevant to your province and industry. Review each entry:

**Status options:**
- **UPCOMING:** Deadline is more than 30 days away. No action needed yet.
- **DUE_SOON:** Deadline is within 30 days. Begin preparing your report now.
- **OVERDUE:** Missed deadline. File as soon as possible and document the reason.
- **FILED:** Completed. The date filed is recorded.

**What to do with each deadline:**
1. Confirm the deadline date is correct for your specific regulator (dates can vary slightly depending on your fiscal year end and entity category).
2. Add notes in the Notes field with any regulator-specific reference numbers or submission portal URLs.
3. Once you complete the filing (e.g., submit your OSFI B-15 disclosure to OSFI's portal), mark it FILED and record the submission date.

**Automatic filing:** When a board member completes an attestation seal, the matching calendar deadline is automatically marked FILED. This closes the governance loop without manual steps.

---

## 18. Checklist — Minimum Setup for a Compliant Report

Use this checklist before your first regulatory filing. Every item in the "Required" column must be complete before a report will contain accurate data rather than zeros.

| # | Task | Tab / Page | Required for |
|---|---|---|---|
| 1 | Organization details complete (name, province, industry, fiscal year end) | Onboarding | All reports |
| 2 | At least one agent deployed and sending live telemetry | Onboarding / Integrations | Scope 2 (location) |
| 3 | At least 3 months of Scope 1 records entered (fuel type + quantity) | Agent & Scope 1 | Scope 1 reporting |
| 4 | Carbon Budget set (tCO₂e ceiling, notification email) | Carbon Budget | Incident alerts, OSFI |
| 5 | SBTi target configured (base year, baseline emissions, pathway) | SBTi Targets | TCFD Pillar 4, IFRS S2.29 |
| 6 | Scope 3 synced at least once (or explain why not applicable) | Scope 3 | IFRS S2, TCFD |
| 7 | TCFD Governance section saved | TCFD page | TCFD, OSFI B-15 |
| 8 | TCFD Strategy section saved (time horizons) | TCFD page | TCFD, OSFI B-15 |
| 9 | TCFD Risk Management section saved | TCFD page | TCFD, OSFI B-15 |
| 10 | TCFD Metrics & Targets section saved | TCFD page | TCFD |
| 11 | IFRS Config section saved (Scope 2 method, internal carbon price) | IFRS S2 page | IFRS S2 / CSDS 2 |
| 12 | SASB Metrics entered (PUE, server utilization) | IFRS S2 page | IFRS S2 SASB |
| 13 | At least one REC added and retired (if claiming market-based Scope 2) | RECs & PPAs | GHG Protocol Scope 2, Bill C-59 |
| 14 | Grid thresholds set to values that match your risk tolerance | Thresholds | Incident log, OSFI |
| 15 | Enforcement Mode toggled to Enforcement (after all agents confirmed working) | Enforcement | Data integrity, OSFI |
| 16 | Board Attestation completed for each major report | Compliance | OSFI B-15 §5.3, governance |
| 17 | Filing Calendar reviewed and deadlines confirmed | Calendar | All frameworks |

---

*Maintained by the GridWitness team. Update this guide whenever new Settings tabs, input fields, or regulatory requirements are added to the platform.*
*Version 1.0 — June 2026*
