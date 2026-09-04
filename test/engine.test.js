import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDeadline, disallowanceCost, isCovered } from '../src/engine/deadline.js';
import { classify, RISK } from '../src/engine/risk.js';
import { addDays } from '../src/engine/dates.js';

const CFG = { bufferDays: 3, redWindowDays: 7, amberWindowDays: 21 };

test('written agreement inside the cap uses the agreed term', () => {
  const r = computeDeadline({ clockStartDate: '2026-03-01', hasWrittenAgreement: true, agreedTermDays: 45 });
  assert.equal(r.deadline, '2026-04-15');
  assert.equal(r.allowedDays, 45);
  assert.equal(r.capApplied, false);
});

test('no written agreement falls to 15 days', () => {
  const r = computeDeadline({ clockStartDate: '2026-03-01', hasWrittenAgreement: false, agreedTermDays: null });
  assert.equal(r.deadline, '2026-03-16');
  assert.equal(r.rule, 'no_written_agreement');
});

test('a 60-day contractual term is capped at the statutory 45', () => {
  const r = computeDeadline({ clockStartDate: '2026-03-01', hasWrittenAgreement: true, agreedTermDays: 60 });
  assert.equal(r.allowedDays, 45);
  assert.equal(r.capApplied, true);
  assert.equal(r.deadline, '2026-04-15');
});

test('an agreement with no stated term falls to 15 days', () => {
  const r = computeDeadline({ clockStartDate: '2026-03-01', hasWrittenAgreement: true, agreedTermDays: null });
  assert.equal(r.allowedDays, 15);
});

test('medium enterprises and inactive registrations are out of scope', () => {
  assert.equal(isCovered('micro', true), true);
  assert.equal(isCovered('small', true), true);
  assert.equal(isCovered('medium', true), false);
  assert.equal(isCovered('micro', false), false);
});

test('disallowance cost is the tax on the forfeited deduction', () => {
  assert.equal(disallowanceCost(500000, 25), 125000);
});

test('uncovered vendors are green with no deadline', () => {
  const r = classify({ today: '2026-04-10', deadline: null, covered: false, needsReview: false, payout: null, config: CFG });
  assert.equal(r.level, RISK.GREEN);
  assert.equal(r.deadline, null);
});

test('five days out with no payout is red', () => {
  const r = classify({ today: '2026-04-10', deadline: '2026-04-15', covered: true, needsReview: false, payout: null, config: CFG });
  assert.equal(r.level, RISK.RED);
  assert.equal(r.daysLeft, 5);
  assert.equal(r.payBy, '2026-04-12');
});

test('a payout scheduled well ahead of the deadline is green', () => {
  const r = classify({ today: '2026-04-01', deadline: '2026-04-15', covered: true, needsReview: false,
    payout: { status: 'scheduled', date: '2026-04-05' }, config: CFG });
  assert.equal(r.level, RISK.GREEN);
});

test('a payout scheduled past the deadline is red even though money is in motion', () => {
  const r = classify({ today: '2026-04-01', deadline: '2026-04-15', covered: true, needsReview: false,
    payout: { status: 'scheduled', date: '2026-04-20' }, config: CFG });
  assert.equal(r.level, RISK.RED);
  assert.equal(r.reasonCode, 'scheduled_too_late');
});

test('a payout scheduled inside the buffer is amber', () => {
  const r = classify({ today: '2026-04-01', deadline: '2026-04-15', covered: true, needsReview: false,
    payout: { status: 'scheduled', date: '2026-04-14' }, config: CFG });
  assert.equal(r.level, RISK.AMBER);
});

test('paid late is a recorded breach', () => {
  const r = classify({ today: '2026-05-01', deadline: '2026-04-15', covered: true, needsReview: false,
    payout: { status: 'processed', date: '2026-04-20' }, config: CFG });
  assert.equal(r.level, RISK.RED);
  assert.equal(r.reasonCode, 'breached');
});

test('unresolved inputs go grey, never green', () => {
  const r = classify({ today: '2026-04-01', deadline: '2026-04-15', covered: true, needsReview: true, payout: null, config: CFG });
  assert.equal(r.level, RISK.GREY);
});

test('the deadline is unaffected by the configurable buffer', () => {
  const base = computeDeadline({ clockStartDate: '2026-03-01', hasWrittenAgreement: true, agreedTermDays: 45 });
  for (const bufferDays of [0, 3, 10]) {
    const r = classify({ today: '2026-04-01', deadline: base.deadline, covered: true, needsReview: false,
      payout: null, config: { ...CFG, bufferDays } });
    assert.equal(r.deadline, '2026-04-15');
    assert.equal(r.payBy, addDays('2026-04-15', -bufferDays));
  }
});
