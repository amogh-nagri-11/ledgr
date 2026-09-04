import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as store from './store.js';
import { assessAll, assessAllCached, assessInvoice, withExplanation, portfolioSummary } from './assess.js';
import { llmAvailable, describeProvider } from './agent/resolve.js';
import { createPayout, mode as payoutMode } from './razorpayx.js';
import { today, isValidISODate } from './engine/dates.js';

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
    mode: { ai: llmAvailable(), provider: describeProvider(), payouts: payoutMode() },
    summary: portfolioSummary(assessments),
    assessments,
  };
}

/** Current queue from cached findings -- instant, no model calls. */
app.get('/api/queue', (req, res) => {
  res.json(envelope(assessAllCached()));
});

/** Run the agent across the ledger (or one invoice) and rebuild the queue. */
app.post('/api/analyze', async (req, res) => {
  const { invoiceId, refresh = true, forceHeuristic = false } = req.body || {};
  try {
    if (invoiceId) {
      const invoice = store.getInvoice(invoiceId);
      if (!invoice) return res.status(404).json({ error: 'No such invoice' });
      const a = await assessInvoice(invoice, { refresh, forceHeuristic });
      store.audit({
        type: 'analysis',
        invoiceId,
        actor: 'ledgr-agent',
        detail: `Resolved inputs via ${a.finding.mode}: clock starts ${a.finding.clockStart.date} (${a.finding.clockStart.basis}); ${a.calc ? `deadline ${a.calc.deadline}` : 'not covered by 43B(h)'}; risk ${a.risk.level}.`,
        trace: a.finding.trace,
      });
      return res.json(envelope(assessAllCached()));
    }

    const assessments = await assessAll({ refresh, forceHeuristic });
    store.audit({
      type: 'analysis',
      actor: 'ledgr-agent',
      detail: `Analysed ${assessments.length} invoices. ${assessments.filter((a) => a.risk.level === 'red').length} red, ${assessments.filter((a) => a.risk.level === 'grey').length} needing review.`,
    });
    res.json(envelope(assessments));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** The readable rationale for one row, generated on demand. */
app.get('/api/invoices/:id/recommendation', async (req, res) => {
  const invoice = store.getInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'No such invoice' });
  const finding = store.getFinding(invoice.id);
  if (!finding) return res.status(409).json({ error: 'Run analysis first' });
  try {
    const a = await assessInvoice(invoice, { refresh: false });
    const full = await withExplanation(a);
    res.json({ recommendation: full.recommendation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Execute. Above the threshold this endpoint is only ever reached by a human
 * clicking Pay Now; at or below it, Ledgr may call it itself.
 */
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
    if (a.finding.needsHumanReview) {
      return res.status(409).json({ error: 'This item is flagged for human review; resolve the open question before paying.' });
    }

    const scheduleFor = req.body?.scheduleFor && isValidISODate(req.body.scheduleFor)
      ? req.body.scheduleFor
      : (a.risk.payBy && a.risk.payBy > today() ? a.risk.payBy : today());

    const payout = await createPayout({
      invoice,
      vendor,
      scheduleFor,
      narration: `Ledgr ${invoice.id}`,
    });

    store.setPayout(invoice.id, payout);

    store.audit({
      type: auto ? 'auto_execution' : 'approved_execution',
      invoiceId: invoice.id,
      actor: auto ? 'ledgr-auto (under threshold)' : approver,
      approver: auto ? null : approver,
      amount: invoice.amount,
      detail: `${auto ? 'Auto-scheduled' : 'Approved and scheduled'} payout ${payout.payoutId} for ${payout.date} via RazorpayX (${payout.source}). Statutory deadline ${a.calc ? a.calc.deadline : 'n/a'}; ${a.calc ? `buffer ${config.bufferDays} days` : ''}.`,
      reasoning: {
        clockStart: a.finding.clockStart,
        agreement: a.finding.agreement,
        vendorMatch: a.finding.vendorMatch,
        deadline: a.calc ? a.calc.deadline : null,
        workings: a.calc ? a.calc.workings : [],
        riskAtDecision: a.risk,
        exposureAvoided: a.exposure,
      },
    });

    res.json({ payout, queue: envelope(assessAllCached()) });
  } catch (err) {
    console.error(err);
    store.audit({ type: 'execution_failed', invoiceId: invoice.id, actor: approver, detail: err.message });
    res.status(502).json({ error: err.message });
  }
});

/** Sweep every under-threshold item that needs action and schedule it. */
app.post('/api/auto-execute', async (req, res) => {
  const config = store.getConfig();
  const queue = assessAllCached();
  const eligible = queue.filter((a) => a.actionable && a.autoExecutable && !a.finding.needsHumanReview);
  const done = [];
  for (const a of eligible) {
    try {
      const scheduleFor = a.risk.payBy > today() ? a.risk.payBy : today();
      const payout = await createPayout({ invoice: a.invoice, vendor: a.vendor, scheduleFor, narration: `Ledgr ${a.invoice.id}` });
      store.setPayout(a.invoice.id, payout);
      store.audit({
        type: 'auto_execution',
        invoiceId: a.invoice.id,
        actor: 'ledgr-auto (under threshold)',
        amount: a.invoice.amount,
        detail: `Auto-scheduled ${payout.payoutId} for ${payout.date}; amount is at or under the ${config.autoExecuteThreshold} threshold. Deadline ${a.calc?.deadline}.`,
        reasoning: { deadline: a.calc?.deadline, workings: a.calc?.workings || [], riskAtDecision: a.risk },
      });
      done.push({ invoiceId: a.invoice.id, payoutId: payout.payoutId, date: payout.date });
    } catch (err) {
      done.push({ invoiceId: a.invoice.id, error: err.message });
    }
  }
  res.json({ executed: done, queue: envelope(assessAllCached()) });
});

app.get('/api/audit', (req, res) => res.json({ audit: store.getAudit() }));

app.post('/api/config', (req, res) => {
  const config = store.setConfig(req.body || {});
  store.audit({ type: 'config_change', actor: req.body?.approver || 'finance.user@demo', detail: `Policy updated: ${JSON.stringify(config)}` });
  res.json(envelope(assessAllCached()));
});

/**
 * Manual intake (feature 1) -- structured entry, no OCR.
 * `acceptedOn` is optional: supply it and a delivery note + GRN are recorded,
 * so the clock runs from acceptance. Leave it out and the agent finds no
 * acceptance evidence, which is itself a result worth seeing.
 */
app.post('/api/invoices', async (req, res) => {
  const { vendorId, amount, invoiceDate, acceptedOn, description } = req.body || {};
  if (!store.getVendor(vendorId)) return res.status(400).json({ error: 'Unknown vendorId' });
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
  if (!isValidISODate(invoiceDate)) return res.status(400).json({ error: 'invoiceDate must be YYYY-MM-DD' });
  if (acceptedOn && !isValidISODate(acceptedOn)) return res.status(400).json({ error: 'acceptedOn must be YYYY-MM-DD' });

  const seq = store.getInvoices().length + 1;
  const id = `INV-${9000 + seq}`;
  const invoice = store.addInvoice({
    id, vendorId, amount: Number(amount), invoiceDate,
    description: description || 'Manual entry', currency: 'INR',
  });

  if (acceptedOn) {
    const ref = String(9000 + seq);
    store.addDeliveryEvents(id, [
      { date: acceptedOn, type: 'delivery_note', ref: `DN-${ref}`, note: 'Delivered, per manual intake.' },
      { date: acceptedOn, type: 'grn_accepted', ref: `GRN-${ref}`, note: 'Goods accepted without objection, per manual intake.' },
    ]);
  }

  store.audit({
    type: 'intake',
    invoiceId: id,
    actor: 'finance.user@demo',
    detail: `Invoice ${id} entered manually: ${invoice.description}, ${amount} on ${invoiceDate}${acceptedOn ? `, goods accepted ${acceptedOn}` : ', no acceptance date supplied'}.`,
  });

  try {
    const a = await assessInvoice(invoice, { refresh: true });
    store.audit({
      type: 'analysis',
      invoiceId: id,
      actor: 'ledgr-agent',
      detail: `Resolved inputs via ${a.finding.mode}: clock starts ${a.finding.clockStart.date} (${a.finding.clockStart.basis}); ${a.calc ? `deadline ${a.calc.deadline}` : 'not covered by 43B(h)'}; risk ${a.risk.level}.`,
      trace: a.finding.trace,
    });
  } catch (err) {
    console.error(err);
  }

  res.json({ invoice, queue: envelope(assessAllCached()) });
});

app.get('/api/vendors', (req, res) => res.json({ vendors: store.getState().vendors }));

app.post('/api/reset', (req, res) => {
  store.reset();
  res.json(envelope([]));
});

app.listen(PORT, () => {
  console.log(`\n  Ledgr running at http://localhost:${PORT}`);
  console.log(`  AI layer:  ${describeProvider() || 'heuristic fallback (set GEMINI_API_KEY or GROQ_API_KEY for the agent)'}`);
  console.log(`  Payouts:   RazorpayX ${payoutMode()}\n`);
});
