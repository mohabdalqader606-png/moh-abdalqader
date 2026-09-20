# TRACEABILITY.md — Test ID → Scenario → Business Rule → Control Matrix

This maps every test *group* in this directory to the business rule it exercises and, where
applicable, to the control ID from the Phase 1 Big-4 audit's control matrix (`audit_report.html
§10`, control IDs C-01..C-10). It is a rule-level map (suite / scenario grain), not a
per-assertion listing — for the full flat list of all 246 individual checks (their exact IDs,
names, pass/fail state and category), run `node run-all.js` and read `results/latest.json`, which
is generated fresh on every run and is the authoritative, machine-readable source of truth. This
file explains *why* each group exists; `results/latest.json` proves *whether it currently passes*.

## Control matrix reference (from Phase 1 audit)

| ID | Area | What it must guarantee |
|----|------|------|
| C-01 | حوكمة بيانات (data governance) | اكتمال الحقول الإلزامية — required-field completeness |
| C-02 | استيراد بيانات (data import) | منع ازدواج/فقدان بيانات — no duplication or silent data loss |
| C-03 | ضبط وصول (access control) | منع إجراء بلا صلاحية — no action without the right permission tier |
| C-04 | محرك القرار (decision engine) | توصية كمية قابلة للتفسير — an explainable, correct recommended quantity |
| C-05 | مخزون أمان (safety stock) | توازن مخاطرة نفاد/فائض مبرَّر إحصائياً — statistically justified buffer |
| C-06 | مدة التوريد (lead time) | تقدير موثوق زمن التوريد — a reliable lead-time estimate |
| C-07 | أوامر شراء مفتوحة (open POs) | منع احتساب توريد غير مؤكَّد — never count unconfirmed supply as incoming |
| C-08 | اختيار مورد (supplier selection) | مورد صحيح لكل صنف — the correct supplier per item |
| C-09 | قابلية التدقيق (auditability) | إعادة إنتاج أي توصية سابقة — any past recommendation must be reproducible |
| C-10 | ضمان جودة (QA) | منع تراجع منطقي عند أي تعديل — no logic regression on any future change |

C-05 (statistical safety stock) has **no green control** in the audit — the engine uses a flat
`serviceBufferDays` constant, not a variance-based model. Tests that touch this area (GD-18) are
deliberately written to **document that gap**, not to assert it doesn't exist — see "gap-documenting
tests" below.

## business-logic.spec.js (`BL-*`, 84 checks — recovered from `validate.js`, see RECOVERY.md)

| Suite | Title | Business rule | Control |
|---|---|---|---|
| 1 | IN-TRANSIT RULE | Confirmed vs. unconfirmed incoming PO supply | C-07 |
| 2 | COMPLETE PURCHASE ORDER — supplier aggregation | Recommended qty never capped below true need; supplier PO aggregation | C-04 |
| 3 | SALES ACCOUNTING — no double counting | Net sales (invoice − return), no duplicate counting | C-04 |
| 4 | SPECIAL WAREHOUSES | Warehouse inclusion/exclusion rules (available vs. physical vs. demand) | C-01, C-04 |
| 5 | MONTHLY SALES — partial period | Average by actual days, not whole months | C-04 |
| 6 | STOCKOUT / OUTLIER DEMAND ADJUSTMENT | Outlier exclusion requires stockout evidence, not just a low ratio | C-04 |
| 7 | CUSTOMER DRILL-DOWN sorting | UI sort/aggregation correctness (unit-level) | — |
| 8 | DATA UPLOAD LIFECYCLE | Baseline lock, incremental merge, rollback, no duplicate keys | C-02 |
| 9 | PERFORMANCE — representative dataset | Large-dataset import/engine timing, cache-hit behavior | C-10 |
| 10 | PHASE 2 — SAP REALITY ALIGNMENT | Receipt matching (GRPO+invoice, no double count), lead-time fallback chain, quotation weighting | C-02, C-06, C-07 |
| 11 | PILOT REVIEW | Frozen recommendation snapshot at decision time, never rewritten | C-09 |
| 12 | LOGIN / PERMISSIONS GATE | Function-level permission enforcement (view/input/admin) | C-03 |

## e2e.spec.js (`E2E-*`, 54 checks — recovered from `smoke.js`, see RECOVERY.md)

One continuous session exercising the real upload UI end-to-end: data-center cards, real modal
upload for all 10 primary sources, engine run, command-center table + columns, 3-state column
sorting, filter panel, why-drawer, item/supplier drawers, sales-analysis report + customer
drill-down, purchase-plan build + CSV export, four distinct print layouts, the full pilot-review
workflow (log → review → close → filter → export → print), responsive layout at 3 breakpoints,
and an IndexedDB-reload persistence check. Maps broadly to C-02 (import UI), C-04 (decision UI)
and C-09 (pilot-review audit trail UI) — see `e2e.spec.js` inline section comments for the
per-step business rule.

## fixtures/golden-dataset.js + golden-dataset.spec.js (`GD-*`, 91 checks — new this phase)

Each of the 20 scenarios below is the corresponding numbered case from the Phase 1 audit's
"مواصفة البيانات المرجعية" table (`audit_report.html §11`), now a concrete, hand-derived,
executable fixture. "Gap-documenting" scenarios assert the engine's *actual* current behavior on
a known limitation (no seasonality model, no statistical safety stock, etc.) — they exist so a
future change to that behavior is a deliberate, reviewed decision, not a silent regression.

| ID | Scenario | Proves | Control | Kind |
|---|---|---|---|---|
| GD-01 | صنف طبيعي | Full base formula chain gives the exact expected number | C-04 | correctness |
| GD-02 | حركة سريعة | Low coverage correctly triggers CRITICAL | C-04 | correctness |
| GD-03 | بطيء الحركة | SLOW_MOVING status (not MONITOR) at 3–6 months coverage | C-04 | correctness |
| GD-04 | راكد تماماً | DEAD stock → zero recommended qty despite available stock | C-04 | correctness |
| GD-05 | صنف جديد (<4 أشهر) | Confidence auto-drops to LOW; no crash on sparse data | C-04, C-10 | correctness |
| GD-06 | صنف موسمي | **Gap**: no seasonal adjustment — flat mean used regardless of a clear seasonal pattern | C-04 | gap-documenting |
| GD-07 | طلب متقطّع/خفيف | **Gap**: same flat-mean formula applied to intermittent demand, no specialized model | C-04 | gap-documenting |
| GD-08 | فائض مخزون | OVERSTOCK correctly triggered above the coverage-months threshold | C-04 | correctness |
| GD-09 | خطر نفاد قادم | ORDER_SOON correctly precedes CRITICAL at intermediate coverage | C-04 | correctness |
| GD-10 | أمر شراء مفتوح مستقبلي | A future open PO is auto-counted as confirmed incoming, no manual step | C-07 | correctness |
| GD-11 | أمر متأخر بلا تاريخ وصول | An overdue, unconfirmed PO is excluded from the decision, shown as "unconfirmed" | C-07 | correctness |
| GD-12 | تأكيد وصول يدوي | Manual confirmation (`setDocOverride`) immediately flips the decision | C-07, C-09 | correctness |
| GD-13 | صنف بلا مورد | "No supplier assigned" is correct, documented behavior, not a crash | C-08 | correctness |
| GD-14 | صنف بموردين، أحدهما مفضَّل | Historical majority always wins over an `IsPreferred` flag when purchase history exists | C-08 | correctness |
| GD-15 | MOQ بلا مضاعف طلب | Correct round-up to MOQ when no order multiple is set | C-04 | correctness |
| GD-16 | مضاعف طلب بلا MOQ | **Gap**: historically-most-common quantity used as a silent multiplier substitute | C-04 | gap-documenting |
| GD-17 | مدة توريد شاذة (180+ يوم) | Extreme lead time doesn't break the horizon calculation (no NaN/Infinity) | C-04, C-06 | correctness |
| GD-18 | تقلّب طلب شهري كبير | **Gap**: safety buffer stays a flat constant regardless of demand volatility (C-05) | C-05 | gap-documenting |
| GD-19 | مرتجعات كبيرة بنفس الشهر | Returns are correctly netted into the monthly demand average | C-04 | correctness |
| GD-20 | فترة تنتهي بشهر جزئي | Sales-report average divides by actual days, not whole months (separate code path from GD-01..19) | C-04 | correctness |

## data-validation.spec.js (`DV-*`, 14 checks — new this phase)

| ID | Edge case | Control |
|---|---|---|
| DV-01 | Negative inventory on-hand | C-01 |
| DV-02 | Same item+supplier mapping re-imported with a different value (cross-batch upsert) | C-02 |
| DV-03 | Header-only (empty) dataset import | C-02 |
| DV-04 | Malformed date value — whole row rejected, not partially imported | C-01, C-02 |
| DV-05 | Missing required field (blank ItemCode) | C-01 |
| DV-06 | Duplicate DocEntry+LineNum within one file | C-02 |
| DV-07 | Explicit MOQ=0 / OrderMultiple=0 (not blank) | C-04 |
| DV-08 | Explicit supplier LeadTimeDays=0 | C-06 |
| DV-09 | Orphan SupplierCode (never in suppliers master) | C-06, C-08 |
| DV-10 | Quotation-only demand (hasDemand=false yet recommendedQty>0) | C-04 |
| DV-11 | Extreme single-line quantity (10,000,000) | C-04, C-10 |
| DV-12 | Item known only via purchaseOrders (never sold, no inventory row) | C-01, C-04 |
| DV-13 | Zero-quantity sales line | C-04 |

## determinism.spec.js (`DET-*`, 3 checks — new this phase)

Runs one shared fixture (stable demand, low-coverage, overstock, a confirmed future PO, and a
manually-confirmed late-PO override) through two independent fresh browser contexts and asserts
byte-identical output — both the per-item recommendation fields and the sorted recommendation
list's order. Maps to C-10 (regression foundation): a bug that only shows up as "same input,
different output between runs" is invisible to every other suite in this directory, since they
each run once.

## Coverage summary (from the most recent `run-all.js` run)

See `results/latest.json` → `coverage` for the current pass/total count per category
(Functional / Decision / Edge / Data-Quality / Regression). That file is regenerated on every
`run-all.js` invocation and is intentionally not duplicated here to avoid the two going stale
against each other.
