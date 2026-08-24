const pool = require('../db/pool');
const { makeCalendar } = require('./workdays');

const DEFAULTS = {
  offDays: [5],
  grace: 0,
  graceMissedMult: 1.5,
  leadTimeDays: 3,
  alphaInterval: 0.4,
  alphaQty: 0.35,
  growthThreshold: 0.15,
};

async function getSettings() {
  const { rows } = await pool.query('SELECT key,value FROM settings');
  const s = { ...DEFAULTS };
  rows.forEach((r) => { s[r.key] = r.value; });
  return s;
}

async function saveSettingKeys(obj) {
  const entries = Object.entries(obj);
  for (const [k, v] of entries) {
    await pool.query(
      'INSERT INTO settings(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
      [k, JSON.stringify(v)]
    );
  }
}

async function getHolidays() {
  const { rows } = await pool.query('SELECT hol_date,description FROM holidays ORDER BY hol_date');
  return rows;
}

async function getCalendarAndSettings() {
  const settings = await getSettings();
  const holidays = await getHolidays();
  const cal = makeCalendar(settings.offDays, holidays.map((h) => h.hol_date));
  return { settings, cal, holidays };
}

module.exports = { DEFAULTS, getSettings, saveSettingKeys, getHolidays, getCalendarAndSettings };
