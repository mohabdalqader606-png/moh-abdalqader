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
