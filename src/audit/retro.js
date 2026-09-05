// ---------------------------------------------------------------------------
// RETROACTIVE EXPOSURE AUDIT
//
// Reconstructs which of last year's payments already breached s.43B(h), by
// judging every historical supply against the vendor's status AS AT THAT DATE
// and comparing the statutory deadline to when the money actually moved.
//
// Two disciplines are load-bearing here:
//
//   1. Coverage is re-derived per supply date. A vendor reclassified to medium
//      in January was covered in December. Applying today's status to last
//      year's ledger is the single largest source of error in the ablation.
//
//   2. The result is NEVER a single number. It is decomposed by confidence, so
//      the part that rests on an uncertain classification is visible. A total
//      that hides fourteen shaky vendor matches is indefensible the moment
//      someone asks how it was arrived at.
//
// The exposure figure is a property of a synthetic ledger. See PROVENANCE.md.
// ---------------------------------------------------------------------------

import * as store from '../store.js';
import { computeDeadline, disallowanceCost } from '../engine/deadline.js';
import { RESULT } from '../engine/coverage.js';
import { daysBetween } from '../engine/dates.js';
import { coverageFor } from '../assess.js';
import { contractsForVendor, FINANCIAL_YEAR } from '../corpus/index.js';

const TERM_PATTERNS = [
  /within\s+[a-z-\s]*\((\d{1,3})\)\s*days/i,
  /net\s*(\d{1,3})\s*(?:days?)?/i,
  /(\d{1,3})\s*days?\s+from/i,
];
const PAYMENT_LINE = /\b(payment|pay\b|net\s*\d|payable|remit)/i;
const NOT_TERM_LINE = /\b(objection|reject|dispute|withhold|retention|penalt|interest|deposit|terminat|notif)/i;

/**
 * The payment term to apply across a vendor's historical run.
 *
 * Prefers a term the invoice agent already resolved for one of that vendor's
 * live payables -- that one has been read properly, amendments and all. Falls
 * back to a deterministic read of the documents. Reported either way, so the
 * audit says which it used.
 */
function vendorTerm(vendorId) {
  for (const inv of store.getLiveInvoices()) {
    if (inv.vendorId !== vendorId) continue;
    const f = store.getInvoiceFinding(inv.id);
    if (f && f.agreement) {
      return {
        exists: f.agreement.exists,
        days: f.agreement.statedTermDays,
        source: 'agent',
        detail: f.agreement.governingDocument || null,
      };
    }
  }

  const docs = contractsForVendor(vendorId);
  if (!docs.length) return { exists: false, days: null, source: 'no_documents', detail: null };
  for (const d of docs) {
    for (const line of d.text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      if (!PAYMENT_LINE.test(line) || NOT_TERM_LINE.test(line)) continue;
      for (const re of TERM_PATTERNS) {
        const m = line.match(re);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0 && n <= 365) {
          return { exists: true, days: n, source: 'document_scan', detail: d.docId };
        }
      }
    }
  }
  return { exists: true, days: null, source: 'document_scan', detail: docs[0].docId };
}

/**
 * @returns a decomposed reconstruction of last year's exposure.
 */
export function runRetroAudit() {
  const config = store.getConfig();
  const invoices = store.getHistoricalInvoices();

  const buckets = {
    breachConfident: [],   // covered, paid late, identity confidence above the floor
    breachUncertain: [],   // covered, paid late, but the classification is shaky
    settledInTime: [],
    notCovered: [],
    unclassified: [],      // no vendor finding, or coverage unknown
  };

  const termCache = new Map();
  const excluded = new Map();   // reasonCode -> {count, value}

  for (const inv of invoices) {
    const vendorFinding = store.getVendorFinding(inv.vendorId);
    if (!vendorFinding) {
      buckets.unclassified.push({ invoice: inv, reason: 'vendor not swept' });
      continue;
    }

    const coverage = coverageFor(inv.vendorId, inv.acceptedOn);
    if (!coverage || coverage.result === RESULT.UNKNOWN) {
      buckets.unclassified.push({ invoice: inv, reason: coverage ? coverage.reasonCode : 'no coverage decision' });
      continue;
    }

    if (coverage.result === RESULT.NOT_COVERED) {
      const row = excluded.get(coverage.reasonCode) || { count: 0, value: 0 };
      row.count += 1;
      row.value += inv.amount;
      excluded.set(coverage.reasonCode, row);
      buckets.notCovered.push({ invoice: inv, reasonCode: coverage.reasonCode });
      continue;
    }

    if (!termCache.has(inv.vendorId)) termCache.set(inv.vendorId, vendorTerm(inv.vendorId));
    const term = termCache.get(inv.vendorId);

    const calc = computeDeadline({
      clockStartDate: inv.acceptedOn,
      hasWrittenAgreement: term.exists,
      agreedTermDays: term.days,
    });

    const payout = store.getPayout(inv.id);
    if (!payout) {
      buckets.unclassified.push({ invoice: inv, reason: 'no payment record' });
      continue;
    }

    const daysLate = daysBetween(calc.deadline, payout.date);
    const row = {
      invoice: inv,
      vendorName: store.getVendor(inv.vendorId)?.ledgerName,
      registeredName: vendorFinding.registeredName,
      deadline: calc.deadline,
      allowedDays: calc.allowedDays,
      rule: calc.rule,
      termSource: term.source,
      paidOn: payout.date,
      daysLate,
      exposure: disallowanceCost(inv.amount, config.taxRatePct),
      identityConfidence: vendorFinding.identityConfidence,
    };

    if (daysLate > 0) {
      const confident = vendorFinding.identityConfidence >= config.identityConfidenceFloor + 0.15;
      (confident ? buckets.breachConfident : buckets.breachUncertain).push(row);
    } else {
      buckets.settledInTime.push(row);
    }
  }

  const total = (rows, key = 'exposure') => rows.reduce((s, r) => s + (r[key] ?? r.invoice.amount), 0);
  const value = (rows) => rows.reduce((s, r) => s + r.invoice.amount, 0);

  return {
    financialYear: FINANCIAL_YEAR,
    taxRatePct: config.taxRatePct,
    invoicesReviewed: invoices.length,
    ledgerValue: value(invoices.map((i) => ({ invoice: i }))),

    confident: {
      count: buckets.breachConfident.length,
      value: value(buckets.breachConfident),
      exposure: total(buckets.breachConfident),
    },
    contingent: {
      count: buckets.breachUncertain.length,
      value: value(buckets.breachUncertain),
      exposure: total(buckets.breachUncertain),
      vendors: [...new Set(buckets.breachUncertain.map((r) => r.vendorName))],
    },
    settledInTime: {
      count: buckets.settledInTime.length,
      value: value(buckets.settledInTime),
    },
    excluded: {
      count: buckets.notCovered.length,
      value: value(buckets.notCovered),
      byReason: [...excluded].map(([reasonCode, r]) => ({ reasonCode, ...r }))
        .sort((a, b) => b.value - a.value),
    },
    unclassified: {
      count: buckets.unclassified.length,
      value: value(buckets.unclassified),
      reasons: [...new Set(buckets.unclassified.map((r) => r.reason))],
    },

    /** Worst breaches first, for the drill-down. */
    breaches: [...buckets.breachConfident, ...buckets.breachUncertain]
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 40),

    provenance: 'Synthetic ledger. The reconstruction method is real; the totals are not a claim about any business.',
  };
}
