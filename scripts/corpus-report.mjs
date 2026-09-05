// Corpus report and non-AI ablation baseline.
//
//   node scripts/corpus-report.mjs
//
// Prints what the corpus contains, what each designed case defeats, and then
// scores the naive (string-matching, regex) arm against ground truth. That
// last number is the point: it is the floor the agent has to beat, and it is
// what "the AI earns its place" has to be measured against.
//
// No API calls, no key. The AI arm plugs in beside this once the portfolio
// agent lands.

import * as corpus from '../src/corpus/index.js';
import { vendors } from '../src/corpus/vendors.js';
import { registrations } from '../src/corpus/registry.js';
import { liveInvoices, historicalInvoices, payouts } from '../src/corpus/ledger.js';
import { vendorTruth, invoiceTruth, coverageAt, caseInventory } from '../src/corpus/truth.js';
import { naiveVendorMatch, naiveCoverage, naiveTermDays, naiveClockStart } from '../src/corpus/naive.js';
import { describeNic, isTradeCode } from '../src/corpus/index.js';
import { computeDeadline, disallowanceCost } from '../src/engine/deadline.js';
import { daysBetween } from '../src/engine/dates.js';

const TAX_RATE = 25;
const inr = (n) => '₹' + Number(Math.round(n)).toLocaleString('en-IN');
const pad = (s, n) => String(s).padEnd(n);
const rule = (c = '-') => console.log(c.repeat(78));

function heading(text) {
  console.log('');
  rule('=');
  console.log(text);
  rule('=');
}

// ---------------------------------------------------------------- inventory

heading('CORPUS');
const s = corpus.stats();
for (const [k, v] of Object.entries(s)) {
  const shown = k.endsWith('Value') ? inr(v) : v;
  console.log(`  ${pad(k, 22)} ${shown}`);
}
console.log(`  ${pad('provenance', 22)} SYNTHETIC (see PROVENANCE.md)`);

heading('WHAT EACH CASE IS DESIGNED TO DEFEAT');
const inventory = caseInventory().filter((r) => r.test !== 'control');
for (const row of inventory) {
  console.log(`  ${pad(row.id, 10)} ${row.test}`);
}
console.log(`\n  ${inventory.length} designed cases, plus ${caseInventory().length - inventory.length} controls.`);

// ------------------------------------------------- naive vendor arm vs truth

heading('ABLATION 1 - VENDOR IDENTITY (naive: trust the declared field, else token overlap)');
let idWrong = 0;
for (const v of vendors) {
  const truth = vendorTruth[v.id];
  const guess = naiveVendorMatch(v);
  const got = guess ? guess.udyam : null;
  const ok = got === truth.udyam;
  if (!ok) {
    idWrong += 1;
    const gotName = guess ? guess.name : 'no match';
    const wantName = truth.name || 'no registration (unknown)';
    console.log(`  MISS ${pad(v.id, 6)} ${pad(v.ledgerName, 26)}`);
    console.log(`       naive -> ${gotName}`);
    console.log(`       truth -> ${wantName}`);
  }
}
console.log(`\n  ${idWrong} of ${vendors.length} vendors misidentified by string matching.`);

// ------------------------------------------------ naive coverage arm vs truth

heading('ABLATION 2 - COVERAGE (naive: registered + micro/small + active today)');
const covErrors = { falsePositive: [], falseNegative: [], missedUnknown: [] };
for (const v of vendors) {
  const truth = vendorTruth[v.id];
  const guess = naiveCoverage(v);
  if (truth.coverage === 'unknown') {
    if (guess !== 'unknown') covErrors.missedUnknown.push(v);
    continue;
  }
  if (guess === 'covered' && truth.coverage === 'not_covered') covErrors.falsePositive.push(v);
  if (guess === 'not_covered' && truth.coverage === 'covered') covErrors.falseNegative.push(v);
}

const liveByVendor = (vid) => liveInvoices.filter((i) => i.vendorId === vid);
const histByVendor = (vid) => historicalInvoices.filter((i) => i.vendorId === vid);
const spendOf = (vid) => [...liveByVendor(vid), ...histByVendor(vid)].reduce((t, i) => t + i.amount, 0);

console.log('  FALSE POSITIVES - naive says covered, the vendor is not.');
console.log('  Cost: payments rushed for no reason, working capital burned.\n');
let fpSpend = 0;
for (const v of covErrors.falsePositive) {
  const reg = naiveVendorMatch(v);
  const spend = spendOf(v.id);
  fpSpend += spend;
  console.log(`    ${pad(v.id, 6)} ${pad(v.ledgerName, 26)} ${pad(inr(spend), 14)} ${describeNic(reg.nic)}`);
}
console.log(`\n    ${covErrors.falsePositive.length} vendors, ${inr(fpSpend)} of payments.`);

console.log('\n  FALSE NEGATIVES - naive says not covered, but it is.');
console.log('  Cost: a real deduction lost, unflagged.\n');
let fnSpend = 0;
for (const v of covErrors.falseNegative) {
  const spend = spendOf(v.id);
  fnSpend += spend;
  console.log(`    ${pad(v.id, 6)} ${pad(v.ledgerName, 26)} ${pad(inr(spend), 14)} ${vendorTruth[v.id].reason || ''}`);
}
console.log(`\n    ${covErrors.falseNegative.length} vendors, ${inr(fnSpend)} of payments.`);

if (covErrors.missedUnknown.length) {
  console.log('\n  ASSUMED, NOT ESCALATED - naive returns a verdict where the answer is unknown.\n');
  for (const v of covErrors.missedUnknown) {
    console.log(`    ${pad(v.id, 6)} ${pad(v.ledgerName, 26)} naive said "${naiveCoverage(v)}", truth is unknown`);
  }
}

// -------------------------------- date-dependent coverage over the historical ledger

heading('ABLATION 3 - COVERAGE AS AT THE SUPPLY DATE (the retroactive audit)');
console.log('  Naive classifies by today\'s status. Coverage is a function of the supply date.\n');

let dateWrong = 0;
let dateWrongValue = 0;
const perVendor = new Map();
for (const inv of historicalInvoices) {
  const truth = coverageAt(inv.vendorId, inv.acceptedOn);
  const guess = naiveCoverage(vendors.find((v) => v.id === inv.vendorId));
  if (truth !== guess) {
    dateWrong += 1;
    dateWrongValue += inv.amount;
    const row = perVendor.get(inv.vendorId) || { n: 0, value: 0 };
    row.n += 1;
    row.value += inv.amount;
    perVendor.set(inv.vendorId, row);
  }
}
for (const [vid, row] of [...perVendor].sort((a, b) => b[1].value - a[1].value)) {
  const t = vendorTruth[vid];
  console.log(`    ${pad(vid, 6)} ${pad(row.n + ' invoices', 14)} ${pad(inr(row.value), 14)} ${t.reason || ''}`);
}
console.log(`\n    ${dateWrong} of ${historicalInvoices.length} historical invoices misclassified, ${inr(dateWrongValue)}.`);

// ------------------------------------------- naive document reasoning vs truth

heading('ABLATION 4 - DOCUMENT REASONING ON LIVE PAYABLES');
let termWrong = 0;
let clockWrong = 0;
console.log('  Payment term extracted from the contract:\n');
for (const inv of liveInvoices) {
  const truth = invoiceTruth[inv.id];
  if (truth.statedTermDays === undefined) continue;
  const got = naiveTermDays(inv);
  if (got !== truth.statedTermDays) {
    termWrong += 1;
    console.log(`    MISS ${pad(inv.id, 10)} naive ${pad(String(got), 6)} truth ${pad(String(truth.statedTermDays), 6)} ${(truth.tests || [])[0] || ''}`);
  }
}
console.log(`\n    ${termWrong} wrong.\n`);

console.log('  Date the statutory clock starts:\n');
for (const inv of liveInvoices) {
  const truth = invoiceTruth[inv.id];
  if (!truth.clockStart) continue;
  const got = naiveClockStart(inv);
  if (got !== truth.clockStart) {
    clockWrong += 1;
    const drift = daysBetween(truth.clockStart, got);
    const dir = drift < 0 ? `${Math.abs(drift)}d early` : `${drift}d late`;
    console.log(`    MISS ${pad(inv.id, 10)} naive ${got} truth ${truth.clockStart}  (${pad(dir, 9)}) ${(truth.tests || [])[0] || ''}`);
  }
}
console.log(`\n    ${clockWrong} wrong.`);

// ------------------------------------- which designed cases actually discriminate

heading('DESIGNED CASES THE NAIVE ARM SURVIVES');
console.log('  A case only earns its place if the non-AI arm gets it wrong. These are');
console.log('  the ones it gets right at their own level. Some are still caught by a');
console.log('  different ablation -- an invoice whose coverage the naive arm gets right');
console.log('  by accident may still rest on a vendor it misidentified in ablation 1.');
console.log('');

const survived = [];

for (const v of vendors) {
  const t = vendorTruth[v.id];
  const designed = (t.tests || []).filter((x) => x !== 'control');
  if (!designed.length) continue;

  const guess = naiveVendorMatch(v);
  const idOk = (guess ? guess.udyam : null) === t.udyam;

  // Coverage has to be checked at every date this vendor actually supplied on,
  // not just today -- otherwise a vendor whose status changed mid-year looks
  // like the naive arm handled it.
  const supplyDates = [
    ...historicalInvoices.filter((i) => i.vendorId === v.id).map((i) => i.acceptedOn),
    ...liveInvoices.filter((i) => i.vendorId === v.id).map((i) => i.invoiceDate),
  ];
  // The naive arm classifies once, by today's status, and applies that verdict
  // to every invoice. Compare that single answer against the truth as at each
  // supply date -- that is where a mid-year status change actually bites.
  const naiveVerdict = naiveCoverage(v);
  const dates = supplyDates.length ? supplyDates : [new Date().toISOString().slice(0, 10)];
  const covOk = dates.every((d) => naiveVerdict === coverageAt(v.id, d));

  if (idOk && covOk) survived.push({ id: v.id, tests: designed });
}

for (const inv of liveInvoices) {
  const t = invoiceTruth[inv.id];
  const designed = (t.tests || []).filter((x) => x !== 'control');
  if (!designed.length) continue;
  const termOk = t.statedTermDays === undefined || naiveTermDays(inv) === t.statedTermDays;
  const clockOk = !t.clockStart || naiveClockStart(inv) === t.clockStart;
  const vend = vendors.find((v) => v.id === inv.vendorId);
  const covTruth = t.covered === true ? 'covered' : t.covered === false ? 'not_covered' : 'unknown';
  const covOk = naiveCoverage(vend, t.clockStart || inv.invoiceDate) === covTruth;
  if (termOk && clockOk && covOk) survived.push({ id: inv.id, tests: designed });
}

if (!survived.length) {
  console.log('    none -- every designed case defeats the naive arm.');
} else {
  for (const row of survived) {
    console.log(`    ${pad(row.id, 10)} ${row.tests.join('; ')}`);
  }
  console.log(`
    ${survived.length} designed cases do not discriminate. Either the case needs`);
  console.log('    sharpening, or it is really a control and should say so.');
}

// -------------------------------------------------- what the errors cost

heading('WHAT THE NAIVE ARM GETS WRONG, IN MONEY');

let deadlineDrift = 0;
let driftValue = 0;
for (const inv of liveInvoices) {
  const truth = invoiceTruth[inv.id];
  if (!truth.clockStart || truth.termDays == null) continue;

  const truthDeadline = computeDeadline({
    clockStartDate: truth.clockStart,
    hasWrittenAgreement: truth.statedTermDays != null,
    agreedTermDays: truth.statedTermDays,
  }).deadline;

  const naiveTerm = naiveTermDays(inv);
  const naiveDeadline = computeDeadline({
    clockStartDate: naiveClockStart(inv),
    hasWrittenAgreement: naiveTerm != null,
    agreedTermDays: naiveTerm,
  }).deadline;

  if (naiveDeadline !== truthDeadline) {
    deadlineDrift += 1;
    driftValue += inv.amount;
    const d = daysBetween(truthDeadline, naiveDeadline);
    console.log(`    ${pad(inv.id, 10)} ${pad(inr(inv.amount), 13)} naive ${naiveDeadline} vs ${truthDeadline}  (${d > 0 ? '+' : ''}${d}d)`);
  }
}

console.log('');
console.log(`  Deadlines wrong on ${deadlineDrift} of the live payables, covering ${inr(driftValue)}.`);
console.log(`  A deadline that is late is a forfeited deduction; one that is early is`);
console.log(`  working capital paid out for nothing.`);
console.log('');
console.log(`  Coverage false positives:  ${covErrors.falsePositive.length} vendors, ${inr(fpSpend)} of payments`);
console.log(`  Coverage false negatives:  ${covErrors.falseNegative.length} vendors, ${inr(fnSpend)} of payments`);
console.log(`  Exposure at ${TAX_RATE}% on the false negatives: ${inr(disallowanceCost(fnSpend, TAX_RATE))}`);
console.log('');
console.log('  This is the floor. If the agent does not beat it, it is decorative.');
rule('=');
console.log('');
