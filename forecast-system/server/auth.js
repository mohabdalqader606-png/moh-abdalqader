const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('JWT_SECRET غير مضبوط في متغيرات البيئة — مطلوب لتوقيع جلسات الدخول.');
}
const COOKIE_NAME = 'wd_token';

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role, repName: user.rep_name }, SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'غير مسجّل الدخول' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'هذا الإجراء يتطلب صلاحية Admin' });
  next();
}

async function login(username, password) {
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1 AND active=true', [username]);
  if (!rows.length) return null;
  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return user;
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, requireAuth, requireAdmin, login, COOKIE_NAME };
