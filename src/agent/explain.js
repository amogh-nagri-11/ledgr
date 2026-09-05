// Turns a structured assessment into something a finance lead can act on in
// ten seconds, ending with the rupee cost of missing the deadline.
//
// Every number handed to the model is already computed. It writes prose around
// fixed figures; it does not derive any of them.

import { chat, llmAvailable, activeProvider } from './llm.js';
import { formatINR } from '../engine/dates.js';

const SYSTEM = `You write one-paragraph payment recommendations for a finance team, under Section 43B(h) of the Indian Income Tax Act.

You are given facts that have already been computed. Restate them; never recompute, adjust or infer a date, a day count or a rupee figure. Use the exact values given.

Write 3-5 sentences, plain and specific, in this order:
1. Who the vendor is, and whether the section reaches them — including why not, if not.
2. The invoice, and when the statutory clock started; say so explicitly if it started somewhere other than the invoice date, and why.
3. The deadline and what is or is not currently scheduled in RazorpayX.
4. The recommended action with the specific pay-by date.
5. Close with the money: what missing the deadline costs in extra tax this year.

No headings, no bullets, no preamble. Never say "definitely" and never give a compliance verdict — this is a risk indicator, not tax advice. If the item is held for review, say plainly what is unresolved instead of recommending a payment.`;

export async function explain(a) {
  if (!llmAvailable()) return { text: template(a), mode: 'template' };
  try {
    const provider = activeProvider();
    const message = await chat({
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: factSheet(a) }],
      maxTokens: 700,
      temperature: 0.2,
    });
    const text = String(message.content || '').trim();
    return text ? { text, mode: 'ai', model: `${provider.label} · ${provider.model}` } : { text: template(a), mode: 'template' };
  } catch (err) {
    console.warn('[explain] falling back to template:', err.message);
    return { text: template(a), mode: 'template', fallbackReason: err.message };
  }
}

function factSheet(a) {
  const vf = a.vendorFinding || {};
  const f = a.finding;
  const lines = [
    `Vendor (our ledger): ${a.vendor.ledgerName}`,
    `Registry match: ${vf.registrationFound ? `${vf.registeredName} (${vf.udyam}), registered activity ${vf.registeredActivity}, identity confidence ${vf.identityConfidence}` : 'no registration resolved'}`,
    `What they actually do: ${vf.actualActivity || 'unknown'}`,
    `Coverage decision (by hardcoded rule, do not restate as your own judgement): ${a.coverage ? a.coverage.result : 'unknown'} — ${a.coverage ? a.coverage.reasonCode : ''}`,
    ...(a.coverage ? a.coverage.workings.map((w) => `  rule: ${w}`) : []),
    `Invoice: ${a.invoice.id}, ${formatINR(a.invoice.amount)}, dated ${a.invoice.invoiceDate} (${a.invoice.description})`,
    `Nature of this supply: ${f.supplyNature}`,
    `Written agreement: ${f.agreement.exists ? `yes, ${f.agreement.governingDocument}, states ${f.agreement.statedTermDays ?? 'no'} day term` : 'none on file'}`,
    `Agreement evidence: ${f.agreement.evidence}`,
    `Statutory clock starts: ${f.clockStart.date} (basis: ${f.clockStart.basis}) — ${f.clockStart.evidence}`,
    `Today: ${a.today}`,
  ];

  if (a.calc) {
    lines.push(`Allowed period applied by the engine: ${a.calc.allowedDays} days (rule: ${a.calc.rule})`);
    if (a.calc.capApplied) lines.push('NOTE: the contract stated a longer term than the statute allows, so the 45-day ceiling was applied.');
    lines.push(`DEADLINE (computed, do not alter): ${a.calc.deadline}`);
    lines.push(`Days remaining: ${a.risk.daysLeft}`);
    lines.push(`Recommended pay-by (deadline minus ${a.config.bufferDays}-day buffer): ${a.risk.payBy}`);
  }

  lines.push(`RazorpayX payout: ${a.payout ? `${a.payout.status} for ${a.payout.date} (${a.payout.payoutId})` : 'none scheduled'}`);
  lines.push(`Risk: ${a.risk.level.toUpperCase()} — ${a.risk.headline}`);
  if (a.covered) {
    lines.push(`Cost of missing the deadline (computed, do not alter): ${formatINR(a.exposure)} of extra tax this year, being ${a.config.taxRatePct}% on a disallowed ${formatINR(a.invoice.amount)} deduction. Recoverable only in the year of payment.`);
  }
  lines.push(`Execution route: ${a.autoExecutable ? `at or below the ${formatINR(a.config.autoExecuteThreshold)} auto-execute threshold` : 'above the threshold, needs a human approval click'}`);
  if (f.needsHumanReview) lines.push(`UNRESOLVED: ${f.reviewReason}`);
  return lines.join('\n');
}

/** Deterministic fallback prose. Same facts, no model. */
function template(a) {
  const vf = a.vendorFinding || {};
  const f = a.finding;
  const parts = [];

  if (!a.covered) {
    const why = a.coverage ? a.coverage.workings[a.coverage.workings.length - 1] : '';
    parts.push(vf.registrationFound
      ? `${a.vendor.ledgerName} is ${vf.registeredName} (${vf.udyam}).`
      : `${a.vendor.ledgerName} could not be matched to any Udyam registration.`);
    parts.push(why);
    parts.push(a.coverage && a.coverage.result === 'unknown'
      ? `Invoice ${a.invoice.id} for ${formatINR(a.invoice.amount)} is held for review rather than assumed out of scope.`
      : `Invoice ${a.invoice.id} for ${formatINR(a.invoice.amount)} therefore carries no statutory deadline. Pay on normal commercial terms.`);
    return parts.join(' ');
  }

  parts.push(`${a.vendor.ledgerName} is ${vf.registeredName} (${vf.udyam}), a ${vf.enterpriseClass || 'micro or small'} enterprise, and the rule finds this supply in scope.`);

  const note = f.clockStart.basis === 'goods_accepted' ? 'when the goods were accepted'
    : f.clockStart.basis === 'rectified_goods_accepted' ? 'when the rectified consignment was accepted, not on the original delivery'
      : f.clockStart.basis === 'deemed_acceptance' ? 'on deemed acceptance, since no goods receipt note was ever raised'
        : 'on the invoice date, as no delivery record exists';
  parts.push(`Invoice ${a.invoice.id}, ${formatINR(a.invoice.amount)}, dated ${a.invoice.invoiceDate}; the statutory clock started on ${f.clockStart.date}, ${note}.`);

  if (f.needsHumanReview) parts.push(`Held for review: ${f.reviewReason}`);

  if (a.calc) {
    parts.push(a.calc.capApplied
      ? `The agreement states a ${f.agreement.statedTermDays}-day term, but a contractual term cannot override the 45-day statutory ceiling, so the deadline is ${a.calc.deadline}.`
      : `${a.calc.allowedDays}-day period applies, giving a deadline of ${a.calc.deadline}.`);
  }

  parts.push(a.payout
    ? `RazorpayX shows a payout ${a.payout.status} for ${a.payout.date}.`
    : 'No payout is currently scheduled in RazorpayX.');

  if (!f.needsHumanReview && a.calc) {
    parts.push(a.risk.daysLeft < 0
      ? `The deadline passed ${Math.abs(a.risk.daysLeft)} day(s) ago; pay immediately to restore the deduction in the year of payment.`
      : `Recommend paying by ${a.risk.payBy} to keep a ${a.config.bufferDays}-day buffer.`);
  }

  parts.push(`Missing this deadline forfeits the ${formatINR(a.invoice.amount)} deduction this year, an estimated ${formatINR(a.exposure)} of extra tax at ${a.config.taxRatePct}%.`);
  return parts.join(' ');
}
