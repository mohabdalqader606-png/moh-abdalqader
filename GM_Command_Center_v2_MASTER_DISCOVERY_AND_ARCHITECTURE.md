# GM Command Center v2 — MASTER DISCOVERY & ARCHITECTURE

**Type:** Discovery + Target Architecture only. **No code, no SQL, no schema changes, no edits to any screen, not committed/pushed.**
**Baseline frozen:** `شاشة_الداشبورد_التنفيذي.html` @ commit `a8a0743` (Phase 1 complete, validated).
**Method:** every claim below is traced to a specific file:line from direct code inspection (this session's own reads + three targeted read-only research passes). Nothing is inferred from naming conventions or assumed to exist. Unconfirmed items are marked **Requires Verification** — never treated as present.

---

## 1. CURRENT STATE — FULL AUDIT

### 1.1 شاشة_الداشبورد_التنفيذي.html (GM Command Center, Phase 1 baseline)

| Capability | State |
|---|---|
| Auth | Supabase Auth + `profiles.allowed_apps` + `user_screen_permissions` (`screen_id='exec-dashboard'`) — works, same pattern as every other screen |
| Data ingestion | 7 manual SAP-paste import sources: sales+returns (UNION OINV/INV1 + ORIN/RIN1), collections (ORCT), purchases (OPCH/PCH1), AR aging+credit limit (OINV+OCRD), AP aging (OPCH), Warehouse 011 monthly balance (OINM), military price list (ITM1/OITM) |
| Persistence | Computed JSON blob → `exec_dashboard_state` Supabase table (`id='main'`), localStorage fallback. **Raw pasted data itself is not queryable by any other screen** — only this screen's own synced blob |
| KPIs live | Sales, Collections, AR, AP — 🟢 Available once pasted |
| KPIs conditional | Gross Profit, Gross Margin, Sales Target — 🟡 Conditional, **read-only** from `financials_app_state` (ported minimal GL aggregation, verified against manual calc: exact match) |
| KPIs blocked/deferred | Working Capital 🟠 (missing Inventory Days), Inventory Value ⚪ (no source anywhere in the system), Procurement 🔴 (link-out only, no data integration) |
| Sales analytics | Monthly/daily trend + drill-down, Sales Composition (regular + isolated Military Sales), Gross/Discount/Returns/Net breakdown, Partial Profit Bridge (Volume+Price computed; Cost/Discount/Returns effect = Data Required) |
| Rankings | Top Customers (Sales/Collection/Outstanding), Top Products (Value/Qty), Top Suppliers (Purchase Value/Outstanding AP) |
| Customer 360 | Modal: sales, collection, AR+aging, credit limit + over-limit flag, monthly trend, returns/discounts when available. **No margin** (by design — no cost data) |
| Management Attention Center | Structured records (Issue/Category/Severity/Impact/Age/Action/Source/Drilldown): sales/collections/purchases YoY delta, AR overdue >90d, credit-limit breach, AP overdue >90d. All fact-derived, documented thresholds |
| Data Status system | 🟢🟡🟠🔴⚪ applied to every conditional/unavailable element |
| External links | Header buttons open `المشتريات_الخارجية_الذكية.html` and `شاشة_التدقيق_الداخلي_الإداري.html` in new tabs — **navigation only, zero data exchange** |
| Explicitly NOT present | Inventory intelligence, Cash/liquidity, Forecasting, Risk heatmap, Decision Center, any Customer/Item/Department margin, Cost Effect, Landed Cost |

### 1.2 المشتريات_الخارجية_الذكية.html (Procurement Intelligence)

| Capability | State |
|---|---|
| Persistence | **IndexedDB only** (`kfc_foreign_procurement_v1`, v3) — 13 raw-data object stores + importLog/planOverrides/docOverrides/pilotReviews/meta. **Recommendation output is never persisted** — `RECO.allRecommendations()` recomputes fresh in-memory on every page load; nothing here is queryable by another screen without literally running this engine |
| Data sources w/ live SAP query | salesInvoices/salesReturns/purchaseInvoices (OINV/INV1, ORIN/RIN1, OPCH/PCH1), purchaseOrders (OPOR/POR1, open lines only), goodsReceipts (OPDN/PDN1 — **weak signal**: 0% of closed PO lines link to a GRPO vs. 83.8% linking straight to an A/P invoice), inventory (OITW+OWHS: OnHand/OnOrder/Committed, **snapshot only, no history**), batches (OBTN+OBVL+OCRD: Batch/InDate/MnfDate/ExpDate/BatchQty/UnitCost/SupplierName — **item-level only, no warehouse dimension**), suppliers (OCRD CardType='S': only CardCode/CardName/Country — **no live lead-time or MOQ field**), items (OITM+OITB: ItemGroup/UoM/UnitWeight/LeadTimeDays — **no cost/price field**), landedCost (OIPF/IPF1 — **defined but confirmed unused by the recommendation engine**) |
| Data sources, manual-only | MOQ + OrderMultiple (`itemSupplierMap`, **no SAP query — Excel/manual upload safety-net**), consumed by `RECO.roundToHistoricalMultiple()` |
| Recommendation object | Rich per-item shape (status/priority/confidence/reasons/narrative/coverageDays/recommendedQty…) but **no monetary value field** on the object itself, and **no BUY_NOW/BUY_SOON/REVIEW/EXPEDITE labels anywhere** — actual enum is CRITICAL/STOCKOUT_RISK/ORDER_SOON/IN_TRANSIT/MONITOR/OVERSTOCK/SLOW_MOVING/NO_ORDER (Arabic-labelled) |
| Supplier exposure | `RECO.supplierPurchasePlan()` exists — **quantity only** (`totalQty`), no currency total |
| Auth | Same pattern, `screen_id='foreign-procurement-intelligence'` |

### 1.3 شاشة_التدقيق_الداخلي_الإداري.html (Internal Audit & Governance)

| Capability | State |
|---|---|
| Persistence | **Pure localStorage** (`kaylani_audit_planner_v1`). Supabase used **only** for auth (`profiles`/`user_screen_permissions`) — zero business-data tables, zero cross-device sync of findings/risks |
| Findings | severity/riskLevel/priority (3 overlapping fields), status (open/action_plan/in_progress/retest/closed/reopened), targetDate, responsible (owner), category (19+ value taxonomy: sales/returns/collect/expense/journal/stock/purchasing/quality/fleet/sapit/hr/assets/gov/erm/compliance/cyber/bcp/hse/contracts…). **No repeat-finding flag. No monetary impact field** — `impact` is free text |
| Risks (`DB.risks`) | id/title/category/process/owner/status/likelihood/impact **(ordinal 1-5, not currency)**/controls[]/**treatment{strategy,plan,owner,targetDate,status}** (=mitigation)/review{lastReviewDate,nextReviewDate} — richly modeled, but same persistence problem |
| Exceptions (`DB.exceptions`) | Separate entity — **the only place in this screen with a real currency field**: `amount`, plus derived `highFinancialImpact = amount>=5000` |
| Scale | 28 distinct view sections — a full GRC platform, not a simple list |
| Auth | `screen_id='internal-audit-portal'`. The comment in `index.html` claiming this screen "has no login" is **stale/false** — it is fully gated |

### 1.4 محرك_القوائم_الختامية_والتحليل_المالي_v48.1_FS.html (Financial Statements Engine)

| Capability | State |
|---|---|
| GL ingestion | **Documented SAP HANA query exists and is shown to the user** (`q2`): `SELECT Account, RefDate, SUM(Debit), SUM(Credit) FROM JDT1 WHERE RefDate BETWEEN {FROM} AND {TO} GROUP BY Account, RefDate` — daily grain, auto-rolled to monthly by `loadMoves()` |
| Chart of accounts | OACT-sourced, **flat only** — no warehouse/item/department dimension. Code comments explicitly confirm this gap twice. An orphaned SAP Profit-Center query (`q7`, `JDT1.ProfitCode`) exists but **is never wired into anything** — dead code |
| Costing | **Zero inventory-costing concept anywhere** — no landed cost, no moving-average/FIFO for inventory. The only "FIFO" in the file is unrelated: a receivables-collection-allocation method for DSO |
| Budget | `S.budget[month][lineCode]`, monthly, **no department dimension**, IS synced to `financials_app_state` (confirmed not in `BIGKEYS`) |
| GP/COGS derivability | Confirmed and **already ported** into the dashboard (Phase 1) — GL-level monthly only, verified against manual calculation |
| Persistence | Supabase `financials_app_state`, single blob, same pattern as other screens |

### 1.5 Cross-cutting infrastructure

- **One Supabase project** (`fxjdmqqmcgccocfbgopm.supabase.co`) across every screen. Only two real shared tables: `profiles`, `user_screen_permissions`, `screens`. Every other table is a **single-row JSON blob per screen** (`exec_dashboard_state`, `financials_app_state`, `mil_branch_sales_state`, `debtaging_app_state`…) — **no relational business-data schema exists anywhere in this system.**
- **No live/relational SAP data table exists at all.** Every screen's entire data model is: paste a SAP HANA query result → compute in the browser → sync only the computed result.
- Portal (`index.html`, `main` branch) gates visibility via `PORTAL_APP_GATE` (app id → screen_id) in addition to `user_screen_permissions` — a card invisible in the portal does **not** mean the screen is unprotected; it can still be reached directly by URL if it has its own auth gate (all four screens above do).

---

## 2. TARGET ARCHITECTURE — SECTION-BY-SECTION EVALUATION

### A. Executive Snapshot
Keep exactly the 9 metrics requested, but **Cash/Liquidity must join the row as a 10th card explicitly marked ⚪ Coming Next** rather than silently omitted — the user's own list included it. No structural change beyond what Phase 1 already built; extending threshold configurability (currently hard-coded 5%/15%) into a settings panel is the only realistic near-term enhancement.

### B. Management Attention Center
Structure already correct and implemented. Two categories can be added **only if Internal Audit gets a persistence layer** (see K): "Overdue audit action" and "Recurring finding" — impossible today (no repeat-finding flag exists at all, confirmed, not just unsynced).

### C. Sales Performance
Sales employee/department/returns/discounts/gross/net are now real (Phase 1). **Department = SAP Branch (OBPL) only** — there is no other department dimension anywhere in the system (confirmed absent in financials engine too). Target/Budget: conditional, sourced from financials engine.

### D. Profitability Intelligence — the central finding of this document
Three **structurally different, non-interchangeable** profitability layers exist in this system today, and none of them currently combine:

| Layer | What it is | Where it lives | Granularity | Cost source |
|---|---|---|---|---|
| **GL-level P&L** | Net Sales/COGS/GP from posted journal entries | Financials engine, ported read-only into dashboard | Monthly, company-wide | Whatever was posted to the "COGS" GL line — no visibility into how that was costed |
| **Line-level margin (item/customer/dept)** | Would need unit cost per sales line | **Does not exist anywhere in the system** | N/A | N/A |
| **Procurement unit cost** | `UnitCost`/`FinalUnitCost` on purchase/landed-cost data | Procurement engine only, **not exposed to any other screen**, and landed cost is itself unused even there | Per PO/batch | Purchase price ± landed cost allocation, **not** inventory valuation |

**No inventory costing methodology (standard/moving-average/FIFO/actual) is implemented anywhere.** Any claim of "Customer Margin" or "Item Margin" today would require inventing a cost — explicitly forbidden. **Warehouse Margin and Sales-Employee Margin are blocked for the identical reason** (no cost, and no warehouse dimension in the GL). Profit Bridge's Cost Effect is blocked by the same root cause; Volume/Price effects remain the only computable factors (already shipped in Phase 1).

### E. Customer 360
Phase 1 baseline is correct. Additive-only future fields, each independently gated: **DSO** (computable now from AR+collections — not yet built, pure calculation, no new data), **customer concentration** (top-N % of total sales — pure calculation from existing data), **payment behavior** (needs collection-to-invoice matching — collections currently import as a flat total per customer/date, not linked to specific invoices, so "on-time vs. late" behavior is **not** derivable without a new query joining `ORCT`/`RCT1` to `OINV`). Profitability/risk-score: blocked (same as D).

### F. Supplier 360
Purchase value + AP aging exist (Phase 1). **Lead time**: real source is `OITM.LeadTime` (item-level, not supplier-level — the supplier-level field is undefined in SAP for this org). **MOQ/Order Multiple**: exist only as a manual Excel upload inside the Procurement screen (`itemSupplierMap`), never SAP-sourced. **Price movement**: computable from the dashboard's own AP/purchase line data if item-level unit price is added to the purchases query (not currently captured — purchases query only pulls line total, no unit price/qty split). **Delivery performance/fill rate**: blocked — the PO→GRPO link is confirmed weak (0% match rate) system-wide, so "did the supplier deliver on time/in full" cannot be reliably derived from GRPO; would need to lean on PO→AP-invoice date gap instead as a proxy, which is a different (weaker) metric and must be labeled as such, not presented as true delivery performance.

### G. Inventory Intelligence
This section needs the most caution. Confirmed available (in the Procurement engine's own IndexedDB, **not exposed elsewhere**): on-hand/on-order/committed (OITW, snapshot only — no history, so no trend), batch/expiry (OBTN+OBVL, item-level, ExpDate-driven near30/near90/expired classification already built there). **Confirmed absent everywhere**: any current inventory **value** (no standard/average/actual cost field feeds inventory — procurement's `UnitCost` is a purchase-transaction cost, not a valuation method), warehouse-level batch detail, sales-velocity-to-inventory-days linkage (would need to join the dashboard's own sales query to a new inventory-value query — neither currently shares data with the other). **Correction to the original ask**: batch quantity/cost in this SAP environment comes from **`OBVL`** (batch valuation), not `OBTQ` — `OBTQ` and `IBT1` were checked and are **not used anywhere in this system**, so their presence cannot be assumed. Any Inventory Intelligence module today would necessarily be built from scratch with new SAP queries (OITW+OWHS for on-hand, a new query for standard/average cost since none is confirmed to exist) — not by reusing the Procurement engine's data, since that engine keeps everything client-side/unexposed.

### H. Working Capital & CCC
AR Days and AP Days are **immediately computable** (AR/AP totals already exist; days = balance ÷ (annualized sales or purchases) × 365 — pure arithmetic, no new data). **Inventory Days is blocked** (no inventory value, per G) — therefore **the full Cash Conversion Cycle cannot be labeled complete**; it must always show as 🟠 Data Required or display AR/AP Days only with Inventory Days explicitly marked missing, never a CCC number that silently assumes zero inventory days.

### I. Cash & Liquidity
**No bank-balance, no payment-schedule, no cash-position data source exists anywhere in the four screens audited.** A 13-week forecast is not a "harder version" of something partially built — it requires an entirely new data foundation (bank statements or `OACT` cash/bank account balances at minimum, plus a payment-scheduling concept that doesn't exist). Per the user's own rule: this stays ⚪ Coming Next, not attempted.

### J. Procurement Intelligence Integration
Answered definitively by direct inspection (§1.2): recommendations are **never persisted** — not in IndexedDB, not in Supabase. The dashboard **cannot** consume them "without rerunning the procurement engine" as asked, because there is nothing else to consume — the engine's output simply does not exist outside its own live page session. Three real options, none implementable today without touching that screen:
1. **Do nothing beyond the link-out** (current Phase 1 state) — zero risk, zero value beyond navigation.
2. **Add a snapshot-export feature to the Procurement screen itself** (writes `RECO.allRecommendations()`'s summary to a new Supabase table on a button click) — requires modifying that screen, explicitly out of scope for this document and for Phase 1's rules.
3. **Duplicate the recommendation engine inside the dashboard** — explicitly forbidden ("don't reinvent"), and infeasible cleanly anyway since MOQ/OrderMultiple/landed-cost inputs are manual-only and not shared.
BUY_NOW/BUY_SOON/REVIEW/EXPEDITE labels would need a new mapping table over the existing CRITICAL/STOCKOUT_RISK/... enum — trivial once (2) is chosen, meaningless before.

### K. Internal Audit / Risk / Governance
Same shape of blocker as J, worse: **zero** Supabase persistence exists for findings/risks/exceptions today (§1.3), not even a JSON blob. Nothing is queryable. Options mirror J exactly — link-out only (current state) vs. modifying that screen to sync a summary (out of scope) vs. duplicating its data model (infeasible: 28 view sections, rich risk/treatment/review schema, not a small thing to replicate). The one silver lining: `DB.exceptions.amount` is the **only real currency financial-impact figure in that entire screen** — if that screen is ever given Supabase sync, exceptions (not findings, not risks) would be the first exploitable source for a dashboard financial-impact rollup.

### L. Risk & Exception Intelligence
The structured-record shape (Category/Severity/Impact/Owner/Age/Due/Status/Source/Action/Drilldown) is exactly what Phase 1's Management Attention Center already implements for the domains that have real data (Sales/Collections/Purchases/AR/AP/Credit). Extending it to Audit findings or a true multi-domain risk register is blocked by K, not by this framework — the framework itself is proven and reusable the moment audit data becomes queryable.

### M. Management Decision Center
Nothing like this exists anywhere in the system today. It is a **write** capability (not a read/aggregation of existing SAP data), so it categorically requires a new Supabase table — there is no way to build this without schema change. Explicitly not designed further here per the "no schema now" instruction; captured as a Phase dependency only.

### N. Forecasting
No statistical forecasting exists in any of the four screens. Sales/Collection forecast could in principle use the dashboard's own multi-year sales history (once a user pastes ≥2 years) for a naive trend/seasonal projection — technically possible with existing data, but is a **new modeling decision**, not a data-availability fact; flagged for explicit human sign-off before any implementation, never assumed. Procurement/Inventory/Cash forecasting are blocked upstream (no inventory or cash data at all).

---

## 3. DATA READINESS MATRIX

| Domain | Metric | Source | Current Availability | Granularity | Status | Missing Data | Required Change | Dependency |
|---|---|---|---|---|---|---|---|---|
| Sales | Gross/Net Sales, Discounts, Returns | Dashboard sales query | Implemented | Line-level | 🟢 | — | — | — |
| Sales | Sales Employee / Department | Dashboard sales query (OSLP/OBPL) | Implemented | Line-level | 🟢 | — | — | — |
| Sales | Target/Budget | financials_app_state.budget | Read-only, conditional | Monthly, no dept | 🟡 | Budget must be loaded on financials screen | — | Financials engine usage |
| Profitability | COGS/Gross Profit/Margin | financials_app_state.moves (GL) | Read-only, conditional | Monthly, company-wide | 🟡 | Line-level cost | New SAP cost query | Financials engine GL data quality |
| Profitability | Customer/Item/Department/Warehouse Margin | — | Not implemented | — | 🔴 | Unit cost per sales line, department dimension | New SAP query + costing-method decision | None exists to build on |
| Profitability | Profit Bridge — Volume/Price | Dashboard sales query | Implemented | Line-level | 🟢 | — | — | — |
| Profitability | Profit Bridge — Cost/Discount/Returns effect | — | Not implemented | — | 🟠/🔴 | Cost blocked; Discount/Returns need per-line matching logic | Calc logic (data exists for Discount/Returns; Cost blocked) | Cost effect depends on Margin row above |
| Collections | Total, by customer | Dashboard collections query | Implemented | Document-level | 🟢 | — | — | — |
| Collections | Payment behavior (on-time/late) | — | Not implemented | — | 🟠 | Invoice-to-payment matching | New query joining ORCT/RCT1↔OINV | — |
| AR | Balance + Aging | Dashboard AR query | Implemented | Invoice-level | 🟢 | — | — | — |
| AR | Credit Limit | Dashboard AR query (OCRD) | Implemented, optional | Customer-level | 🟡 | Populated only if column pasted | — | — |
| AR | DSO | — | Calculable now (no new data) | — | 🟠 (not yet built) | Just needs the formula added | Calc logic only | — |
| AP | Balance + Aging | Dashboard AP query | Implemented | Invoice-level | 🟢 | — | — | — |
| AP | DPO | — | Calculable now (no new data) | — | 🟠 (not yet built) | Formula only | Calc logic only | — |
| Inventory | On-hand/On-order/Committed | Procurement engine only (OITW/OWHS) | Exists, **not exposed to dashboard** | Snapshot, item+warehouse | 🔴 for dashboard | Cross-screen exposure | New dashboard query (duplicate, since procurement data isn't shared) | Procurement screen change OR new query |
| Inventory | Value / costing method | — | Not implemented anywhere | — | 🔴 | Standard/average/actual cost source | New SAP query + methodology decision | None exists |
| Inventory | Batch/Expiry | Procurement engine only (OBTN/OBVL) | Exists, not exposed | Item-level | 🔴 for dashboard | Same as above | Same as above | Same as above |
| Inventory | Inventory Days | — | Blocked | — | 🔴 | Depends on Inventory Value | — | Inventory Value row |
| Working Capital | AR Days, AP Days | Dashboard AR/AP | Calculable now | — | 🟠 (not yet built) | Formula only | Calc logic only | — |
| Working Capital | Full CCC | — | Blocked | — | 🔴 | Inventory Days | — | Inventory Value row |
| Cash | Cash/Bank position | — | Not implemented anywhere | — | ⚪ | Bank/GL cash account data | New SAP query | New data foundation |
| Cash | 13-Week Forecast | — | Not implemented anywhere | — | ⚪ | Cash position + payment schedule | New data foundation + model | Cash position row |
| Customer Profitability | Margin by customer | — | Blocked | — | 🔴 | Same as Profitability row | Same | Same |
| Item Profitability | Margin by item | — | Blocked | — | 🔴 | Same | Same | Same |
| Department Profitability | Margin by department | — | Blocked (no dept dimension in GL either) | — | 🔴 | Cost + department dimension | Same | Same |
| Supplier Performance | Purchase value, AP exposure | Dashboard purchases/AP | Implemented | — | 🟢 | — | — | — |
| Supplier Performance | Lead time, delivery performance | OITM.LeadTime (item-level); GRPO link weak | Partial, low confidence | — | 🟡/🔴 | Reliable delivery-performance signal | Proxy via PO→AP-invoice gap, clearly labeled | Procurement data quality |
| Procurement Recommendations | BUY_NOW etc. | RECO engine, in-memory only | Not persisted | — | 🔴 | Persistence layer | Snapshot-export feature on procurement screen | Procurement screen change |
| Audit Findings | Open/High/Overdue/Category | localStorage only | Not queryable | — | 🔴 | Supabase persistence | Sync feature on audit screen | Audit screen change |
| Audit — Financial Impact | `DB.exceptions.amount` only | localStorage only | Not queryable; only exceptions have currency | — | 🔴 | Same as above | Same | Same |
| Risk | Risk register / heatmap | localStorage only (`DB.risks`, rich schema) | Not queryable | — | 🔴 | Same as above | Same | Same |
| Management Decisions | — | — | Does not exist | — | 🔴 | Entire feature | New Supabase table (needs your approval) | None |
| Forecasting | Sales/Collections | Dashboard's own history | Technically computable | — | 🟠 (modeling decision, not data gap) | Model choice + sign-off | New calc logic | Enough historical periods pasted |
| Forecasting | Procurement/Inventory/Cash | — | Blocked upstream | — | ⚪ | Inventory/Cash data first | — | Those rows above |

---

## 4. SAP DATA ARCHITECTURE (confirmed tables only)

| Table(s) | Used by | Fields confirmed | Known limitation |
|---|---|---|---|
| `OINV`/`INV1` | Dashboard, Procurement | DocDate, CardCode, ItemCode, Quantity, LineTotal, DiscPrcnt, DocDueDate, PaidToDate | — |
| `ORIN`/`RIN1` | Dashboard (UNION for returns) | Same shape as OINV/INV1 | — |
| `OPCH`/`PCH1` | Dashboard, Procurement | CardCode, ItemCode, LineTotal, DocDueDate, PaidToDate | No unit-price/qty split currently pulled for price-trend analysis |
| `ORPC`/`RPC1` (A/P credit memos) | **Not used anywhere confirmed** | — | **Requires Verification** if ever needed |
| `OCRD` | Everywhere (customers + suppliers) | CardCode, CardName, CardType, CreditLine, Country | Supplier `LeadTimeDays` field defined in Procurement UI but **not populated by any live query** |
| `OSLP` | Dashboard (sales rep) | SlpCode, SlpName | — |
| `OITM`/`OITB` | Procurement, Dashboard (mil. price list) | ItemCode, ItemName, ItmsGrpNam, SalUnitMsr, SWeight1, LeadTime | No cost/price field pulled |
| `OITW`/`OWHS` | Procurement only | ItemCode, WhsCode, WhsName, OnHand, OnOrder, IsCommited | Snapshot only, no history; **not exposed to dashboard** |
| `OBTN` + `OBVL` (not OBTQ) | Procurement only | Batch/DistNumber, InDate, MnfDate, ExpDate, BatchQty, UnitCost | Item-level only, no warehouse dimension; **OBTQ and IBT1 confirmed NOT used anywhere in this system** |
| `OPOR`/`POR1` | Procurement only | ShipDate, Quantity, OpenQty, DocStatus | Open lines only |
| `OPDN`/`PDN1` | Procurement only | Quantity, WhsCode, BaseEntry, BaseLine | **Weak PO linkage** (0% closed-PO→GRPO match) |
| `OIPF`/`IPF1` (landed cost) | Procurement only | FinalUnitCost, IncreasePct | **Confirmed unused** by the recommendation engine |
| `ORCT` | Dashboard (collections), other screens | DocDate, CardCode, DocTotal | No line-level invoice allocation (RCT1 not joined) |
| `OINM` | Dashboard (Warehouse 011 running balance) | ItemCode, Warehouse, InQty, OutQty, CreateDate, TransId | — |
| `OWTR`/`WTR1` | Military branch-sales screen (separate from this dashboard) | — | Not wired into this dashboard |
| `JDT1`/`OJDT`/`OACT` | Financials engine only | Account, RefDate, Debit, Credit; AcctCode/Name/Drawer/FatherNum/Levels | Flat CoA — **no department/warehouse dimension**; an orphaned Profit-Center query (`JDT1.ProfitCode`) exists but is **dead code, never wired in** |

---

## 5. PROFITABILITY DATA LAYER — SPECIFICATION (not implemented)

Ideal future line-level dataset: `Date, DocType, CustomerCode, ItemCode, SlpCode, BranchCode(=Dept proxy), WarehouseCode, Quantity, GrossSales, Discount, Returns, NetSales, UnitCost, COGS, GrossProfit, GrossMargin`.

**Every field through `NetSales` already exists** (Phase 1 sales query, extendable with `WhsCode` trivially). **`UnitCost` through `GrossMargin` have zero confirmed source** — three real candidates exist in the wider system and none has been chosen or verified as correct for this business:

| Candidate cost source | Where it lives today | Suitability |
|---|---|---|
| Moving-average / standard cost on `OITM`/`OITW` | **Not confirmed to exist** — not queried by any screen | Requires Verification directly against SAP before any commitment |
| Procurement's transactional `UnitCost`/`FinalUnitCost` | Procurement engine, `landedCost`/`batches` stores | Reflects purchase cost, not necessarily current inventory valuation; landed cost is proven unused/unreliable there |
| GL-level COGS (already ported) | Financials engine | Only gives a company-wide monthly total — cannot be allocated back to a line, customer, or item without an allocation key that doesn't exist |

**This document does not choose one** — that decision needs your explicit sign-off plus direct SAP field verification, per the rule against assuming a costing methodology.

---

## 6. EXECUTIVE KPI FRAMEWORK

| KPI | Formula | Source | Frequency | Status logic | Drilldown |
|---|---|---|---|---|---|
| Sales | Σ Net Sales | Dashboard sales query | Per selected period | 🟢 once pasted | Sales chart |
| Gross Profit | NetSales−COGS (GL) | financials_app_state | Monthly | 🟡 conditional on GL data | GP card |
| Gross Margin | GP/NetSales | Same | Monthly | 🟡 | Margin card |
| Collections | Σ receipts | Dashboard collections query | Per period | 🟢/🟠 | Collections card |
| AR / AP | Σ open balance | Dashboard AR/AP query | Snapshot as-of-import | 🟢/🟠 | AR/AP card |
| Working Capital | AR Days+Inv Days+AP Days | Mixed | — | 🔴 until Inventory Days exists | Working Capital card |
| Inventory | Valuation | — | — | ⚪ | — |
| Procurement | Link only | — | — | 🔴 | External link |

Thresholds already documented, not arbitrary (Phase 1): ≥15% change = High severity, 5–15% = Medium, <5% not surfaced; AR/AP overdue >120d = High, 91–120d = Medium; credit-limit breach >50% over = High.

---

## 7. MANAGEMENT ATTENTION FRAMEWORK — verified-supportable alerts only

| Alert | Data support today |
|---|---|
| Overdue receivables/payables | 🟢 implemented |
| Credit limit breach | 🟢 implemented (conditional on credit-limit column) |
| Sales/Collections/Purchases decline | 🟢 implemented |
| Unusual discount | 🟠 computable once per-line discount % is compared to a defined "normal" threshold — no such threshold exists today, needs a business rule decision |
| Supplier exposure concentration | 🟢 computable now (Top Suppliers data already exists) — not yet built as an alert, pure calc gap |
| Inventory risk / stockout / overstock | 🔴 blocked (no inventory data in dashboard) |
| Overdue audit action | 🔴 blocked (Audit screen not queryable) |
| Procurement exception | 🔴 blocked (Procurement not queryable) |

---

## 8. EXECUTIVE UX / INFORMATION ARCHITECTURE

Current Phase 1 is a single scroll with 9 sections — already borderline long. Recommended target: **fixed Executive Snapshot header** (always visible) + **tabbed body**: [Sales & Profitability] [Attention Center] [Customers] [Suppliers] [Collections/AR/AP] [Working Capital] — inventory/cash/audit/procurement/decisions tabs added only as each becomes real, always showing their Data Status badge in the tab label itself so the GM never opens an empty tab unknowingly. Filters (period, department/branch, customer, supplier) stay global at the top, exactly as today.

---

## 9. DATA GOVERNANCE

Every number on this dashboard must already answer (Phase 1 partially does this via Data Status badges + "as of" notes; not yet universal): source screen/table, period covered, calculation method (in plain language), and Available/Conditional/Data Required/Blocked. Recommendation: a small "ⓘ" affordance on every KPI card surfacing exactly these four facts, reusing the existing `statusBadge()`/footNote pattern rather than a new component.

---

## 10. INTEGRATION ARCHITECTURE

```
SAP B1/HANA
   ↓ (manual paste, per screen, no exceptions found anywhere in this system)
Browser-side calculation (per screen, independent)
   ↓ (each screen syncs ONLY its own computed summary)
Supabase — one single-row JSON blob per screen (exec_dashboard_state, financials_app_state, ...)
   ↓ (read-only, cross-screen, opt-in — the ONE pattern proven safe in Phase 1)
GM Command Center reads financials_app_state today; could read others the same way IF those screens add a compact synced summary
```
Procurement and Internal Audit currently sit **outside** this pattern entirely (no Supabase sync at all) — they are the exception, not the rule, and joining the pattern requires changing those screens, not the dashboard.

---

## 11. SECURITY / PERMISSIONS (documentation only, no changes)

Current model (`user_screen_permissions`, VIEW/INPUT/ADMIN) is per-screen, not per-role-across-screens. A true "Finance sees GP, Sales doesn't see Audit" model would require either: (a) row-level feature flags within the dashboard's own permission check (new logic, no schema change), or (b) granting/denying whole screens as today. Gap: there is no existing concept of "role" (GM/Finance/Sales/Procurement/Audit/Admin) distinct from per-screen VIEW/INPUT/ADMIN — introducing one is a policy decision, not documented further per the no-changes-now rule.

---

## 12. PERFORMANCE / RELIABILITY

Phase 1 already uses pre-built `Map` indexes (`IDX.byDay`/`byMonth`) to avoid recompute-on-click. Risks as more sources are added: the sales query with UNION+returns roughly doubles row count for the same date range — acceptable at current scale (manual paste implies bounded size), revisit if multi-year pastes become common. `financials_app_state` read is already async/non-blocking (confirmed pattern) — the same discipline must apply to any future cross-screen read.

---

## 13. TESTING STRATEGY (future, comprehensive)

Empty state · old query format · new query format · missing optional columns · missing `financials_app_state` · missing budget · zero values · returns · discounts · AP aging · AR aging · GP/Margin (incl. GL data absent mid-period) · Customer 360 · Supplier 360 (once built) · Working Capital (Inventory Days absent) · permissions (VIEW vs ADMIN) · regression on every existing v1 KPI · console errors · **reconciliation checks** (Gross−Discount−Returns=Net; Volume+Price effect=ΔNetSales) — this last category is not hypothetical: it caught two real bugs during Phase 1 and should be a permanent, repeated check on every future data-shape change.

---

## 14. FINAL ROADMAP (dependency-ordered, not artificially phased)

| Step | Objective | Needs | Risk |
|---|---|---|---|
| 1 | AR/AP Days + partial Working Capital display | Calc only, no new data | Low |
| 2 | Customer DSO + concentration | Calc only | Low |
| 3 | Supplier price-trend (from existing purchase lines, once unit price/qty are added to the query) | Small query extension | Low |
| 4 | Decide profitability cost methodology (Section 5) — **your decision + direct SAP verification, not code** | Business decision | — |
| 5 | Line-level profitability (Customer/Item/Warehouse Margin, Cost Effect) | New SAP query per step 4's decision | Medium — depends entirely on step 4 |
| 6 | Inventory Intelligence (new dashboard-owned queries, not reused from Procurement) | New OITW/OWHS/cost queries | Medium |
| 7 | Full CCC | Depends on step 6 | — |
| 8 | Procurement snapshot integration | **Requires modifying `المشتريات_الخارجية_الذكية.html`** — separate approval | High (cross-screen) |
| 9 | Audit/Risk integration | **Requires modifying `شاشة_التدقيق_الداخلي_الإداري.html`** — separate approval | High (cross-screen) |
| 10 | Management Decision Center | New Supabase table — separate approval | Medium |
| 11 | Cash/Liquidity, 13-week forecast | Entirely new data foundation | Not started until upstream data exists |
| 12 | Statistical forecasting | Business sign-off on methodology | Not started |

---

## 15. WHAT WE SHOULD NOT BUILD (yet)

- Customer/Item/Department/Warehouse Margin — no reliable cost source exists.
- Profit Bridge Cost Effect — same root cause.
- Landed Cost analysis — confirmed unused and unreliable even in its native screen.
- 13-week cash forecast — zero cash/payment data foundation.
- Statistical forecasting — no modeling decision made, and would need it regardless of data.
- Real-time Procurement integration — nothing is persisted to integrate with.
- Real Audit integration — nothing is persisted to integrate with.
- Risk scoring — no documented methodology, and source data (Audit) isn't even reachable.
- Management Decision Center — needs schema not yet approved.

---

## 16. FINAL EXECUTIVE RECOMMENDATION

**A. Current maturity:** A working, honest Level-1 Executive Dashboard with real Sales/Collections/AR/AP, a verified GL-level Gross Profit reader, and a genuine (if narrow) Management Attention Center. Every number is traceable and never fabricated.

**B. Target maturity:** A true GM Command Center needs three things this system does not yet have anywhere: (1) a line-level cost/margin source, (2) inventory valuation, (3) a persistence layer for Procurement and Audit. None of these are dashboard problems — they are gaps in the source screens and in SAP data availability.

**C. Critical gaps:** No costing methodology decided or verified (§5); Procurement and Audit are architecturally isolated (§J/K); no cash data exists at all (§I).

**D. Recommended sequence:** Do the zero-risk, pure-calculation wins first (Steps 1–3), force a costing-methodology decision before touching profitability (Step 4), then treat Inventory, Procurement integration, and Audit integration as three **independent, separately-approved** tracks — none blocks the others, and each carries real cross-screen risk that this document explicitly does not authorize.

**E. Exact next action:** Decide the profitability cost methodology (Section 5) — a business decision plus direct SAP field verification, not an implementation step. Everything downstream of Profitability (Bridge, Customer/Item Margin, most of Section D) is blocked until this one decision is made.
