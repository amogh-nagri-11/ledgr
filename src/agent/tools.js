// The investigation surface, over the corpus.
//
// These return raw material and nothing else. No tool returns a verdict, a
// coverage flag or a parsed payment term -- if one did, the agent would be
// decorative and a regex would score the same. The AI and heuristic arms share
// these, so their evidence chains are directly comparable.

import * as corpus from '../corpus/index.js';
import * as store from '../store.js';
import { classAt, activeAt } from '../corpus/registry.js';
import { describe as describeNic, division } from '../corpus/nic.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Loose containment score, used only to order candidates. Never a decision. */
function looseScore(query, name) {
  const a = norm(query).split(' ').filter(Boolean);
  const b = norm(name).split(' ').filter(Boolean);
  if (!a.length || !b.length) return 0;
  const hit = (t, list) => list.some((o) => o === t || (t.length >= 4 && o.length >= 4 && (o.startsWith(t) || t.startsWith(o))));
  const f = a.filter((t) => hit(t, b)).length / a.length;
  const r = b.filter((t) => hit(t, a)).length / b.length;
  return Number(((f + r) / 2).toFixed(3));
}

/**
 * TOOL: search the Udyam registry.
 * Returns candidates with their registered activity and dated status, so the
 * agent can weigh state, activity and category itself.
 */
export function searchUdyamRegistry({ query, as_of }) {
  const asOf = as_of || new Date().toISOString().slice(0, 10);
  const scored = corpus.registrations
    .map((r) => ({
      udyam: r.udyam,
      name: r.name,
      state: r.state,
      stateCode: r.stateCode,
      nic: r.nic,
      registeredActivity: describeNic(r.nic),
      nicDivision: division(r.nic),
      enterpriseClassAsOf: classAt(r, asOf),
      registrationLiveAsOf: activeAt(r, asOf),
      registeredOn: r.registeredOn,
      lapsedOn: r.lapsedOn,
      classHistory: r.classHistory,
      similarity: looseScore(query, r.name),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  return {
    query,
    as_of: asOf,
    candidates: scored,
    note: 'Similarity is a crude ordering hint, not a decision. Two candidates can tie. '
      + 'Corroborate with the GSTIN state prefix and with what the vendor actually supplies. '
      + 'Category and live status are reported AS AT as_of, because coverage depends on the supply date.',
  };
}

/** TOOL: look up one registration directly by number. */
export function getUdyamRegistration({ udyam, as_of }) {
  const asOf = as_of || new Date().toISOString().slice(0, 10);
  const r = corpus.registrations.find((x) => x.udyam === udyam);
  if (!r) {
    return { udyam, found: false, note: 'No such registration. A declared number can be stale or mistyped; try searching by name.' };
  }
  return {
    found: true,
    udyam: r.udyam,
    name: r.name,
    state: r.state,
    stateCode: r.stateCode,
    nic: r.nic,
    registeredActivity: describeNic(r.nic),
    nicDivision: division(r.nic),
    enterpriseClassAsOf: classAt(r, asOf),
    registrationLiveAsOf: activeAt(r, asOf),
    registeredOn: r.registeredOn,
    lapsedOn: r.lapsedOn,
    classHistory: r.classHistory,
  };
}

/** TOOL: the buyer's own record of a vendor. */
export function getVendorRecord({ vendor_id }) {
  const v = store.getVendor(vendor_id);
  if (!v) return { error: `No vendor ${vendor_id}` };
  return {
    vendor: v,
    gstinStatePrefix: String(v.gstin).slice(0, 2),
    note: v.declaredUdyam
      ? 'The vendor declared a registration number at onboarding. Declarations are not always right — verify it resolves to this vendor.'
      : 'No registration declared at onboarding. Search the registry by name.',
  };
}

/** TOOL: what this vendor has actually supplied, from the invoice history. */
export function getSupplyHistory({ vendor_id, limit = 8 }) {
  const rows = store.getAllInvoices()
    .filter((i) => i.vendorId === vendor_id)
    .slice(0, limit)
    .map((i) => ({ invoiceId: i.id, date: i.invoiceDate, amount: i.amount, description: i.description }));
  return {
    vendor_id,
    supplies: rows,
    note: 'Descriptions of what was actually supplied. Use these to judge whether the vendor '
      + 'manufactures, provides a service, or resells — the registered activity code can be misleading.',
  };
}

/** TOOL: contracts and PO terms on file. Raw text; which one governs is a judgement. */
export function getVendorDocuments({ vendor_id }) {
  const docs = corpus.contractsForVendor(vendor_id);
  return {
    vendor_id,
    documentCount: docs.length,
    documents: docs,
    note: docs.length === 0
      ? 'No written agreement on file for this vendor.'
      : 'Read the payment clause and quote it. Note the `supersedes` field: an amendment replaces '
        + 'the clause it names. Contracts contain day-counts that are not payment terms.',
  };
}

/** TOOL: the acceptance trail, as raw documents. Nothing here is pre-classified. */
export function getAcceptanceDocuments({ invoice_id }) {
  // Seeded trail plus anything captured through manual intake.
  const docs = [...corpus.documentsForInvoice(invoice_id), ...store.getExtraDocuments(invoice_id)]
    .sort((a, b) => a.date.localeCompare(b.date));
  const inv = store.getInvoice(invoice_id);
  return {
    invoice_id,
    invoiceDate: inv ? inv.invoiceDate : null,
    documentCount: docs.length,
    documents: docs,
    note: 'Raw documents in date order. `medium` says how each arrived, not what it means — '
      + 'you have to read the body. A signed goods receipt note is acceptance. A written objection '
      + 'to the GOODS, raised inside whatever window the contract gives, suspends acceptance until '
      + 'the rectified consignment is taken. An objection to the RATE does not. If there is no receipt '
      + 'note and no objection, acceptance is deemed 15 days after delivery under s.2(b) MSMED.',
  };
}

/** TOOL: any RazorpayX payout booked against this invoice. */
export function getPayoutStatus({ invoice_id }) {
  const payout = store.getPayout(invoice_id);
  return payout
    ? { invoice_id, payout }
    : { invoice_id, payout: null, note: 'No payout scheduled or processed for this invoice.' };
}

export const TOOL_IMPLS = {
  search_udyam_registry: searchUdyamRegistry,
  get_udyam_registration: getUdyamRegistration,
  get_vendor_record: getVendorRecord,
  get_supply_history: getSupplyHistory,
  get_vendor_documents: getVendorDocuments,
  get_acceptance_documents: getAcceptanceDocuments,
  get_payout_status: getPayoutStatus,
};

export { looseScore };
