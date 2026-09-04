// Offline stand-in for the AI layer.
//
// It calls the same investigation tools in the same order and emits the same
// finding shape, so the deterministic engine and the UI cannot tell the
// difference -- but the judgement is regex + token overlap rather than
// reasoning. It exists so the product runs (and is testable) with no API key,
// and so the AI's value is legible by comparison: this is what the naive
// version gets wrong.

import { addDays } from '../engine/dates.js';
import { TOOL_IMPLS, nameSimilarity } from './tools.js';

const STRONG_MATCH = 0.55;
const WEAK_MATCH = 0.38;
const DEEMED_ACCEPTANCE_DAYS = 15;   // s.2(b) MSMED

const TERM_PATTERNS = [
  /within\s+[a-z-\s]*\((\d{1,3})\)\s*days/i,   // "within forty-five (45) days"
  /net\s*(\d{1,3})\s*(?:days?)?/i,             // "Net 60 days" / "Net 30 from"
  /(\d{1,3})\s*days?\s+from/i,                 // "45 days from receipt"
];

// A contract has many day-counts in it -- objection windows, notice periods,
// retention releases. Scoping to lines that actually talk about payment avoids
// the obvious failure of grabbing the first number that looks like a term.
// It is still only pattern matching: a clause split across lines, or a term
// stated as prose, defeats it. That gap is what the AI layer is for.
const PAYMENT_LINE = /\b(payment|pay\b|net\s*\d|payable|remit)/i;
const NOT_A_TERM_LINE = /\b(objection|reject|dispute|withhold|retention|penalt|interest)/i;

function extractTermDays(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const candidates = lines.filter((l) => PAYMENT_LINE.test(l) && !NOT_A_TERM_LINE.test(l));
  for (const line of candidates) {
    for (const re of TERM_PATTERNS) {
      const m = line.match(re);
      if (!m) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= 365) return { days: n, quote: line };
    }
  }
  return null;
}

export function heuristicResolve(invoice, vendor) {
  const trace = [];
  const call = (name, input) => {
    const result = TOOL_IMPLS[name](input);
    trace.push({ tool: name, input, summary: summarise(name, input, result) });
    return result;
  };

  // 1. Vendor identity ------------------------------------------------------
  const search = call('search_udyam_registry', { query: vendor.ledgerName });
  const top = search.candidates[0] || null;
  const second = search.candidates[1] || null;
  const sim = top ? top.similarity : 0;

  let vendorMatch;
  let reviewReason = null;

  if (top && sim >= STRONG_MATCH) {
    vendorMatch = {
      found: true,
      registeredName: top.name,
      udyamNumber: top.udyam,
      enterpriseClass: top.enterpriseClass,
      registrationActive: top.active,
      confidence: Math.min(0.95, sim),
      evidence: `Ledger name "${vendor.ledgerName}" matched registry entry "${top.name}" (${top.udyam}) on token overlap ${sim}.`,
    };
    if (second && second.similarity >= WEAK_MATCH && sim - second.similarity < 0.2) {
      reviewReason = `Two registry entries are close matches for "${vendor.ledgerName}": "${top.name}" and "${second.name}".`;
    }
  } else if (top && sim >= WEAK_MATCH) {
    vendorMatch = {
      found: true,
      registeredName: top.name,
      udyamNumber: top.udyam,
      enterpriseClass: top.enterpriseClass,
      registrationActive: top.active,
      confidence: sim,
      evidence: `Weak match: "${vendor.ledgerName}" against "${top.name}" (${sim}).`,
    };
    reviewReason = `Vendor-name match to "${top.name}" is weak (${sim}); confirm the Udyam registration manually.`;
  } else {
    vendorMatch = {
      found: false,
      registeredName: null,
      udyamNumber: null,
      enterpriseClass: null,
      registrationActive: false,
      confidence: top ? 1 - sim : 0.8,
      evidence: `No Udyam registry entry resembles "${vendor.ledgerName}" (best candidate ${top ? `"${top.name}" at ${sim}` : 'none'}). Treated as not MSME-registered.`,
    };
  }

  // 2. Agreement and stated term -------------------------------------------
  const file = call('get_vendor_file', { vendor_id: vendor.id });
  const doc = (file.documents || [])[0] || null;
  let agreement;
  if (!doc) {
    agreement = { exists: false, statedTermDays: null, documentRef: null,
      evidence: 'No contract or purchase-order document on file for this vendor.' };
  } else {
    const term = extractTermDays(doc.text);
    agreement = {
      exists: true,
      statedTermDays: term ? term.days : null,
      documentRef: doc.docId,
      evidence: term
        ? `${doc.docId}: "${term.quote}"`
        : `${doc.docId} is on file but states no extractable payment term.`,
    };
  }

  // 3. When the clock starts ------------------------------------------------
  const timeline = call('get_delivery_timeline', { invoice_id: invoice.id });
  const events = timeline.events || [];
  const grn = [...events].reverse().find((e) => e.type === 'grn_accepted');
  const objection = events.find((e) => e.type === 'objection_raised');
  const delivery = events.find((e) => e.type === 'delivery_note');

  let clockStart;
  if (grn && objection) {
    clockStart = { date: grn.date, basis: 'rectified_goods_accepted', confidence: 0.85,
      evidence: `Objection ${objection.ref} raised ${objection.date} suspended acceptance; rectified consignment accepted on ${grn.date} per ${grn.ref}.` };
  } else if (grn) {
    clockStart = { date: grn.date, basis: 'goods_accepted', confidence: 0.9,
      evidence: `Goods accepted on ${grn.date} per ${grn.ref}.` };
  } else if (delivery) {
    clockStart = { date: addDays(delivery.date, DEEMED_ACCEPTANCE_DAYS), basis: 'deemed_acceptance', confidence: 0.45,
      evidence: `Delivered ${delivery.date} per ${delivery.ref} with no GRN and no objection on record; acceptance deemed ${DEEMED_ACCEPTANCE_DAYS} days later under s.2(b) MSMED.` };
    reviewReason = reviewReason || `No goods receipt note for ${invoice.id}; the acceptance date is deemed rather than evidenced.`;
  } else {
    clockStart = { date: invoice.invoiceDate, basis: 'invoice_date', confidence: 0.4,
      evidence: 'No delivery trail on record; fell back to the invoice date.' };
    reviewReason = reviewReason || `No delivery or acceptance record exists for ${invoice.id}.`;
  }

  call('get_payout_status', { invoice_id: invoice.id });

  return {
    mode: 'heuristic',
    model: null,
    vendorMatch,
    agreement,
    clockStart,
    needsHumanReview: Boolean(reviewReason),
    reviewReason,
    trace,
    resolvedAt: new Date().toISOString(),
  };
}

function summarise(name, input, result) {
  switch (name) {
    case 'search_udyam_registry': {
      const t = result.candidates[0];
      return `Searched "${input.query}" -> top candidate ${t ? `${t.name} (${t.enterpriseClass}, similarity ${t.similarity})` : 'none'}`;
    }
    case 'get_vendor_file':
      return `Pulled vendor file for ${input.vendor_id} -> ${result.documentCount} document(s) on file`;
    case 'get_delivery_timeline':
      return `Walked delivery trail for ${input.invoice_id} -> ${result.eventCount} event(s): ${(result.events || []).map((e) => e.type).join(', ') || 'none'}`;
    case 'get_payout_status':
      return result.payout ? `Payout ${result.payout.status} on ${result.payout.date}` : 'No payout booked against this invoice';
    default:
      return 'ok';
  }
}
