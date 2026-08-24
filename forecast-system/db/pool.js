const { Pool, types } = require('pg');

// أرجع أعمدة DATE كنص 'YYYY-MM-DD' بدل Date object لتفادي مشاكل المنطقة الزمنية
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false),
});

module.exports = pool;
