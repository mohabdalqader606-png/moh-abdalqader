const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id,username,role,rep_name,active,created_at FROM users ORDER BY id');
  res.json(rows);
});

router.get('/reps', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT DISTINCT rep FROM withdrawals WHERE rep <> '' ORDER BY rep");
  res.json(rows.map((r) => r.rep));
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, role, repName } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: 'بيانات ناقصة' });
  if (!['admin', 'rep'].includes(role)) return res.status(400).json({ error: 'صلاحية غير صحيحة' });
  if (role === 'rep' && !repName) return res.status(400).json({ error: 'اسم المندوب مطلوب لحساب من نوع مندوب' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users(username,password_hash,role,rep_name) VALUES ($1,$2,$3,$4) RETURNING id,username,role,rep_name,active,created_at',
      [username, hash, role, role === 'rep' ? repName : null]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    throw e;
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { active, password, repName, role } = req.body || {};
  const sets = [], params = [];
  if (active !== undefined) { params.push(active); sets.push(`active=$${params.length}`); }
  if (repName !== undefined) { params.push(repName); sets.push(`rep_name=$${params.length}`); }
  if (role !== undefined) { params.push(role); sets.push(`role=$${params.length}`); }
  if (password) { params.push(await bcrypt.hash(password, 10)); sets.push(`password_hash=$${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'لا يوجد تعديل' });
  params.push(req.params.id);
  await pool.query(`UPDATE users SET ${sets.join(',')} WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

module.exports = router;
