// ---------------------------------------------------------------------------
// RISK CLASSIFICATION -- also deterministic.
// Ties the statutory deadline to actual money movement in RazorpayX.
// ---------------------------------------------------------------------------

import { addDays, daysBetween } from './dates.js';

export const RISK = {
  RED: 'red',       // breach imminent or already occurred
  AMBER: 'amber',   // schedule with buffer
  GREEN: 'green',   // no action
  GREY: 'grey',     // ambiguous, needs human review
};

/**
 * @param {object} p
 * @param {string}  p.today
 * @param {string}  p.deadline
 * @param {boolean} p.covered           s.43B(h) applies to this vendor
 * @param {boolean} p.needsReview       AI could not resolve inputs confidently
 * @param {object|null} p.payout        {status:'scheduled'|'processed'|'failed', date:'YYYY-MM-DD'}
 * @param {object}  p.config            {bufferDays, redWindowDays, amberWindowDays}
 */
export function classify({ today, deadline, covered, needsReview, payout, config }) {
  const { bufferDays, redWindowDays, amberWindowDays } = config;

  if (!covered) {
    // No statutory clock exists, so there is no deadline to report.
    return { deadline: null, payBy: null, daysLeft: null, level: RISK.GREEN,
      reasonCode: 'not_covered', headline: 'Section 43B(h) does not apply to this vendor.' };
  }

  const payBy = addDays(deadline, -bufferDays);
  const daysLeft = daysBetween(today, deadline);
  const base = { deadline, payBy, daysLeft };

  if (needsReview) {
    return { ...base, level: RISK.GREY, reasonCode: 'needs_review',
      headline: 'Inputs could not be resolved with confidence \u2014 human review required.' };
  }

  if (payout && payout.status === 'processed') {
    const slack = daysBetween(payout.date, deadline);
    return slack >= 0
      ? { ...base, level: RISK.GREEN, reasonCode: 'settled_in_time',
          headline: `Paid ${payout.date}, ${slack} day(s) inside the deadline. Compliance item closed.` }
      : { ...base, level: RISK.RED, reasonCode: 'breached',
          headline: `Paid ${payout.date}, ${Math.abs(slack)} day(s) after the deadline. Deduction is at risk for this year.` };
  }

  if (payout && payout.status === 'scheduled') {
    const slack = daysBetween(payout.date, deadline);
    if (slack < 0) {
      return { ...base, level: RISK.RED, reasonCode: 'scheduled_too_late',
        headline: `Payout scheduled ${payout.date} \u2014 ${Math.abs(slack)} day(s) past the deadline. Reschedule.` };
    }
    if (slack < bufferDays) {
      return { ...base, level: RISK.AMBER, reasonCode: 'scheduled_thin_buffer',
        headline: `Payout scheduled ${payout.date}, only ${slack} day(s) of buffer before the deadline.` };
    }
    return { ...base, level: RISK.GREEN, reasonCode: 'scheduled_covered',
      headline: `Payout scheduled ${payout.date}, ${slack} day(s) ahead of the deadline.` };
  }

  if (daysLeft < 0) {
    return { ...base, level: RISK.RED, reasonCode: 'breached',
      headline: `Deadline passed ${Math.abs(daysLeft)} day(s) ago with no payout. Deduction forfeited for this year unless paid.` };
  }
  if (daysLeft <= redWindowDays) {
    return { ...base, level: RISK.RED, reasonCode: 'breach_imminent',
      headline: `${daysLeft} day(s) to the deadline and no payout in motion.` };
  }
  if (daysLeft <= amberWindowDays) {
    return { ...base, level: RISK.AMBER, reasonCode: 'schedule_now',
      headline: `${daysLeft} day(s) to the deadline. Schedule a payout to keep the buffer.` };
  }
  return { ...base, level: RISK.GREEN, reasonCode: 'monitoring',
    headline: `${daysLeft} day(s) to the deadline. No action needed yet.` };
}

/** Sort order for the action queue: worst first. */
const ORDER = { [RISK.RED]: 0, [RISK.GREY]: 1, [RISK.AMBER]: 2, [RISK.GREEN]: 3 };

export function rankAssessments(list) {
  return [...list].sort((a, b) => {
    const byLevel = ORDER[a.risk.level] - ORDER[b.risk.level];
    if (byLevel !== 0) return byLevel;
    const da = a.risk.daysLeft ?? Number.MAX_SAFE_INTEGER;
    const db = b.risk.daysLeft ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return b.invoice.amount - a.invoice.amount;   // bigger exposure first
  });
}
