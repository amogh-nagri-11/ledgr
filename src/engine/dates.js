// Plain UTC date arithmetic on 'YYYY-MM-DD' strings.
// Deliberately dependency-free: this file feeds the statutory calculation and
// must be trivially auditable.

export function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function daysBetween(fromISO, toISOStr) {
  const ms = toDate(toISOStr).getTime() - toDate(fromISO).getTime();
  return Math.round(ms / 86400000);
}

export function today() {
  return toISO(new Date());
}

export function isValidISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toDate(value).getTime());
}

export function formatINR(paise) {
  // Amounts are held in rupees (integers) throughout the MVP.
  return '\u20B9' + Number(paise).toLocaleString('en-IN');
}
