// Exercises both agentic loops against a stub OpenAI-compatible provider, so
// the tool-call plumbing is tested without spending a token: multi-turn tool
// calls, argument parsing, the flat -> structured mapping, the guarantee that
// a broken provider degrades to the heuristic arm instead of throwing, and --
// the important one -- that neither agent is allowed to decide coverage.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { vendorById } from '../src/corpus/index.js';
import { liveInvoices } from '../src/corpus/ledger.js';
import { decideCoverage, RESULT } from '../src/engine/coverage.js';

const vendor = vendorById('V001');
const invoice = liveInvoices.find((i) => i.id === 'INV-4101');

function stubProvider(script) {
  const seen = [];
  let i = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push(JSON.parse(body));
      const message = script[Math.min(i, script.length - 1)];
      i += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message }] }));
    });
  });
  return { server, seen, requests: () => i };
}

const toolCall = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

const VENDOR_FINDING = {
  registration_found: true,
  udyam: 'UDYAM-MH-26-0041872',
  registered_name: 'Sharma Enterprises Private Limited',
  enterprise_class: 'micro',
  registration_active: true,
  registered_activity: 'manufacturing',
  actual_activity: 'manufacturing',
  identity_confidence: 0.93,
  identity_evidence: 'GSTIN prefix 27 is Maharashtra, matching the registration state.',
  activity_evidence: 'Registered under fabricated structural metal products.',
  alternative_considered: '',
};

const INVOICE_FINDING = {
  agreement_exists: true,
  stated_term_days: 45,
  governing_document: 'MSA-SHARMA-2024',
  agreement_evidence: 'Clause 7.2: payment within forty-five (45) days from acceptance.',
  clock_start_date: '2026-07-25',
  clock_start_basis: 'goods_accepted',
  clock_start_confidence: 0.9,
  clock_start_evidence: 'GRN-7741 signed on the delivery date.',
  supply_nature: 'manufactured',
  supply_evidence: 'MS plate supplied against a drawing.',
  needs_human_review: false,
  review_reason: '',
};

async function withStub(script, fn) {
  const stub = stubProvider(script);
  await new Promise((r) => stub.server.listen(0, '127.0.0.1', r));
  const port = stub.server.address().port;

  process.env.LLM_PROVIDER = 'ollama';                     // key-less provider
  process.env.LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.LLM_MODEL = 'stub-model';
  try {
    return await fn(stub);
  } finally {
    await new Promise((r) => stub.server.close(r));
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
  }
}

// ------------------------------------------------------------ portfolio agent

test('the portfolio agent investigates, then submits a vendor finding', async () => {
  const script = [
    { role: 'assistant', content: null, tool_calls: [
      toolCall('c1', 'get_vendor_record', { vendor_id: 'V001' }),
      toolCall('c2', 'get_udyam_registration', { udyam: 'UDYAM-MH-26-0041872', as_of: '2026-09-05' }),
    ] },
    { role: 'assistant', content: null, tool_calls: [toolCall('c3', 'get_supply_history', { vendor_id: 'V001' })] },
    { role: 'assistant', content: null, tool_calls: [toolCall('c4', 'submit_vendor_finding', VENDOR_FINDING)] },
  ];

  await withStub(script, async (stub) => {
    const { classifyVendor } = await import('../src/agent/portfolio.js');
    const f = await classifyVendor(vendor, { asOf: '2026-09-05' });

    assert.equal(f.mode, 'ai');
    assert.equal(stub.requests(), 3);
    assert.equal(f.udyam, 'UDYAM-MH-26-0041872');
    assert.equal(f.enterpriseClass, 'micro');
    assert.equal(f.registeredActivity, 'manufacturing');
    assert.equal(f.identityConfidence, 0.93);
    assert.deepEqual(f.trace.map((t) => t.tool),
      ['get_vendor_record', 'get_udyam_registration', 'get_supply_history', 'submit_vendor_finding']);

    // Real tool output went back to the model, keyed by tool_call_id.
    const toolMsg = stub.seen[1].messages.find((m) => m.role === 'tool' && m.name === 'get_vendor_record');
    assert.equal(toolMsg.tool_call_id, 'c1');
    assert.match(toolMsg.content, /Sharma Ent\./);
  });
});

test('the portfolio agent has no way to return a coverage verdict', async () => {
  const script = [{ role: 'assistant', content: null, tool_calls: [toolCall('c1', 'submit_vendor_finding', VENDOR_FINDING)] }];
  await withStub(script, async (stub) => {
    const { classifyVendor } = await import('../src/agent/portfolio.js');
    const f = await classifyVendor(vendor, { asOf: '2026-09-05' });

    // The submission schema offered to the model must not contain a coverage field.
    const schema = stub.seen[0].tools.find((t) => t.function.name === 'submit_vendor_finding').function.parameters;
    for (const key of Object.keys(schema.properties)) {
      assert.equal(/cover|exempt|applies|in_scope/i.test(key), false, `schema exposes "${key}" to the model`);
    }
    assert.equal('covered' in f, false);
    assert.equal('coverage' in f, false);
  });
});

test('junk from a weak model is clamped', async () => {
  const script = [{ role: 'assistant', content: null, tool_calls: [
    toolCall('c1', 'submit_vendor_finding', {
      ...VENDOR_FINDING,
      enterprise_class: 'nonsense',
      registered_activity: 'wat',
      actual_activity: '',
      identity_confidence: 7,
      udyam: '',
      registered_name: '',
    }),
  ] }];
  await withStub(script, async () => {
    const { classifyVendor } = await import('../src/agent/portfolio.js');
    const f = await classifyVendor(vendor, { asOf: '2026-09-05' });
    assert.equal(f.enterpriseClass, null);
    assert.equal(f.registeredActivity, null);
    assert.equal(f.actualActivity, 'unknown');
    assert.equal(f.identityConfidence, 1, 'confidence clamped into 0..1');
    assert.equal(f.udyam, null);
  });
});

// -------------------------------------------------------------- invoice agent

test('the invoice agent submits payment-timing facts, not a deadline', async () => {
  const script = [
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'get_vendor_documents', { vendor_id: 'V001' })] },
    { role: 'assistant', content: null, tool_calls: [toolCall('c2', 'get_acceptance_documents', { invoice_id: 'INV-4101' })] },
    { role: 'assistant', content: null, tool_calls: [toolCall('c3', 'submit_invoice_finding', INVOICE_FINDING)] },
  ];
  await withStub(script, async (stub) => {
    const { resolveInvoice } = await import('../src/agent/invoice.js');
    const f = await resolveInvoice(invoice, vendor);

    assert.equal(f.mode, 'ai');
    assert.equal(f.agreement.statedTermDays, 45);
    assert.equal(f.clockStart.basis, 'goods_accepted');
    assert.equal(f.supplyNature, 'manufactured');

    const schema = stub.seen[0].tools.find((t) => t.function.name === 'submit_invoice_finding').function.parameters;
    for (const key of Object.keys(schema.properties)) {
      assert.equal(/deadline|due_date|cover/i.test(key), false, `schema exposes "${key}" to the model`);
    }
  });
});

test('a model that answers in prose is nudged back to the tools', async () => {
  const script = [
    { role: 'assistant', content: 'The deadline is probably mid-September.' },
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'submit_invoice_finding', INVOICE_FINDING)] },
  ];
  await withStub(script, async (stub) => {
    const { resolveInvoice } = await import('../src/agent/invoice.js');
    const f = await resolveInvoice(invoice, vendor);
    assert.equal(f.mode, 'ai');
    const nudge = stub.seen[1].messages.at(-1);
    assert.equal(nudge.role, 'user');
    assert.match(nudge.content, /Do not answer in prose/);
  });
});

test('a dead provider degrades to the heuristic arm rather than throwing', async () => {
  process.env.LLM_PROVIDER = 'ollama';
  process.env.LLM_BASE_URL = 'http://127.0.0.1:1/v1';
  process.env.LLM_MODEL = 'stub-model';
  try {
    const { resolveInvoice } = await import('../src/agent/invoice.js');
    const f = await resolveInvoice(invoice, vendor);
    assert.equal(f.mode, 'heuristic_fallback');
    assert.ok(f.fallbackReason);
    assert.ok(f.clockStart.date, 'the fallback still produces usable inputs');
  } finally {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
  }
});

// ------------------------------------------------------------ coverage rule

test('coverage is decided by the rule, and traders are excluded', () => {
  const base = {
    registrationFound: true, enterpriseClass: 'small', registrationActive: true,
    identityConfidence: 0.9, confidenceFloor: 0.6,
  };
  assert.equal(decideCoverage({ ...base, registeredActivity: 'manufacturing', supplyNature: 'manufactured' }).result, RESULT.COVERED);
  assert.equal(decideCoverage({ ...base, registeredActivity: 'trading', supplyNature: 'resale' }).result, RESULT.NOT_COVERED);
  // A trading registration is a prior, not a verdict.
  assert.equal(decideCoverage({ ...base, registeredActivity: 'trading', supplyNature: 'manufactured' }).result, RESULT.COVERED);
  // A manufacturer passing goods through is not covered on that supply -- but
  // only when the resale is evidenced on THIS supply.
  assert.equal(decideCoverage({ ...base, registeredActivity: 'manufacturing', supplyNature: 'resale', supplyEvidenced: true }).result, RESULT.NOT_COVERED);
  // Medium is out of scope; a lapsed registration attaches no obligation.
  assert.equal(decideCoverage({ ...base, enterpriseClass: 'medium', registeredActivity: 'manufacturing', supplyNature: 'manufactured' }).result, RESULT.NOT_COVERED);
  assert.equal(decideCoverage({ ...base, registrationActive: false, registeredActivity: 'manufacturing', supplyNature: 'manufactured' }).result, RESULT.NOT_COVERED);
});

test('unknown is escalated, never silently treated as not covered', () => {
  const unresolved = decideCoverage({
    registrationFound: false, enterpriseClass: null, registrationActive: false,
    registeredActivity: null, supplyNature: 'unknown', identityConfidence: 0,
  });
  assert.equal(unresolved.result, RESULT.UNKNOWN);
  assert.equal(unresolved.needsReview, true);

  const shaky = decideCoverage({
    registrationFound: true, enterpriseClass: 'micro', registrationActive: true,
    registeredActivity: 'manufacturing', supplyNature: 'manufactured',
    identityConfidence: 0.4, confidenceFloor: 0.6,
  });
  assert.equal(shaky.result, RESULT.UNKNOWN, 'a shaky identity must not produce a coverage verdict');
  assert.equal(shaky.needsReview, true);
});

test('a vendor-level activity guess escalates rather than excluding', () => {
  // Registered as a producer, but the supply history reads as resale, and no
  // invoice-level evidence backs that up. Excluding here would silently drop a
  // real deduction, so the rule must escalate instead.
  const guess = decideCoverage({
    registrationFound: true, enterpriseClass: 'micro', registrationActive: true,
    registeredActivity: 'manufacturing', supplyNature: 'resale',
    supplyEvidenced: false, identityConfidence: 0.95, confidenceFloor: 0.6,
  });
  assert.equal(guess.result, RESULT.UNKNOWN);
  assert.equal(guess.reasonCode, 'activity_conflict');
  assert.equal(guess.needsReview, true);

  // The same conclusion, evidenced on this supply, does exclude.
  const evidenced = decideCoverage({
    registrationFound: true, enterpriseClass: 'micro', registrationActive: true,
    registeredActivity: 'manufacturing', supplyNature: 'resale',
    supplyEvidenced: true, identityConfidence: 0.95, confidenceFloor: 0.6,
  });
  assert.equal(evidenced.result, RESULT.NOT_COVERED);
  assert.equal(evidenced.reasonCode, 'pass_through_supply');
});
