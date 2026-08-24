const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db/pool');

const WD_DIR = path.join(__dirname, '..', 'data', 'incoming', 'withdrawals');
const STOCK_DIR = path.join(__dirname, '..', 'data', 'incoming', 'stock');

function p2(n) { return String(n).padStart(2, '0'); }

function parseDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + (+s) * 86400000);
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  }
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/))) {
    let d = +m[1], mo = +m[2], y = +m[3];
    if (d > 12 && mo <= 12) { /* DD/MM */ } else if (mo > 12 && d <= 12) { [d, mo] = [mo, d]; }
    if (mo > 12 || d > 31) return null;
    return `${y}-${p2(mo)}-${p2(d)}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt)) return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
  return null;
}

function splitLine(line) { return line.includes('\t') ? line.split('\t') : line.split(','); }

function parseWithdrawalText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  let bad = 0;
  if (!lines.length) return { out, bad };
  let start = 0;
  const c0 = splitLine(lines[0]);
  const qtyTest = c0[6];
  const dateTest = parseDate(c0[4]);
  if ((qtyTest != null && isNaN(parseFloat(qtyTest))) || !dateTest) start = 1;
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    if (c.length < 7) continue;
    const custCode = (c[0] || '').trim(), custName = (c[1] || '').trim(), itemCode = (c[2] || '').trim(), itemName = (c[3] || '').trim();
    const wdDate = parseDate(c[4]);
    const qty = parseFloat(c[6]);
    const uom = (c[7] || '').trim();
    const rep = (c[8] || '').trim();
    const custCategory = (c[9] || '').trim();
    const itemCategory = (c[10] || '').trim();
    if (!custCode || !itemCode || !wdDate || isNaN(qty)) { bad++; continue; }
    out.push({ custCode, custName, itemCode, itemName, wdDate, qty, uom, rep, custCategory, itemCategory });
  }
  return { out, bad };
}

function parseStockText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  if (!lines.length) return out;
  let start = 0;
  const c0 = splitLine(lines[0]);
  if (c0[4] != null && isNaN(parseFloat(c0[4]))) start = 1;
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    if (c.length < 4) continue;
    const custCode = (c[0] || '').trim(), itemCode = (c[1] || '').trim();
    if (!custCode || !itemCode) continue;
    const type = (c[2] || '').trim().toLowerCase().includes('open') ? 'opening' : 'delivery';
    const date = parseDate(c[3]);
    const qty = parseFloat(c[4]);
    if (!date || isNaN(qty)) continue;
    out.push({ custCode, itemCode, type, date, qty });
  }
  return out;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(csv|txt|tsv)$/i.test(f)).map((f) => path.join(dir, f));
}

function fileHash(content) { return crypto.createHash('sha256').update(content).digest('hex'); }

async function importWithdrawalFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = fileHash(content);
  const filename = path.basename(filePath);
  const already = await pool.query('SELECT 1 FROM imported_files WHERE file_hash=$1', [hash]);
  if (already.rows.length) return { filename, skipped: true, added: 0, dup: 0, bad: 0 };

  const { out, bad } = parseWithdrawalText(content);
  let added = 0, dup = 0;
  for (const r of out) {
    const res = await pool.query(
      `INSERT INTO withdrawals(cust_code,cust_name,item_code,item_name,wd_date,qty,uom,rep,cust_category,item_category,source_file)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (cust_code,item_code,wd_date,qty,uom) DO NOTHING`,
      [r.custCode, r.custName, r.itemCode, r.itemName, r.wdDate, r.qty, r.uom, r.rep, r.custCategory, r.itemCategory, filename]
    );
    if (res.rowCount) added++; else dup++;
  }
  await pool.query(
    'INSERT INTO imported_files(filename,file_hash,file_kind,rows_added,rows_dup,rows_bad) VALUES ($1,$2,$3,$4,$5,$6)',
    [filename, hash, 'withdrawals', added, dup, bad]
  );
  return { filename, skipped: false, added, dup, bad };
}

async function importStockFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = fileHash(content);
  const filename = path.basename(filePath);
  const already = await pool.query('SELECT 1 FROM imported_files WHERE file_hash=$1', [hash]);
  if (already.rows.length) return { filename, skipped: true, added: 0 };

  const out = parseStockText(content);
  for (const r of out) {
    await pool.query(
      'INSERT INTO stock_feed(cust_code,item_code,event_type,event_date,qty,source_file) VALUES ($1,$2,$3,$4,$5,$6)',
      [r.custCode, r.itemCode, r.type, r.date, r.qty, filename]
    );
  }
  await pool.query(
    'INSERT INTO imported_files(filename,file_hash,file_kind,rows_added,rows_dup,rows_bad) VALUES ($1,$2,$3,$4,0,0)',
    [filename, hash, 'stock', out.length]
  );
  return { filename, skipped: false, added: out.length };
}

async function scanAndImportAll() {
  const results = { withdrawals: [], stock: [] };
  for (const f of listFiles(WD_DIR)) results.withdrawals.push(await importWithdrawalFile(f));
  for (const f of listFiles(STOCK_DIR)) results.stock.push(await importStockFile(f));
  return results;
}

module.exports = { scanAndImportAll, parseDate, parseWithdrawalText, parseStockText, WD_DIR, STOCK_DIR };
