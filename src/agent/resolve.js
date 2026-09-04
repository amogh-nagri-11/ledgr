// ---------------------------------------------------------------------------
// AI EXTRACTION AND REASONING AGENT
//
// This layer does the messy work: match the vendor against the Udyam registry,
// read the contract to find the payment term, and decide when the statutory
// clock actually starts. It investigates with tools rather than giving up on
// ambiguity, and it returns evidence + confidence for every input.
//
// It NEVER computes a deadline. Date arithmetic lives in engine/deadline.js.
//
// Runs on any OpenAI-compatible provider (see llm.js). The submit_finding
// schema is deliberately FLAT -- small free-tier models handle a flat object
// of scalars far more reliably than nested objects, and normalise() below
// rebuilds the structured finding the rest of the app expects.
// ---------------------------------------------------------------------------

import { chat, parseToolArgs, llmAvailable, describeProvider, activeProvider } from './llm.js';
import { TOOL_IMPLS } from './tools.js';
import { heuristicResolve } from './heuristic.js';

export { llmAvailable, describeProvider };

const MAX_ITERATIONS = 8;

const SYSTEM = `You are the extraction and reasoning layer of Ledgr, a payment-compliance controller for Section 43B(h) of the Indian Income Tax Act.

Your job is to establish THREE facts about one supplier invoice, with evidence:

1. VENDOR IDENTITY. The buyer's ledger name is messy ("Sharma Ent."); the Udyam registry holds the formal name ("Sharma Enterprises Private Limited"). Search the registry and decide whether it is the same entity. Section 43B(h) attaches only to MICRO and SMALL enterprises -- a MEDIUM enterprise is out of scope, and so is a vendor with no registration.

2. THE AGREEMENT AND ITS PAYMENT TERM. Read the actual contract or PO text. Is there a written agreement, and what payment term does it state, in days? Report the term the document states, even when it exceeds 45 days -- the statutory cap is applied downstream by a hardcoded rule, NOT by you. Beware of other day-counts in the contract: objection windows, notice periods and retention releases are NOT payment terms. Quote the clause you used.

3. WHEN THE CLOCK STARTS. This is the hardest part and is often NOT the invoice date. Walk the delivery trail:
   - A signed GRN is acceptance -> the clock runs from the GRN date.
   - A written objection raised within the contractual window suspends acceptance -> the clock runs afresh from the date the rectified consignment was accepted.
   - No GRN and no objection -> acceptance is DEEMED 15 days after delivery (s.2(b) MSMED); flag lower confidence.
   - Only if there is no delivery trail at all, fall back to the invoice date.

RULES
- You are forbidden from computing deadlines, adding days to dates, or stating when payment is due. Report only the inputs above. A downstream deterministic engine does the arithmetic.
- Investigate before you escalate. Call the tools. If something is ambiguous, call another tool: pull the vendor file, re-read the clause, search the registry again with a different query, check the delivery timeline.
- Set needs_human_review to true ONLY when you genuinely cannot resolve an input -- for example a vendor-name match you would not stand behind, or an acceptance date you can only guess at. A resolved answer with moderate confidence is more useful than an escalation.
- Every field must be backed by a short verbatim quote or an explicit document/event reference.
- When you have gathered what you need, call submit_finding exactly once. Do not answer in prose.`;

const INVESTIGATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_udyam_registry',
      description: 'Search the Udyam MSME registry by vendor name. Returns candidate registrations with enterprise class (micro/small/medium), status and a crude similarity hint.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Vendor name to search for. Try variations if the first search is inconclusive.' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_vendor_file',
      description: "Fetch the buyer's vendor master record and the full text of every contract or purchase-order document on file for that vendor.",
      parameters: {
        type: 'object',
        properties: { vendor_id: { type: 'string', description: 'Vendor id, e.g. V001' } },
        required: ['vendor_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_delivery_timeline',
      description: 'Fetch delivery notes, goods receipt notes, objection emails and re-deliveries for an invoice, in date order. Use this to work out when acceptance occurred.',
      parameters: {
        type: 'object',
        properties: { invoice_id: { type: 'string', description: 'Invoice id, e.g. INV-2041' } },
        required: ['invoice_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payout_status',
      description: 'Check whether a RazorpayX payout is already scheduled or processed against this invoice.',
      parameters: {
        type: 'object',
        properties: { invoice_id: { type: 'string', description: 'Invoice id, e.g. INV-2041' } },
        required: ['invoice_id'],
        additionalProperties: false,
      },
    },
  },
];

const SUBMIT_TOOL = {
  type: 'function',
  function: {
    name: 'submit_finding',
    description: 'Submit the resolved compliance inputs for this invoice. Call exactly once, after investigating.',
    parameters: {
      type: 'object',
      properties: {
        vendor_found: { type: 'boolean', description: 'True if you are confident this vendor appears in the Udyam registry.' },
        registered_name: { type: 'string', description: 'Formal registry name, or empty string if not found.' },
        udyam_number: { type: 'string', description: 'Udyam registration number, or empty string if not found.' },
        enterprise_class: { type: 'string', enum: ['micro', 'small', 'medium', 'none'], description: 'Use "none" when the vendor is not in the registry.' },
        registration_active: { type: 'boolean' },
        vendor_confidence: { type: 'number', description: '0 to 1.' },
        vendor_evidence: { type: 'string', description: 'Why this is, or is not, the same entity.' },

        agreement_exists: { type: 'boolean', description: 'Is there a written agreement covering this supply?' },
        stated_term_days: { type: 'number', description: 'Payment term in days as stated in the document. Use 0 if no term is stated or no agreement exists. Report it as written even if over 45.' },
        agreement_document_ref: { type: 'string', description: 'Document id the term came from, or empty string.' },
        agreement_evidence: { type: 'string', description: 'Verbatim quote of the payment clause, or a note that nothing is on file.' },

        clock_start_date: { type: 'string', description: 'YYYY-MM-DD. The date the statutory clock starts running.' },
        clock_start_basis: { type: 'string', enum: ['goods_accepted', 'rectified_goods_accepted', 'deemed_acceptance', 'invoice_date'] },
        clock_start_confidence: { type: 'number', description: '0 to 1.' },
        clock_start_evidence: { type: 'string', description: 'Which event decided this, referenced explicitly.' },

        needs_human_review: { type: 'boolean' },
        review_reason: { type: 'string', description: 'What is unresolved, or empty string if nothing is.' },
      },
      required: [
        'vendor_found', 'registered_name', 'udyam_number', 'enterprise_class', 'registration_active',
        'vendor_confidence', 'vendor_evidence',
        'agreement_exists', 'stated_term_days', 'agreement_document_ref', 'agreement_evidence',
        'clock_start_date', 'clock_start_basis', 'clock_start_confidence', 'clock_start_evidence',
        'needs_human_review', 'review_reason',
      ],
      additionalProperties: false,
    },
  },
};

function summarise(name, input, result) {
  if (result && result.error) return result.error;
  switch (name) {
    case 'search_udyam_registry': {
      const top = result.candidates[0];
      return `Searched "${input.query}" -> top candidate ${top ? `${top.name} (${top.enterpriseClass}, similarity ${top.similarity})` : 'none'}`;
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

/**
 * Runs the agentic loop for one invoice.
 * Falls back to the deterministic heuristic extractor if no provider is
 * configured or the call fails -- the demo must never hard-stop on the AI layer.
 */
export async function resolveInvoice(invoice, vendor, { forceHeuristic = false } = {}) {
  if (forceHeuristic || !llmAvailable()) {
    return heuristicResolve(invoice, vendor);
  }

  const provider = activeProvider();
  const trace = [];

  const prompt = `Resolve the compliance inputs for this invoice.

Invoice id: ${invoice.id}
Vendor id: ${vendor.id}
Vendor name as it appears in our ledger: "${vendor.ledgerName}"
Vendor GSTIN: ${vendor.gstin}
Invoice date: ${invoice.invoiceDate}
Amount: INR ${invoice.amount.toLocaleString('en-IN')}
Description: ${invoice.description}

Today's date is ${new Date().toISOString().slice(0, 10)}.

Investigate with the tools, then call submit_finding.`;

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: prompt },
  ];
  const tools = [...INVESTIGATION_TOOLS, SUBMIT_TOOL];

  try {
    let submitted = null;

    for (let i = 0; i < MAX_ITERATIONS && !submitted; i += 1) {
      const message = await chat({ messages, tools });
      messages.push(message);

      const calls = message.tool_calls || [];
      if (!calls.length) {
        // The model answered in prose instead of calling a tool. Nudge once.
        if (i === MAX_ITERATIONS - 1) break;
        messages.push({
          role: 'user',
          content: 'Do not answer in prose. Call a tool to investigate, or call submit_finding with the resolved inputs.',
        });
        continue;
      }

      for (const call of calls) {
        const name = call.function?.name;
        let content;

        try {
          const args = parseToolArgs(call.function?.arguments);

          if (name === 'submit_finding') {
            submitted = args;
            trace.push({ tool: 'submit_finding', input: {}, summary: 'Submitted resolved inputs with evidence' });
            content = 'Finding recorded.';
          } else if (TOOL_IMPLS[name]) {
            const result = TOOL_IMPLS[name](args);
            trace.push({ tool: name, input: args, summary: summarise(name, args, result) });
            content = JSON.stringify(result);
          } else {
            content = `Unknown tool "${name}".`;
          }
        } catch (err) {
          content = `Tool error: ${err.message}`;
        }

        messages.push({ role: 'tool', tool_call_id: call.id, name, content });
      }
    }

    if (!submitted) throw new Error(`Agent finished without calling submit_finding after ${MAX_ITERATIONS} iterations.`);

    return normalise(submitted, trace, { mode: 'ai', model: `${provider.label} · ${provider.model}` });
  } catch (err) {
    console.warn(`[agent] LLM path failed for ${invoice.id}, falling back to heuristic:`, err.message);
    const fallback = heuristicResolve(invoice, vendor);
    fallback.mode = 'heuristic_fallback';
    fallback.fallbackReason = err.message;
    return fallback;
  }
}

/**
 * Guard-rail the model output so the deterministic engine always gets sane
 * types, and rebuild the nested finding shape from the flat tool arguments.
 */
export function normalise(f, trace, meta) {
  const cls = str(f.enterprise_class).toLowerCase();
  const term = Number(f.stated_term_days);
  const basis = ['goods_accepted', 'rectified_goods_accepted', 'deemed_acceptance', 'invoice_date'].includes(f.clock_start_basis)
    ? f.clock_start_basis
    : 'invoice_date';

  return {
    ...meta,
    vendorMatch: {
      found: Boolean(f.vendor_found),
      registeredName: str(f.registered_name) || null,
      udyamNumber: str(f.udyam_number) || null,
      enterpriseClass: ['micro', 'small', 'medium'].includes(cls) ? cls : null,
      registrationActive: Boolean(f.registration_active),
      confidence: clamp(f.vendor_confidence),
      evidence: str(f.vendor_evidence),
    },
    agreement: {
      exists: Boolean(f.agreement_exists),
      statedTermDays: Number.isFinite(term) && term > 0 ? Math.round(term) : null,
      documentRef: str(f.agreement_document_ref) || null,
      evidence: str(f.agreement_evidence),
    },
    clockStart: {
      date: /^\d{4}-\d{2}-\d{2}$/.test(str(f.clock_start_date)) ? str(f.clock_start_date) : null,
      basis,
      confidence: clamp(f.clock_start_confidence),
      evidence: str(f.clock_start_evidence),
    },
    needsHumanReview: Boolean(f.needs_human_review),
    reviewReason: str(f.review_reason) || null,
    trace,
    resolvedAt: new Date().toISOString(),
  };
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

function clamp(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
