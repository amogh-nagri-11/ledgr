// The pipeline: AI finding -> deterministic deadline -> risk -> recommendation.
// The split matters. Everything the model produced is an *input*; every date
// below is arithmetic.

import * as store from './store.js';
import { computeDeadline, disallowanceCost, isCovered } from './engine/deadline.js';
import { classify, rankAssessments, RISK } from './engine/risk.js';
import { today } from './engine/dates.js';
import { resolveInvoice } from './agent/resolve.js';
import { explain } from './agent/explain.js';

/** Run (or reuse) the agent finding for one invoice, then price and classify it. */
export async function assessInvoice(invoice, { refresh = false, forceHeuristic = false } = {}) {
  const vendor = store.getVendor(invoice.vendorId);
  let finding = store.getFinding(invoice.id);

  if (!finding || refresh) {
    finding = await resolveInvoice(invoice, vendor, { forceHeuristic });
    store.setFinding(invoice.id, finding);
  }

  return buildAssessment(invoice, vendor, finding);
}

/** Pure: given a finding, produce the assessment. No I/O, no model calls. */
export function buildAssessment(invoice, vendor, finding) {
  const config = store.getConfig();
  const t = today();
  const payout = store.getPayout(invoice.id);

  const covered = finding.vendorMatch.found
    && isCovered(finding.vendorMatch.enterpriseClass, finding.vendorMatch.registrationActive);

  let calc = null;
  if (covered && finding.clockStart.date) {
    calc = computeDeadline({
      clockStartDate: finding.clockStart.date,
      hasWrittenAgreement: finding.agreement.exists,
      agreedTermDays: finding.agreement.statedTermDays,
    });
  }

  const risk = classify({
    today: t,
    deadline: calc ? calc.deadline : null,
    covered: covered && Boolean(calc),
    needsReview: finding.needsHumanReview,
    payout,
    config,
  });

  const exposure = covered ? disallowanceCost(invoice.amount, config.taxRatePct) : 0;
  const autoExecutable = invoice.amount <= config.autoExecuteThreshold;

  return {
    invoice,
    vendor,
    finding,
    covered,
    calc,
    risk,
    payout,
    exposure,
    autoExecutable,
    needsApproval: !autoExecutable,
    actionable: [RISK.RED, RISK.AMBER].includes(risk.level) && !payout,
    config: { taxRatePct: config.taxRatePct, bufferDays: config.bufferDays, autoExecuteThreshold: config.autoExecuteThreshold },
    today: t,
  };
}

/**
 * Assess the whole ledger. Invoices are independent, but each one is a whole
 * agentic loop -- firing them all at once is ~5 requests x N invoices in the
 * same second, which instantly trips a free-tier per-minute quota. Cap the
 * concurrency instead. Raise LLM_CONCURRENCY on a paid key.
 */
export async function assessAll(opts = {}) {
  const invoices = store.getInvoices();
  const limit = Math.max(1, Number(process.env.LLM_CONCURRENCY) || 2);
  const results = new Array(invoices.length);
  let next = 0;

  const worker = async () => {
    while (next < invoices.length) {
      const i = next;
      next += 1;
      results[i] = await assessInvoice(invoices[i], opts);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, invoices.length) }, worker));
  return rankAssessments(results);
}

/** Rebuild every assessment from cached findings -- cheap, no model calls. */
export function assessAllCached() {
  const results = store.getInvoices().map((inv) => {
    const finding = store.getFinding(inv.id);
    if (!finding) return null;
    return buildAssessment(inv, store.getVendor(inv.vendorId), finding);
  }).filter(Boolean);
  return rankAssessments(results);
}

/** Attach the readable rationale. Separate call so the queue renders instantly. */
export async function withExplanation(assessment) {
  const recommendation = await explain(assessment);
  return { ...assessment, recommendation };
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
