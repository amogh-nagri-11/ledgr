// The ablation: naive vs AI vs ground truth.
//
//   npm run ablation
//
// Reads the AI arm from the cached findings in .ledgr-state.json, so it makes
// no API calls and costs nothing to run. Sweep and analyse first (in the app,
// or via the API); this scores what those produced.
//
// Both arms are graded through src/corpus/score.js so they cannot be judged on
// different criteria, and errors are separated by direction, because they cost
// different things:
//
//   false positive   a vendor called in scope who is not -> payments rushed
//                    for no reason, working capital burned
//   false negative   a covered vendor called out of scope -> a real deduction
//                    silently lost, and nothing downstream looks again
//   escalated        refused to decide -> a human looks, nothing is lost

import * as store from '../src/store.js';
import { coverageFor, datedStatus } from '../src/assess.js';
import { decideCoverage, RESULT } from '../src/engine/coverage.js';
import { scoreVendors, scoreInvoices, scoreHistorical, tally, paymentsFor, COVERAGE } from '../src/corpus/score.js';
import { naiveVendorMatch, naiveCoverage, naiveTermDays, naiveClockStart } from '../src/corpus/naive.js';
import { vendors } from '../src/corpus/vendors.js';
import { liveInvoices } from '../src/corpus/ledger.js';
import { vendorTruth } from '../src/corpus/truth.js';
import { registrations, classAt, activeAt } from '../src/corpus/registry.js';
import { activityFromNic } from '../src/engine/coverage.js';

const inr = (n) => '₹' + Number(Math.round(n || 0)).toLocaleString('en-IN');
const pad = (s, n) => String(s ?? '').padEnd(n);
const rule = (c = '=') => console.log(c.repeat(78));
const heading = (t) => { console.log(''); rule(); console.log(t); rule(); };

store.load();

// ---------------------------------------------------------------------------
// The two arms
// ---------------------------------------------------------------------------

const naiveArm = {
  label: 'naive (string matching + regex)',
  vendor: (id) => {
    const v = vendors.find((x) => x.id === id);
    const reg = naiveVendorMatch(v);
    return { udyam: reg ? reg.udyam : null, coverage: naiveCoverage(v) };
  },
  invoice: (id) => {
    const inv = liveInvoices.find((i) => i.id === id);
    const v = vendors.find((x) => x.id === inv.vendorId);
    return {
      clockStart: naiveClockStart(inv),
      statedTermDays: naiveTermDays(inv),
      coverage: naiveCoverage(v),
    };
  },
  historical: (vendorId) => naiveCoverage(vendors.find((x) => x.id === vendorId)),
};

const aiArm = {
  label: 'agent',
  vendor: (id) => {
    const f = store.getVendorFinding(id);
    if (!f) return { udyam: null, coverage: COVERAGE.UNKNOWN, error: 'not swept' };
    const cov = coverageFor(id, new Date().toISOString().slice(0, 10));
    return { udyam: f.udyam, coverage: cov ? cov.result : COVERAGE.UNKNOWN };
  },
  invoice: (id) => {
    const f = store.getInvoiceFinding(id);
    const inv = liveInvoices.find((i) => i.id === id);
    if (!f) return { clockStart: null, statedTermDays: null, coverage: COVERAGE.UNKNOWN, error: 'not analysed' };
    const cov = coverageFor(inv.vendorId, f.clockStart.date || inv.invoiceDate, f.supplyNature);
    return {
      clockStart: f.clockStart.date,
      statedTermDays: f.agreement.statedTermDays,
      coverage: cov ? cov.result : COVERAGE.UNKNOWN,
    };
  },
  historical: (vendorId, date) => {
    const cov = coverageFor(vendorId, date);
    return cov ? cov.result : COVERAGE.UNKNOWN;
  },
};

// ---------------------------------------------------------------------------

const swept = vendors.filter((v) => store.getVendorFinding(v.id)).length;
const analysed = liveInvoices.filter((i) => store.getInvoiceFinding(i.id)).length;
const aiVendors = vendors.filter((v) => (store.getVendorFinding(v.id) || {}).mode === 'ai').length;
const aiInvoices = liveInvoices.filter((i) => (store.getInvoiceFinding(i.id) || {}).mode === 'ai').length;

heading('COVERAGE OF THE RUN BEING SCORED');
console.log(`  vendors swept        ${swept}/${vendors.length}   (${aiVendors} by the AI arm, ${swept - aiVendors} fell back)`);
console.log(`  live invoices        ${analysed}/${liveInvoices.length}   (${aiInvoices} by the AI arm, ${analysed - aiInvoices} fell back)`);
if (aiVendors < vendors.length || aiInvoices < liveInvoices.length) {
  console.log('\n  NOTE: the AI arm is incomplete. Anything that fell back is scored as');
  console.log('  the heuristic result, so the agent column understates it. Re-run the');
  console.log('  sweep and analysis -- both retry fallbacks -- before quoting a number.');
}

// ------------------------------------------------------------ vendor arm

const nv = scoreVendors(naiveArm.vendor);
const av = scoreVendors(aiArm.vendor);

heading('1 · VENDOR IDENTITY AND COVERAGE');
console.log(`  ${pad('', 34)}${pad('naive', 12)}agent`);
console.log(`  ${pad('identity correct', 34)}${pad(`${tally(nv, 'identityOk')}/${nv.length}`, 12)}${tally(av, 'identityOk')}/${av.length}`);
console.log(`  ${pad('coverage correct', 34)}${pad(`${tally(nv, 'coverageOk')}/${nv.length}`, 12)}${tally(av, 'coverageOk')}/${av.length}`);

const sev = (rows, s) => rows.filter((r) => r.severity === s);
for (const [label, key] of [['false positives (rushed payments)', 'false_positive'],
  ['false negatives (deduction lost)', 'false_negative'],
  ['escalated (a human looks)', 'escalated']]) {
  console.log(`  ${pad(label, 34)}${pad(sev(nv, key).length, 12)}${sev(av, key).length}`);
}

const nFp = sev(nv, 'false_positive');
const aFp = sev(av, 'false_positive');
console.log(`  ${pad('payments behind false positives', 34)}${pad(inr(paymentsFor(nFp.map((r) => r.id))), 12)}${inr(paymentsFor(aFp.map((r) => r.id)))}`);

console.log('\n  Cases where the two arms disagree:\n');
for (let i = 0; i < nv.length; i += 1) {
  const n = nv[i];
  const a = av[i];
  if (n.identityOk === a.identityOk && n.coverageOk === a.coverageOk) continue;
  const mark = (r) => (r.identityOk && r.coverageOk ? 'ok  ' : 'MISS');
  console.log(`    ${pad(n.id, 6)}${pad(n.name, 24)} naive ${mark(n)}   agent ${mark(a)}`);
  if (!n.identityOk) console.log(`           naive matched ${n.gotUdyam ? n.gotUdyam : 'nothing'}, truth is ${n.wantUdyam}`);
  if (!a.identityOk) console.log(`           agent matched ${a.gotUdyam ? a.gotUdyam : 'nothing'}, truth is ${a.wantUdyam}`);
  if (!a.coverageOk) console.log(`           agent coverage ${a.gotCoverage} (${a.severity}), truth ${a.wantCoverage}`);
}

// ----------------------------------------------------------- invoice arm

const ni = scoreInvoices(naiveArm.invoice);
const ai = scoreInvoices(aiArm.invoice);

heading('2 · INVOICE FACTS ON THE LIVE LEDGER');
console.log(`  ${pad('', 34)}${pad('naive', 12)}agent`);
console.log(`  ${pad('clock start correct', 34)}${pad(`${tally(ni, 'clockOk')}/${ni.length}`, 12)}${tally(ai, 'clockOk')}/${ai.length}`);
console.log(`  ${pad('payment term correct', 34)}${pad(`${tally(ni, 'termOk')}/${ni.length}`, 12)}${tally(ai, 'termOk')}/${ai.length}`);
console.log(`  ${pad('coverage correct', 34)}${pad(`${tally(ni, 'coverageOk')}/${ni.length}`, 12)}${tally(ai, 'coverageOk')}/${ai.length}`);
console.log(`  ${pad('all three correct', 34)}${pad(`${tally(ni, 'allOk')}/${ni.length}`, 12)}${tally(ai, 'allOk')}/${ai.length}`);

console.log('\n  Designed cases, one line each:\n');
for (let i = 0; i < ni.length; i += 1) {
  if (!ni[i].designed) continue;
  const m = (r) => (r.allOk ? 'ok  ' : 'MISS');
  console.log(`    ${pad(ni[i].id, 10)} naive ${m(ni[i])}  agent ${m(ai[i])}   ${ni[i].test}`);
  if (!ai[i].allOk) {
    if (!ai[i].clockOk) console.log(`               agent clock ${ai[i].gotClock} want ${ai[i].wantClock}`);
    if (!ai[i].termOk) console.log(`               agent term ${ai[i].gotTerm} want ${ai[i].wantTerm}`);
    if (!ai[i].coverageOk) console.log(`               agent coverage ${ai[i].gotCoverage} want ${ai[i].wantCoverage}`);
  }
}

// -------------------------------------------------------- historical arm

const nh = scoreHistorical(naiveArm.historical);
const ah = scoreHistorical(aiArm.historical);

heading('3 · HISTORICAL COVERAGE, JUDGED AS AT THE SUPPLY DATE');
console.log(`  ${pad('', 34)}${pad('naive', 16)}agent`);
console.log(`  ${pad('invoices misclassified', 34)}${pad(`${nh.wrong}/${nh.total}`, 16)}${ah.wrong}/${ah.total}`);
console.log(`  ${pad('value misclassified', 34)}${pad(inr(nh.wrongValue), 16)}${inr(ah.wrongValue)}`);

if (nh.byVendor.size) {
  console.log('\n  Where the naive arm goes wrong at volume:\n');
  for (const [vid, row] of [...nh.byVendor].sort((a, b) => b[1].value - a[1].value)) {
    console.log(`    ${pad(vid, 6)}${pad(`${row.n} invoices`, 14)}${pad(inr(row.value), 14)}${vendorTruth[vid].reason || ''}`);
  }
}

// ------------------------------------------------------------- the number

heading('THE HEADLINE');
const nVendorOk = tally(nv, 'identityOk');
const aVendorOk = tally(av, 'identityOk');
const nCovOk = tally(nv, 'coverageOk');
const aCovOk = tally(av, 'coverageOk');

console.log(`  Identity:  string matching resolves ${nVendorOk} of ${nv.length} vendors; the agent resolves ${aVendorOk}.`);
console.log(`  Coverage:  ${nCovOk} of ${nv.length} against ${aCovOk} of ${av.length}.`);
if (nFp.length) {
  console.log(`  Cost:      the naive arm calls ${nFp.length} out-of-scope vendors in scope, covering ${inr(paymentsFor(nFp.map((r) => r.id)))}`);
  console.log(`             of payments that would be rushed for no reason.`);
}
console.log(`  At volume: ${nh.wrong} of ${nh.total} historical invoices misclassified against ${ah.wrong},`);
console.log(`             ${inr(nh.wrongValue)} against ${inr(ah.wrongValue)}.`);

const escalated = sev(av, 'escalated');
if (escalated.length) {
  console.log(`\n  The agent's ${escalated.length} miss${escalated.length > 1 ? 'es' : ''} ${escalated.length > 1 ? 'are' : 'is'} an escalation, not a wrong verdict:`);
  for (const r of escalated) console.log(`    ${r.id} ${r.name} — refused to decide rather than deciding wrongly.`);
}

const aFn = sev(av, 'false_negative');
if (aFn.length) {
  console.log(`\n  WARNING: the agent produced ${aFn.length} false negative(s) — a covered vendor called`);
  console.log('  out of scope. That is the expensive direction and should be fixed before this');
  console.log('  number is quoted anywhere:');
  for (const r of aFn) console.log(`    ${r.id} ${r.name}`);
}

console.log('\n  Synthetic corpus — see PROVENANCE.md. The method transfers; the totals do not.');
rule();
console.log('');
