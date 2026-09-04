// Turns the structured assessment into something a finance lead can act on in
// ten seconds -- ending with the rupee cost of missing the deadline.
//
// Every number handed to the model is already computed. The model writes prose
// around fixed figures; it is not allowed to derive any of them.

import { chat, llmAvailable, activeProvider } from './llm.js';
import { formatINR } from '../engine/dates.js';

const SYSTEM = `You write one-paragraph payment recommendations for a finance team, under Section 43B(h) of the Indian Income Tax Act.

You are given facts that have already been computed. Restate them; never recompute, adjust, or infer a date, a day count, or a rupee figure. Use the exact values given.

Write 3-5 sentences, plain and specific, in this order:
1. Who the vendor is and their MSME status.
2. The invoice, and when the statutory clock started -- say so explicitly if it started somewhere other than the invoice date, and why.
3. The deadline and what is or is not currently scheduled in RazorpayX.
4. The recommended action with the specific pay-by date.
5. Close with the money: what missing the deadline costs in extra tax this year.

No headings, no bullets, no preamble. Never say "definitely" or give a compliance verdict -- this is a risk indicator, not tax advice. If the item needs human review, say plainly what is unresolved instead of recommending a payment.`;

export async function explain(a) {
  const facts = factSheet(a);
  if (!llmAvailable()) return { text: template(a), mode: 'template' };

  try {
    const provider = activeProvider();
    const message = await chat({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: facts },
      ],
      maxTokens: 700,
      temperature: 0.2,
    });
    const text = String(message.content || '').trim();
    return text
      ? { text, mode: 'ai', model: `${provider.label} · ${provider.model}` }
      : { text: template(a), mode: 'template' };
  } catch (err) {
    console.warn('[explain] falling back to template:', err.message);
    return { text: template(a), mode: 'template', fallbackReason: err.message };
  }
}

function factSheet(a) {
  const f = a.finding;
  const lines = [
    `Vendor (our ledger): ${a.vendor.ledgerName}`,
    `Udyam match: ${f.vendorMatch.found ? `${f.vendorMatch.registeredName} (${f.vendorMatch.udyamNumber}), ${f.vendorMatch.enterpriseClass} enterprise, confidence ${f.vendorMatch.confidence}` : 'no registry match found'}`,
    `Section 43B(h) applies: ${a.covered ? 'yes' : 'no'}`,
    `Invoice: ${a.invoice.id}, ${formatINR(a.invoice.amount)}, dated ${a.invoice.invoiceDate} (${a.invoice.description})`,
    `Written agreement: ${f.agreement.exists ? `yes, ${f.agreement.documentRef}, states ${f.agreement.statedTermDays ?? 'no'} day term` : 'none on file'}`,
    `Agreement evidence: ${f.agreement.evidence}`,
    `Statutory clock starts: ${f.clockStart.date} (basis: ${f.clockStart.basis}) - ${f.clockStart.evidence}`,
    `Today: ${a.today}`,
  ];

  if (a.calc) {
    lines.push(`Allowed period applied by the deterministic engine: ${a.calc.allowedDays} days (rule: ${a.calc.rule})`);
    if (a.calc.capApplied) lines.push('NOTE: the contract stated a longer term than the statute allows, so the 45-day statutory ceiling was applied instead.');
    lines.push(`DEADLINE (computed, do not alter): ${a.calc.deadline}`);
    lines.push(`Days remaining: ${a.risk.daysLeft}`);
    lines.push(`Recommended pay-by date (deadline minus ${a.config.bufferDays}-day buffer): ${a.risk.payBy}`);
  }

  lines.push(`RazorpayX payout: ${a.payout ? `${a.payout.status} for ${a.payout.date} (${a.payout.payoutId})` : 'none scheduled'}`);
  lines.push(`Risk classification: ${a.risk.level.toUpperCase()} - ${a.risk.headline}`);
  lines.push(`Cost of missing the deadline (computed, do not alter): ${formatINR(a.exposure)} of extra tax this year, being the ${a.config.taxRatePct}% tax on a disallowed ${formatINR(a.invoice.amount)} deduction. Recoverable only in the year the payment is actually made.`);
  lines.push(`Execution route: ${a.autoExecutable ? `at or below the ${formatINR(a.config.autoExecuteThreshold)} auto-execute threshold` : 'above the auto-execute threshold, needs a human approval click'}`);

  if (f.needsHumanReview) lines.push(`UNRESOLVED: ${f.reviewReason}`);

  return lines.join('\n');
}

/** Deterministic fallback prose. Same facts, no model. */
function template(a) {
  const f = a.finding;
  const parts = [];

  if (!a.covered) {
    parts.push(f.vendorMatch.found
      ? `${a.vendor.ledgerName} matches ${f.vendorMatch.registeredName}, a ${f.vendorMatch.enterpriseClass} enterprise.`
      : `${a.vendor.ledgerName} could not be matched to any Udyam registration.`);
    parts.push(`Section 43B(h) covers micro and small enterprises only, so invoice ${a.invoice.id} for ${formatINR(a.invoice.amount)} carries no statutory payment deadline and no deduction risk. Pay on your normal commercial terms.`);
    return parts.join(' ');
  }

  parts.push(`${a.vendor.ledgerName} is ${f.vendorMatch.registeredName} (${f.vendorMatch.udyamNumber}), a Udyam-registered ${f.vendorMatch.enterpriseClass} enterprise, so Section 43B(h) applies.`);

  const clockNote = f.clockStart.basis === 'goods_accepted' ? 'when the goods were accepted'
    : f.clockStart.basis === 'rectified_goods_accepted' ? 'when the rectified consignment was accepted, not on the original delivery'
    : f.clockStart.basis === 'deemed_acceptance' ? 'on deemed acceptance, since no goods receipt note was ever raised'
    : 'on the invoice date, as no delivery record exists';
  parts.push(`Invoice ${a.invoice.id}, ${formatINR(a.invoice.amount)}, dated ${a.invoice.invoiceDate}; the statutory clock started on ${f.clockStart.date}, ${clockNote}.`);

  if (f.needsHumanReview) {
    parts.push(`This item is held for review: ${f.reviewReason} Resolve that before scheduling a payout.`);
  }

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
