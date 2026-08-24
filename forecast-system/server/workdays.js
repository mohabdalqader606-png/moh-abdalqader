function isoDate(d) {
  return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
}
function p2(n) { return String(n).padStart(2, '0'); }
function toDate(iso) { return new Date(iso + 'T00:00:00Z'); }

function isWorkingDay(iso, cal) {
  const d = toDate(iso);
  if (cal.offDays.includes(d.getUTCDay())) return false;
  if (cal.holidays.has(iso)) return false;
  return true;
}

function addWorkingDays(iso, n, cal) {
  if (n == null || isNaN(n)) return null;
  let d = toDate(iso);
  let steps = Math.round(n);
  const dir = steps >= 0 ? 1 : -1;
  steps = Math.abs(steps);
  let guard = 0;
  while (steps > 0 && guard < 20000) {
    d.setUTCDate(d.getUTCDate() + dir);
    guard++;
    if (isWorkingDay(isoDate(d), cal)) steps--;
  }
  return isoDate(d);
}

function workingDaysBetween(iso1, iso2, cal) {
  if (!iso1 || !iso2) return null;
  if (iso1 === iso2) return 0;
  let sign = 1, a = iso1, b = iso2;
  if (a > b) { sign = -1;[a, b] = [b, a]; }
  let d = toDate(a);
  const end = toDate(b);
  let cnt = 0, guard = 0;
  while (d < end && guard < 20000) {
    d.setUTCDate(d.getUTCDate() + 1);
    guard++;
    if (isWorkingDay(isoDate(d), cal)) cnt++;
  }
  return cnt * sign;
}

function makeCalendar(offDays, holidayRows) {
  return {
    offDays: offDays && offDays.length ? offDays : [5],
    holidays: new Set((holidayRows || []).map((h) => (typeof h === 'string' ? h : isoDate(new Date(h))))),
  };
}

module.exports = { isoDate, isWorkingDay, addWorkingDays, workingDaysBetween, makeCalendar };
