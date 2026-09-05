// ---------------------------------------------------------------------------
// INVOICE AGENT -- one investigation per payable.
//
// Establishes which agreement governs, what term it states, when the clock
// actually started, and what the supplier actually did on THIS supply. It
// never computes a deadline and never decides coverage.
// ---------------------------------------------------------------------------

import { investigate, clamp, str } from './loop.js';
import { llmAvailable } from './llm.js';
import { getVendorDocuments, getAcceptanceDocuments, getPayoutStatus } from './tools.js';
import { addDays } from '../engine/dates.js';
import { SUPPLY } from '../engine/coverage.js';

const DEEMED_DAYS = 15;   // s.2(b) MSMED

const SYSTEM = `You resolve the payment-timing facts for one supplier invoice, for a compliance system built on Section 43B(h) of the Indian Income Tax Act.

Establish FOUR things, each with evidence:

1. WHETHER A WRITTEN AGREEMENT GOVERNS THIS SUPPLY, and what payment term it states, in days. Read the documents on file. Watch for:
   - an amendment: it carries a \`supersedes\` field and replaces the clause it names, in either direction
   - a purchase order that states its own terms and prevails over a framework agreement
   - a term written in words rather than digits
   - other day-counts that are NOT payment terms: objection windows, notice periods, retention releases, claim periods
   Report the term the document states even if it exceeds 45 days. A hardcoded rule applies the statutory ceiling afterwards; that is not your job.

2. WHEN THE STATUTORY CLOCK STARTS. Usually not the invoice date. Read the acceptance documents — they are raw, and nothing tells you what a document means:
   - a signed goods receipt note is acceptance; the clock runs from its date
   - a written objection TO THE GOODS, raised inside whatever window the contract allows, suspends acceptance; the clock then runs from the date the rectified consignment was accepted
   - an objection to the RATE or the price is not an objection to the goods and does NOT move the clock
   - an objection raised after the contractual window has closed does NOT move the clock
   - a refusal to accept need not use the words "object" or "reject". If the buyer says it is holding goods aside and will not book them in, that is a refusal, and acceptance happens later
   - if there is no receipt note and no objection at all, acceptance is DEEMED 15 days after delivery under s.2(b) MSMED — report deemed_acceptance and lower confidence

3. WHAT THE SUPPLIER ACTUALLY DID ON THIS SUPPLY: manufactured it, performed a service, or resold third-party material without further processing. Read the invoice description and the delivery documents. This can differ from what the vendor usually does.

4. WHETHER ANYTHING IS UNRESOLVED that a person needs to settle.

RULES
- Never add days to a date. Never state a deadline or a due date. Report the start date and the term; a hardcoded engine does the arithmetic.
- Never say whether s.43B(h) applies. A rule decides that.
- Quote the clause or the document you relied on.
- Finish by calling submit_invoice_finding exactly once.`;

const SUBMIT = {
  type: 'function',
  function: {
    name: 'submit_invoice_finding',
    description: 'Submit the resolved facts for this invoice. Call exactly once.',
    parameters: {
      type: 'object',
      properties: {
        agreement_exists: { type: 'boolean' },
        stated_term_days: { type: 'number', description: 'As stated in the governing document. 0 if none stated or no agreement.' },
        governing_document: { type: 'string', description: 'The docId that governs, or empty string.' },
        agreement_evidence: { type: 'string', description: 'Quote the payment clause, and say why this document governs if others were on file.' },
        clock_start_date: { type: 'string', description: 'YYYY-MM-DD.' },
        clock_start_basis: { type: 'string', enum: ['goods_accepted', 'rectified_goods_accepted', 'deemed_acceptance', 'invoice_date'] },
        clock_start_confidence: { type: 'number' },
        clock_start_evidence: { type: 'string', description: 'Name the documents and say what you concluded from each.' },
        supply_nature: { type: 'string', enum: ['manufactured', 'service', 'resale', 'unknown'] },
        supply_evidence: { type: 'string' },
        needs_human_review: { type: 'boolean' },
        review_reason: { type: 'string', description: 'Empty string if nothing is unresolved.' },
      },
      required: ['agreement_exists', 'stated_term_days', 'governing_document', 'agreement_evidence',
        'clock_start_date', 'clock_start_basis', 'clock_start_confidence', 'clock_start_evidence',
        'supply_nature', 'supply_evidence', 'needs_human_review', 'review_reason'],
      additionalProperties: false,
    },
  },
};

export async function resolveInvoice(invoice, vendor, { forceHeuristic = false } = {}) {
  if (forceHeuristic || !llmAvailable()) return heuristicResolve(invoice, vendor);

  try {
    const { submitted, trace, model } = await investigate({
      system: SYSTEM,
      prompt: `Resolve the payment-timing facts for this invoice.

Invoice: ${invoice.id}
Vendor: ${vendor.id} — "${vendor.ledgerName}"
Invoice date: ${invoice.invoiceDate}
Amount: INR ${invoice.amount.toLocaleString('en-IN')}
Description: ${invoice.description}

Investigate, then call submit_invoice_finding.`,
      toolNames: ['get_vendor_documents', 'get_acceptance_documents', 'get_payout_status'],
      submitTool: SUBMIT,
      submitName: 'submit_invoice_finding',
    });
    return normalise(submitted, trace, { mode: 'ai', model });
  } catch (err) {
    console.warn(`[invoice] LLM path failed for ${invoice.id}, falling back:`, err.message);
    const f = heuristicResolve(invoice, vendor);
    f.mode = 'heuristic_fallback';
    f.fallbackReason = err.message;
    return f;
  }
}

function normalise(f, trace, meta) {
  const term = Number(f.stated_term_days);
  const basis = ['goods_accepted', 'rectified_goods_accepted', 'deemed_acceptance', 'invoice_date']
    .includes(f.clock_start_basis) ? f.clock_start_basis : 'invoice_date';
  const nature = ['manufactured', 'service', 'resale'].includes(f.supply_nature) ? f.supply_nature : SUPPLY.UNKNOWN;
  return {
    ...meta,
    agreement: {
      exists: Boolean(f.agreement_exists),
      statedTermDays: Number.isFinite(term) && term > 0 ? Math.round(term) : null,
      governingDocument: str(f.governing_document) || null,
      evidence: str(f.agreement_evidence),
    },
    clockStart: {
      date: /^\d{4}-\d{2}-\d{2}$/.test(str(f.clock_start_date)) ? str(f.clock_start_date) : null,
      basis,
      confidence: clamp(f.clock_start_confidence),
      evidence: str(f.clock_start_evidence),
    },
    supplyNature: nature,
    supplyEvidence: str(f.supply_evidence),
    needsHumanReview: Boolean(f.needs_human_review),
    reviewReason: str(f.review_reason) || null,
    trace,
    resolvedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Heuristic arm
// ---------------------------------------------------------------------------

const TERM_PATTERNS = [
  /within\s+[a-z-\s]*\((\d{1,3})\)\s*days/i,
  /net\s*(\d{1,3})\s*(?:days?)?/i,
  /(\d{1,3})\s*days?\s+from/i,
];
const PAYMENT_LINE = /\b(payment|pay\b|net\s*\d|payable|remit)/i;
const NOT_TERM_LINE = /\b(objection|reject|dispute|withhold|retention|penalt|interest|deposit|terminat|notif)/i;

const ACCEPTANCE = /\b(goods receipt note|grn|accepted|acceptance|service completion)\b/i;
const DELIVERY = /\b(delivery challan|delivered|despatch|dispatch)\b/i;
const OBJECTION = /\b(object|objection|objecting|reject|rejected|damaged)\b/i;

const RESELL = /\b(as received|bought in|resold|resale|original mill packing|without further processing)\b/i;
const MADE = /\b(fabricat|machined|manufactur|made to drawing|cast|moulded|printed|pressed)\b/i;
const SERVICE = /\b(freight|transport|inspection|service call|survey|haulage)\b/i;

export function heuristicResolve(invoice, vendor) {
  const trace = [];
  const call = (name, impl, args, summary) => {
    const r = impl(args);
    trace.push({ tool: name, input: args, summary: summary(r) });
    return r;
  };

  // 1. Agreement -- first payment-looking day count, in file order.
  const docs = call('get_vendor_documents', getVendorDocuments, { vendor_id: vendor.id },
    (r) => `${r.documentCount} document(s) on file`);
  let agreement = { exists: false, statedTermDays: null, governingDocument: null, evidence: 'No contract or purchase-order document on file.' };
  if (docs.documentCount > 0) {
    let found = null;
    for (const d of docs.documents) {
      for (const line of d.text.split('\n').map((l) => l.trim()).filter(Boolean)) {
        if (!PAYMENT_LINE.test(line) || NOT_TERM_LINE.test(line)) continue;
        for (const re of TERM_PATTERNS) {
          const m = line.match(re);
          if (!m) continue;
          const n = Number(m[1]);
          if (Number.isFinite(n) && n > 0 && n <= 365) { found = { days: n, quote: line, doc: d.docId }; break; }
        }
        if (found) break;
      }
      if (found) break;
    }
    agreement = found
      ? { exists: true, statedTermDays: found.days, governingDocument: found.doc, evidence: `${found.doc}: "${found.quote}"` }
      : { exists: true, statedTermDays: null, governingDocument: docs.documents[0].docId, evidence: `${docs.documents[0].docId} is on file but no payment term could be extracted.` };
  }

  // 2. Clock start -- delivery starts it; any objection keyword resets it.
  const accept = call('get_acceptance_documents', getAcceptanceDocuments, { invoice_id: invoice.id },
    (r) => `${r.documentCount} acceptance document(s)`);
  const list = accept.documents;
  let clockStart;
  let reviewReason = null;

  const objection = list.find((d) => OBJECTION.test(d.body));
  const grn = [...list].reverse().find((d) => ACCEPTANCE.test(d.body));
  const delivery = list.find((d) => DELIVERY.test(d.body));

  if (objection) {
    const after = list.filter((d) => d.date > objection.date && ACCEPTANCE.test(d.body));
    if (after.length) {
      const last = after[after.length - 1];
      clockStart = { date: last.date, basis: 'rectified_goods_accepted', confidence: 0.8,
        evidence: `${objection.ref} mentions an objection; took the later acceptance ${last.ref} on ${last.date}.` };
    } else {
      clockStart = { date: objection.date, basis: 'invoice_date', confidence: 0.4,
        evidence: `${objection.ref} mentions an objection and no acceptance follows it.` };
      reviewReason = `An objection on ${invoice.id} appears unresolved.`;
    }
  } else if (delivery) {
    clockStart = { date: delivery.date, basis: 'goods_accepted', confidence: 0.7,
      evidence: `Treated delivery ${delivery.ref} on ${delivery.date} as the start of the clock.` };
  } else if (grn) {
    clockStart = { date: grn.date, basis: 'goods_accepted', confidence: 0.7, evidence: `Accepted per ${grn.ref}.` };
  } else {
    clockStart = { date: invoice.invoiceDate, basis: 'invoice_date', confidence: 0.3,
      evidence: 'No acceptance trail; fell back to the invoice date.' };
    reviewReason = `No delivery or acceptance record exists for ${invoice.id}.`;
  }

  // 3. Supply nature -- keyword read of the description and documents.
  const blob = `${invoice.description} ${list.map((d) => d.body).join(' ')}`;
  const supplyNature = RESELL.test(blob) ? SUPPLY.RESALE
    : MADE.test(blob) ? SUPPLY.MANUFACTURED
      : SERVICE.test(blob) ? SUPPLY.SERVICE : SUPPLY.UNKNOWN;

  call('get_payout_status', getPayoutStatus, { invoice_id: invoice.id },
    (r) => (r.payout ? `Payout ${r.payout.status} on ${r.payout.date}` : 'No payout booked'));

  return {
    mode: 'heuristic', model: null,
    agreement,
    clockStart,
    supplyNature,
    supplyEvidence: `Keyword read of the invoice description and delivery documents.`,
    needsHumanReview: Boolean(reviewReason),
    reviewReason,
    trace,
    resolvedAt: new Date().toISOString(),
  };
}

export { DEEMED_DAYS, addDays };
