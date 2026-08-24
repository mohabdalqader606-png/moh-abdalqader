CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','rep')),
  rep_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawals(
  id BIGSERIAL PRIMARY KEY,
  cust_code TEXT NOT NULL,
  cust_name TEXT,
  item_code TEXT NOT NULL,
  item_name TEXT,
  wd_date DATE NOT NULL,
  qty NUMERIC NOT NULL,
  uom TEXT,
  rep TEXT,
  cust_category TEXT,
  item_category TEXT,
  source_file TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cust_code,item_code,wd_date,qty,uom)
);
CREATE INDEX IF NOT EXISTS idx_wd_pair ON withdrawals(cust_code,item_code);
CREATE INDEX IF NOT EXISTS idx_wd_rep ON withdrawals(rep);
CREATE INDEX IF NOT EXISTS idx_wd_date ON withdrawals(wd_date);

CREATE TABLE IF NOT EXISTS stock_feed(
  id BIGSERIAL PRIMARY KEY,
  cust_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('opening','delivery')),
  event_date DATE NOT NULL,
  qty NUMERIC NOT NULL,
  source_file TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_pair ON stock_feed(cust_code,item_code);

CREATE TABLE IF NOT EXISTS holidays(
  hol_date DATE PRIMARY KEY,
  description TEXT
);

CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS forecasts(
  cust_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  cust_name TEXT, item_name TEXT, rep TEXT, cust_category TEXT, item_category TEXT, uom TEXT,
  n_obs INT, last_wd_date DATE,
  avg_interval NUMERIC, median_interval NUMERIC, cv_interval NUMERIC,
  avg_qty NUMERIC, median_qty NUMERIC, mad_qty NUMERIC,
  trend TEXT, rel_slope NUMERIC, dom_dow INT, dom_pct NUMERIC, seasonal_ok BOOLEAN,
  expected_date DATE, expected_qty NUMERIC, qty_low NUMERIC, qty_high NUMERIC,
  confidence INT, status TEXT,
  anomaly_dir TEXT, anomaly_z NUMERIC,
  days_since_last INT, overdue_wd INT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(cust_code,item_code)
);

CREATE TABLE IF NOT EXISTS accuracy_log(
  id BIGSERIAL PRIMARY KEY,
  cust_code TEXT, item_code TEXT, cust_name TEXT, item_name TEXT,
  predicted_date DATE, predicted_qty NUMERIC,
  actual_date DATE, actual_qty NUMERIC,
  err_days INT, err_qty_pct NUMERIC,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_log(
  id BIGSERIAL PRIMARY KEY,
  cust_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('contacted','snoozed','done')),
  note TEXT,
  snooze_until DATE,
  user_id INT REFERENCES users(id),
  at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_pair ON action_log(cust_code,item_code,alert_type);

CREATE TABLE IF NOT EXISTS imported_files(
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  file_hash TEXT UNIQUE NOT NULL,
  file_kind TEXT NOT NULL,
  rows_added INT NOT NULL DEFAULT 0,
  rows_dup INT NOT NULL DEFAULT 0,
  rows_bad INT NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
