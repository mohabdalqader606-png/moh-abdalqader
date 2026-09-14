# المشتريات الخارجية الذكية — Foreign Procurement Intelligence
## FINAL HANDOFF DOCUMENTATION

**Version:** `v1.0.0-GOLDEN`
**Build date:** 2026-09-14
**Status:** 🔒 **GOLDEN FREEZE** — validated, frozen, production logic locked pending SAP field confirmation
**File:** `المشتريات_الخارجية_الذكية.html` (single self-contained file, ~2,900 lines, no embedded data)
**Branch:** `claude/stoic-shannon-dyzjm3`

This document is the reference for anyone (human or AI) picking up this screen after this
session. It describes what exists, how it works, and what must be confirmed against the real
SAP B1 HANA environment before the recommendations are trusted for live purchasing decisions.

---

## A) Current Architecture

Single HTML file, three layers, no build step, no external backend:

```
┌─────────────────────────────────────────────────────────────┐
│  VIEW LAYER (script block 2)                                 │
│  7 views: القرارات / المخاطر / خطة الشراء / تحليل الطلب /      │
│  الموردون / الأصناف / مركز البيانات — + drawers/modals + print │
├─────────────────────────────────────────────────────────────┤
│  ENGINE LAYER (script block 1)                                │
│  SALES → DEMAND (outlier adj.) → INV → PURCHASE (pattern) →   │
│  SUPPLIER (lead time) → POTRACK (PO/GRPO) → RECO (decision)   │
├─────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                   │
│  IndexedDB (kfc_foreign_procurement_v1, v2) — 13 object       │
│  stores, one per data source + importLog + planOverrides +    │
│  docOverrides + meta. In-memory indexes (IDX) + SALES line    │
│  cache rebuilt only on data change.                            │
└─────────────────────────────────────────────────────────────┘
```

- **No data is embedded in the file.** Everything is uploaded by the user through مركز البيانات
  (paste or .txt/.csv/.tsv file) and stored in the browser's IndexedDB.
- **No network calls, no SAP connection.** The screen never talks to SAP directly; the user
  runs the suggested HANA queries manually and pastes/uploads the result.
- All computation runs client-side. Results are cached (`STATE._recos`, `STATE._recosAll`,
  `STATE._salesReport`) and only recomputed by `refreshComputed()` / `recomputeAll()` —
  triggered by: import commit/rollback, filter apply, tunable-setting change, "تشغيل المحرك".
  Sorting, opening drawers, switching views, and drilling down **never** recompute the engine
  (verified — see section R).

---

## B) Data Sources

Defined in `DATA_SOURCES` (13 entries), each with: label, IndexedDB store name, unique-key
fields (for dedup), column list (key/label/aliases/type/required), a ready-to-copy SAP B1 HANA
query, and an `sqlNote` documenting known uncertainty.

| Source | Store | Unique key | Required |
|---|---|---|---|
| فواتير المبيعات | `salesInvoices` | DocEntry+LineNum | Yes |
| مرتجعات المبيعات | `salesReturns` | DocEntry+LineNum | Yes |
| فواتير المشتريات | `purchaseInvoices` | DocEntry+LineNum | Yes |
| أوامر الشراء | `purchaseOrders` | DocEntry+LineNum | Yes |
| محاضر الاستلام | `goodsReceipts` | DocEntry+LineNum | Yes |
| أوامر البيع | `salesOrders` | DocEntry+LineNum | Yes |
| عروض أسعار المبيعات | `salesQuotations` | DocEntry+LineNum | Yes |
| المخزون الحالي | `inventory` | ItemCode+WhsCode | Yes |
| الباتشات/الصلاحية | `batches` | ItemCode+Batch+WhsCode | Yes |
| كشف الموردين | `suppliers` | SupplierCode | Yes |
| اللاندد كوست | `landedCost` | DocEntry+ItemCode+Batch | Optional, not used by the engine |
| كشف الأصناف | `items` | ItemCode | Optional (name/group/UOM/weight) |
| ربط صنف-مورد | `itemSupplierMap` | ItemCode+SupplierCode | Optional (manual override only) |

Every source's exact SQL is visible and copyable inside مركز البيانات → each card → "كويري SAP
HANA المقترح". These are **starting points**, several explicitly marked "تحقق قبل الإنتاج" —
see the Validation Checklist below.

---

## C) Data Upload Lifecycle

1. User pastes text (or uploads .txt/.csv/.tsv) into a source's import modal.
2. `IMPORT.mapRows()` — parses (tab or comma delimited), matches headers to columns (exact
   match first, then partial fallback that never reuses an already-claimed header — fixed in
   this session), type-coerces, and validates (required fields, numeric, date, negative qty,
   duplicate keys within the same paste).
3. `IMPORT.preview()` — diffs against what's already stored: counts to-add / to-update /
   unchanged, and — if the historical baseline is locked — flags rows that fall in
   2022–2025 and would be silently dropped.
4. User confirms → `IMPORT.commit()` — writes via `DB.bulkPut` keyed by the source's unique
   key (so re-importing the same document updates it in place, never duplicates), tags new
   rows with `_batchId`/`_importBatch`, updates `STATE.data[source]` in memory (merge, not a
   full re-read), and appends one `importLog` entry recording exactly which keys were added
   and the pre-update value of every row that was overwritten.
5. **Rollback**: `IMPORT.rollback(source)` reads the last log entry for that source, deletes
   the rows it added, restores the pre-update values of the rows it changed, and removes the
   log entry. One level of undo, per source, always available.
6. All of this is real IndexedDB — data survives page reload (verified).

---

## D) Historical Baseline 2022–2025

- `CONFIG.historicalYears = [2022, 2023, 2024, 2025]`.
- A single boolean flag (`DB.getMeta('historicalLocked')`) toggled from مركز البيانات →
  "قفل الأساس التاريخي 2022–2025".
- **When locked**, any import whose source has a `dateField` and whose rows fall inside a
  historical year is filtered out at commit time (`confirmImport()` in the view layer, mirrored
  in the validation harness) — those rows are silently **not** written, and the preview screen
  warns the user beforehand with a count.
- **When unlocked**, historical years import/update normally like any other data.
- 2026 rows are **never** subject to the lock, regardless of lock state — they always go
  through the normal incremental dedup-by-key path.
- The Data Center shows a year-by-year row count strip (2022…2026) so the user can see the
  baseline is populated before locking it.

---

## E) Incremental 2026

- No special-cased "2026 mode" in code — it is the natural behavior of the same
  dedup-by-unique-key commit path once the historical years are locked.
- Re-importing a 2026 file: rows with a key that doesn't exist yet are added; rows with an
  existing key whose field values changed are updated in place; rows with an existing key and
  identical values are left untouched (`preview.unchanged`).
- The context bar shows **"2026 محدَّث"** (with the exact import timestamp) once any batch
  touching 2026 dates has landed. This is derived from `importLog`, not a separate flag.
- Verified: two sequential 2026 updates where update #2 partially overlaps update #1 produce
  exactly the expected add/update/unchanged counts, no duplicate keys, and the historical rows
  are byte-for-byte untouched (same `_key`/`_importBatch`).

---

## F) Sales Calculation

`SALES` engine (`buildNetLines()`):

- Reads `salesInvoices` (sign +1) and `salesReturns` (sign −1), **excluding any row whose
  `Canceled` field (case-insensitive) equals `'Y'`** from both — a cancelled invoice is not
  sold, a cancelled return is not a return and is not re-added as a sale.
- Net line quantity/amount = signed sum; net sales for any item/customer/month/warehouse
  combination is Σ(valid invoice qty) − Σ(valid return qty), computed once and cached
  (`SALES._cache`), indexed by ItemCode for O(1) per-item lookups.
- `SALES.filteredLines(opts)` applies the active global filters (date/item/warehouse/
  customer/employee/supplier) and, when `demandOnly:true`, additionally drops warehouses whose
  business rule says `includeInSalesDemand:false` (see section I).
- The monthly Sales Analysis report (`buildSalesReport`) aggregates net qty/amount per item per
  calendar month over the selected (or auto-derived) date range, and computes the **raw
  average using actual elapsed days**, not calendar-month count (see section Q for the exact
  formula).

---

## G) Returns / Cancellation Logic

- **Normal invoice**: `Canceled='N'` (or absent) → counted in gross sales.
- **Cancelled invoice**: `Canceled='Y'` → excluded entirely, never counted as a sale.
- **Return / Credit Memo**: separate source (`salesReturns`), `Canceled='N'` → subtracted from
  gross sales.
- **Cancelled return**: `Canceled='Y'` on a return row → excluded entirely — **not** subtracted
  (it isn't a real return) and **not** added back as a sale.
- **Multiple invoices / multiple returns, same item+customer+month**: all valid rows sum
  together; net = Σvalid invoices − Σvalid returns for that item/customer/month. Verified with
  a scenario mixing 2 invoices + 2 returns + a cancelled invoice + a cancelled "cancellation
  document" + a cancelled return for the same item/customer/month — net matched the manual
  hand-calculation exactly, and the customer drill-down for that month showed the correct
  per-customer net split.
- This is a **field-value convention**, not a document-type distinction — the engine only
  looks at the `Canceled` column value. Whatever your SAP export marks as cancelled (invoice
  or its "cancellation document") must arrive with `Canceled='Y'` in the uploaded data. See
  Validation Checklist item 7.

---

## H) Inventory Logic

`INV` engine:

- **Physical stock** = Σ OnHand across all warehouse rows for the item (no exclusions).
- **Available stock** = Σ OnHand across warehouses *not* flagged `excludeFromAvailable`, minus
  any batch quantity classified `EXPIRED` for that item (expired stock is subtracted from
  "available to sell/plan against" but is never hidden — it's shown separately and does not
  block a recommendation).
- **Committed** = warehouse `Committed` field if present, else Σ open Sales Order qty.
- **On Order** = warehouse `OnOrder` field if present, else Σ open Purchase Order qty.
- **Historical stock timeline** (`monthlyAvailableTimeline`): SAP gives no historical
  snapshots, so the engine **reconstructs** month-by-month available stock by walking
  *backward* from the current snapshot: `Opening = Closing − Received + Sold` for each month,
  using only available-warehouse sales and receipts. This anchors correctly (verified: the
  reconstructed closing balance for the most recent month equals the actual current snapshot).
- **Stock status** (`STOCKOUT` / `OVERSTOCK` / `SLOW` / `DEAD` / `NORMAL`) combines available
  stock, the *adjusted* monthly demand (section J), and recent sale activity — thresholds are
  tunable (`overstockCoverageMonths`, `slowStockCoverageMonths`, `deadStockMonthsNoSale`).

---

## I) Special Warehouse Rules

Single source of truth: `CONFIG.warehouseRules` (one object, referenced everywhere — not
duplicated in code). Fixed per business requirement:

| Warehouse | Meaning | Excluded from Available Stock | Included in Sales Demand |
|---|---|:---:|:---:|
| 004 | تالف/معطوب | ✅ | ❌ |
| 100 | تالف/معطوب | ✅ | ❌ |
| 006 | تالف/معطوب | ✅ | ❌ |
| 003 | عينات مُصدَرة للعملاء | ✅ | ❌ |
| 005 | فروقات جرد | ✅ | ❌ |
| 008 | فروقات استلام | ✅ | ❌ |
| **011** | **مبيعات عسكرية (المؤسسة الاستهلاكية العسكرية)** | ✅ | **✅** |

Warehouse 011 is the one deliberate asymmetry: its stock never counts as available (it isn't
sellable general inventory), but its sales **do** count as real demand driving the
recommendation, and they are **not** hidden from the general Sales Analysis report (only the
demand-engine and available-stock calculations apply the exclusion).

Verified: physical stock across 8 warehouses (100 each) = 800; available (only whs `01`) = 100;
demand for a month with 300 sold from `01` + 100 sold from `011` = 400 (011 included); the same
011 sales still appear in the Sales Analysis drill-down for that month (not hidden).

---

## J) Stock-out / Outlier Logic

`DEMAND.adjustedMonthlyDemand(itemCode)`:

1. Builds a trailing (up to 12-month) monthly net-demand series, starting no earlier than the
   item's first actual sale (never zero-pads pre-launch months, which would drag the average
   down artificially).
2. Computes the median of non-zero months.
3. For each month: `ratio = qty / median`.
   - `ratio < outlierLowRatio` (default 0.35) → **candidate** low outlier. The engine then
     checks `INV.monthlyAvailableTimeline` for that month: if opening stock and receipts were
     both near-zero, it's excluded from the average with reason "مخزون شبه صفري + لا توريد
     وارد" and confidence HIGH/MEDIUM. **Without that corroborating evidence, the month is
     kept in the average** and explicitly labeled "لم يُستبعد" — never silently dropped just
     for being low.
   - `ratio > outlierHighRatio` (default 2.60) → excluded as an unusually high spike (bulk
     order / one-off customer), reason shown, confidence MEDIUM.
4. `raw` = mean of all months in the series. `adjusted` = mean of months not excluded.
   `excludedMonths[]` lists every flagged month (excluded or not) with its reason and
   confidence — nothing is hidden.

Verified against the exact sequence from the spec (`1000, 980, 1020, 20, 1040, 40, 1100`) with
zero stock and no receipts during the low months: raw average = 742.86, months with qty 20 and
40 were both excluded with stock-out evidence, adjusted average = 1,028 (mean of the 5 normal
months) — reported with reason and confidence in both the engine result and the item detail
drawer.

---

## K) Purchase History Pattern

`PURCHASE` engine, per item (+ optionally per supplier), built from `purchaseInvoices`:

- `count`, `min`, `max`, `median`, `mostCommon` (statistical mode) order quantity, average
  days between consecutive purchases, last purchase date.
- `roundToHistoricalMultiple(itemCode, supplierCode, neededQty)` — rounds the *true calculated
  requirement* up to the nearest practical multiple (the most common historical order size, or
  an explicit `OrderMultiple`/`MOQ` from `itemSupplierMap` if provided). **This is rounding
  only — it can only round a requirement up, never cap it down.** If the true need exceeds every
  historical order ever placed, the recommendation exceeds history too.

Verified: an item whose largest historical purchase was 3,000 but whose true calculated need
was 5,470 was recommended at 6,000 (rounded up to the next 3,000-multiple), not capped at 3,000.

---

## L) Supplier Lead Time

`SUPPLIER.leadTimeDays(code)` — three-tier fallback, in order:
1. `suppliers.LeadTimeDays` from the uploaded supplier master, if > 0.
2. **Derived**: median of (goods-receipt date − matching purchase-order date) across that
   supplier's history, matched by `BaseEntry` when present, else by item + receipt-after-order.
3. `CONFIG.tunable.defaultLeadTimeDays` (default 30) if neither is available.

Lead time is always a property of the **supplier**, never the item — confirmed by design and
by the derivation query only ever grouping by `SupplierCode`.

---

## M) In-Transit Logic *(finalized this session — see also section S)*

`POTRACK.statusFor(itemCode)` classifies every open PO line:

| Condition | Classification | Counts as Incoming Supply? |
|---|---|:---:|
| Open PO, delivery date in the future | Confirmed incoming | ✅ |
| Open PO, delivery date in the past, user entered & confirmed an Expected Arrival date | Confirmed incoming | ✅ |
| Open PO, delivery date in the past, **no** confirmed arrival date | **Unconfirmed incoming / risk** | ❌ |

- `POTRACK.incomingQty()` sums only the confirmed rows — this is what feeds
  `RECO.computeForItem()`'s gap calculation.
- `POTRACK.unconfirmedIncomingQty()` sums the unconfirmed (past-due, no date) rows separately.
  It is **never** added to `incoming` and never reduces the recommended order quantity.
- The UI shows unconfirmed quantity as a red "+N غير مؤكد" note next to the incoming-supply
  column, in the "لماذا؟" reasons list as its own line ("بضاعة متوقعة غير مؤكدة — تحتاج تاريخ
  وصول — لا تدخل بحساب القرار"), and in the narrative sentence. Confirming an arrival date
  (item detail drawer → بالطريق section → date input) moves the line from unconfirmed to
  confirmed immediately and recomputes.
- If confirmed incoming supply fully closes the calculated gap (`neededQty<=0`) while coverage
  is still below the critical/soon threshold, status is `IN_TRANSIT` (not `CRITICAL` with a
  qty of 0) — this was a real bug found and fixed via this session's validation, verified in
  three branches (future-dated, approved past-due, and the boundary case).

---

## N) Recommendation Engine

`RECO.computeForItem(itemCode)` combines, in order:
Adjusted monthly demand (J) → open Sales Orders (committed demand) → open Quotations
(weighted by `CONFIG.tunable.quotationWeight`, default 0.30) → current available stock (H) →
confirmed incoming supply (M) → supplier lead time (L) → historical purchase pattern (K) →
expiry risk → stock-out risk history (J).

- **Required quantity** = `dailyDemand × (leadTimeDays + serviceBufferDays) + openSO +
  weightedQuotations − availableStock − confirmedIncoming`, floored at 0, then rounded via (K).
- **Status** (priority order): `CRITICAL` → `STOCKOUT_RISK` → `ORDER_SOON` → `IN_TRANSIT` →
  `MONITOR` → `OVERSTOCK` → `SLOW_MOVING` → `NO_ORDER`. Exact branching in code
  (`RECO.computeForItem`) — not reproduced field-by-field here to avoid this document drifting
  out of sync with the frozen logic; read the function directly if precision matters, it is the
  single source of truth.
- **Explainability**: every recommendation carries a `reasons[]` (key/value facts) and
  `narrative[]` (plain-language Arabic bullets) array used verbatim by the "لماذا؟" drawer,
  the item detail drawer, and every print layout — the UI never re-derives its own explanation.
- **Confidence** (`HIGH`/`MEDIUM`/`LOW`) is a weighted score over: months of demand history,
  demand-adjustment confidence, lead-time source quality, purchase-pattern sample size, and
  whether inventory data exists for the item at all.
- Results are memoized per item (`RECO._cache`) and invalidated only by `recomputeAll()`.

---

## O) Supplier-level Complete Purchase Order Aggregation

`RECO.supplierPurchasePlan(statusFilter)` / the view layer's `selectedPlanGroups()`:

- Groups all items with `recommendedQty > 0` (optionally filtered to CRITICAL/ORDER_SOON, or to
  whatever the user has manually selected in خطة الشراء) by their resolved supplier.
- Produces **one row per supplier** with: total item count, **one combined total quantity**
  (sum of every item's recommended/edited qty), total weight in tons if unit weights are
  available, the supplier's lead time, and expected arrival if ordered today.
- This is the literal "SUPPLIER A: Item A + Item B + Item C + Item D = 20 Ton total" shape from
  the spec — verified with exactly that scenario (4 items, historical patterns that would have
  capped one item at 3,000 if patterns were treated as ceilings) producing a single 20,000 kg
  (20 ton) order for one supplier, never 4 separate small orders.
- The user can adjust quantity/note per item and deselect items before building/printing the
  final plan; edits are `planOverrides` (item-level, persisted in IndexedDB).

---

## P) Printing

- Dedicated print layout (`PRINT.run()`/`#printRoot`), **not a printed screenshot of the UI** —
  the entire interactive UI (`nav`, filters, buttons) is hidden via `@media print`, and a
  purpose-built document is injected: title, period, applied filters, generation timestamp,
  system name/version, summary tiles, one or more titled sections each with its own table and
  totals row, and a running footer.
- Every view has a "طباعة" action wired to a specific print composer:
  `printCurrentView()` (context-aware per active view), `printPurchasePlan()`,
  `printSalesAnalysis()`, `printCustomerDrilldown()`, `printItemDetail()`.
- A4 landscape, table headers/footers repeat across pages (`thead`/`tfoot`
  `display:table-header-group/footer-group`), rows avoid breaking mid-row.
- **Known limitation**: page-number footer text relies on CSS `@page` margin boxes, which
  Firefox honors and Chrome currently ignores — see Known Risks.

---

## Q) Filtering / Sorting

**Filters** (single `STATE.filters` object, one panel, applied everywhere): date range, item
(code/name search), item group, supplier, supplier country, warehouse, customer, sales
employee, recommendation status, stock status, expiry status. A badge shows the active filter
count; "مسح الفلاتر" resets all. Applying filters calls `refreshComputed()` (a real,
intentional recompute — filters are supposed to change results) then re-renders the active
view only.

**Monthly average formula** (Sales Analysis): actual elapsed days in the selected range ÷
30.4368 (average Gregorian month length) = "equivalent months"; average = total quantity ÷
equivalent months. A 1/1–13/9 range is **256 actual days ≈ 8.41 equivalent months**, not 9 —
verified: with 100 units/month for 8 full months + 100 in the 13-day September stub (900
total), the reported average is 107.0, not 100.

**Sorting**: every data table header cycles **descending → ascending → none** (`toggleSort`),
with a visible ▼/▲/⇅ indicator per column, one shared `SORT_STATE` keyed per table. Customer
drill-down opens with net quantity sorted highest→lowest by default (no explicit sort state —
first click is an explicit "descending" state, verified as a real 3-state cycle, not a 2-state
toggle).

---

## R) Performance Architecture

- **In-memory indexes** (`IDX.by(source, field)`) built lazily, once, and reused — replaces
  what would otherwise be O(n) linear scans per item per lookup.
- **Sales line cache** (`SALES._cache`, `SALES.buildNetLines()`/`linesForItem()`) — the
  normalized (signed, cancellation-filtered) sales+returns line list is computed once and
  indexed by ItemCode.
- **Recommendation memoization** (`RECO._cache`) — `computeForItem` is only ever recalculated
  after `recomputeAll()`/`invalidateData()`, never on render.
- **Chunked table rendering** — tables over a few hundred rows (Sales Analysis, Items view,
  recommendation tables) render the first 300 rows synchronously and append the rest in
  `setTimeout(…,0)` batches, keyed by a render token so a fast second render (e.g. re-sorting)
  cancels the pending batch instead of racing it.
- **IndexedDB**: object stores keyed by document key only (`_key`), no secondary indexes (an
  earlier version had unused `ItemCode`/date/batch indexes that measurably slowed large bulk
  writes with no read ever using them — removed in `dbVersion: 2`, upgrade path deletes them
  automatically on first open, no data loss).
- **Verified at scale** (1,500 items, 60 suppliers, ~200,000 sales lines + 5,000 returns across
  2022–2026, 400 open POs, 3,000 batches): 200k-line import ≈ 45 s; full page reload with that
  data already in IndexedDB ≈ 2.7 s; recommendation engine over all 1,500 items ≈ 0.6 s;
  switching views, sorting, opening any drawer, or drilling into a customer month — all under
  ~0.25 s with **zero** recommendation-engine recalculation (measured directly, not inferred).

---

## S) Known Risks

1. **Every SAP B1 HANA query in مركز البيانات is a best-effort starting point**, built from
   the tables the user confirmed (`OINV`/`INV1`, `OITW`/`OWHS`, `OIPF`/`IPF1`,
   `IBT1`/`OBVL`/`OBTN`/`OITM`/`OCRD`) plus standard SAP B1 tables for everything else
   (returns, sales orders, quotations, purchase orders, goods receipts, AP invoices). Several
   fields are explicitly flagged uncertain in the query notes — see the **PRODUCTION SAP
   VALIDATION CHECKLIST** below. None of these were guessed-and-fixed; they are left as
   editable text so a SAP consultant can correct them without touching code.
2. **Print page numbers**: `@page` margin-box counters work in Firefox, not in current Chrome —
   the printed footer omits a reliable page number in Chrome. No CSS-only fix exists for this
   without a JS pagination library, which was out of scope.
2. **Weight totals** (tons) in the supplier purchase plan only appear when `وزن الوحدة` /
   `UnitWeight` is present in the uploaded item master — optional field, silently omitted if
   absent (shown as "الوزن غير متاح" rather than a wrong number).
3. **Stock-out evidence confidence**: because historical inventory is *reconstructed backward*
   from today's snapshot rather than from true historical snapshots, a low-sales month can only
   reach `HIGH` confidence when both opening stock and receipts are near-zero that month;
   ambiguous cases stay `MEDIUM` and are never silently excluded. This is intentional
   conservatism, not a defect, but it means genuinely stocked-out months with imperfect
   reconstruction data may be kept in the average until better evidence (receipts data, batch
   data) is uploaded.
4. **`Canceled` field convention**: the engine trusts whatever value arrives in the uploaded
   `Canceled` column (`'Y'`/`'N'`, case-insensitive). If the real SAP cancellation behavior in
   this environment doesn't map cleanly onto a single Y/N flag per document (e.g., a separate
   reversal document type instead), the uploaded query must produce that flag correctly — the
   engine has no independent way to detect it. See Validation Checklist item 7.
5. **Large-dataset import time** (~45 s for 200k lines) is a one-time/periodic cost acceptable
   for a manual paste/upload workflow, not for interactive use — do not expect sub-second
   imports at that scale.
6. **Item→Supplier resolution** is derived from actual purchase history by design (largest
   cumulative purchased quantity), which the spec explicitly required over trusting a single
   "preferred vendor" field. If a required supplier relationship exists only via a formal
   SAP field (not reflected in purchase history yet), it won't surface until either that
   history exists or it's added to `itemSupplierMap` manually.

---

## PRODUCTION SAP VALIDATION CHECKLIST

None of the following were guessed or silently "fixed" — each is left as **VALIDATION
REQUIRED** in the relevant query/note inside مركز البيانات, editable directly in the screen
once confirmed. Do not change the corresponding engine logic to work around an unconfirmed
field; correct the query/mapping instead.

1. ⬜ Confirm actual SAP HANA field names for batch/expiry query (`IBT1`+`OBVL`+`OBTN`+`OITM`+`OCRD` join — especially unit cost source `OBVL.SUAvgUP`).
2. ⬜ Confirm `OITM.CardCode` (used as the batch query's supplier join — may not be the correct standard field in this SAP B1 version).
3. ⬜ Confirm `OITM.SWeight1` (unit weight, used for ton totals in the supplier purchase plan).
4. ⬜ Confirm `OITM.SalUnitMsr` (sales UOM, shown throughout the UI next to every quantity).
5. ⬜ Confirm `POR1.ShipDate` (purchase order line delivery date, drives Past-Due / In-Transit classification).
6. ⬜ Confirm Supplier Lead Time UDF / source (currently assumed `OCRD.U_LeadTimeDays`, a custom field whose real name varies by company).
7. ⬜ Confirm exact Sales Cancellation behavior in our SAP B1 environment (does `OINV.Canceled='Y'` alone correctly represent every cancelled invoice and cancellation document in this environment?).
8. ⬜ Confirm Returns / Credit Memo relationship (`ORIN`/`RIN1` assumed as the standard AR Credit Memo pair — confirm this is what "return" means operationally here, and how it relates to the original invoice if that link matters).
9. ⬜ Confirm Item → Preferred Supplier mapping (the engine derives this from purchase history by design — confirm whether a formal SAP preferred-vendor field should also feed `itemSupplierMap`).
10. ⬜ Confirm actual Purchase Invoice quantity/UOM/weight fields (`PCH1.Quantity`/`Price` assumed — confirm UOM and weight are correctly represented for the sizes actually used in this business).
11. ⬜ Confirm Goods Receipt PO fields (`OPDN`/`PDN1`, especially `BaseEntry`/`BaseLine` reliably linking back to the originating `OPOR`/`POR1` line in this environment).
12. ⬜ Confirm Sales Order fields (`ORDR`/`RDR1`, especially `OpenQty` correctly reflecting partially-delivered orders).
13. ⬜ Confirm Sales Quotation fields (`OQUT`/`QUT1`, especially `OpenQty` and whether quotations expire/should stop counting as potential demand after some age).

---

*This document describes the system as of the Golden Freeze commit. If the file
`المشتريات_الخارجية_الذكية.html` is modified after this point without updating this document,
treat this document as stale and prefer reading the code directly — the code is always the
source of truth.*
