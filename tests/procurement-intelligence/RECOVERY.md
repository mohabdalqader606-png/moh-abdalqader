# RECOVERY.md — what was recovered vs. newly authored (Phase P0-A)

This test foundation was built under an explicit authorization ("P0-A — PERMANENT TEST
GOVERNANCE & REGRESSION FOUNDATION") that required an honest accounting of which parts are a
faithful recovery of pre-existing work and which parts are new. This file is that accounting.
Nothing below is a claim about test *quality* — only about test *origin*.

## What existed before this phase

Throughout the engagement that produced المشتريات_الخارجية_الذكية.html, two test scripts ran
repeatedly against the live application from a **session-local scratch directory** — never
committed to this repository, never versioned, invisible to any other session or to `git log`.
They were:

- **`validate.js`** — an 84-check business-logic suite across 12 numbered sections (in-transit
  rule, complete-PO supplier aggregation, sales accounting, special warehouses, monthly sales,
  stockout/outlier demand adjustment, customer drill-down, data-upload lifecycle, performance,
  SAP-reality alignment, pilot review, login/permissions).
- **`smoke.js`** — a 54-check end-to-end UI suite driving the real upload modal, navigation,
  sorting, filtering, drawers, print layouts, CSV export, responsive layout, and an
  IndexedDB-reload persistence check.

At the start of this phase both files were confirmed **still present** in the scratch directory
(verified directly, not assumed) before any porting began.

## What was recovered (ported, not rewritten)

- **`business-logic.spec.js`** — a direct, line-by-line port of `validate.js`. Every one of the
  84 original `check(suite, name, ok, info)` call sites, every fixture TSV row, every hand-derived
  expected number, and every comment is carried over **verbatim**. The only additions layered on
  top are: routing the setup through the new shared `harness.js` instead of each suite's own
  inline copy of the browser-mock code, a `SUITE_META` category tag per suite, and an
  auto-generated `BL-XX.Y` Test ID per check (via a thin wrapper around the same `check()` call
  signature — the call sites themselves are untouched).
- **`e2e.spec.js`** — the same treatment applied to `smoke.js`: every check, click path, selector
  and fixture row recovered verbatim; only the harness wiring and `E2E-NN` Test IDs are new.

Recovering these into the repository is exactly the P0 gap the Phase 1 audit named: *"مجموعة
اختبارات شاملة (84+54) — خارج النسخ، غير موجودة بالمستودع نفسه"* (a comprehensive 84+54 test
suite existed, but outside version control, not in the repository itself).

### A behavioral difference the port surfaced and had to fix — in the harness, not the ported checks

Porting `validate.js`'s and `smoke.js`'s inline setup code into one shared `harness.js` (so it
isn't duplicated five times across suites) required merging two DIFFERENT setup functions that
happened to look similar: `fresh()` (used by `validate.js`, which always waits for `APP_READY`)
and `authPage()` (used by both files' login/permission-gate tests, which — critically — never
auto-waits for `APP_READY`, because one of its own test cases is a denied-permission scenario
where `APP_READY` never becomes true at all). The first merged draft of `harness.js` made
`authPage()` delegate into the same forced-wait logic as `fresh()`, which hung forever on
suite 12's `permission: null` case. This was caught immediately by actually running the ported
suite (not by inspection) and fixed by giving `authPage()` its own implementation, matching the
original exactly — no test assertion was changed, no expected value was changed, only the
harness's internal wiring. A second, smaller harness gap (the shared `window.print` mock was
missing the `__prints` counter and `__hold` gate that `smoke.js`'s own mock had, which two of the
52 e2e print-related checks depend on) was found and fixed the same way. Both fixes are called
out here because "faithful port" is a specific claim, and a reader auditing that claim should be
able to see exactly where fidelity slipped and how it was restored — not just be told it holds.

## What is newly authored this phase (not a recovery of anything)

Everything else in `tests/procurement-intelligence/` did not exist anywhere before this phase —
there was no prior scratch version, ported or otherwise:

- **`harness.js`** — the shared setup module itself. It is a *refactor* that extracts the setup
  code duplicated across `validate.js`/`smoke.js` into one file; it is not a port of either
  original file, since neither original had a "shared harness" concept.
- **`fixtures/golden-dataset.js`** — all 20 golden-dataset scenarios, newly built this phase. The
  20 scenario *definitions* (what each one proves) mirror the "مواصفة البيانات المرجعية" table in
  the Phase 1 audit report (`audit_report.html §11`) verbatim — that table was itself new writing
  in Phase 1, not a recovery — but the concrete fixture data, the hand-derived expected values and
  the `math` citations in each scenario are new work product of this phase, computed directly from
  the engine's documented formula chain (see file:line citations inline).
- **`golden-dataset.spec.js`**, **`data-validation.spec.js`**, **`determinism.spec.js`**,
  **`run-all.js`** — all newly authored this phase; none existed in any prior form.

## What this means for trusting the numbers

- `business-logic.spec.js` / `e2e.spec.js`: their expected values were **not** independently
  re-derived in this phase — they carry forward whatever was already validated when `validate.js`
  / `smoke.js` were written and run repeatedly during the engagement. Trust in those numbers rests
  on that prior work, not on anything new here.
- `golden-dataset.spec.js` / `data-validation.spec.js` / `determinism.spec.js`: their expected
  values were derived fresh this phase, directly from the production file's formulas (see the
  `math` field in each golden-dataset scenario and the inline comments in the other two files),
  then checked against the live engine — not the other way around. See TRACEABILITY.md for how
  each check maps to a documented business rule.

No test file in this directory was generated by running the app once and recording whatever it
produced as "expected". Every expected value here — recovered or new — was computed independently
of the engine first.
