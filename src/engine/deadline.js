// ---------------------------------------------------------------------------
// DETERMINISTIC DEADLINE ENGINE
//
// This is the "deliberately dumb" layer. No LLM touches it. It takes already-
// extracted, evidenced inputs and applies Section 43B(h) / MSMED s.15 as
// hardcoded arithmetic. If the AI hallucinates, it hallucinates an *input*,
// which is visible in the evidence chain -- it can never hallucinate a date.
// ---------------------------------------------------------------------------

import { addDays, daysBetween } from './dates.js';

export const STATUTORY_CAP_DAYS = 45;      // max enforceable term when a written agreement exists
export const STATUTORY_DEFAULT_DAYS = 15;  // when there is no written agreement (or no term stated)

/** Enterprise classes to which s.43B(h) attaches. Medium enterprises are excluded. */
export const COVERED_CLASSES = ['micro', 'small'];

/**
 * @param {object} input
 * @param {string}  input.clockStartDate      ISO date the statutory clock starts from
 * @param {boolean} input.hasWrittenAgreement
 * @param {number|null} input.agreedTermDays  term stated in the agreement, if any
 * @returns {{deadline: string, allowedDays: number, rule: string, capApplied: boolean, workings: string[]}}
 */
export function computeDeadline({ clockStartDate, hasWrittenAgreement, agreedTermDays }) {
  const workings = [];
  let allowedDays;
  let rule;
  let capApplied = false;

  if (!hasWrittenAgreement) {
    allowedDays = STATUTORY_DEFAULT_DAYS;
    rule = 'no_written_agreement';
    workings.push(`No written agreement on file \u2192 statutory default of ${STATUTORY_DEFAULT_DAYS} days applies.`);
  } else if (agreedTermDays == null) {
    allowedDays = STATUTORY_DEFAULT_DAYS;
    rule = 'agreement_without_term';
    workings.push(`Written agreement exists but states no payment term \u2192 falls back to ${STATUTORY_DEFAULT_DAYS} days.`);
  } else if (agreedTermDays > STATUTORY_CAP_DAYS) {
    allowedDays = STATUTORY_CAP_DAYS;
    rule = 'agreement_capped_at_45';
    capApplied = true;
    workings.push(`Agreement states ${agreedTermDays} days, which exceeds the statutory ceiling \u2192 capped at ${STATUTORY_CAP_DAYS} days. A contractual term cannot override s.15 MSMED.`);
  } else {
    allowedDays = agreedTermDays;
    rule = 'agreement_term';
    workings.push(`Written agreement states ${agreedTermDays} days, within the ${STATUTORY_CAP_DAYS}-day ceiling \u2192 ${agreedTermDays} days applies.`);
  }

  const deadline = addDays(clockStartDate, allowedDays);
  workings.push(`Clock starts ${clockStartDate} + ${allowedDays} days \u2192 deadline ${deadline}.`);

  return { deadline, allowedDays, rule, capApplied, workings };
}

/**
 * Rupee cost of missing the deadline: the expense is disallowed this year, so
 * tax is paid on it at the applicable rate. Recoverable in the year of payment.
 */
export function disallowanceCost(amount, taxRatePct) {
  return Math.round(amount * (taxRatePct / 100));
}

/** Is s.43B(h) engaged at all for this vendor? */
export function isCovered(enterpriseClass, registrationActive) {
  return Boolean(registrationActive) && COVERED_CLASSES.includes(String(enterpriseClass || '').toLowerCase());
}

export function daysRemaining(todayISO, deadlineISO) {
  return daysBetween(todayISO, deadlineISO);
}
