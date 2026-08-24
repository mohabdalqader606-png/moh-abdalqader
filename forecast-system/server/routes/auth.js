const express = require('express');
const { login, signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });
  const user = await login(username, password);
  if (!user) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ username: user.username, role: user.role, repName: user.rep_name });
});

router.post('/logout', (req, res) => { clearAuthCookie(res); res.json({ ok: true }); });

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, repName: req.user.repName });
});

module.exports = router;
