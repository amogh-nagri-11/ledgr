// ---------------------------------------------------------------------------
// PORTFOLIO AGENT -- one investigation per VENDOR, not per invoice.
//
// Vendor status is a property of the vendor. 24 vendors and 210 invoices is 24
// investigations, not 210. The result is cached and re-verified on demand.
//
// It establishes identity and registered activity with evidence. It does NOT
// decide coverage -- engine/coverage.js does that, over what this returns.
// ---------------------------------------------------------------------------

import { investigate, clamp, str } from './loop.js';
import { llmAvailable } from './llm.js';
import { searchUdyamRegistry, getUdyamRegistration, getVendorRecord, getSupplyHistory, looseScore } from './tools.js';
import { activityFromNic, ACTIVITY } from '../engine/coverage.js';
import { registrations, classAt, activeAt } from '../corpus/registry.js';
import { invoices } from '../corpus/ledger.js';
import { describe as describeNic } from '../corpus/nic.js';
import { today } from '../engine/dates.js';

const SYSTEM = `You classify one supplier for a buyer's MSME payment-compliance system, under Section 43B(h) of the Indian Income Tax Act.

Establish THREE things, each with evidence:

1. WHICH REGISTERED ENTITY THIS IS. The ledger name is messy and may be a trade name or an abbreviation. A registration number declared at onboarding may be stale, mistyped, or belong to another firm — check it rather than trusting it. When two candidates score alike, corroborate:
   - the GSTIN state prefix must match the registration's state code (27 Maharashtra, 29 Karnataka, 33 Tamil Nadu, 24 Gujarat, 07 Delhi, 09 Uttar Pradesh, 10 Bihar, 36 Telangana, 19 West Bengal, 32 Kerala, 06 Haryana, 08 Rajasthan, 23 Madhya Pradesh, 03 Punjab, 21 Odisha, 30 Goa)
   - what the vendor actually supplies should be consistent with the registered activity
   If two candidates remain genuinely plausible, say so and report low confidence rather than picking one.

2. THE REGISTERED ACTIVITY: manufacturing, service, or trading. Report what the registration says.

3. WHAT THE VENDOR ACTUALLY DOES, from its supply history: does it manufacture what it sells, provide a service, or resell goods it bought in? This can differ from the registered activity, and where it does, the supply history is the better evidence.

RULES
- You do not decide whether s.43B(h) applies. A hardcoded rule does that from what you report. Do not use the words covered or exempt.
- Do not compute dates or deadlines.
- Report enterprise category and registration status AS AT the date given to you, not as at today. A firm reclassified later was still small before.
- Investigate before you conclude. Check a declared number, search by name, look at the supply history.
- If you cannot identify the vendor, say so with registration_found false. Unknown is a real answer; guessing is not.
- Finish by calling submit_vendor_finding exactly once.`;

const SUBMIT = {
  type: 'function',
  function: {
    name: 'submit_vendor_finding',
    description: 'Submit the classification for this vendor. Call exactly once.',
    parameters: {
      type: 'object',
      properties: {
        registration_found: { type: 'boolean' },
        udyam: { type: 'string', description: 'Registration number, or empty string.' },
        registered_name: { type: 'string', description: 'Formal name, or empty string.' },
        enterprise_class: { type: 'string', enum: ['micro', 'small', 'medium', 'none'], description: 'As at the supply date given.' },
        registration_active: { type: 'boolean', description: 'Was it live on the supply date.' },
        registered_activity: { type: 'string', enum: ['manufacturing', 'service', 'trading', 'none'] },
        actual_activity: { type: 'string', enum: ['manufacturing', 'service', 'trading', 'unknown'], description: 'What the supply history shows they really do.' },
        identity_confidence: { type: 'number', description: '0 to 1. Low when two candidates are plausible.' },
        identity_evidence: { type: 'string', description: 'Why this entity and not another. Cite the GSTIN prefix or supply history where you used them.' },
        activity_evidence: { type: 'string', description: 'Why this activity classification.' },
        alternative_considered: { type: 'string', description: 'Any rival candidate you weighed and rejected, and why. Empty string if none.' },
      },
      required: ['registration_found', 'udyam', 'registered_name', 'enterprise_class', 'registration_active',
        'registered_activity', 'actual_activity', 'identity_confidence', 'identity_evidence',
        'activity_evidence', 'alternative_considered'],
      additionalProperties: false,
    },
  },
};

/** Classify one vendor. Falls back to the heuristic arm on any failure. */
export async function classifyVendor(vendor, { asOf = today(), forceHeuristic = false } = {}) {
  if (forceHeuristic || !llmAvailable()) return heuristicClassify(vendor, asOf);

  try {
    const { submitted, trace, model } = await investigate({
      system: SYSTEM,
      prompt: `Classify this supplier.

Vendor id: ${vendor.id}
Ledger name: "${vendor.ledgerName}"
GSTIN: ${vendor.gstin}
Declared Udyam number: ${vendor.declaredUdyam || 'none declared'}
Onboarded: ${vendor.onboardedOn}

Report category and registration status as at ${asOf}.

Investigate, then call submit_vendor_finding.`,
      toolNames: ['get_vendor_record', 'get_udyam_registration', 'search_udyam_registry', 'get_supply_history'],
      submitTool: SUBMIT,
      submitName: 'submit_vendor_finding',
    });
    return normalise(submitted, trace, { mode: 'ai', model }, asOf);
  } catch (err) {
    console.warn(`[portfolio] LLM path failed for ${vendor.id}, falling back:`, err.message);
    const f = heuristicClassify(vendor, asOf);
    f.mode = 'heuristic_fallback';
    f.fallbackReason = err.message;
    return f;
  }
}

function normalise(f, trace, meta, asOf) {
  const cls = str(f.enterprise_class).toLowerCase();
  const reg = str(f.registered_activity).toLowerCase();
  const act = str(f.actual_activity).toLowerCase();
  return {
    ...meta,
    asOf,
    registrationFound: Boolean(f.registration_found),
    udyam: str(f.udyam) || null,
    registeredName: str(f.registered_name) || null,
    enterpriseClass: ['micro', 'small', 'medium'].includes(cls) ? cls : null,
    registrationActive: Boolean(f.registration_active),
    registeredActivity: ['manufacturing', 'service', 'trading'].includes(reg) ? reg : null,
    actualActivity: ['manufacturing', 'service', 'trading'].includes(act) ? act : 'unknown',
    identityConfidence: clamp(f.identity_confidence),
    identityEvidence: str(f.identity_evidence),
    activityEvidence: str(f.activity_evidence),
    alternativeConsidered: str(f.alternative_considered) || null,
    trace,
    resolvedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Heuristic arm -- same tools, same output shape, no reasoning.
// ---------------------------------------------------------------------------

const RESELL_HINTS = /\b(bought in|resold|resale|as received|traded|stockist|distribut)\b/i;
const MADE_HINTS = /\b(fabricat|machined|manufactur|made to drawing|cast|moulded|printed|pressed)\b/i;
const SERVICE_HINTS = /\b(freight|transport|inspection|service|call|survey|haulage)\b/i;

export function heuristicClassify(vendor, asOf = today()) {
  const trace = [];
  const call = (name, fnImpl, args, summary) => {
    const r = fnImpl(args);
    trace.push({ tool: name, input: args, summary: summary(r) });
    return r;
  };

  call('get_vendor_record', getVendorRecord, { vendor_id: vendor.id },
    (r) => `Vendor record -> ${r.vendor.declaredUdyam ? `declared ${r.vendor.declaredUdyam}` : 'nothing declared'}`);

  let reg = null;
  let confidence = 0;
  let evidence = '';
  let alternative = null;

  if (vendor.declaredUdyam) {
    const looked = call('get_udyam_registration', getUdyamRegistration, { udyam: vendor.declaredUdyam, as_of: asOf },
      (r) => (r.found ? `${r.udyam} -> ${r.name}` : `${r.udyam} not found`));
    if (looked.found) {
      reg = registrations.find((x) => x.udyam === looked.udyam);
      confidence = 0.9;
      evidence = `Declared registration ${reg.udyam} resolved to "${reg.name}". Taken at face value.`;
    } else {
      evidence = `Declared registration ${vendor.declaredUdyam} does not exist. No further check made.`;
    }
  }

  if (!reg) {
    const search = call('search_udyam_registry', searchUdyamRegistry, { query: vendor.ledgerName, as_of: asOf },
      (r) => `Searched "${vendor.ledgerName}" -> ${r.candidates[0] ? r.candidates[0].name : 'nothing'}`);
    const top = search.candidates[0];
    const second = search.candidates[1];
    if (top && top.similarity >= 0.5) {
      reg = registrations.find((x) => x.udyam === top.udyam);
      confidence = Math.min(0.85, top.similarity);
      evidence = `Ledger name "${vendor.ledgerName}" matched "${top.name}" on token overlap ${top.similarity}.`;
      if (second && Math.abs(top.similarity - second.similarity) < 0.05) {
        alternative = `${second.name} scored the same; the first result was taken.`;
      }
    } else {
      evidence = `Nothing in the registry resembles "${vendor.ledgerName}" (best ${top ? top.similarity : 0}).`;
    }
  }

  const history = call('get_supply_history', getSupplyHistory, { vendor_id: vendor.id },
    (r) => `Reviewed ${r.supplies.length} past supplies`);
  const blob = history.supplies.map((s) => s.description).join(' ');
  const actual = RESELL_HINTS.test(blob) ? ACTIVITY.TRADING
    : MADE_HINTS.test(blob) ? ACTIVITY.MANUFACTURING
      : SERVICE_HINTS.test(blob) ? ACTIVITY.SERVICE : 'unknown';

  if (!reg) {
    return {
      mode: 'heuristic', model: null, asOf,
      registrationFound: false, udyam: null, registeredName: null,
      enterpriseClass: null, registrationActive: false,
      registeredActivity: null, actualActivity: actual,
      identityConfidence: 0, identityEvidence: evidence, activityEvidence: 'No registration to compare against.',
      alternativeConsidered: alternative, trace, resolvedAt: new Date().toISOString(),
    };
  }

  return {
    mode: 'heuristic', model: null, asOf,
    registrationFound: true,
    udyam: reg.udyam,
    registeredName: reg.name,
    enterpriseClass: classAt(reg, asOf),
    registrationActive: activeAt(reg, asOf),
    registeredActivity: activityFromNic(reg.nic),
    actualActivity: actual,
    identityConfidence: confidence,
    identityEvidence: evidence,
    activityEvidence: `Registered under ${describeNic(reg.nic)} (NIC ${reg.nic}).`,
    alternativeConsidered: alternative,
    trace,
    resolvedAt: new Date().toISOString(),
  };
}

/** How many invoices this vendor has, for sweep ordering. */
export const invoiceCountFor = (vendorId) => invoices.filter((i) => i.vendorId === vendorId).length;
