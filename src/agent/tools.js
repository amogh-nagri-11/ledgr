// The investigation surface. These are the tools the agent calls when it hits
// ambiguity -- pull the contract, query the registry, walk the delivery trail.
// They return raw material; the agent (or the heuristic fallback) does the
// judgement. Both paths share these so the evidence chain is identical.

import * as store from '../store.js';

const LEGAL_SUFFIXES = new Set([
  'pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'co', 'company', 'corp',
  'enterprises', 'enterprise', 'ent', 'and', 'the', 'traders', 'trading', 'works', 'solutions', 'sons',
]);

function tokens(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Crude token-overlap score, weighted toward distinctive (non-suffix) tokens. */
export function nameSimilarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const weight = (t) => (LEGAL_SUFFIXES.has(t) ? 0.25 : 1);
  const matched = (t, list) =>
    list.some((o) => o === t || (t.length >= 3 && (o.startsWith(t) || t.startsWith(o))));
  let hit = 0;
  let total = 0;
  for (const t of ta) {
    total += weight(t);
    if (matched(t, tb)) hit += weight(t);
  }
  let hitB = 0;
  let totalB = 0;
  for (const t of tb) {
    totalB += weight(t);
    if (matched(t, ta)) hitB += weight(t);
  }
  return Number((((hit / total) + (hitB / totalB)) / 2).toFixed(3));
}

/** TOOL: search the Udyam registry by (messy) vendor name. */
export function searchUdyamRegistry({ query }) {
  const scored = store
    .getUdyamRegistry()
    .map((e) => ({ ...e, similarity: nameSimilarity(query, e.name) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);
  return {
    query,
    candidateCount: scored.length,
    candidates: scored,
    note: 'Similarity is a crude token-overlap hint, not a decision. Judge the match yourself; a low or tied score means you should flag for human review.',
  };
}

/** TOOL: the vendor master record plus every contract / PO document on file. */
export function getVendorFile({ vendor_id }) {
  const vendor = store.getVendor(vendor_id);
  if (!vendor) return { error: `No vendor ${vendor_id}` };
  const documents = store.getVendorDocuments(vendor_id);
  return {
    vendor,
    documentCount: documents.length,
    documents,
    note: documents.length === 0
      ? 'No written agreement on file for this vendor.'
      : 'Read the payment clause verbatim; quote it as evidence.',
  };
}

/** TOOL: delivery notes, GRNs, objection emails and re-deliveries for an invoice. */
export function getDeliveryTimeline({ invoice_id }) {
  const invoice = store.getInvoice(invoice_id);
  if (!invoice) return { error: `No invoice ${invoice_id}` };
  const events = store.getDeliveryEvents(invoice_id);
  return {
    invoice_id,
    invoiceDate: invoice.invoiceDate,
    eventCount: events.length,
    events,
    note: 'A signed GRN is acceptance. An objection raised in time suspends acceptance until the rectified consignment is accepted. If no GRN and no objection exists, acceptance is deemed 15 days after delivery under s.2(b) MSMED.',
  };
}

/** TOOL: any RazorpayX payout already booked against this invoice. */
export function getPayoutStatus({ invoice_id }) {
  const payout = store.getPayout(invoice_id);
  return payout
    ? { invoice_id, payout }
    : { invoice_id, payout: null, note: 'No payout scheduled or processed for this invoice.' };
}

export const TOOL_IMPLS = {
  search_udyam_registry: searchUdyamRegistry,
  get_vendor_file: getVendorFile,
  get_delivery_timeline: getDeliveryTimeline,
  get_payout_status: getPayoutStatus,
};
