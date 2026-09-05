import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as store from './store.js';
import {
  assessLiveLedger, assessLiveCached, assessInvoice, withExplanation,
  portfolioSummary, sweepPortfolio, sweepVendor, coverageFor,
} from './assess.js';
import { runRetroAudit } from './audit/retro.js';
import { llmAvailable, describeProvider, quotaState } from './agent/llm.js';
import { createPayout, fetchPayoutStatus, mode as payoutMode } from './razorpayx.js';
import { today, isValidISODate } from './engine/dates.js';
import * as corpus from './corpus/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(here, '..', 'public')));

store.load();
const PORT = process.env.PORT || 3000;

function envelope(assessments) {
  return {
    today: today(),
    config: store.getConfig(),
    mode: { ai: llmAvailable(), provider: describeProvider(), payouts: payoutMode(), quota: quotaState() },
    sweep: sweepStatus(),
    summary: portfolioSummary(assessments),
    assessments,
  };
}

// ------------------------------------------------------------------- state

app.get('/api/state', (req, res) => res.json(envelope(assessLiveCached())));

app.get('/api/corpus', (req, res) => res.json({ stats: corpus.stats(), provenance: 'SYNTHETIC — see PROVENANCE.md' }));

// -------------------------------------------------- phase 1: portfolio sweep

let sweepJob = null;

function sweepStatus() {
  return {
    done: store.sweptCount(),
    total: store.getVendors().length,
    complete: store.sweepComplete(),
    running: Boolean(sweepJob && sweepJob.running),
    current: sweepJob ? sweepJob.current : null,
    mode: sweepJob ? sweepJob.mode : null,
    startedAt: sweepJob ? sweepJob.startedAt : null,
    fellBack: sweepJob ? sweepJob.fellBack : 0,
    error: sweepJob ? sweepJob.error : null,
  };
}

app.get('/api/sweep/status', (req, res) => res.json({ sweep: sweepStatus(), vendors: vendorRows() }));

/**
 * The sweep runs in the background and the client polls. A 24-vendor AI sweep
 * is minutes of work; blocking an HTTP request on it makes the UI look hung.
 */
app.post('/api/sweep', async (req, res) => {
  const { refresh = false, forceHeuristic = false, vendorId } = req.body || {};
  try {
    if (vendorId) {
      const vendor = store.getVendor(vendorId);
      if (!vendor) return res.status(404).json({ error: 'No such vendor' });
      const finding = await sweepVendor(vendor, { forceHeuristic });
      store.audit({
        type: 'vendor_classification', vendorId, actor: 'ledgr-portfolio-agent',
        detail: `${vendor.ledgerName} -> ${finding.registrationFound ? `${finding.registeredName} (${finding.registeredActivity}, ${finding.enterpriseClass})` : 'no registration resolved'}, confidence ${finding.identityConfidence}, via ${finding.mode}.`,
        trace: finding.trace,
      });
      return res.json({ finding, vendors: vendorRows(), sweep: sweepStatus() });
    }

    if (sweepJob && sweepJob.running) {
      return res.status(409).json({ error: 'A sweep is already running.', sweep: sweepStatus() });
    }

    sweepJob = {
      running: true,
      mode: forceHeuristic || !llmAvailable() ? 'heuristic' : 'ai',
      startedAt: new Date().toISOString(),
      current: null,
      fellBack: 0,
      error: null,
    };

    // Fire and forget; the client polls /api/sweep/status.
    (async () => {
      const started = Date.now();
      try {
        await sweepPortfolio({
          refresh,
          forceHeuristic,
          onProgress: (done, total, vendorId2) => { sweepJob.current = vendorId2; },
        });
        sweepJob.fellBack = store.getVendors()
          .filter((v) => (store.getVendorFinding(v.id) || {}).mode === 'heuristic_fallback').length;
        store.audit({
          type: 'portfolio_sweep', actor: 'ledgr-portfolio-agent',
          detail: `Swept ${store.sweptCount()} vendors in ${Math.round((Date.now() - started) / 1000)}s (${sweepJob.mode})`
            + (sweepJob.fellBack ? `; ${sweepJob.fellBack} fell back to the heuristic arm.` : '.'),
        });
      } catch (err) {
        console.error(err);
        sweepJob.error = err.message;
      } finally {
        sweepJob.running = false;
        sweepJob.current = null;
      }
    })();

    res.status(202).json({ started: true, sweep: sweepStatus() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** Vendor list with the cached finding and today's coverage decision. */
function vendorRows() {
  const t = today();
  return store.getVendors().map((v) => {
    const finding = store.getVendorFinding(v.id);
    const coverage = finding ? coverageFor(v.id, t) : null;
    const invoices = store.getAllInvoices().filter((i) => i.vendorId === v.id);
    return {
      vendor: v,
      finding,
      coverage,
      invoiceCount: invoices.length,
      totalValue: invoices.reduce((s, i) => s + i.amount, 0),
    };
  });
}

app.get('/api/vendors', (req, res) => res.json({ vendors: vendorRows() }));

// --------------------------------------------- phase 2: live ledger analysis

app.post('/api/analyze', async (req, res) => {
  const { invoiceId, refresh = true, forceHeuristic = false } = req.body || {};
  try {
    if (invoiceId) {
      const invoice = store.getInvoice(invoiceId);
      if (!invoice) return res.status(404).json({ error: 'No such invoice' });
      const a = await assessInvoice(invoice, { refresh, forceHeuristic });
      store.audit({
        type: 'invoice_analysis', invoiceId, actor: 'ledgr-invoice-agent',
        detail: `Clock starts ${a.finding.clockStart.date} (${a.finding.clockStart.basis}); coverage ${a.coverage?.result} (${a.coverage?.reasonCode}); ${a.calc ? `deadline ${a.calc.deadline}` : 'no statutory deadline'}; risk ${a.risk.level}. Via ${a.finding.mode}.`,
        trace: a.finding.trace,
      });
      return res.json(envelope(assessLiveCached()));
    }

    const assessments = await assessLiveLedger({ refresh, forceHeuristic });
    store.audit({
      type: 'ledger_analysis', actor: 'ledgr-invoice-agent',
      detail: `Analysed ${assessments.length} live payables. ${assessments.filter((a) => a.risk.level === 'red').length} red, ${assessments.filter((a) => a.risk.level === 'grey').length} held for review.`,
    });
    res.json(envelope(assessments));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices/:id/recommendation', async (req, res) => {
  const invoice = store.getInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'No such invoice' });
  if (!store.getInvoiceFinding(invoice.id)) return res.status(409).json({ error: 'Run analysis first' });
  try {
    const a = await assessInvoice(invoice, { refresh: false });
    const full = await withExplanation(a);
    res.json({ recommendation: full.recommendation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------- phase 3: retroactive audit

app.get('/api/audit/retro', (req, res) => {
  if (!store.sweepComplete()) {
    return res.status(409).json({ error: 'Run the portfolio sweep first — the audit reconstructs coverage per vendor.' });
  }
  res.json(runRetroAudit());
});

// ------------------------------------------------------ phase 4: execute

app.post('/api/invoices/:id/pay', async (req, res) => {
  const invoice = store.getInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'No such invoice' });
  const vendor = store.getVendor(invoice.vendorId);
  const config = store.getConfig();
  const { approver = 'finance.user@demo', auto = false } = req.body || {};

  if (auto && invoice.amount > config.autoExecuteThreshold) {
    return res.status(403).json({ error: 'Above the auto-execute threshold; requires human approval.' });
  }

  try {
    const a = await assessInvoice(invoice, { refresh: false });
    if (a.finding.needsHumanReview || a.coverage?.result === 'unknown') {
      return res.status(409).json({ error: 'Held for review; resolve the open question before paying.' });
    }
    if (!a.covered) {
      return res.status(409).json({ error: 'Not a covered supply — no statutory deadline, so Ledgr will not schedule this.' });
    }

    const scheduleFor = req.body?.scheduleFor && isValidISODate(req.body.scheduleFor)
      ? req.body.scheduleFor
      : (a.risk.payBy && a.risk.payBy > today() ? a.risk.payBy : today());

    const payout = await createPayout({ invoice, vendor, scheduleFor, narration: `Ledgr ${invoice.id}` });
    store.setPayout(invoice.id, { ...payout, confirmed: false });

    store.audit({
      type: auto ? 'auto_execution' : 'approved_execution',
      invoiceId: invoice.id,
      actor: auto ? 'ledgr-auto (under threshold)' : approver,
      approver: auto ? null : approver,
      amount: invoice.amount,
      detail: `${auto ? 'Auto-scheduled' : 'Approved and scheduled'} payout ${payout.payoutId} for ${payout.date} via RazorpayX (${payout.source}). Deadline ${a.calc?.deadline}. NOT YET CLOSED — awaiting payout confirmation.`,
      reasoning: {
        coverage: a.coverage,
        clockStart: a.finding.clockStart,
        agreement: a.finding.agreement,
        deadline: a.calc?.deadline,
        workings: a.calc?.workings || [],
        riskAtDecision: a.risk,
        exposureAvoided: a.exposure,
      },
    });

    res.json({ payout, queue: envelope(assessLiveCached()) });
  } catch (err) {
    console.error(err);
    store.audit({ type: 'execution_failed', invoiceId: invoice.id, actor: approver, detail: err.message });
    res.status(502).json({ error: err.message });
  }
});

/**
 * The feedback loop. A compliance item does not close because a payout was
 * requested -- it closes when RazorpayX confirms the money moved.
 */
app.post('/api/invoices/:id/confirm', async (req, res) => {
  const invoice = store.getInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'No such invoice' });
  const payout = store.getPayout(invoice.id);
  if (!payout) return res.status(409).json({ error: 'No payout booked against this invoice.' });

  try {
    const remote = await fetchPayoutStatus(payout.payoutId);
    const confirmed = { ...payout, status: 'processed', confirmed: true, confirmedAt: new Date().toISOString(), utr: remote.utr || payout.utr || `UTRSIM${invoice.id.slice(-4)}` };
    store.setPayout(invoice.id, confirmed);

    const a = await assessInvoice(invoice, { refresh: false });
    store.audit({
      type: 'payout_confirmed', invoiceId: invoice.id, actor: 'razorpayx-feedback',
      amount: invoice.amount,
      detail: `Payout ${confirmed.payoutId} confirmed processed on ${confirmed.date} (UTR ${confirmed.utr}). Compliance item closed against deadline ${a.calc?.deadline}.`,
      reasoning: { deadline: a.calc?.deadline, paidOn: confirmed.date, riskAtClose: a.risk },
    });

    res.json({ payout: confirmed, queue: envelope(assessLiveCached()) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/auto-execute', async (req, res) => {
  const config = store.getConfig();
  const eligible = assessLiveCached().filter((a) => a.actionable && a.autoExecutable);
  const done = [];
  for (const a of eligible) {
    try {
      const scheduleFor = a.risk.payBy > today() ? a.risk.payBy : today();
      const payout = await createPayout({ invoice: a.invoice, vendor: a.vendor, scheduleFor, narration: `Ledgr ${a.invoice.id}` });
      store.setPayout(a.invoice.id, { ...payout, confirmed: false });
      store.audit({
        type: 'auto_execution', invoiceId: a.invoice.id, actor: 'ledgr-auto (under threshold)', amount: a.invoice.amount,
        detail: `Auto-scheduled ${payout.payoutId} for ${payout.date}; at or under the ${config.autoExecuteThreshold} threshold. Deadline ${a.calc?.deadline}.`,
        reasoning: { coverage: a.coverage, deadline: a.calc?.deadline, workings: a.calc?.workings || [], riskAtDecision: a.risk },
      });
      done.push({ invoiceId: a.invoice.id, payoutId: payout.payoutId, date: payout.date });
    } catch (err) {
      done.push({ invoiceId: a.invoice.id, error: err.message });
    }
  }
  res.json({ executed: done, queue: envelope(assessLiveCached()) });
});

// -------------------------------------------------------------- housekeeping

app.get('/api/audit', (req, res) => res.json({ audit: store.getAudit() }));

app.post('/api/config', (req, res) => {
  const config = store.setConfig(req.body || {});
  store.audit({ type: 'config_change', actor: req.body?.approver || 'finance.user@demo', detail: `Policy updated: ${JSON.stringify(config)}` });
  res.json(envelope(assessLiveCached()));
});

app.post('/api/invoices', async (req, res) => {
  const { vendorId, amount, invoiceDate, acceptedOn, description } = req.body || {};
  if (!store.getVendor(vendorId)) return res.status(400).json({ error: 'Unknown vendorId' });
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
  if (!isValidISODate(invoiceDate)) return res.status(400).json({ error: 'invoiceDate must be YYYY-MM-DD' });
  if (acceptedOn && !isValidISODate(acceptedOn)) return res.status(400).json({ error: 'acceptedOn must be YYYY-MM-DD' });

  const seq = store.getLiveInvoices().length + 1;
  const id = `INV-${9000 + seq}`;
  const invoice = store.addInvoice({
    id, vendorId, amount: Number(amount), invoiceDate,
    description: description || 'Manual entry', currency: 'INR', period: 'live',
  });

  if (acceptedOn) {
    const ref = String(9000 + seq);
    store.addAcceptanceDocuments(id, [
      { ref: `DN-${ref}`, invoiceId: id, medium: 'scanned_document', date: acceptedOn, body: `DELIVERY CHALLAN ${ref}. ${invoice.description}. Delivered to the Buyer.` },
      { ref: `GRN-${ref}`, invoiceId: id, medium: 'scanned_document', date: acceptedOn, body: `GOODS RECEIPT NOTE ${ref}. Received and accepted without objection. Signed at stores.` },
    ]);
  }

  store.audit({
    type: 'intake', invoiceId: id, actor: 'finance.user@demo',
    detail: `Invoice ${id} entered manually: ${invoice.description}, ${amount} on ${invoiceDate}${acceptedOn ? `, goods accepted ${acceptedOn}` : ', no acceptance date supplied'}.`,
  });

  try {
    const a = await assessInvoice(invoice, { refresh: true });
    store.audit({
      type: 'invoice_analysis', invoiceId: id, actor: 'ledgr-invoice-agent',
      detail: `Coverage ${a.coverage?.result}; clock ${a.finding.clockStart.date} (${a.finding.clockStart.basis}); ${a.calc ? `deadline ${a.calc.deadline}` : 'no deadline'}; risk ${a.risk.level}.`,
      trace: a.finding.trace,
    });
  } catch (err) {
    console.error(err);
  }

  res.json({ invoice, queue: envelope(assessLiveCached()) });
});

app.post('/api/reset', (req, res) => {
  store.reset();
  res.json(envelope([]));
});

app.listen(PORT, () => {
  console.log(`\n  Ledgr running at http://localhost:${PORT}`);
  console.log(`  AI layer:  ${describeProvider() || 'heuristic fallback (set GEMINI_API_KEY or GROQ_API_KEY)'}`);
  console.log(`  Payouts:   RazorpayX ${payoutMode()}`);
  const s = corpus.stats();
  console.log(`  Corpus:    ${s.vendors} vendors · ${s.liveInvoices} live · ${s.historicalInvoices} historical (SYNTHETIC)\n`);
});
