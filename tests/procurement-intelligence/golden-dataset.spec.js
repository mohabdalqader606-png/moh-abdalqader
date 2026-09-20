/* Golden Dataset regression runner — executes each of the 20 controlled scenarios in
   fixtures/golden-dataset.js against the real engine (RECO.computeForItem / getSalesReport)
   through the shared harness, and asserts the HAND-DERIVED expected values documented in the
   fixture. This is the "golden result protection" gate: a scenario FAILS LOUDLY on any
   unexpected change to the engine's math — it never silently updates its own expectations.
   If a future change to the production file is intentional, the fixture's `math` field and
   `expected` values must be updated by a human as a deliberate, reviewed edit — never by this
   script, and never automatically. */
'use strict';
const { launchBrowser, freshPage, check: rawCheck, near } = require('./harness');
const fx = require('./fixtures/golden-dataset');

const R = [];
const errorsAll = [];
function check(id, name, ok, info) { rawCheck(R, id, name, ok, info); }

/** Builds GD-20 (dynamic — anchored to "today" at run time so a period-ending-mid-month
    scenario stays valid indefinitely instead of drifting stale like a hardcoded calendar date
    would). Mirrors GD-01..19's fixed-fixture style but computed once per run. */
function buildScenario20() {
  const { NOW, H, L, saleRow } = fx;
  const day = 13;
  const to = NOW.getDate() >= day ? new Date(NOW.getFullYear(), NOW.getMonth(), day) : new Date(NOW.getFullYear(), NOW.getMonth() - 1, day);
  const baseY = to.getFullYear(), baseM = to.getMonth();
  const rows = [H.salesInvoices]; let de = 1;
  for (let i = 8; i >= 1; i--) rows.push(saleRow(de++, new Date(baseY, baseM - i, 10), 'GD20', 100));
  rows.push(saleRow(de++, new Date(baseY, baseM, 8), 'GD20', 100));   // included (before cutoff)
  rows.push(saleRow(de++, new Date(baseY, baseM, 20), 'GD20', 999));  // excluded (after `to`=day 13)
  const from = new Date(baseY, baseM - 8, 1);
  const days = Math.round((to - from) / 86400000) + 1;
  const equivMonths = days / 30.4368;
  const totalQty = 8 * 100 + 100; // the excluded 999 is deliberately not counted
  return { tsv: L(rows), from, to, days, equivMonths, totalQty, expectedAvg: totalQty / equivMonths };
}

function isFinitePositive(n) { return typeof n === 'number' && Number.isFinite(n); }

async function runReco(browser, s) {
  const { ctx, page } = await freshPage(browser);
  for (const step of s.imports) await page.imp(step.source, step.tsv);
  await page.refresh();
  if (s.overrides) {
    for (const ov of s.overrides) await page.evaluate(({ key, patch }) => setDocOverride(key, patch), ov);
    await page.evaluate(() => { invalidateData(); STATE._recos = null; STATE._recosAll = null; });
  }
  const r = await page.evaluate((code) => {
    const x = RECO.computeForItem(code);
    return {
      status: x.status, stockStatus: x.stockStatus, monthlyDemand: x.monthlyDemand,
      coverageDays: x.coverageDays === Infinity ? null : x.coverageDays,
      neededQtyRaw: x.neededQtyRaw, recommendedQty: x.recommendedQty,
      leadTimeDays: x.leadTime.days, leadTimeSource: x.leadTime.source,
      supplierCode: x.supplier.code, incoming: x.incoming, unconfirmedIncoming: x.unconfirmedIncoming,
      demandRaw: x.demand.raw, demandAdjusted: x.demand.adjusted, demandSeriesLen: x.demand.series.length,
      demandConfidence: x.demand.confidence, demandExcludedCount: x.demand.excludedMonths.length,
    };
  }, s.itemCode);
  errorsAll.push(...page.errors);
  await ctx.close();
  return r;
}

function assertScenario(s, r) {
  const e = s.expected;
  const groups = [['intermediate', e.intermediate], ['final', e.final], ['decision', e.decision]];
  for (const [label, fields] of groups) {
    if (!fields) continue;
    for (const key of Object.keys(fields)) {
      const expVal = fields[key];
      if (key.endsWith('Near')) {
        const baseKey = key.slice(0, -4);
        const [target, tol] = expVal;
        check(`${s.id}.${label}.${baseKey}`, `${s.title} — ${baseKey}≈${target}`, near(r[baseKey], target, tol), `actual=${r[baseKey]}`);
      } else if (key === 'finiteCheck') {
        const nums = [r.neededQtyRaw, r.recommendedQty, r.coverageDays].filter(v => v !== null && v !== undefined);
        check(`${s.id}.${label}.finite`, `${s.title} — no NaN/Infinity in output`, nums.every(isFinitePositive) || nums.every(v => Number.isFinite(v)), JSON.stringify(nums));
      } else {
        check(`${s.id}.${label}.${key}`, `${s.title} — ${key}=${JSON.stringify(expVal)}`, r[key] === expVal, `actual=${JSON.stringify(r[key])}`);
      }
    }
  }
}

async function main() {
  const browser = await launchBrowser();
  for (const s of fx.SCENARIOS) {
    if (s.dynamic) continue; // GD-20 handled separately below (salesReport mode)
    console.log('\n[' + s.id + '] ' + s.title);
    const r = await runReco(browser, s);
    assertScenario(s, r);
  }

  /* GD-20 — separate code path (buildSalesReport / getSalesReport), not RECO.computeForItem */
  const gd20 = fx.SCENARIOS.find(s => s.id === 'GD-20');
  console.log('\n[' + gd20.id + '] ' + gd20.title);
  const built = buildScenario20();
  const { ctx, page } = await freshPage(browser);
  await page.imp('salesInvoices', built.tsv);
  await page.refresh();
  await page.evaluate(({ from, to }) => { STATE.filters.dateFrom = from; STATE.filters.dateTo = to; refreshComputed(); }, { from: fx.fmt(built.from), to: fx.fmt(built.to) });
  const rep = await page.evaluate(() => { const r = getSalesReport(); const row = r.rows.find(x => x.ItemCode === 'GD20'); return { days: r.days, equivMonths: r.equivMonths, totalQty: row ? row.totalQty : 0, rawAvgQty: row ? row.rawAvgQty : 0 }; });
  errorsAll.push(...page.errors);
  await ctx.close();
  check('GD-20.intermediate.days', gd20.title + ' — days=' + built.days + ' (independently computed from the same dateFrom/dateTo)', rep.days === built.days, `actual=${rep.days}`);
  check('GD-20.intermediate.equivMonths', gd20.title + ' — equivMonths≈' + built.equivMonths.toFixed(4), near(rep.equivMonths, built.equivMonths, 0.01), `actual=${rep.equivMonths}`);
  check('GD-20.final.totalQty', gd20.title + ' — totalQty=' + built.totalQty + ' (day-20 sale after cutoff excluded)', rep.totalQty === built.totalQty, `actual=${rep.totalQty}`);
  check('GD-20.decision.rawAvgQty', gd20.title + ' — rawAvgQty = totalQty/equivMonths (days, not whole months)', near(rep.rawAvgQty, built.expectedAvg, 0.5), `expected≈${built.expectedAvg.toFixed(2)} actual=${rep.rawAvgQty}`);

  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== GOLDEN DATASET SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  }).catch(e => { console.error('FATAL', e); process.exit(2); });
} else {
  module.exports = { main };
}
