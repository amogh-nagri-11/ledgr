// Where the token budget goes.
//
//   npm run tokens
//
// Makes no API calls. Reconstructs exactly what each agent would send and
// measures it, broken down by component, so throughput work is aimed at the
// biggest item rather than guessed at.
//
// The thing that makes this non-obvious: an agent loop RESENDS the whole
// conversation on every round trip. A four-call loop does not cost
// system + tools + results once -- it costs the system prompt and tool
// definitions four times, plus each tool result every turn after it lands.

import * as store from '../src/store.js';
import { TOOL_DEFS } from '../src/agent/loop.js';
import { TOOL_IMPLS } from '../src/agent/tools.js';
import { liveInvoices } from '../src/corpus/ledger.js';
import { vendors } from '../src/corpus/vendors.js';

store.load();

// Rough but stable: ~4 characters per token for English + JSON. Good enough to
// rank components against each other, which is all this needs to do.
const tok = (s) => Math.ceil(JSON.stringify(s).length / 4);
const pad = (s, n) => String(s).padEnd(n);
const num = (n) => String(n).padStart(7);

const PORTFOLIO_TOOLS = ['get_vendor_record', 'get_udyam_registration', 'search_udyam_registry', 'get_supply_history'];
const INVOICE_TOOLS = ['get_vendor_documents', 'get_acceptance_documents', 'get_payout_status'];

function systemPromptTokens(file, exportName) {
  return file;
}

console.log('');
console.log('='.repeat(74));
console.log('TOKEN PROFILE — where an agent run actually spends');
console.log('='.repeat(74));

// --------------------------------------------------------------- tool defs

for (const [label, names] of [['portfolio agent', PORTFOLIO_TOOLS], ['invoice agent', INVOICE_TOOLS]]) {
  const defs = names.map((n) => TOOL_DEFS[n]);
  const total = tok(defs);
  console.log(`\n${label.toUpperCase()} — tool definitions`);
  for (const n of names) {
    console.log(`  ${pad(n, 30)}${num(tok(TOOL_DEFS[n]))} tok`);
  }
  console.log(`  ${pad('subtotal (sent EVERY call)', 30)}${num(total)} tok`);
}

// ------------------------------------------------------------ tool results

console.log('\nTOOL RESULTS — measured on the real corpus');

const sampleVendor = vendors.find((v) => v.id === 'V015');
const portfolioResults = {
  get_vendor_record: TOOL_IMPLS.get_vendor_record({ vendor_id: sampleVendor.id }),
  get_udyam_registration: TOOL_IMPLS.get_udyam_registration({ udyam: sampleVendor.declaredUdyam, as_of: '2026-09-06' }),
  search_udyam_registry: TOOL_IMPLS.search_udyam_registry({ query: sampleVendor.ledgerName, as_of: '2026-09-06' }),
  get_supply_history: TOOL_IMPLS.get_supply_history({ vendor_id: sampleVendor.id }),
};
console.log(`\n  portfolio (vendor ${sampleVendor.id}):`);
for (const [k, v] of Object.entries(portfolioResults)) {
  console.log(`    ${pad(k, 28)}${num(tok(v))} tok`);
}

// The invoice agent's payload varies a lot by how much paperwork exists.
const rows = liveInvoices.map((inv) => {
  const docs = TOOL_IMPLS.get_vendor_documents({ vendor_id: inv.vendorId });
  const acc = TOOL_IMPLS.get_acceptance_documents({ invoice_id: inv.id });
  const pay = TOOL_IMPLS.get_payout_status({ invoice_id: inv.id });
  return { id: inv.id, docs: tok(docs), acc: tok(acc), pay: tok(pay), total: tok(docs) + tok(acc) + tok(pay) };
});
rows.sort((a, b) => b.total - a.total);

console.log('\n  invoice (heaviest first):');
console.log(`    ${pad('', 12)}${num('contracts')}${num('acceptance')}${num('payout')}${num('total')}`);
for (const r of rows.slice(0, 8)) {
  console.log(`    ${pad(r.id, 12)}${num(r.docs)}${num(r.acc)}${num(r.pay)}${num(r.total)}`);
}
const avg = Math.round(rows.reduce((s, r) => s + r.total, 0) / rows.length);
console.log(`    ${pad('average', 12)}${num('')}${num('')}${num('')}${num(avg)}`);

// ------------------------------------------------------- the resend effect

const SYSTEM_INVOICE = 609;    // measured from src/agent/invoice.js
const SYSTEM_PORTFOLIO = 472;  // measured from src/agent/portfolio.js

console.log('');
console.log('='.repeat(74));
console.log('COST PER INVOICE — before and after prefetching');
console.log('='.repeat(74));

const invTools = tok(INVOICE_TOOLS.map((n) => TOOL_DEFS[n]));
const fixed = SYSTEM_INVOICE + invTools;   // resent on every single turn

function runCost(turns, resultsDelivered) {
  // Turn n carries the fixed overhead plus every result landed before it.
  let total = 0;
  for (let t = 1; t <= turns; t += 1) {
    total += fixed + (resultsDelivered[t - 1] || 0);
  }
  return total;
}

// Before: 4 turns, results arriving one per turn.
const third = Math.round(avg / 3);
const before = runCost(4, [0, third, third * 2, third * 3]);

// After: documents supplied in turn 1, so the loop is submit-on-turn-2.
const after = runCost(2, [avg, avg]);

console.log(`  fixed overhead per turn      ${num(fixed)} tok  (system ${SYSTEM_INVOICE} + tool defs ${invTools})`);
console.log(`  average tool payload         ${num(avg)} tok`);
console.log('');
console.log(`  BEFORE  4 turns              ${num(before)} tok`);
console.log(`  AFTER   2 turns, prefetched  ${num(after)} tok`);
const saved = before - after;
console.log(`  saved                        ${num(saved)} tok   (${Math.round(saved / before * 100)}%)`);

console.log('');
console.log(`  25 invoices before           ${num(before * 25)} tok`);
console.log(`  25 invoices after            ${num(after * 25)} tok`);
console.log(`  Groq free tier: 8,000/min, 200,000/DAY`);
console.log(`  share of a daily budget      ${Math.round(before * 25 / 200000 * 100)}%  ->  ${Math.round(after * 25 / 200000 * 100)}%`);

const porTools = tok(PORTFOLIO_TOOLS.map((n) => TOOL_DEFS[n]));
const pFixed = SYSTEM_PORTFOLIO + porTools;
const pBefore = 4 * pFixed + 700;
const pAfter = 3 * pFixed + 700;
console.log('');
console.log(`  24 vendors before            ${num(pBefore * 24)} tok`);
console.log(`  24 vendors after             ${num(pAfter * 24)} tok   (one turn saved; the loop still branches)`);

console.log('');
console.log(`  FULL PASS before             ${num(before * 25 + pBefore * 24)} tok`);
console.log(`  FULL PASS after              ${num(after * 25 + pAfter * 24)} tok`);
console.log('');
