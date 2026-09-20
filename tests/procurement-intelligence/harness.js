/* Shared Playwright harness — Foreign Procurement Intelligence screen.
   Test-only. Not loaded by the application, not referenced by any HTML, never read at runtime.
   Source under test: المشتريات_الخارجية_الذكية.html at repo root (path resolved relative to this file,
   so suites run correctly regardless of the invoking working directory). */
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const APP_FILE = path.join(__dirname, '..', '..', 'المشتريات_الخارجية_الذكية.html');
const APP_URL = 'file://' + APP_FILE;
const CHROMIUM_PATH = '/opt/pw-browsers/chromium';

function check(bucket, id, name, ok, info) {
  bucket.push({ id, name, ok: !!ok, info: info !== undefined ? (typeof info === 'string' ? info : JSON.stringify(info)) : undefined });
  console.log((ok ? '  PASS' : '  FAIL') + ' - ' + id + ' ' + name + (info !== undefined ? '  [' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 300) + ']' : ''));
}

async function launchBrowser() {
  return chromium.launch({ executablePath: CHROMIUM_PATH });
}

/* Standard mocked Supabase client — ADMIN permission, real session present at boot.
   No real network call is made (auth + procurement data are both fully client-side / IndexedDB). */
function mockSupabaseInitScript({ permission, autoSession, testUserId } = {}) {
  const perm = permission === undefined ? 'ADMIN' : permission;
  const auto = autoSession === undefined ? true : autoSession;
  const uid = testUserId || 'test-user-id';
  return ({ perm, auto, uid }) => {
    function chain(data) { const c = { eq() { return c; }, single: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }) }; return c; }
    window.supabase = {
      createClient() {
        return {
          auth: {
            signInWithPassword: async ({ email }) => ({ data: { user: { id: uid, email } }, error: null }),
            signOut: async () => {},
            getSession: async () => (auto ? { data: { session: { user: { id: uid, email: 'test@kaylani.local' } } } } : { data: { session: null } }),
            onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
            updateUser: async () => ({ data: { user: { id: uid, email: 'test@kaylani.local' } }, error: null }),
          },
          from(table) {
            return {
              select() {
                if (table === 'profiles') return chain({ full_name: 'Test ' + (perm || 'NONE'), role: 'user' });
                if (table === 'user_screen_permissions') return chain(perm ? { permission: perm } : null);
                return chain(null);
              },
            };
          },
        };
      },
    };
  };
}

/** Fresh browser context, empty IndexedDB, logged in with the given permission (default ADMIN).
    Exposes page.imp(sourceKey, tsvText) — the same mapRows→preview→commit path the real upload UI uses,
    driven directly (no file dialog) for speed; page.refresh() re-runs onDataChanged(); page.errors collects
    console/page errors observed during the test. */
async function freshPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints++; if (!window.__hold) setTimeout(() => window.dispatchEvent(new Event('afterprint')), 10); }; });
  await page.addInitScript(mockSupabaseInitScript(opts), { perm: opts.permission === undefined ? 'ADMIN' : opts.permission, auto: opts.autoSession === undefined ? true : opts.autoSession, uid: opts.testUserId || 'test-user-id' });
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed in test harness */' }));
  await page.goto(APP_URL);
  if (opts.autoSession === false) { page.errors = errors; return { ctx, page }; }
  await page.waitForFunction(() => window.APP_READY === true, null, { timeout: 15000 });
  page.imp = async (k, tsv) => page.evaluate(async ({ k, tsv }) => {
    const { mapped, errors, unmatched } = IMPORT.mapRows(k, tsv);
    if (unmatched.length) throw new Error('unmatched: ' + unmatched.map(c => c.key).join(','));
    const prev = await IMPORT.preview(k, mapped);
    let rows = mapped;
    if (prev.historicalLocked) { const src = DATA_SOURCES[k]; if (src.dateField) rows = mapped.filter(r => { const d = r[src.dateField]; return !(d instanceof Date) || !CONFIG.historicalYears.includes(d.getFullYear()); }); }
    const res = await IMPORT.commit(k, rows, { mode: 'incremental', errorCount: errors.length });
    return Object.assign(res, { rejected: errors.length, preview: prev, imported: rows.length });
  }, { k, tsv });
  page.refresh = async () => { await page.evaluate(() => onDataChanged()); };
  page.errors = errors;
  return { ctx, page };
}

/** Session-only login test harness (no pre-populated data, optional auto-session restore) —
    exact call shape: authPage(browser, permission, autoSession). permission=null exercises the
    "no permission row for this screen" denial path. autoSession=false exercises the real doLogin() form.
    Unlike freshPage, this does NOT wait for APP_READY: with permission=null, APP_READY never
    becomes true (the app denies access and shows a login message instead), so each suite-12
    scenario does its own waiting (on APP_READY when access is expected to succeed, or on the
    login/denial message when it is not). This matches the original scratchpad authPage exactly. */
async function authPage(browser, permission, autoSession) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.addInitScript(mockSupabaseInitScript({ permission, autoSession }), { perm: permission, auto: autoSession === undefined ? true : autoSession, uid: 'test-user-id' });
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed in test harness */' }));
  await page.goto(APP_URL);
  page.errors = errors;
  return { ctx, page };
}

const L = arr => arr.join('\n');
const near = (a, b, t) => Math.abs(a - b) <= (t || 0.01);

module.exports = { APP_FILE, APP_URL, CHROMIUM_PATH, check, launchBrowser, freshPage, authPage, L, near };
