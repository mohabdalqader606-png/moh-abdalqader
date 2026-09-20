/* Orchestrator — runs every committed suite for the Foreign Procurement Intelligence screen
   (business-logic, e2e, golden-dataset, data-validation, determinism, decision-evidence,
   p1c-confidence-reproducibility, p1a-auditor-access, p1b-override-reason) and writes a
   traceability + coverage report to results/. This is the single command a human or a CI gate
   runs before merging any change to المشتريات_الخارجية_الذكية.html.

   Coverage here means TEST coverage by category (Functional/Decision/Edge/Data-Quality/
   Regression/Auditability) — how many documented business rules, decisions and edge cases are
   exercised — not code-line coverage. A file can have 100% code coverage and still ship a wrong
   formula; this report tracks whether the DECISIONS are tested, per TRACEABILITY.md.

   Usage: node run-all.js            → runs everything, writes results/run-<timestamp>.json
          node run-all.js bl,e2e      → runs only the named suites (bl,e2e,golden,dv,det,de,p1c,p1a,p1b) */
'use strict';
const fs = require('fs');
const path = require('path');

const SUITES = [
  { key: 'bl', label: 'business-logic', file: './business-logic.spec.js' },
  { key: 'e2e', label: 'e2e', file: './e2e.spec.js' },
  { key: 'golden', label: 'golden-dataset', file: './golden-dataset.spec.js' },
  { key: 'dv', label: 'data-validation', file: './data-validation.spec.js' },
  { key: 'det', label: 'determinism', file: './determinism.spec.js' },
  { key: 'de', label: 'decision-evidence', file: './decision-evidence.spec.js' },
  { key: 'p1c', label: 'p1c-confidence-reproducibility', file: './p1c-confidence-reproducibility.spec.js' },
  { key: 'p1a', label: 'p1a-auditor-access', file: './p1a-auditor-access.spec.js' },
  { key: 'p1b', label: 'p1b-override-reason', file: './p1b-override-reason.spec.js' },
];

/** Maps a suite's own category (business-logic.spec.js already tags each check via SUITE_META)
    or a test-ID prefix (the other suites don't carry a category field, only id/name/ok/info) to
    the 6-bucket coverage taxonomy used in this report and in TRACEABILITY.md. */
function categoryOf(suiteKey, result) {
  if (result.category) {
    return { 'business-rule': 'Decision', integration: 'Functional', unit: 'Functional', regression: 'Regression', 'data-validation': 'Data-Quality' }[result.category] || 'Functional';
  }
  if (suiteKey === 'e2e') return 'Functional';
  if (suiteKey === 'golden') return 'Decision';
  if (suiteKey === 'det') return 'Regression';
  if (suiteKey === 'de' || suiteKey === 'p1c' || suiteKey === 'p1a' || suiteKey === 'p1b') return 'Auditability';
  if (suiteKey === 'dv') return (result.id === 'DV-10' || result.id === 'DV-12') ? 'Edge' : 'Data-Quality';
  return 'Functional';
}

function pickSuites(argv) {
  const only = (argv[2] || '').split(',').filter(Boolean);
  if (!only.length) return SUITES;
  return SUITES.filter(s => only.includes(s.key));
}

async function main() {
  const chosen = pickSuites(process.argv);
  const startedAt = new Date();
  const suiteReports = [];
  let anyFailed = false;

  for (const s of chosen) {
    console.log('\n' + '='.repeat(70));
    console.log('RUNNING: ' + s.label);
    console.log('='.repeat(70));
    const mod = require(s.file);
    const t0 = Date.now();
    let outcome;
    try {
      outcome = await mod.main();
    } catch (e) {
      console.error('FATAL in ' + s.label + ':', e);
      outcome = { results: [], errors: ['FATAL: ' + (e && e.stack || e)] };
    }
    const ms = Date.now() - t0;
    const results = outcome.results || [];
    const errors = outcome.errors || [];
    const failed = results.filter(r => !r.ok);
    const suiteFailed = failed.length > 0 || errors.length > 0;
    if (suiteFailed) anyFailed = true;
    suiteReports.push({ key: s.key, label: s.label, ms, total: results.length, passed: results.length - failed.length, failed: failed.length, consoleErrors: errors.length, results, errors });
    console.log(`\n[${s.label}] ${results.length - failed.length}/${results.length} passed, ${errors.length} console/page error(s), ${ms}ms`);
  }

  /* ---- traceability: every test ID -> category, flattened across suites ---- */
  const traceability = [];
  suiteReports.forEach(sr => {
    sr.results.forEach(r => {
      traceability.push({ suite: sr.label, id: r.id, name: r.name, category: categoryOf(sr.key, r), ok: r.ok, info: r.info });
    });
  });

  /* ---- coverage by category (test counts, not code lines) ---- */
  const coverage = {};
  traceability.forEach(t => {
    coverage[t.category] = coverage[t.category] || { total: 0, passed: 0 };
    coverage[t.category].total++;
    if (t.ok) coverage[t.category].passed++;
  });

  const totals = suiteReports.reduce((acc, sr) => ({ total: acc.total + sr.total, passed: acc.passed + sr.passed, failed: acc.failed + sr.failed, consoleErrors: acc.consoleErrors + sr.consoleErrors }), { total: 0, passed: 0, failed: 0, consoleErrors: 0 });

  console.log('\n' + '='.repeat(70));
  console.log('COVERAGE BY CATEGORY (test count, not code-line coverage)');
  console.log('='.repeat(70));
  Object.keys(coverage).sort().forEach(cat => {
    const c = coverage[cat];
    console.log(`  ${cat.padEnd(14)} ${String(c.passed).padStart(3)}/${String(c.total).padEnd(3)} passed`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('OVERALL: ' + totals.passed + '/' + totals.total + ' passed | ' + totals.failed + ' failed | ' + totals.consoleErrors + ' console/page errors');
  console.log('='.repeat(70));

  if (totals.failed > 0) {
    console.log('\nFAILED CHECKS:');
    traceability.filter(t => !t.ok).forEach(t => console.log(`  [${t.suite}] ${t.id} — ${t.name}  ${t.info ? '[' + t.info + ']' : ''}`));
  }

  const report = {
    generatedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    suites: suiteReports.map(sr => ({ key: sr.key, label: sr.label, ms: sr.ms, total: sr.total, passed: sr.passed, failed: sr.failed, consoleErrors: sr.consoleErrors })),
    coverage,
    totals,
    traceability,
  };

  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(resultsDir, `run-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(resultsDir, 'latest.json'), JSON.stringify(report, null, 2));
  console.log('\nReport written: ' + outFile + '\n                 ' + path.join(resultsDir, 'latest.json'));

  process.exitCode = anyFailed ? 1 : 0;
}

main();
