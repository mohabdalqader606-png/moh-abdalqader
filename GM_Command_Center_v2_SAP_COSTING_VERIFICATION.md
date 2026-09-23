# GM Command Center v2 — SAP COSTING VERIFICATION

**Type:** Discovery/verification only. No code, no SQL, no schema, no edits, not committed/pushed.
**Method:** every claim traced to file:line from direct code inspection of this repository's own existing, already-in-production SQL query library — not from theoretical SAP B1 knowledge. Anything the files themselves don't confirm is marked **Requires Verification**.

---

## HEADLINE FINDING (read this first)

**The codebase already contains two competing, both "production"-tagged, sales-line cost/profit methods — and one explicitly contradicts the other's trustworthiness.**

- **Method 1 — `INV1.GrssProfit` / `INV1.StockValue`** (query `KLN-SAL-000009`, tag: **"[الحالة: إنتاجي/معتمد]"** — production/approved, verbatim).
- **Method 2 — Batch-actual-cost** (`OBTN.CostTotal ÷ Quantity`, query `KLN-SAL-000004`), whose own description states it exists **specifically because**: *"كويري إنتاجي فعلي (وليس مبني على حقل GrssProfit الجاهز **غير المعتمد بهذه البيئة**)"* — i.e., this query was deliberately built to avoid `GrssProfit` because that field is **documented elsewhere in this same file as not certified for this SAP environment**.

Both queries are live, used, and labeled production. They will produce **different numbers** for the same invoice line. This is not a hypothetical risk — it is a documented internal contradiction in the existing codebase, and it is the single most important fact this investigation surfaced. Everything below is organized around resolving it.

---

## 1. OBJECTIVE — direct answer

> For one specific sales invoice line in SAP B1, can we determine the actual inventory cost attributed to that sale?

**Answer: CONDITIONALLY YES — two candidate sources exist and are already used in production elsewhere in this system, but they disagree with each other by the project's own documentation, and neither has been reconciled against the other or against GL.** Resolving this requires live SAP verification, not more code reading — see §9/§14.

---

## 2. OITM COST FIELDS

| Field | Exists in project | Table | Meaning | Used where | Suitable for sales-line COGS? | Verification required |
|---|---|---|---|---|---|---|
| `AvgPrice` | Yes | OITM (read via item master queries) | SAP's moving-average item cost | Fallback in `KLN-STK-000001`/`q20` (`CASE WHEN batch Quantity<>0 THEN CostTotal/Quantity ELSE AvgPrice END`); also `KLN-STK-007`, `KLN-STK-008` | Only as a **fallback** when batch cost is unavailable — and per a live-verified note in `شاشة_كشوفات_التوالف.html:445`, **`AvgPrice` returns zero for batch-managed items** (most of this company's items, per the same note) | Confirm on which items `AvgPrice` is actually non-zero (non-batch items only, per the damage-reports finding) |
| `LastPurPrc` | Not found in any query in this project | — | — | — | — | Requires Verification if ever needed |
| `PriceList`/`Price` (ITM1) | Yes | ITM1 | Sales price list, **not cost** | Dashboard's military price-list query; audit-screen tax/pricing query (`ITM1."PriceList"`) | No — this is a selling price, not a cost | — |
| Standard Cost | Not found anywhere | — | — | — | — | Not applicable to this SAP environment as configured, per absence of any query for it |

## 3. OITW

| Aspect | Finding |
|---|---|
| On-hand/On-order/Committed | Confirmed in Procurement engine (`OITW.OnHand`/`OnOrder`/`IsCommited`) and in the query library's inventory-turnover queries — **snapshot only** |
| Warehouse-specific cost | Only via `AvgPrice` (item-level, not truly warehouse-specific despite the join to `OWHS` in some queries) |
| **Reliability warning (confirmed live)** | `شاشة_كشوفات_التوالف.html:445`: *"لم نعتمد OITW.StockValue/OnHand ولا OITW.AvgPrice (صفر لهذه الأصناف المُدارة بباتشات)"* — explicitly NOT used for batch-managed items because it returns zero |
| Historical | Explicitly documented as **not historical**: `KLN-STK-008` (audit library) — *"تقييم لحظي (OITW.OnHand حالي)؛ لا يدعم تاريخاً سابقاً بذاته"*; `KLN-STK-001` — *"OITW.OnHand رصيد لحظي فقط، لا تاريخ سابق له"* |

**Quantity ≠ cost ≠ valuation ≠ COGS, kept distinct per your instruction:** `OnHand`/`OnOrder` = quantity only. `AvgPrice` = a cost figure but zero for batch items. `OnHand×AvgPrice` (used in `KLN-STK-008`) = a valuation snapshot, explicitly not historical. None of these three is COGS — COGS requires the *sale* transaction, covered in §4.

## 4. SALES DOCUMENT COST (OINV/INV1, ORIN/RIN1)

| Field | Table | Meaning (per project docs) | Reliable? | Includes returns? | Reflects inventory valuation? | Affected by landed cost? | Historical? |
|---|---|---|---|---|---|---|---|
| `GrssProfit` | INV1/RIN1 | SAP's own computed gross profit per line | **Contested** — production-tagged in `KLN-SAL-000009`, but explicitly called "غير المعتمد بهذه البيئة" (unapproved in this environment) by `KLN-SAL-000004`'s own description | Yes — `RIN1` branch negates it (`-SUM(T1."GrssProfit")`, confirmed identical in both files) | Whatever method computed it (Requires Verification — not stated) | Not confirmed either way | Requires Verification (SAP typically freezes this at posting, but no file in this project confirms that for this environment) |
| `StockValue` | INV1/RIN1 | SAP's own computed COGS per line | Same contested status as `GrssProfit` (companion field, same query) | Yes, negated identically | Same as above | Not confirmed either way | Same as above |

**Do not treat "GrssProfit" as COGS just because of its name** (per your explicit rule) — it is not COGS itself; `StockValue` is the COGS-equivalent field, and `GrssProfit` = Net − `StockValue` (implicitly, per the query's own column labeling "Net"/"GP"/"Cost").

## 5. INVENTORY MOVEMENT COST

| Source | Finding |
|---|---|
| `OINM.CalcPrice` | Used in `KLN-STK-007` (inventory turnover): `SUM(OutQty*CalcPrice) AS "COGS_Period"` — a **third, independent** COGS-estimation path, never cross-checked against `StockValue` or batch cost anywhere in this codebase |
| Item+Warehouse+Date+Quantity+Cost reconstruction | Theoretically possible from `OINM`, but no query in this project actually performs this reconstruction and reconciles it to a specific sales invoice line — **absent, not just unconfirmed** |
| Sales Invoice → Inventory Movement → COGS chain | **No query in this project does this join.** `StockValue` is read directly off `INV1` (SAP pre-computes and stores it there); nothing here traces it back through `OINM` |

## 6. BATCH COSTING

| Aspect | Finding |
|---|---|
| `OBTN.CostTotal/Quantity` | **Live-verified against actual SAP** (`شاشة_كشوفات_التوالف.html:438-444`): real example `45,765.382 ÷ 25,814 = 1.773`, confirmed to match SAP's own "Batch Details → Cost" screen exactly. This is the single strongest piece of evidence in this entire investigation — an actual, checked-against-live-SAP number, not a code-reading inference |
| `OBTN.Balance` | **Explicitly documented as unreliable** for some batches — same file, same lines: a real batch with a large Quantity/Output-Quantity gap gave "a huge, illogical Balance" while `CostTotal/Quantity` stayed correct. **Any formula using `Balance` (this includes the Procurement engine's own `OBVL`-based `Balance/(AccQty-AccNegQ)` formula, and the old procurement screen's identical pattern) inherits this documented risk** |
| `OBVL` | Used by the Procurement engine and the old (superseded) procurement screen for batch valuation via `Balance`-style division — **the same risk pattern flagged above applies** |
| `IBT1` | **Correction to a prior report in this same investigation thread**: IBT1 is NOT unused everywhere — the OLD (superseded) `شاشة_ذكاء_المشتريات_والمخزون.html:923` explicitly uses it: *"بيحسب رصيد كل باتش من حركاته بجدول IBT1 وكلفته من آخر تقييم مخزون OBVL"*. It is absent from the CURRENT procurement engine and from every other screen, but it is not fictional — it existed in this project's own prior iteration |
| `OBTQ` | Still not found used anywhere in any file investigated across this whole project — Requires Verification only if a future query needs it |
| Link to sales transactions | **No query anywhere links a specific batch to a specific sales invoice line's cost** other than `KLN-SAL-000004`, which joins via `OITL/ITL1` (item transfer/log-linking table) to attribute the actual batch sold — this is the one query in the whole library attempting a true batch→sale linkage, and it's the one whose own description flags the alternative (`GrssProfit`) as untrustworthy |

## 7. LANDED COST

| Question | Answer |
|---|---|
| What exists | `KLN-PUR-000002`: `OIPF`/`IPF1`, `FinalUnitCost = TtlCostLC/Quantity`, with explicit de-duplication logic excluding superseded landed-cost documents |
| Posted into inventory valuation? | **Not shown anywhere in this project.** No query joins this to `AvgPrice`, `StockValue`, or `OBTN.CostTotal` |
| Affects eventual COGS? | Not demonstrated in this codebase either way — Requires Verification directly against SAP |
| Linkable to Item/Batch/Warehouse/Sales? | Linkable to Item (confirmed), not demonstrated for Batch/Warehouse/Sales in any query here |
| Is `FinalUnitCost` = inventory cost, purchase cost, or an estimate? | Per its own formula (`TtlCostLC/Quantity`) it is a **landed-cost-adjusted purchase cost** — a cost of acquisition including allocated import charges, not a statement that SAP has posted this into the item's inventory valuation. **Do not classify it as inventory cost without further verification** — this report does not |

**Confirmed independently: the Procurement engine's `landedCost` data source is defined but never consumed by its own recommendation engine** (established in a prior investigation this session) — consistent with landed cost being an isolated, unintegrated concept everywhere in this project, not just in Procurement.

## 8. GL COGS RECONCILIATION

**Verdict: absent, not merely unconfirmed.** Every `JDT1`-referencing query in the library (e.g. `KLN-COL-000003`, `KLN-COL-000008`) is an AR/customer-balance or statement-of-account query, keyed by customer, not by item/inventory. The one GL-reconciliation query that exists at all, `KLN-FIN-005`, reconciles the **AR/AP subledger** (`OCRD.Balance`) to the GL control account (`OACT.Balance`) — a completely different reconciliation (subledger vs. GL), not inventory/COGS. **No query in this project ties a `JDT1` COGS-account posting back to `INV1.StockValue`, `OINM`, or any inventory document via `TransId`/`BaseRef`/`BaseEntry`/`BaseType`.**

## 9. REALISTIC SALES-LINE TRACE

```
OINV / INV1  →  [BREAK: no query bridges this]  →  Inventory movement (OINM)  →  [BREAK]  →  Inventory cost  →  [BREAK]  →  COGS journal entry  →  JDT1
```

The chain as literally requested **cannot be verified end-to-end from this project's existing queries** — it breaks at three points. What DOES exist is a **shortcut** that SAP itself provides: `INV1.StockValue` is (per SAP B1's own document design) supposed to already equal "COGS for this line," pre-computed by SAP at posting time — bypassing the OINM/JDT1 chain entirely. Whether that pre-computed value is itself correct in this environment is exactly the headline contradiction (§0) — one production query trusts it, another was built specifically to distrust it. **Mark the full manual trace as: Requires LIVE SAP Verification.** The shortcut (`StockValue`) is a documented candidate, not a verified one.

## 10. COSTING METHOD COMPARISON

| Method | Actual source in Kaylani | Historical availability | Line-level | Warehouse-level | Batch-level | Reconciles to GL COGS | Landed Cost | Status |
|---|---|---|---|---|---|---|---|---|
| Moving Average (`OITM.AvgPrice`) | Confirmed exists, used as fallback only | Not historical (point-in-time; also documented as **zero for batch-managed items**) | No (item-level) | No | No | Not attempted anywhere | Not integrated | Used only as a fallback in 2 queries |
| Standard Cost | Not found in this project | — | — | — | — | — | — | Not present |
| FIFO (inventory) | Not found — the only "FIFO" in this project is an unrelated AR-collection-allocation method | — | — | — | — | — | — | Not present for inventory |
| Actual Transaction Cost (`INV1.StockValue`) | Confirmed exists, production-tagged in one query, **flagged unapproved by another** | Requires Verification (SAP typically freezes at posting; not confirmed here) | Yes | No | No | Not attempted | Not shown either way | **Contested within the project itself** |
| Batch Cost (`OBTN.CostTotal/Quantity`) | Confirmed exists, **live-verified against actual SAP screen** | Yes in principle (batch-level record, not a live snapshot) — not explicitly re-tested for older/depleted batches | Yes, via batch-to-invoice link in one query | Not by itself (batches aren't warehouse-specific in `OBTN` per the damage-reports note) | Yes — this is its native level | Not attempted | Not integrated | Production-tagged, and the query using it exists specifically to avoid the contested `StockValue` field |
| GL COGS Allocation | Confirmed exists (monthly, GL-level, already ported to the dashboard in Phase 1) | Yes, monthly | No | No | No | Yes, by definition (it IS the GL) | Not applicable | Production-tagged, but cannot be allocated down to a line without an allocation key that doesn't exist |

No method is ranked or recommended, per your instruction. The table above is the evidence; §14/§15 state only what is proven vs. not.

## 11. HISTORICAL DATA TEST

| Method | 2024/2025/2026 support | Documented limitation |
|---|---|---|
| `AvgPrice`/`OnHand` valuation | **Current/future only** — two separate library entries explicitly say "لحظي...لا يدعم تاريخاً سابقاً" | Cannot be used to value inventory as of a past date at all |
| `INV1.StockValue` | Requires Verification — plausible if frozen at posting (typical SAP behavior) but not confirmed in this project's own documentation | Unknown whether revaluations after posting would silently change it |
| `OBTN.CostTotal/Quantity` (batch) | Plausible for any batch still on record, historical periods included, since it's a per-lot stored figure, not a live snapshot | Not tested against a batch that has since been fully depleted/purged from `OBTN`; returns/transfers affecting a batch's recorded cost over time not addressed by any file |
| GL COGS | Yes, monthly, for any period with posted `JDT1` data | Aggregate only — no line detail regardless of period |

Revaluation effects, returns timing, transfer effects, and landed-cost timing are **not addressed by any query or comment in this project** for any of the above methods — all Requires Verification.

## 12. REQUIRED PROFITABILITY DATASET

| Field | Source | Confirmed/Unconfirmed | Calculation | Limitation |
|---|---|---|---|---|
| Date, DocType, DocEntry, LineNum | INV1/RIN1 | Confirmed | Direct | — |
| Customer, Item, SalesEmployee | OINV/INV1, OSLP | Confirmed (already in Phase 1 query) | Direct | — |
| Branch/Department | OBPL | Confirmed, but this is the **only** dimension available anywhere — no true department concept exists in the GL either | Direct | Not a true cost-center |
| Warehouse | Not currently in the dashboard's sales query | Would need adding | Direct if added | INV1 does carry a WhsCode on the line — Requires Verification of exact column name in this environment |
| Batch | Only via a new join (`OITL/ITL1`, per `KLN-SAL-000004`) | Confirmed the join exists in the library, not in the dashboard | Complex join, not a simple column add | This is the crux of the whole cost question |
| Quantity, Gross Sales, Discount, Returns, Net Sales | Dashboard's own Phase 1 query | Confirmed, already built | Direct | — |
| Unit Cost, COGS | `StockValue` (contested) or batch join (complex) or GL (no line detail) | **Unconfirmed which is authoritative** | Depends entirely on §14 Gate A resolution | This is the blocker |
| Gross Profit, Gross Margin | Derived from the above | N/A | NetSales − COGS | Inherits the COGS uncertainty exactly |

## 13. INVENTORY VALUATION CONSEQUENCE

**Sales-line COGS and balance-sheet inventory valuation are different problems requiring different evidence, and this project's own data confirms they cannot share one source today:**
- Sales-line COGS candidates (`StockValue`, batch cost) are transaction-level and (for batch cost) live-verified — but neither is proven historical-snapshot-safe for a balance-sheet date.
- Balance-sheet inventory valuation (`OnHand×AvgPrice`, `KLN-STK-008`) is explicitly documented as **point-in-time only** and **zero for batch-managed items** — i.e., it may not even produce a usable number for most of this company's inventory.
- **Conclusion: Inventory Value / Inventory Days / Working Capital / CCC cannot borrow the sales-line COGS answer once §14 resolves it** — inventory valuation is a separate, currently weaker-evidenced problem (the one production valuation query explicitly disclaims batch-item support), and needs its own verification pass, not an assumption that solving COGS also solves this.

## 14. DECISION GATE

- **GATE A — VERIFIED LINE-LEVEL COST:** **CONDITIONAL.** Two production-tagged candidates exist; the project's own documentation shows them contradicting each other's trustworthiness. Not a clean YES until reconciled against live SAP.
- **GATE B — VERIFIED INVENTORY VALUATION:** **NO** as currently evidenced — the only valuation query explicitly excludes/zeroes-out batch-managed items, which this damage-reports note indicates is most of this company's inventory.
- **GATE C — HISTORICAL COST AVAILABLE:** **CONDITIONAL.** Batch cost and `StockValue` are plausibly historical (stored, not live-snapshot) but neither is confirmed frozen/stable over time by this project's own documentation. `AvgPrice`-based methods are confirmed **NOT** historical.
- **GATE D — GL RECONCILIATION POSSIBLE:** **NO** — confirmed absent from every query in this project; not proven impossible in principle, but nothing here does it today.
- **GATE E — CUSTOMER/ITEM MARGIN READY:** **CONDITIONAL/NO** — queries exist (plural, incompatible ones) but would disagree with each other; "ready" only once Gate A is resolved. Department/Warehouse margin: **NO** (no dimension exists for either, confirmed).
- **GATE F — INVENTORY DAYS READY:** **NO** — depends on Gate B, which is itself unresolved and explicitly weak for this company's (batch-managed) inventory.

## 15. FINAL RECOMMENDATION

1. **What SAP actually provides:** Two native, queryable sales-line cost signals (`INV1.StockValue`/`GrssProfit`, and batch-level `OBTN.CostTotal/Quantity` reachable via an item-transfer-log join) — both already used in this project's own "production" query library.
2. **What is proven:** Batch cost (`OBTN.CostTotal/Quantity`) is proven — live-verified against an actual SAP screen with a real numeric match. Returns are proven to correctly reduce both `GrssProfit` and `StockValue` in the existing queries. `OBTN.Balance`-based formulas (used by the Procurement engine) are proven **unreliable** for at least some batches.
3. **What is not proven:** Whether `StockValue`/`GrssProfit` is trustworthy in this specific SAP environment (directly disputed by the project's own code comments) — this is the central open question. Which inventory-valuation method (if any) is safe for batch-managed items. Whether landed cost is folded into any of the above by SAP itself. Whether any of these figures are stable/frozen historically. Any GL-level reconciliation of COGS.
4. **Requires LIVE SAP verification:** A direct, side-by-side check — for a handful of real, already-invoiced sales lines — comparing `INV1.StockValue`, the batch-actual-cost calculation, and the OINM movement cost, against what SAP's own screens show for those same transactions. This is exactly the methodology the damage-reports team already used successfully once in this project (§6) — it is the proven way to settle this, not further code reading.
5. **Fields/queries that would be required:** `KLN-SAL-000004` (batch-actual method, already written) and `KLN-SAL-000009` (StockValue method, already written) run side-by-side over the same real period, plus a manual spot-check against SAP's native Batch Details / Invoice Gross Profit report for 5-10 real transactions.
6. **What becomes possible after verification:** If either method is confirmed trustworthy — Customer/Item margin (Gate E), Profit Bridge's Cost Effect, and a real Gross Profit/Margin figure more granular than today's GL-level monthly number.
7. **What remains blocked regardless:** Department/Warehouse margin (no dimension exists in the GL or in any margin query), full Inventory Days/CCC (inventory valuation is a separate, weaker-evidenced problem per §13), GL-to-line reconciliation (confirmed absent, would need new query design even after Gate A resolves).

**Management Decision Required:** Which of the two existing, both-labeled-"production" cost methods (`StockValue`/`GrssProfit` vs. batch-actual-cost) is authoritative for this business — and whether that decision should itself be preceded by the live SAP spot-check in point 4, given the two methods' own documentation already disagrees. This is a business/finance decision informed by a short verification exercise, not an engineering choice, and not something this document resolves.
