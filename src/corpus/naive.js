// The non-AI arm of the ablation.
//
// This is a fair, competent, non-stupid implementation of what you would build
// without a model: trust the vendor master, match names by token overlap,
// regex the contract for a day count, treat delivery as the start of the
// clock. It is not a straw man -- every rule here is one a sensible engineer
// would write, and on an easy corpus it scores identically to the agent.
//
// Its errors are the product's justification, so they are worth naming:
//   - it trusts a declared Udyam number that happens to be wrong
//   - it cannot break a tie between two plausible registrations
//   - it has no concept of registered activity, so every registered micro or
//     small vendor looks covered, traders included
//   - it reads the first day-count it finds, so amendments do not supersede
//   - it cannot read a term written in words
//   - it treats delivery as acceptance, and any "objection" as a reset

import { registrations, classAt, activeAt } from './registry.js';
import { forVendor as contractsForVendor } from './contracts.js';
import { forInvoice as documentsForInvoice } from './documents.js';
import { today } from '../engine/dates.js';

const STOPWORDS = new Set([
  'pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'co', 'company', 'corp',
  'and', 'the', 'of',
]);

function tokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t));
}

function overlap(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const hit = (t, list) => list.some((o) => o === t || (t.length >= 4 && o.length >= 4 && (o.startsWith(t) || t.startsWith(o))));
  const fwd = ta.filter((t) => hit(t, tb)).length / ta.length;
  const rev = tb.filter((t) => hit(t, ta)).length / tb.length;
  return (fwd + rev) / 2;
}

/** Trust the declared number; otherwise take the top name match, first wins. */
export function naiveVendorMatch(vendor) {
  if (vendor.declaredUdyam) {
    return registrations.find((r) => r.udyam === vendor.declaredUdyam) || null;
  }
  let best = null;
  let bestScore = 0;
  for (const reg of registrations) {
    const score = overlap(vendor.ledgerName, reg.name);
    if (score > bestScore) {
      bestScore = score;
      best = reg;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Registered + micro/small + currently active. No notion of activity. */
export function naiveCoverage(vendor, asOf = today()) {
  const reg = naiveVendorMatch(vendor);
  if (!reg) return 'not_covered';
  if (!activeAt(reg, asOf)) return 'not_covered';
  const cls = classAt(reg, asOf);
  return cls === 'micro' || cls === 'small' ? 'covered' : 'not_covered';
}

const TERM_PATTERNS = [
  /within\s+[a-z-\s]*\((\d{1,3})\)\s*days/i,
  /net\s*(\d{1,3})\s*(?:days?)?/i,
  /(\d{1,3})\s*days?\s+from/i,
];

const PAYMENT_LINE = /\b(payment|pay\b|net\s*\d|payable|remit)/i;
const NOT_A_TERM_LINE = /\b(objection|reject|dispute|withhold|retention|penalt|interest|deposit)/i;

/** First day count on a payment-ish line, reading documents in file order. */
export function naiveTermDays(invoice) {
  const docs = contractsForVendor(invoice.vendorId);
  for (const doc of docs) {
    const lines = doc.text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!PAYMENT_LINE.test(line) || NOT_A_TERM_LINE.test(line)) continue;
      for (const re of TERM_PATTERNS) {
        const m = line.match(re);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0 && n <= 365) return n;
      }
    }
  }
  return null;
}

const ACCEPTANCE = /\b(goods receipt note|grn|accepted|acceptance|service completion)\b/i;
const DELIVERY = /\b(delivery challan|delivered|despatch|dispatch)\b/i;
const OBJECTION = /\b(object|objection|objecting|reject|rejected|rejecting|damaged)\b/i;

/** Delivery starts the clock; any objection keyword resets it. */
export function naiveClockStart(invoice) {
  const docs = documentsForInvoice(invoice.id);
  if (!docs.length) return invoice.invoiceDate;

  const objection = docs.find((d) => OBJECTION.test(d.body));
  if (objection) {
    const after = docs.filter((d) => d.date > objection.date && ACCEPTANCE.test(d.body));
    return after.length ? after[after.length - 1].date : objection.date;
  }

  const first = docs.find((d) => DELIVERY.test(d.body) || ACCEPTANCE.test(d.body));
  return first ? first.date : invoice.invoiceDate;
}

/** Everything the naive arm concludes about one live invoice. */
export function naiveAssess(invoice, vendor) {
  const asOf = invoice.acceptedOn || invoice.invoiceDate;
  return {
    match: naiveVendorMatch(vendor),
    coverage: naiveCoverage(vendor, asOf),
    statedTermDays: naiveTermDays(invoice),
    clockStart: naiveClockStart(invoice),
  };
}
