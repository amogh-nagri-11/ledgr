// Corpus integrity, and the property that justifies its existence:
// the naive approach must actually fail on it.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as corpus from '../src/corpus/index.js';
import { registrations, classAt, activeAt } from '../src/corpus/registry.js';
import { vendors, stateCodeOf } from '../src/corpus/vendors.js';
import { documents as contracts } from '../src/corpus/contracts.js';
import { acceptanceDocuments } from '../src/corpus/documents.js';
import { liveInvoices, historicalInvoices, payouts, CORPUS_SEED } from '../src/corpus/ledger.js';
import { vendorTruth, invoiceTruth, coverageAt } from '../src/corpus/truth.js';
import { isTradeCode } from '../src/corpus/nic.js';
import { naiveVendorMatch, naiveCoverage, naiveTermDays, naiveClockStart } from '../src/corpus/naive.js';

// --------------------------------------------------------------- integrity

test('every vendor has a truth label', () => {
  for (const v of vendors) {
    assert.ok(vendorTruth[v.id], `no truth for ${v.id}`);
  }
});

test('every live invoice has a truth label and an existing vendor', () => {
  for (const inv of liveInvoices) {
    assert.ok(invoiceTruth[inv.id], `no truth for ${inv.id}`);
    assert.ok(vendors.some((v) => v.id === inv.vendorId), `${inv.id} points at missing ${inv.vendorId}`);
  }
});

test('every truth udyam number resolves to a real registration', () => {
  for (const [vid, t] of Object.entries(vendorTruth)) {
    if (t.udyam === null) continue;
    assert.ok(registrations.some((r) => r.udyam === t.udyam), `${vid} truth points at unknown ${t.udyam}`);
  }
});

test('a declared Udyam number can be wrong, and V017 is the case', () => {
  const v = vendors.find((x) => x.id === 'V017');
  assert.ok(v.declaredUdyam, 'V017 declares a number');
  assert.equal(registrations.some((r) => r.udyam === v.declaredUdyam), false,
    'the declared number must not exist, or the case is not testing anything');
  assert.ok(registrations.some((r) => r.udyam === vendorTruth.V017.udyam));
});

test('truth registrations agree with the registry on activity and class', () => {
  for (const [vid, t] of Object.entries(vendorTruth)) {
    if (!t.udyam || t.coverage === 'unknown') continue;
    const reg = registrations.find((r) => r.udyam === t.udyam);
    if (t.activity === 'trading') {
      assert.ok(isTradeCode(reg.nic), `${vid}: truth says trading but NIC ${reg.nic} is not a trade code`);
    }
  }
});

test('every contract amendment supersedes a document that exists', () => {
  for (const d of contracts) {
    if (!d.supersedes) continue;
    assert.ok(contracts.some((x) => x.docId === d.supersedes), `${d.docId} supersedes missing ${d.supersedes}`);
  }
});

test('acceptance documents are not typed by meaning', () => {
  const allowed = new Set(['email', 'scanned_document', 'system_note']);
  for (const d of acceptanceDocuments) {
    assert.ok(allowed.has(d.medium), `${d.ref} has medium "${d.medium}"`);
    assert.equal('type' in d, false, `${d.ref} carries a type field -- that hands the model the answer`);
    assert.ok(d.body && d.body.length > 20, `${d.ref} has no readable body`);
  }
});

test('every live invoice has at least one acceptance document', () => {
  for (const inv of liveInvoices) {
    const docs = acceptanceDocuments.filter((d) => d.invoiceId === inv.id);
    assert.ok(docs.length > 0, `${inv.id} has no delivery trail`);
  }
});

test('the historical ledger is deterministic under the seed', () => {
  assert.equal(CORPUS_SEED, 20260904);
  assert.ok(historicalInvoices.length > 100, 'enough volume for an audit to mean something');
  for (const inv of historicalInvoices) {
    assert.ok(payouts[inv.id], `${inv.id} has no payout`);
    assert.ok(payouts[inv.id].date >= inv.acceptedOn, `${inv.id} paid before acceptance`);
  }
});

// ------------------------------------------------- date-dependent coverage

test('coverage is a function of the supply date, not of today', () => {
  // Girish reclassified small -> medium on 2026-01-15.
  assert.equal(coverageAt('V010', '2025-06-01'), 'covered');
  assert.equal(coverageAt('V010', '2026-02-01'), 'not_covered');
  // Suvarna's registration lapsed 2025-11-30.
  assert.equal(coverageAt('V009', '2025-09-10'), 'covered');
  assert.equal(coverageAt('V009', '2026-01-10'), 'not_covered');
});

test('the registry reports category and status as at a date', () => {
  const girish = registrations.find((r) => r.udyam === 'UDYAM-HR-06-0072244');
  assert.equal(classAt(girish, '2025-12-31'), 'small');
  assert.equal(classAt(girish, '2026-01-15'), 'medium');

  const suvarna = registrations.find((r) => r.udyam === 'UDYAM-TN-14-0290118');
  assert.equal(activeAt(suvarna, '2025-11-29'), true);
  assert.equal(activeAt(suvarna, '2025-12-01'), false);
});

test('both vendors with changing status carry real historical volume', () => {
  for (const vid of ['V009', 'V010']) {
    const runs = historicalInvoices.filter((i) => i.vendorId === vid);
    assert.ok(runs.length >= 10, `${vid} needs enough history for the error to compound`);
    const before = runs.filter((i) => coverageAt(vid, i.acceptedOn) === 'covered');
    const after = runs.filter((i) => coverageAt(vid, i.acceptedOn) !== 'covered');
    assert.ok(before.length > 0 && after.length > 0,
      `${vid} must straddle its status change, got ${before.length} before / ${after.length} after`);
  }
});

// ----------------------------------------- the corpus must defeat the naive

test('naive vendor matching gets the designed identity cases wrong', () => {
  const wrong = [];
  for (const v of vendors) {
    const truth = vendorTruth[v.id];
    const guess = naiveVendorMatch(v);
    const guessed = guess ? guess.udyam : null;
    if (guessed !== truth.udyam) wrong.push(v.id);
  }
  assert.ok(wrong.length > 0, 'if string matching resolves every vendor, the corpus is too easy');
});

test('the naive coverage check produces false positives on traders', () => {
  const falsePositives = vendors.filter((v) => {
    const truth = vendorTruth[v.id];
    return naiveCoverage(v) === 'covered' && truth.coverage === 'not_covered' && truth.activity === 'trading';
  });
  assert.ok(falsePositives.length >= 3,
    `expected several trader false positives, got ${falsePositives.length}`);
});

test('naive term extraction is defeated by amendments, words and decoys', () => {
  const cases = ['INV-4115', 'INV-4116', 'INV-4117'];
  const wrong = cases.filter((id) => {
    const inv = liveInvoices.find((i) => i.id === id);
    return naiveTermDays(inv) !== invoiceTruth[id].statedTermDays;
  });
  assert.ok(wrong.length >= 2,
    `expected the amendment/words/decoy cases to defeat regex, only ${wrong.length} did`);
});

test('naive clock-start is defeated by the rate objection and the implicit refusal', () => {
  for (const id of ['INV-4112', 'INV-4124']) {
    const naive = naiveClockStart(liveInvoices.find((i) => i.id === id));
    assert.notEqual(naive, invoiceTruth[id].clockStart,
      `${id}: naive matched the truth, so the case tests nothing`);
  }
});

test('corpus stats are reported', () => {
  const s = corpus.stats();
  assert.ok(s.vendors >= 24);
  assert.ok(s.designedCases >= 30);
  assert.ok(s.historicalInvoices > 100);
});
