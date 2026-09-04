// Exercises the agentic loop against a stub OpenAI-compatible provider, so the
// tool-call plumbing is tested without spending a token: multi-turn tool calls,
// argument parsing, the flat -> nested finding mapping, and the guarantee that
// a broken provider degrades to the heuristic instead of throwing.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const invoice = { id: 'INV-2041', vendorId: 'V001', amount: 500000, invoiceDate: '2026-07-25', description: 'MS plate supply' };
const vendor = { id: 'V001', ledgerName: 'Sharma Ent.', gstin: '27AABCS1429B1ZP' };

/** Serves a canned sequence of assistant messages, one per request. */
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

function toolCall(id, name, args) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

const GOOD_FINDING = {
  vendor_found: true,
  registered_name: 'Sharma Enterprises Private Limited',
  udyam_number: 'UDYAM-MH-26-0041872',
  enterprise_class: 'micro',
  registration_active: true,
  vendor_confidence: 0.92,
  vendor_evidence: 'Ledger "Sharma Ent." is the registry entry "Sharma Enterprises Private Limited".',
  agreement_exists: true,
  stated_term_days: 45,
  agreement_document_ref: 'MSA-SHARMA-2024',
  agreement_evidence: 'Clause 7.2: payment within forty-five (45) days from acceptance.',
  clock_start_date: '2026-07-25',
  clock_start_basis: 'goods_accepted',
  clock_start_confidence: 0.9,
  clock_start_evidence: 'GRN-4471 signed on 2026-07-25.',
  needs_human_review: false,
  review_reason: '',
};

async function withStub(script, fn) {
  const stub = stubProvider(script);
  await new Promise((r) => stub.server.listen(0, '127.0.0.1', r));
  const port = stub.server.address().port;

  process.env.LLM_PROVIDER = 'ollama';                       // key-less provider
  process.env.LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.LLM_MODEL = 'stub-model';

  const { resolveInvoice } = await import('../src/agent/resolve.js');
  try {
    return await fn(resolveInvoice, stub);
  } finally {
    await new Promise((r) => stub.server.close(r));
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
  }
}

test('the agent investigates with tools, then submits a finding', async () => {
  const script = [
    { role: 'assistant', content: null, tool_calls: [
      toolCall('c1', 'search_udyam_registry', { query: 'Sharma Ent.' }),
      toolCall('c2', 'get_vendor_file', { vendor_id: 'V001' }),
    ] },
    { role: 'assistant', content: null, tool_calls: [
      toolCall('c3', 'get_delivery_timeline', { invoice_id: 'INV-2041' }),
    ] },
    { role: 'assistant', content: null, tool_calls: [
      toolCall('c4', 'submit_finding', GOOD_FINDING),
    ] },
  ];

  await withStub(script, async (resolveInvoice, stub) => {
    const f = await resolveInvoice(invoice, vendor);

    assert.equal(f.mode, 'ai');
    assert.equal(stub.requests(), 3, 'should take three round trips');

    // Flat tool arguments were rebuilt into the nested finding shape.
    assert.equal(f.vendorMatch.registeredName, 'Sharma Enterprises Private Limited');
    assert.equal(f.vendorMatch.enterpriseClass, 'micro');
    assert.equal(f.agreement.statedTermDays, 45);
    assert.equal(f.clockStart.date, '2026-07-25');
    assert.equal(f.clockStart.basis, 'goods_accepted');
    assert.equal(f.needsHumanReview, false);
    assert.equal(f.reviewReason, null);

    // Every investigation step is on the record, plus the submission.
    assert.deepEqual(f.trace.map((t) => t.tool), [
      'search_udyam_registry', 'get_vendor_file', 'get_delivery_timeline', 'submit_finding',
    ]);

    // Real tool output was fed back to the model, not a stub.
    const secondRequest = stub.seen[1];
    const toolMsg = secondRequest.messages.find((m) => m.role === 'tool' && m.name === 'search_udyam_registry');
    assert.ok(toolMsg.content.includes('Sharma Enterprises Private Limited'));
    assert.equal(toolMsg.tool_call_id, 'c1');
  });
});

test('sentinel values from a weak model normalise to nulls', async () => {
  const script = [{ role: 'assistant', content: null, tool_calls: [
    toolCall('c1', 'submit_finding', {
      ...GOOD_FINDING,
      vendor_found: false,
      registered_name: '',
      udyam_number: '',
      enterprise_class: 'none',
      agreement_exists: false,
      stated_term_days: 0,
      agreement_document_ref: '',
      vendor_confidence: 4,            // out of range
      clock_start_basis: 'nonsense',   // not in the enum
      review_reason: '',
    }),
  ] }];

  await withStub(script, async (resolveInvoice) => {
    const f = await resolveInvoice(invoice, vendor);
    assert.equal(f.vendorMatch.enterpriseClass, null);
    assert.equal(f.vendorMatch.registeredName, null);
    assert.equal(f.vendorMatch.confidence, 1, 'confidence is clamped to 0..1');
    assert.equal(f.agreement.statedTermDays, null, '0 days means "no term stated"');
    assert.equal(f.agreement.documentRef, null);
    assert.equal(f.clockStart.basis, 'invoice_date', 'an invalid basis falls back');
    assert.equal(f.reviewReason, null);
  });
});

test('a model that answers in prose is nudged back to the tools', async () => {
  const script = [
    { role: 'assistant', content: 'The deadline is probably around mid-September.' },
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'submit_finding', GOOD_FINDING)] },
  ];

  await withStub(script, async (resolveInvoice, stub) => {
    const f = await resolveInvoice(invoice, vendor);
    assert.equal(f.mode, 'ai');
    const nudge = stub.seen[1].messages.at(-1);
    assert.equal(nudge.role, 'user');
    assert.match(nudge.content, /Do not answer in prose/);
  });
});

test('a provider failure degrades to the heuristic instead of throwing', async () => {
  process.env.LLM_PROVIDER = 'ollama';
  process.env.LLM_BASE_URL = 'http://127.0.0.1:1/v1';   // nothing listening
  process.env.LLM_MODEL = 'stub-model';

  const { resolveInvoice } = await import('../src/agent/resolve.js');
  try {
    const f = await resolveInvoice(invoice, vendor);
    assert.equal(f.mode, 'heuristic_fallback');
    assert.ok(f.fallbackReason, 'the reason is recorded for the audit trail');
    assert.ok(f.clockStart.date, 'the fallback still produces usable inputs');
  } finally {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
  }
});
