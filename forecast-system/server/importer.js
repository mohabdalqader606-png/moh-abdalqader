const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db/pool');

const WD_DIR = path.join(__dirname, '..', 'data', 'incoming', 'withdrawals');
const STOCK_DIR = path.join(__dirname, '..', 'data', 'incoming', 'stock');
const QUOTES_DIR = path.join(__dirname, '..', 'data', 'incoming', 'quotes');
const RESERVED_DIR = path.join(__dirname, '..', 'data', 'incoming', 'reserved');

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
  // ملاحظة: تعمّدنا عدم استخدام new Date(v) كحل احتياطي أخير — مفسّر التواريخ بالـ JS
  // متساهل بشكل خطير (مثلاً new Date("صنف 0") بيرجع تاريخ صحيح!) وبيقبل نصوص مش تواريخ أصلاً.
  // لو ما طابق أي نمط معروف أعلاه، الأصح نرفضه صراحة بدل ما نخمّن تاريخ غلط بصمت.
  return null;
}

function splitLine(line) { return line.includes('\t') ? line.split('\t') : line.split(','); }

// SAP B1 Query Generator بيضيف أحياناً عمود ترقيم صفوف "#" بأول كل سطر عند النسخ من الشبكة،
// فبيزيح كل الأعمدة خانة وحدة لليمين. نكتشف هذا تلقائياً بدل ما نطلب من المستخدم يشيله يدوياً كل مرة.
function detectOffset(cols, dateIdx) {
  if (parseDate(cols[dateIdx])) return 0;
  if (parseDate(cols[dateIdx + 1])) return 1;
  return 0;
}

function parseWithdrawalText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  const reasons = {};
  let bad = 0;
  if (!lines.length) return { out, bad, reasons };
  let start = 0;
  const c0 = splitLine(lines[0]);
  const qtyTest = c0[6];
  const dateTest = parseDate(c0[4]);
  if ((qtyTest != null && isNaN(parseFloat(qtyTest))) || !dateTest) start = 1;
  if (start >= lines.length) return { out, bad, reasons };
  const off = detectOffset(splitLine(lines[start]), 4);
  const addBad = (reason) => { bad++; reasons[reason] = (reasons[reason] || 0) + 1; };
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    if (c.length < 7 + off) { addBad(`عدد أعمدة غير كافٍ (${c.length} من ${7 + off} مطلوبة)`); continue; }
    const custCode = (c[0 + off] || '').trim(), custName = (c[1 + off] || '').trim(), itemCode = (c[2 + off] || '').trim(), itemName = (c[3 + off] || '').trim();
    const wdDateRaw = c[4 + off], qtyRaw = c[6 + off];
    const wdDate = parseDate(wdDateRaw);
    const qty = parseFloat(qtyRaw);
    const uom = (c[7 + off] || '').trim();
    const rep = (c[8 + off] || '').trim();
    const custCategory = (c[9 + off] || '').trim();
    const itemCategory = (c[10 + off] || '').trim();
    if (!custCode) { addBad('كود العميل فاضي'); continue; }
    if (!itemCode) { addBad('كود الصنف فاضي'); continue; }
    if (!wdDate) { addBad(`تاريخ غير مفهوم: "${wdDateRaw}"`); continue; }
    if (isNaN(qty)) { addBad(`كمية غير صالحة: "${qtyRaw}"`); continue; }
    out.push({ custCode, custName, itemCode, itemName, wdDate, qty, uom, rep, custCategory, itemCategory });
  }
  return { out, bad, reasons };
}

function parseStockText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  if (!lines.length) return out;
  let start = 0;
  const c0 = splitLine(lines[0]);
  if (c0[3] != null && isNaN(parseFloat(c0[3]))) start = 1;
  if (start >= lines.length) return out;
  const off = detectOffset(splitLine(lines[start]), 3);
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    if (c.length < 4 + off) continue;
    const custCode = (c[0 + off] || '').trim(), itemCode = (c[1 + off] || '').trim();
    if (!custCode || !itemCode) continue;
    const type = (c[2 + off] || '').trim().toLowerCase().includes('open') ? 'opening' : 'delivery';
    const date = parseDate(c[3 + off]);
    const qty = parseFloat(c[4 + off]);
    if (!date || isNaN(qty)) continue;
    out.push({ custCode, itemCode, type, date, qty });
  }
  return out;
}

function parseQuotesText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  if (!lines.length) return out;
  let start = 0;
  const c0 = splitLine(lines[0]);
  if (c0[5] != null && isNaN(parseFloat(c0[5]))) start = 1;
  if (start >= lines.length) return out;
  const off = detectOffset(splitLine(lines[start]), 4);
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    if (c.length < 6 + off) continue;
    const custCode = (c[0 + off] || '').trim(), custName = (c[1 + off] || '').trim(), itemCode = (c[2 + off] || '').trim(), itemName = (c[3 + off] || '').trim();
    const quoteDate = parseDate(c[4 + off]);
    const qty = parseFloat(c[5 + off]);
    const openQty = parseFloat(c[6 + off]);
    const rep = (c[7 + off] || '').trim();
    if (!custCode || !itemCode || !quoteDate) continue;
    out.push({ custCode, custName, itemCode, itemName, quoteDate, qty: isNaN(qty) ? 0 : qty, openQty: isNaN(openQty) ? null : openQty, rep });
  }
  return out;
}

function parseReservedText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  if (!lines.length) return out;
  let start = 0;
  const c0 = splitLine(lines[0]);
  if (c0[10] != null && isNaN(parseFloat(c0[10]))) start = 1;
  if (start >= lines.length) return out;
  const off = detectOffset(splitLine(lines[start]), 1);
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    if (c.length < 11 + off) continue;
    const docNum = (c[0 + off] || '').trim();
    const invoiceDate = parseDate(c[1 + off]);
    const custCode = (c[2 + off] || '').trim(), custName = (c[3 + off] || '').trim(), itemCode = (c[4 + off] || '').trim(), itemName = (c[5 + off] || '').trim();
    const undeliveredQty = parseFloat(c[10 + off]);
    if (!custCode || !itemCode || !invoiceDate || isNaN(undeliveredQty) || undeliveredQty <= 0) continue;
    out.push({ docNum, invoiceDate, custCode, custName, itemCode, itemName, undeliveredQty });
  }
  return out;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(csv|txt|tsv)$/i.test(f)).map((f) => path.join(dir, f));
}

function fileHash(content) { return crypto.createHash('sha256').update(content).digest('hex'); }

// إدخال دفعي (Batch INSERT) بدل سطر-سطر — لتفادي مئات آلاف رحلات الشبكة المنفصلة لقاعدة البيانات
const BATCH_SIZE = 500;
async function batchInsert(client, sql, rowsToParams, rows) {
  let added = 0, dup = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const params = [];
    const valuesSql = chunk.map((r, idx) => {
      const p = rowsToParams(r);
      const placeholders = p.map((_, j) => `$${params.length + j + 1}`).join(',');
      params.push(...p);
      return `(${placeholders})`;
    }).join(',');
    const res = await client.query(sql(valuesSql), params);
    added += res.rowCount;
    dup += chunk.length - res.rowCount;
  }
  return { added, dup };
}

async function importWithdrawalFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = fileHash(content);
  const filename = path.basename(filePath);
  const already = await pool.query('SELECT 1 FROM imported_files WHERE file_hash=$1', [hash]);
  if (already.rows.length) return { filename, skipped: true, added: 0, dup: 0, bad: 0 };

  const { out, bad, reasons } = parseWithdrawalText(content);
  const client = await pool.connect();
  let added = 0, dup = 0;
  try {
    const result = await batchInsert(
      client,
      (values) => `INSERT INTO withdrawals(cust_code,cust_name,item_code,item_name,wd_date,qty,uom,rep,cust_category,item_category,source_file)
        VALUES ${values} ON CONFLICT (cust_code,item_code,wd_date,qty,uom) DO NOTHING`,
      (r) => [r.custCode, r.custName, r.itemCode, r.itemName, r.wdDate, r.qty, r.uom, r.rep, r.custCategory, r.itemCategory, filename],
      out
    );
    added = result.added; dup = result.dup;
    await client.query(
      'INSERT INTO imported_files(filename,file_hash,file_kind,rows_added,rows_dup,rows_bad) VALUES ($1,$2,$3,$4,$5,$6)',
      [filename, hash, 'withdrawals', added, dup, bad]
    );
  } finally {
    client.release();
  }
  return { filename, skipped: false, added, dup, bad, reasons };
}

async function importStockFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = fileHash(content);
  const filename = path.basename(filePath);
  const already = await pool.query('SELECT 1 FROM imported_files WHERE file_hash=$1', [hash]);
  if (already.rows.length) return { filename, skipped: true, added: 0 };

  const out = parseStockText(content);
  const client = await pool.connect();
  try {
    for (const r of out) {
      await client.query(
        'INSERT INTO stock_feed(cust_code,item_code,event_type,event_date,qty,source_file) VALUES ($1,$2,$3,$4,$5,$6)',
        [r.custCode, r.itemCode, r.type, r.date, r.qty, filename]
      );
    }
    await client.query(
      'INSERT INTO imported_files(filename,file_hash,file_kind,rows_added,rows_dup,rows_bad) VALUES ($1,$2,$3,$4,0,0)',
      [filename, hash, 'stock', out.length]
    );
  } finally {
    client.release();
  }
  return { filename, skipped: false, added: out.length };
}

async function importQuotesFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = fileHash(content);
  const filename = path.basename(filePath);
  const already = await pool.query('SELECT 1 FROM imported_files WHERE file_hash=$1', [hash]);
  if (already.rows.length) return { filename, skipped: true, added: 0 };

  const out = parseQuotesText(content);
  const client = await pool.connect();
  try {
    const result = await batchInsert(
      client,
      (values) => `INSERT INTO quotes(cust_code,cust_name,item_code,item_name,quote_date,qty,open_qty,rep,source_file) VALUES ${values}`,
      (r) => [r.custCode, r.custName, r.itemCode, r.itemName, r.quoteDate, r.qty, r.openQty, r.rep, filename],
      out
    );
    await client.query(
      'INSERT INTO imported_files(filename,file_hash,file_kind,rows_added,rows_dup,rows_bad) VALUES ($1,$2,$3,$4,0,0)',
      [filename, hash, 'quotes', result.added]
    );
    return { filename, skipped: false, added: result.added };
  } finally {
    client.release();
  }
}

async function importReservedFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = fileHash(content);
  const filename = path.basename(filePath);
  const already = await pool.query('SELECT 1 FROM imported_files WHERE file_hash=$1', [hash]);
  if (already.rows.length) return { filename, skipped: true, added: 0 };

  const out = parseReservedText(content);
  const client = await pool.connect();
  try {
    const result = await batchInsert(
      client,
      (values) => `INSERT INTO reserved_invoices(doc_num,invoice_date,cust_code,cust_name,item_code,item_name,undelivered_qty,source_file) VALUES ${values}`,
      (r) => [r.docNum, r.invoiceDate, r.custCode, r.custName, r.itemCode, r.itemName, r.undeliveredQty, filename],
      out
    );
    await client.query(
      'INSERT INTO imported_files(filename,file_hash,file_kind,rows_added,rows_dup,rows_bad) VALUES ($1,$2,$3,$4,0,0)',
      [filename, hash, 'reserved', result.added]
    );
    return { filename, skipped: false, added: result.added };
  } finally {
    client.release();
  }
}

async function scanAndImportAll() {
  const results = { withdrawals: [], stock: [], quotes: [], reserved: [] };
  for (const f of listFiles(WD_DIR)) results.withdrawals.push(await importWithdrawalFile(f));
  for (const f of listFiles(STOCK_DIR)) results.stock.push(await importStockFile(f));
  for (const f of listFiles(QUOTES_DIR)) results.quotes.push(await importQuotesFile(f));
  for (const f of listFiles(RESERVED_DIR)) results.reserved.push(await importReservedFile(f));
  return results;
}

module.exports = {
  scanAndImportAll, parseDate, parseWithdrawalText, parseStockText, parseQuotesText, parseReservedText,
  WD_DIR, STOCK_DIR, QUOTES_DIR, RESERVED_DIR,
};
