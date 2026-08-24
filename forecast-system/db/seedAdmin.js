require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const migrate = require('./migrate');

async function seedAdmin() {
  await migrate();
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) {
    console.log('[seedAdmin] users already exist — skipping');
    return;
  }
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn('[seedAdmin] ADMIN_PASSWORD env var not set — using temporary password "changeme123". غيّرها فوراً بعد أول دخول.');
  }
  const hash = await bcrypt.hash(password || 'changeme123', 10);
  await pool.query(
    'INSERT INTO users(username,password_hash,role,rep_name) VALUES ($1,$2,$3,$4)',
    [username, hash, 'admin', null]
  );
  console.log(`[seedAdmin] created admin user "${username}"`);
}

module.exports = seedAdmin;

if (require.main === module) {
  seedAdmin().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
