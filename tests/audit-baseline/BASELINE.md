# Audit screen — regression baseline (P0)

Test-only artifacts. Not loaded by the application, not referenced by any HTML, never read at runtime.

- Source: `شاشة_التدقيق_الداخلي_الإداري.html` at `origin/main` 34ac307 (blob 07fd1716, sha256 2c1157ef…)
- Fixed clock used by the harness: 2026-09-04T09:00 (todayStr() = 2026-09-04)
- `harness.js` — Playwright harness. MODE=baseline snapshots; MODE=compare diffs a build against this folder.
- `baseline_export.json` — Production-format backup produced by the app's own exportBtn after importing the reference dataset.
- `baseline_calc.json` — computeDashboardStats / computeHealthScore / residualRisk / authorityConflict / emailIsOverdue / detectRepeatFindings outputs.
- `baseline_thresholds.json` — performance regression thresholds (defined at P0).
- `baseline_result.json` — all P0 checks, overflow matrix (390:authority is pre-existing), dialog a11y state, print text hashes.
- `baseline_print_*.html` — the two popup print templates as rendered.

Run (from repo root, ephemeral browser profile, never touches user data):

    MODE=compare TAG=p1 BASE=tests/audit-baseline OUT=/tmp/audit-out TARGET="$PWD/شاشة_التدقيق_الداخلي_الإداري.html" node tests/audit-baseline/harness.js

## Performance observations — closed at P8 (evidence session 2026-09-04, fresh sandbox, builds P4 0f17443 / P6 87a4ef4 / P7 fde537e)

Methodology: P4/P6/P7 measured in the same session, interleaved P4→P6→P7 per round; T1 = 7 fresh contexts per build (cold first dashboard switch, harness definition); T2/T3/T4 = 15 rounds per build in one context, first 3 rounds discarded as warm-up, 12 measured; samples > 500 ms counted as stalls and excluded (0 stalls occurred); median is the decision statistic; T6 = P4 calibration at session start and end; T7 = the unchanged compare harness, one run per build. Raw samples: P8 evidence report (session log).

| Observation | Threshold | Test | P4 median (p95) | P6 median (p95) | P7 median (p95) | Official harness (T7) | Classification |
|---|---|---|---|---|---|---|---|
| Dashboard switch | 122 ms (single sample) | T1 cold | 124 (133) | 119 (126) | 122 (134) | P4 137 FAIL · P6 120 PASS · P7 124 FAIL | Closed — environment variance (P8 evidence). Dashboard code byte-identical since P4; P7 ≤ P4 in every statistic; the approved P4 build fails the same single-sample check in the same session. The threshold equals the P4 dashboard's own cold cost (~120 ms median), so single samples straddle it by ±10 ms noise. |
| Dashboard switch | — | T2 warm | 80 (128) | 80 (144) | 80 (143) | — | Non-regression (identical medians). |
| Large-dataset findings | 250 ms | T3 harness definition (dashboard + findings) | 133 (152) | 153 (170) | 149 (250) | P4 153 · P6 191 · P7 203, all PASS | Closed — environment variance (P8 evidence) for the 258 ms seen at G7; P7 ≤ P6. P6/P7 vs P4 (+12%) is the approved P5 findings redesign, inside the threshold. |
| Large-dataset findings | — | T4 isolated findings render | 36 (41) | 50 (55) | 49 (53) | — | Non-regression: P7 = P6 within 2%. |

T6 calibration (P4, harness-style, 3 samples each): start — load 419/138/140 ms, cold dashboard 213/121/125 ms, large findings 207/170/100 ms; end — load 139/117/152 ms, cold dashboard 129/173/168 ms, large findings 106/124/124 ms. Reference load medians in T1: P4 118, P6 115, P7 119 ms (threshold 400).

Thresholds and harness unchanged. No production code changed at P8.
