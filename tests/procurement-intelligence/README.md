# Permanent test foundation — شاشة المشتريات الخارجية الذكية

This directory is the repository-committed, permanent regression foundation for
`المشتريات_الخارجية_الذكية.html`. It was established under an explicit "P0-A" authorization
(build a committed test suite, zero production changes), extended under "P0-B" (a Decision
Evidence / auditability layer — the first phase that DID authorize production changes, strictly
scoped to additive, read-only-from-the-engine's-perspective evidence capture; see
`AUDIT_EVIDENCE_EXAMPLE.md`), then extended again under "P1-C" (the first of P0-B's own
confirmed-gap items to be authorized for implementation: one additive historical-evidence field,
`inputSnapshot.hasInventoryRecord`, closing the one confirmed gap in Confidence-label
reproducibility), then extended again under "P1-A" (the second of P0-B's own confirmed-gap items:
an orthogonal `audit_access` capability — `myAuditAccess`/`hasAuditAccess()` — granting
Decision-Evidence-only access independent of the existing VIEW/INPUT/ADMIN tiers, with no change
to those tiers' own behavior). See RECOVERY.md for exactly what P0-A's tests recovered from prior
(uncommitted) work vs. newly authored, and TRACEABILITY.md for what each test group proves and
how it maps to the Phase 1 audit's control matrix.

## What's here

| File | Checks | Purpose |
|---|---|---|
| `harness.js` | — | Shared Playwright setup (fresh IndexedDB context, mocked Supabase auth, `page.imp()` import helper). Not a test file itself. |
| `business-logic.spec.js` | 84 | Core recommendation-engine formulas: in-transit rule, PO aggregation, sales accounting, warehouses, partial-period averaging, outlier/stockout adjustment, drill-down sorting, upload lifecycle, performance, SAP-reality alignment, pilot review, login/permissions. |
| `e2e.spec.js` | 54 | Real UI end-to-end: upload modal, navigation, sorting, filtering, drawers, print layouts, CSV export, responsive layout, reload persistence. |
| `fixtures/golden-dataset.js` | — | 20 controlled, hand-derived reference scenarios (data only — see file header). **Controlled test data, not production data.** |
| `golden-dataset.spec.js` | 91 | Executes the 20 golden-dataset scenarios against the live engine and asserts the hand-derived expected values. |
| `data-validation.spec.js` | 14 | Negative/edge inputs: negative inventory, duplicate/empty/malformed imports, explicit-zero MOQ/lead-time, orphan supplier, extreme quantity, sparse items. |
| `determinism.spec.js` | 3 | Same input run twice in independent contexts must produce byte-identical output. |
| `decision-evidence.spec.js` | 18 | **(P0-B)** The `EVIDENCE` module: decision identity, fingerprint determinism/sensitivity, actor capture, historical immutability against config changes, overrides, failure handling. |
| `p1c-confidence-reproducibility.spec.js` | 6 | **(P1-C)** The `inputSnapshot.hasInventoryRecord` field: presence/absence, independent Confidence-label reconstruction, historical immutability, fingerprint sensitivity. |
| `p1a-auditor-access.spec.js` | 16 | **(P1-A)** The `audit_access` capability (`myAuditAccess`/`hasAuditAccess()`): audit-only evidence access, operational denial (engine/quantities/tunables/historical lock), VIEW/INPUT/ADMIN regression, the schema-impossible `audit_access=true`+`permission=null` edge case, historical evidence immutability. |
| `run-all.js` | — | Orchestrates all eight suites above, writes `results/run-<timestamp>.json` and `results/latest.json`. |
| `results/` | — | Generated JSON reports (traceability + coverage-by-category). Not hand-edited. |
| `TRACEABILITY.md` | — | Test ID → scenario → business rule → control-matrix mapping. |
| `RECOVERY.md` | — | Honest accounting of recovered vs. newly-authored test code (P0-A). |
| `AUDIT_EVIDENCE_EXAMPLE.md` | — | **(P0-B)** A concrete, real example of the Decision Evidence tree structure and an override event. |

None of this is loaded by the application at runtime — it is test-only, run from a separate
Node/Playwright process against the static HTML file via `file://`.

## Prerequisites

- Node.js with Playwright's `chromium` package resolvable. In this environment that means
  running with `NODE_PATH=/opt/node22/lib/node_modules` and Chromium already installed at
  `/opt/pw-browsers/chromium` (both are set up in this sandbox already — nothing to install).
- No `npm install` step and no `package.json` in this directory — the suites `require('playwright')`
  directly via `NODE_PATH`, matching how the original scratch-directory scripts were always run.

## Running the suites

Run everything (this is the gate to run before merging any change to the production HTML file):

```bash
cd tests/procurement-intelligence
NODE_PATH=/opt/node22/lib/node_modules node run-all.js
```

Run a subset of suites by key (`bl`, `e2e`, `golden`, `dv`, `det`, `de`, `p1c`, `p1a`):

```bash
NODE_PATH=/opt/node22/lib/node_modules node run-all.js bl,golden
```

Run one suite directly (each file is also independently executable and exits non-zero on any
failure or console/page error):

```bash
NODE_PATH=/opt/node22/lib/node_modules node business-logic.spec.js       # all 12 sub-suites
NODE_PATH=/opt/node22/lib/node_modules node business-logic.spec.js 1,3   # only sub-suites 1 and 3
NODE_PATH=/opt/node22/lib/node_modules node e2e.spec.js
NODE_PATH=/opt/node22/lib/node_modules node golden-dataset.spec.js
NODE_PATH=/opt/node22/lib/node_modules node data-validation.spec.js
NODE_PATH=/opt/node22/lib/node_modules node determinism.spec.js
NODE_PATH=/opt/node22/lib/node_modules node decision-evidence.spec.js    # P0-B
NODE_PATH=/opt/node22/lib/node_modules node p1c-confidence-reproducibility.spec.js  # P1-C
NODE_PATH=/opt/node22/lib/node_modules node p1a-auditor-access.spec.js              # P1-A
```

A full `run-all.js` pass currently takes well under a minute (business-logic and e2e each launch
one browser context per sub-flow; golden-dataset and data-validation launch one per scenario for
full isolation; determinism launches two).

## Reading the results

`run-all.js` prints a live PASS/FAIL line per check as it runs, a coverage table by category
(Functional / Decision / Edge / Data-Quality / Regression — see TRACEABILITY.md for what each
category means and why it's tracked separately from code-line coverage), and an overall summary.
It also writes `results/latest.json` — the authoritative, machine-readable record of every
individual check's ID, name, category, pass/fail state and diagnostic info from the most recent
run. Diff two timestamped `results/run-*.json` files to see exactly what changed between runs.

Exit code is `0` only if every check across every suite passed **and** no suite observed a
browser console or page error. A non-zero exit means something regressed — read the "FAILED
CHECKS" section of the output (or `results/latest.json`) for the exact test ID and diagnostic info.

## Rules for maintaining this suite

- **Golden result protection**: if `golden-dataset.spec.js`, `business-logic.spec.js` or
  `e2e.spec.js` starts failing after a change to the production file, that is the suite doing its
  job. Never edit an `expected` value (or a golden-dataset fixture's numbers) to make a failure go
  away without first confirming, with the same hand-derivation discipline used to write it, that
  the *new* engine output is the *correct* one. If it's not correct, fix the engine, not the test.
  If it is correct, update the fixture's `math` comment alongside the `expected` value in the same
  commit, so the citation and the number never drift apart.
- **Controlled data only**: everything under `fixtures/` and every inline TSV fixture in the
  suites here is synthetic test data (item codes `GD01`..`GD20`, `DT01`..`DT05`, `DV01`..`DV13`,
  etc.). Never replace it with real customer/supplier/transaction data from مركز الكيلاني للأغذية.
- **Isolation**: each business-logic sub-suite, each golden-dataset scenario and each
  data-validation case runs in its own fresh browser context with an empty IndexedDB (via
  `harness.js`'s `freshPage()`/`authPage()`). Don't share state across cases by reusing item codes,
  DocEntry numbers or supplier codes between fixtures that are meant to run independently — see
  `determinism.spec.js`'s header comment for a concrete example of why that broke once already
  (merging golden-dataset scenarios into a shared fixture collided on reused DocEntry/supplier
  codes that were only ever meant to be unique within their own isolated scenario).
- **No production changes from this directory**: nothing here should ever need to modify
  `المشتريات_الخارجية_الذكية.html`. If a test genuinely requires a production code change to be
  written correctly, that's a signal to stop and get explicit authorization for that change
  first — the same rule the P0-A phase that created this suite operated under.
