// The pipeline.
//
//   portfolio agent  -> evidence about the vendor
//   COVERAGE RULE    -> does s.43B(h) engage        (hardcoded)
//   invoice agent    -> evidence about this supply
//   DEADLINE ENGINE  -> the statutory date          (hardcoded)
//   RISK             -> against the actual payout   (hardcoded)
//
// Both model outputs are inputs. Every determination below is arithmetic.

import * as store from './store.js';
import { computeDeadline, disallowanceCost } from './engine/deadline.js';
import { decideCoverage, RESULT } from './engine/coverage.js';
import { classify, rankAssessments, RISK } from './engine/risk.js';
import { today } from './engine/dates.js';
import { classifyVendor } from './agent/portfolio.js';
import { resolveInvoice } from './agent/invoice.js';
import { explain } from './agent/explain.js';

const concurrency = () => Math.max(1, Number(process.env.LLM_CONCURRENCY) || 2);

/** Run a bounded-concurrency map. Free tiers meter per minute. */
async function pool(items, worker) {
  const limit = Math.min(concurrency(), items.length);
  const out = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, run));
  return out;
}

// ---------------------------------------------------------------------------
// Phase 1 -- the portfolio sweep
// ---------------------------------------------------------------------------

export async function sweepVendor(vendor, opts = {}) {
  const finding = await classifyVendor(vendor, opts);
  store.setVendorFinding(vendor.id, finding);
  return finding;
}

/**
 * Sweep the vendor master.
 *
 * `refresh: false` re-attempts anything that has NOT been resolved by the AI
 * arm -- vendors with no finding at all, and vendors whose finding came from
 * the heuristic fallback because the provider was rate-limited. Free tiers
 * meter per minute, so a full AI sweep often cannot complete in one pass;
 * running it a few times accumulates real coverage instead of freezing the
 * first pass's failures in place.
 */
export async function sweepPortfolio({ refresh = false, forceHeuristic = false, onProgress } = {}) {
  const vendors = store.getVendors();
  const unresolved = (v) => {
    const f = store.getVendorFinding(v.id);
    if (!f) return true;
    return !forceHeuristic && f.mode === 'heuristic_fallback';
  };
  const todo = refresh ? vendors : vendors.filter(unresolved);
  let done = 0;
  await pool(todo, async (v) => {
    await sweepVendor(v, { forceHeuristic });
    done += 1;
    if (onProgress) onProgress(done, todo.length, v.id);
  });
  return vendors.map((v) => ({ vendor: v, finding: store.getVendorFinding(v.id) }));
}

/** Coverage for one vendor as at a date. Rule over agent evidence. */
export function coverageFor(vendorId, asOfDate, supplyNature = 'unknown') {
  const finding = store.getVendorFinding(vendorId);
  if (!finding) return null;
  const config = store.getConfig();

  // The cached finding was resolved as at some date; re-derive class/status for
  // this supply date from the registration it identified.
  const dated = datedStatus(finding, asOfDate);

  // Did this come from the invoice agent reading THIS supply, or is it a
  // vendor-level inference about what the firm generally does? The rule needs
  // to know, because it will not exclude a covered vendor on a guess.
  const supplyEvidenced = supplyNature !== 'unknown';

  return decideCoverage({
    registrationFound: finding.registrationFound,
    enterpriseClass: dated.enterpriseClass,
    registrationActive: dated.registrationActive,
    registeredActivity: finding.registeredActivity,
    supplyNature: supplyEvidenced ? supplyNature : natureFromActivity(finding.actualActivity),
    supplyEvidenced,
    identityConfidence: finding.identityConfidence,
    confidenceFloor: config.identityConfidenceFloor,
  });
}

function natureFromActivity(actual) {
  if (actual === 'manufacturing') return 'manufactured';
  if (actual === 'service') return 'service';
  if (actual === 'trading') return 'resale';
  return 'unknown';
}

/**
 * Re-derive category and live status as at a supply date, from the registry
 * entry the agent identified. The agent reports as-at-one-date; coverage has
 * to be judged at every supply date, so this is the deterministic bridge.
 */
import { registrations, classAt, activeAt } from './corpus/registry.js';

export function datedStatus(finding, asOfDate) {
  if (!finding.registrationFound || !finding.udyam) {
    return { enterpriseClass: null, registrationActive: false };
  }
  const reg = registrations.find((r) => r.udyam === finding.udyam);
  if (!reg) return { enterpriseClass: finding.enterpriseClass, registrationActive: finding.registrationActive };
  return { enterpriseClass: classAt(reg, asOfDate), registrationActive: activeAt(reg, asOfDate) };
}

// ---------------------------------------------------------------------------
// Phase 2 -- per-invoice assessment
// ---------------------------------------------------------------------------

export async function assessInvoice(invoice, { refresh = false, forceHeuristic = false } = {}) {
  const vendor = store.getVendor(invoice.vendorId);

  if (!store.getVendorFinding(vendor.id)) {
    await sweepVendor(vendor, { forceHeuristic });
  }

  let finding = store.getInvoiceFinding(invoice.id);
  if (!finding || refresh) {
    finding = await resolveInvoice(invoice, vendor, { forceHeuristic });
    store.setInvoiceFinding(invoice.id, finding);
  }

  return buildAssessment(invoice, vendor, finding);
}

/** Pure. No I/O, no model calls. */
export function buildAssessment(invoice, vendor, finding) {
  const config = store.getConfig();
  const t = today();
  const payout = store.getPayout(invoice.id);
  const vendorFinding = store.getVendorFinding(vendor.id);

  const supplyDate = finding.clockStart?.date || invoice.invoiceDate;
  const coverage = coverageFor(vendor.id, supplyDate, finding.supplyNature);
  const covered = coverage ? coverage.result === RESULT.COVERED : false;
  const coverageUnknown = coverage ? coverage.result === RESULT.UNKNOWN : true;

  let calc = null;
  if (covered && finding.clockStart?.date) {
    calc = computeDeadline({
      clockStartDate: finding.clockStart.date,
      hasWrittenAgreement: finding.agreement.exists,
      agreedTermDays: finding.agreement.statedTermDays,
    });
  }

  const needsReview = Boolean(finding.needsHumanReview) || coverageUnknown;

  const risk = classify({
    today: t,
    deadline: calc ? calc.deadline : null,
    covered: covered && Boolean(calc),
    needsReview,
    payout,
    config,
  });

  const exposure = covered ? disallowanceCost(invoice.amount, config.taxRatePct) : 0;
  const autoExecutable = invoice.amount <= config.autoExecuteThreshold;

  return {
    invoice,
    vendor,
    vendorFinding,
    finding,
    coverage,
    covered,
    calc,
    risk,
    payout,
    exposure,
    autoExecutable,
    needsApproval: !autoExecutable,
    actionable: [RISK.RED, RISK.AMBER].includes(risk.level) && !payout && !needsReview,
    config: {
      taxRatePct: config.taxRatePct,
      bufferDays: config.bufferDays,
      autoExecuteThreshold: config.autoExecuteThreshold,
    },
    today: t,
  };
}

export async function assessLiveLedger(opts = {}) {
  const invoices = store.getLiveInvoices();
  const results = await pool(invoices, (inv) => assessInvoice(inv, opts));
  return rankAssessments(results);
}

export function assessLiveCached() {
  const results = store.getLiveInvoices().map((inv) => {
    const finding = store.getInvoiceFinding(inv.id);
    if (!finding) return null;
    const vendor = store.getVendor(inv.vendorId);
    if (!store.getVendorFinding(vendor.id)) return null;
    return buildAssessment(inv, vendor, finding);
  }).filter(Boolean);
  return rankAssessments(results);
}

export async function withExplanation(assessment) {
  return { ...assessment, recommendation: await explain(assessment) };
}

export function portfolioSummary(assessments) {
  const byLevel = { red: 0, amber: 0, green: 0, grey: 0 };
  let atRisk = 0;
  let exposure = 0;
  for (const a of assessments) {
    byLevel[a.risk.level] += 1;
    if (a.risk.level === RISK.RED || a.risk.level === RISK.AMBER) {
      atRisk += a.invoice.amount;
      exposure += a.exposure;
    }
  }
  return { byLevel, atRisk, exposure, count: assessments.length };
}
