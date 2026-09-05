// Scoring, shared by the report and the tests.
//
// One place that decides what "correct" means, so the ablation cannot quietly
// grade the two arms on different criteria. Every function here takes a
// prediction and returns per-case results against src/corpus/truth.js.

import { vendorTruth, invoiceTruth, coverageAt } from './truth.js';
import { vendors } from './vendors.js';
import { liveInvoices, historicalInvoices } from './ledger.js';

export const COVERAGE = { COVERED: 'covered', NOT_COVERED: 'not_covered', UNKNOWN: 'unknown' };

/** Was this vendor case designed to defeat a non-AI approach? */
export const isDesigned = (id) => {
  const t = vendorTruth[id] || invoiceTruth[id];
  return Boolean(t && (t.tests || []).some((x) => !x.startsWith('control')));
};

/**
 * Score one arm's vendor predictions.
 * @param {(vendorId: string) => {udyam: string|null, coverage: string}} predict
 */
export function scoreVendors(predict) {
  const rows = [];
  for (const v of vendors) {
    const truth = vendorTruth[v.id];
    let got;
    try {
      got = predict(v.id);
    } catch (err) {
      got = { udyam: null, coverage: COVERAGE.UNKNOWN, error: err.message };
    }

    const identityOk = (got.udyam || null) === truth.udyam;
    const coverageOk = got.coverage === truth.coverage;

    // An error that escalates is not the same as an error that decides wrongly.
    // Excluding a covered vendor silently drops a real deduction; including an
    // excluded one burns working capital. Escalating does neither.
    let severity = 'ok';
    if (!coverageOk) {
      if (got.coverage === COVERAGE.UNKNOWN) severity = 'escalated';
      else if (truth.coverage === COVERAGE.COVERED) severity = 'false_negative';
      else if (truth.coverage === COVERAGE.NOT_COVERED) severity = 'false_positive';
      else severity = 'wrong';
    }

    rows.push({
      id: v.id,
      name: v.ledgerName,
      designed: isDesigned(v.id),
      identityOk,
      coverageOk,
      severity,
      gotUdyam: got.udyam || null,
      wantUdyam: truth.udyam,
      gotCoverage: got.coverage,
      wantCoverage: truth.coverage,
      why: truth.reason || '',
      error: got.error || null,
    });
  }
  return rows;
}

/**
 * Score one arm's live-invoice predictions.
 * @param {(invoiceId: string) => {clockStart: string|null, statedTermDays: number|null, coverage: string}} predict
 */
export function scoreInvoices(predict) {
  const rows = [];
  for (const inv of liveInvoices) {
    const truth = invoiceTruth[inv.id];
    if (!truth) continue;
    let got;
    try {
      got = predict(inv.id);
    } catch (err) {
      got = { clockStart: null, statedTermDays: null, coverage: COVERAGE.UNKNOWN, error: err.message };
    }

    const wantCoverage = truth.covered === true ? COVERAGE.COVERED
      : truth.covered === false ? COVERAGE.NOT_COVERED : COVERAGE.UNKNOWN;

    // Clock start and term only apply where the supply is in scope at all.
    const clockApplies = Boolean(truth.clockStart);
    const termApplies = truth.statedTermDays !== undefined;

    const clockOk = !clockApplies || got.clockStart === truth.clockStart;
    const termOk = !termApplies || got.statedTermDays === truth.statedTermDays;
    const coverageOk = got.coverage === wantCoverage;

    rows.push({
      id: inv.id,
      vendorId: inv.vendorId,
      designed: isDesigned(inv.id),
      clockOk,
      termOk,
      coverageOk,
      allOk: clockOk && termOk && coverageOk,
      gotClock: got.clockStart,
      wantClock: clockApplies ? truth.clockStart : null,
      gotTerm: got.statedTermDays,
      wantTerm: termApplies ? truth.statedTermDays : null,
      gotCoverage: got.coverage,
      wantCoverage,
      test: (truth.tests || []).find((t) => !t.startsWith('control')) || '',
      error: got.error || null,
    });
  }
  return rows;
}

/**
 * Score coverage across the historical ledger, judged as at each supply date.
 * This is where a "classify once by today's status" approach compounds.
 */
export function scoreHistorical(predictCoverageAt) {
  let wrong = 0;
  let wrongValue = 0;
  const byVendor = new Map();
  for (const inv of historicalInvoices) {
    const want = coverageAt(inv.vendorId, inv.acceptedOn);
    let got;
    try {
      got = predictCoverageAt(inv.vendorId, inv.acceptedOn);
    } catch {
      got = COVERAGE.UNKNOWN;
    }
    if (got !== want) {
      wrong += 1;
      wrongValue += inv.amount;
      const row = byVendor.get(inv.vendorId) || { n: 0, value: 0 };
      row.n += 1;
      row.value += inv.amount;
      byVendor.set(inv.vendorId, row);
    }
  }
  return { wrong, wrongValue, total: historicalInvoices.length, byVendor };
}

export function tally(rows, key) {
  return rows.reduce((n, r) => n + (r[key] ? 1 : 0), 0);
}

/** Value of payments touched by a set of vendor ids. */
export function paymentsFor(ids) {
  const set = new Set(ids);
  return [...liveInvoices, ...historicalInvoices]
    .filter((i) => set.has(i.vendorId))
    .reduce((s, i) => s + i.amount, 0);
}
