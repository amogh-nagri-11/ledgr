// Keep upgrading until every finding came from the AI arm.
//
//   npm run complete            # watch until done, or 2h elapse
//   npm run complete -- --once  # one attempt, then report
//
// Free tiers meter tokens against a ROLLING window, so capacity returns
// gradually rather than at a reset time. A single pass therefore often cannot
// finish, and the useful operation is not "run it again" but "keep upgrading
// what has not been resolved yet, patiently, until nothing is left".
//
// Both the sweep and the ledger analysis already treat a heuristic result as
// unresolved, so repeated calls converge rather than redoing work. This just
// drives that to completion and says what it is waiting on.

const BASE = process.env.LEDGR_URL || 'http://localhost:3000';
const ONCE = process.argv.includes('--once');
const POLL_MS = 20000;          // while a job is running
const RETRY_MS = 5 * 60 * 1000; // between attempts, when quota is the blocker
const MAX_MS = 2 * 60 * 60 * 1000;

const started = Date.now();
const clock = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[${clock()}] ${msg}`);

async function api(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

async function snapshot() {
  const { body } = await api('/api/state');
  const { body: v } = await api('/api/vendors');

  const vendors = v.vendors || [];
  const vendorAi = vendors.filter((r) => r.finding && r.finding.mode === 'ai').length;

  const invoices = body.assessments || [];
  const invoiceAi = invoices.filter((a) => a.finding && a.finding.mode === 'ai').length;
  const pending = invoices
    .filter((a) => !a.finding || a.finding.mode !== 'ai')
    .map((a) => a.invoice.id);

  return {
    vendorAi,
    vendorTotal: vendors.length,
    invoiceAi,
    invoiceTotal: body.sweep ? invoices.length : 0,
    pending,
    sweepRunning: body.sweep?.running,
    analysisRunning: body.analysis?.running,
    quotaTripped: Boolean(body.mode?.quota?.tripped),
    quotaUntil: body.mode?.quota?.until,
    complete: vendorAi === vendors.length && pending.length === 0 && vendors.length > 0,
  };
}

async function attempt() {
  const s = await snapshot();
  if (s.complete) return s;

  if (s.vendorAi < s.vendorTotal && !s.sweepRunning) {
    const r = await api('/api/sweep', { method: 'POST', body: JSON.stringify({ refresh: false }) });
    if (r.status === 202) log(`sweep started — ${s.vendorTotal - s.vendorAi} vendor(s) to upgrade`);
  }
  if (s.pending.length && !s.analysisRunning) {
    const r = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ refresh: false }) });
    if (r.status === 202) log(`analysis started — ${s.pending.length} invoice(s) to upgrade: ${s.pending.join(', ')}`);
  }
  return s;
}

log(`watching ${BASE} until every finding is from the AI arm`);

let last = '';
for (;;) {
  const s = await attempt();

  const line = `vendors ${s.vendorAi}/${s.vendorTotal} · invoices ${s.invoiceAi}/${s.invoiceTotal}`
    + (s.pending.length ? ` · waiting on ${s.pending.length}` : '');
  if (line !== last) {
    log(line);
    last = line;
  }

  if (s.complete) {
    log('COMPLETE — every vendor and every invoice resolved by the AI arm.');
    log('Run `npm run ablation` for a number that is safe to quote.');
    break;
  }

  if (ONCE) {
    log(`still outstanding: ${s.pending.join(', ') || 'none'}`);
    process.exitCode = 1;
    break;
  }

  if (Date.now() - started > MAX_MS) {
    log(`giving up after ${Math.round(MAX_MS / 60000)} min. Outstanding: ${s.pending.join(', ')}`);
    process.exitCode = 1;
    break;
  }

  const busy = s.sweepRunning || s.analysisRunning;
  if (s.quotaTripped) {
    log(`quota breaker tripped until ${String(s.quotaUntil).slice(11, 19)} — holding off`);
  }
  await new Promise((r) => setTimeout(r, busy ? POLL_MS : RETRY_MS));
}
