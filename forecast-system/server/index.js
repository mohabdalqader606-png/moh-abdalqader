require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const migrate = require('../db/migrate');
const seedAdmin = require('../db/seedAdmin');
const { scanAndImportAll } = require('./importer');
const { recomputeAll } = require('./recompute');

const authRoutes = require('./routes/auth');
const actionCenterRoutes = require('./routes/actionCenter');
const drillRoutes = require('./routes/drill');
const trendsRoutes = require('./routes/trends');
const stockRoutes = require('./routes/stock');
const accuracyRoutes = require('./routes/accuracy');
const settingsRoutes = require('./routes/settingsRoutes');
const usersRoutes = require('./routes/users');
const syncRoutes = require('./routes/sync');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/action-center', actionCenterRoutes);
app.use('/api/drill', drillRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/accuracy', accuracyRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sync', syncRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'غير موجود' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'خطأ داخلي في السيرفر' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await migrate();
  await seedAdmin();
  try {
    const importResult = await scanAndImportAll();
    const totalAdded = [...importResult.withdrawals, ...importResult.stock, ...importResult.quotes, ...importResult.reserved].reduce((s, r) => s + (r.added || 0), 0);
    console.log(`[startup import] ${totalAdded} سطر جديد من ملفات data/incoming`);
  } catch (e) {
    console.error('[startup import] فشل الاستيراد التلقائي:', e.message);
  }
  await recomputeAll();
  app.listen(PORT, () => console.log(`[server] يعمل على المنفذ ${PORT}`));
}

start().catch((e) => { console.error('فشل بدء التشغيل:', e); process.exit(1); });
