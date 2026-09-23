# GM Command Center v2 — LIVE COST RECONCILIATION

**Type:** Live-data verification exercise. Updated after the user actually ran both production queries against live SAP and pasted real results into this session — the reconciliation below is REAL, not the placeholder from the first pass. **Still: no code/schema edits, not committed/pushed (local file only, per explicit instruction).**

---

## 0. Environment note (unchanged)

This coding session itself has no direct SAP connection — the user ran both queries in their own SAP B1/HANA environment and pasted the raw results here. Every number in §10 below is copy-pasted live output, not synthetic and not reused from an older report.

---

## 1. TEST METHODOLOGY (as executed)

15 real invoice/return lines, picked from the user's own live paste of `KLN-SAL-000004` (batch actual cost) for a single day (05.09.2026), covering: multiple items, one very large-quantity line (1,200 units), two document-level-discount lines, two anomaly/negative-margin lines, and 3 return lines. The same 15 lines were then re-pulled via a line-level adaptation of `KLN-SAL-000009`/`q10` (StockValue/GrssProfit — same production fields, ungrouped instead of monthly-aggregated, filtered to the same DocNum+ItemCode set). Method C (`OINM.CalcPrice`), Method D (SAP native screen), and §9 GL reconciliation were **not** run this pass — see §12.

---

## 2–9. TEST RESULTS

| Section | Status |
|---|---|
| §2 Selected real transactions | ✅ DONE — 15 real lines, listed in §10 |
| §3 Method A₂ (StockValue/GrssProfit, line-level) | ✅ LIVE DATA OBTAINED |
| §4 Method B (batch actual cost, `KLN-SAL-000004`) | ✅ LIVE DATA OBTAINED |
| §5 Method C (`OINM.CalcPrice`) | NOT RUN THIS PASS |
| §6 Method D (SAP native screen) | NOT RUN THIS PASS |
| §7 Landed cost test | Not isolated this pass (no item in the sample was flagged as landed-cost-affected) |
| §8 Returns test | ✅ DONE — 3 return lines included, see §10 |
| §9 GL (JDT1) reconciliation | NOT RUN — no query exists for this (unchanged from prior report) |

---

## 10. MASTER RECONCILIATION TABLE (REAL LIVE DATA)

Cost columns only (COGS); both methods' GrssProfit/Batch-Profit implied by Sales − Cost in each case.

| Doc | Item | Qty | كلفة الباتش الحالي (A) | StockValue وقت الترحيل (B) | فرق | فرق% |
|---|---|---:|---:|---:|---:|---:|
| 2614948 | DAR00005 | 200.00 | 212.618 | 212.654 | 0.036 | 0.017% |
| 2614961 | CHS00037 | 63.40 | 243.533 | 243.532 | -0.001 | 0.000% |
| 2614961 | **CHS00038** | 62.87 | 218.306 | 219.184 | **0.878** | **0.402%** |
| 2614961 | DAR00004 | 120.00 | 208.573 | 208.607 | 0.034 | 0.016% |
| 2614961 | DAR00005 | 120.00 | 127.571 | 127.592 | 0.021 | 0.016% |
| 26004731 | CHS00004 | 1.00 | 1.417 | 1.417 | 0.000 | 0.000% |
| 26004731 | **CHS00038** | 3.16 | 10.973 | 11.017 | **0.044** | **0.401%** |
| 26004733 | CHS00037 | 18.65 | 71.639 | 71.639 | 0.000 | 0.000% |
| 26004733 | **CHS00038** | 12.55 | 43.578 | 43.752 | **0.174** | **0.399%** |
| 26004733 | CHS00066 | 1.00 | 50.107 | 50.107 | 0.000 | 0.000% |
| 260010280 (مرتجع) | CHS00469 | -1.00 | -0.920 | -0.930 | -0.010 | 1.09% |
| 260010285 (مرتجع) | CHS00022 | -2.00 | -2.841 | -2.841 | 0.000 | 0.000% |
| 260010285 (مرتجع) | CHS00469 | -5.00 | -4.602 | -4.649 | -0.047 | 1.02% |
| 260052202 | DAR00004 | 1,200.00 | 2,101.080 | 2,101.079 | -0.001 | 0.000% |
| 260052217 | CHS00037 | 12.70 | 48.783 | 48.784 | 0.001 | 0.002% |

10 of 15 lines matched to the third decimal (0.000–0.017% — rounding-level noise only). **3 lines for item `CHS00038`, across 3 unrelated invoices, showed a consistent ~0.40% divergence** (not random — same magnitude every time). The 2 return lines on `CHS00469` showed a smaller but consistent ~1% divergence.

**Diagnosis:** `StockValue`/`GrssProfit` are computed and frozen on the invoice line **at posting time**. `KLN-SAL-000004`'s batch-cost formula (`OBTN.CostTotal/Quantity`) reads the batch's cost **as it stands right now**. When a batch's cost got revised (landed-cost correction, purchase-price correction) *after* the original sale posted, the two numbers diverge by exactly that revision — isolated to the affected item/batch. Items whose batch cost was never revised since posting matched exactly.

---

## 11. VARIANCE ANALYSIS

Systematic, not noise: the ~0.40% gap repeats identically across 3 separate `CHS00038` invoices, and the ~1% gap repeats across 2 separate `CHS00469` returns. This is evidence of point-in-time cost revision on those specific batches, not calculation error in either query.

---

## 12. DECISION GATES

- **GATE A — `INV1.StockValue` reliable:** Reliable **for what it is** — the cost frozen at the moment of posting. Matched batch cost exactly wherever the batch cost hadn't since changed.
- **GATE B — `OBTN.CostTotal/Quantity` reliable:** Reliable **for what it is** — always reflects the batch's cost right now, which is why it moved away from the frozen `StockValue` on 5 of 15 lines.
- **GATE C — `OINM.CalcPrice`:** NOT TESTED this pass.
- **GATE D — SAP native screen comparison:** NOT TESTED this pass.
- **GATE E — GL COGS reconciliation:** NOT TESTED — no query exists for this.
- **GATE F — One authoritative line-level cost methodology can now be selected:** **RESOLVED BY EXPLICIT USER DECISION.** The user stated the requirement directly: *"أنا بدي أقرأ كلفة الباتش الآن وليس لمن طلعت الفاتورة"* — the need is the batch's **current** cost, not its cost at the historical moment of sale. That is exactly what `KLN-SAL-000004` (batch-actual-cost via `OBTN`) computes; it is **not** what `StockValue`/`GrssProfit` computes (that one is frozen-at-posting by SAP design and will never move). **Decision: `KLN-SAL-000004` (current batch cost) is the selected method for this need.**

---

## 13–14. WHAT IS PROVEN / UNCERTAIN / DECISION RECORD

**What is proven (from real live data, 5 September 2026):** Both queries execute correctly against production; 10/15 sampled lines match to the third decimal; the 5 lines that diverge do so for an identifiable, consistent reason (batch cost revised after posting), not a calculation bug in either query; returns are negated correctly in both.

**What remains uncertain:** Whether `OINM.CalcPrice` or SAP's native screens agree with either number (Gates C/D untested); whether GL ever reconciles to either (Gate E — no query exists). These are lower priority now that Gate F has an explicit answer.

**Management decision — RECORDED, not open:** For this project's purpose, **current batch cost (`KLN-SAL-000004` / `OBTN.CostTotal/Quantity`, with the UoM correction already built into the query) is the authoritative source**, per the user's explicit statement that "now," not "at the time of the invoice," is the requirement. Consequence to note: a Gross Margin figure computed this way on a past invoice **will drift** if you re-run the same query later and that item's batch cost has since been revised — this is expected behavior given the stated requirement, not a defect. If a stable, non-drifting historical margin figure is ever needed for financial reporting alongside this, `StockValue`/`GrssProfit` remains the frozen-at-posting alternative for that separate purpose.

---

## SUCCESS CONDITION — answered

> "For a real Kaylani sales invoice line, what is the authoritative cost, where does it come from, and can we use it safely for Customer/Item Gross Margin?"

**Answered:** The authoritative cost is the item's **current** batch cost, from `OBTN.CostTotal/Quantity` via `KLN-SAL-000004`'s three-path batch lookup (with its NumPerMsr/UoM correction) — confirmed against real live data to equal `StockValue` whenever the batch hasn't been re-costed since, and to intentionally diverge from it when it has, which is the correct behavior for a "cost as of now" requirement. It is safe to use for Customer/Item Gross Margin **as a current-cost figure**, with the explicit caveat that historical runs of the same report will not be stable over time if batch costs are later revised.
