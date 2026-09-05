const $ = (id) => document.getElementById(id);
const inr = (n) => '₹' + Number(Math.round(n || 0)).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DOT = { red: '\u{1F534}', amber: '\u{1F7E1}', green: '\u{1F7E2}', grey: '⚪' };
const COV = { covered: '\u{1F7E2} in scope', not_covered: '— out of scope', unknown: '⚪ unresolved' };

let state = null;
let vendorRows = [];
let retroData = null;
let tab = 'queue';
let justAdded = null;
const openRows = new Set();
const openVendors = new Set();
const recommendations = new Map();

function hint(msg, spinning = false) {
  $('hint').innerHTML = spinning ? `<span class="spinner">◌</span> ${esc(msg)}` : esc(msg);
}

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// ------------------------------------------------------------------- chrome

function renderChrome() {
  if (!state) return;
  const quotaTripped = state.mode.quota && state.mode.quota.tripped;
  $('modeAi').textContent = quotaTripped
    ? `AI: quota exhausted — heuristic arm`
    : `AI: ${state.mode.provider || 'heuristic fallback'}`;
  $('modeAi').classList.toggle('live', state.mode.ai && !quotaTripped);
  $('modeAi').classList.toggle('warn', Boolean(quotaTripped));
  $('modePayout').textContent = `Payouts: RazorpayX ${state.mode.payouts}`;
  $('modePayout').classList.toggle('live', state.mode.payouts === 'sandbox');
  $('modeSweep').textContent = `Sweep: ${state.sweep.done}/${state.sweep.total}${state.sweep.running ? ' …' : ''}`;
  $('modeSweep').classList.toggle('live', state.sweep.complete);
  $('modeDate').textContent = `Today ${state.today}`;

  $('cfgBuffer').value = state.config.bufferDays;
  $('cfgTax').value = state.config.taxRatePct;
  $('cfgThreshold').value = state.config.autoExecuteThreshold;
  $('cfgFloor').value = state.config.identityConfidenceFloor;
}

function tile(k, v, s, cls = '') {
  return `<div class="tile ${cls}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`;
}

function renderSummary() {
  if (tab === 'queue' && state) {
    const s = state.summary;
    $('summary').innerHTML = `
      ${tile('Breach imminent', s.byLevel.red, `${s.byLevel.amber} amber · ${s.byLevel.grey} held for review`, 'red')}
      ${tile('Payables at risk', inr(s.atRisk), 'red + amber', '')}
      ${tile('Deduction exposure', inr(s.exposure), `extra tax at ${state.config.taxRatePct}% if missed`, 'exposure')}
      ${tile('Clear', s.byLevel.green, `of ${s.count} live payables`, '')}`;
  } else if (tab === 'vendors') {
    const c = { covered: 0, not_covered: 0, unknown: 0, unswept: 0 };
    for (const r of vendorRows) {
      if (!r.finding) c.unswept += 1;
      else c[r.coverage ? r.coverage.result : 'unknown'] += 1;
    }
    const excluded = vendorRows.filter((r) => r.coverage && r.coverage.result === 'not_covered');
    $('summary').innerHTML = `
      ${tile('In scope', c.covered, 'carry the statutory clock', '')}
      ${tile('Out of scope', c.not_covered, `${inr(excluded.reduce((s, r) => s + r.totalValue, 0))} of payments`, '')}
      ${tile('Unresolved', c.unknown, 'escalated, not assumed', 'exposure')}
      ${tile('Not swept', c.unswept, `of ${vendorRows.length} vendors`, c.unswept ? 'red' : '')}`;
  } else if (tab === 'retro' && retroData) {
    const r = retroData;
    $('summary').innerHTML = `
      ${tile('Confident breaches', inr(r.confident.exposure), `${r.confident.count} invoices, ${inr(r.confident.value)}`, 'red')}
      ${tile('Contingent', inr(r.contingent.exposure), `${r.contingent.count} invoices needing review`, 'exposure')}
      ${tile('Excluded', r.excluded.count, `${inr(r.excluded.value)} out of scope`, '')}
      ${tile('Settled in time', r.settledInTime.count, `of ${r.invoicesReviewed} reviewed`, '')}`;
  } else {
    $('summary').innerHTML = '';
  }
}

function show(which) {
  tab = which;
  for (const el of document.querySelectorAll('.tab')) el.classList.toggle('active', el.dataset.tab === which);
  for (const id of ['queue', 'vendors', 'retro']) $(id).hidden = id !== which;
  renderSummary();
  if (which === 'vendors') renderVendors();
  if (which === 'retro') renderRetro();
}

// -------------------------------------------------------------- queue view

function render(data) {
  if (data) state = data;
  if (!state) return;
  renderChrome();
  renderSummary();

  const q = $('queue');
  if (!state.assessments.length) {
    q.innerHTML = `<p class="empty">Nothing analysed yet.<br><strong>Run portfolio sweep</strong> first — coverage is decided per vendor — then <strong>Analyse live ledger</strong>.</p>`;
    return;
  }
  q.innerHTML = state.assessments.map(row).join('');
  wireQueue();
}

function row(a) {
  const id = a.invoice.id;
  const open = openRows.has(id);
  const lvl = a.risk.level;
  const pill = a.calc
    ? `<span class="deadline-pill ${lvl}">due ${a.calc.deadline}${a.risk.daysLeft != null ? ` · ${a.risk.daysLeft}d` : ''}</span>`
    : `<span class="deadline-pill">${esc(a.coverage ? COV[a.coverage.result] : 'no deadline')}</span>`;

  let action = '';
  if (a.payout) {
    action = a.payout.confirmed
      ? `<span class="deadline-pill ok">confirmed ${esc(a.payout.date)}</span>`
      : `<button class="small" data-confirm="${id}">Confirm payout</button>`;
  } else if (a.risk.level === 'grey') {
    action = '<span class="deadline-pill">held for review</span>';
  } else if (a.actionable) {
    action = a.autoExecutable
      ? `<button class="small" data-pay="${id}" data-auto="1">Auto-schedule</button>`
      : `<button class="${lvl === 'red' ? 'pay' : ''} small" data-pay="${id}">Pay now</button>`;
  }

  return `
  <article class="row ${lvl} ${open ? 'open' : ''} ${justAdded === id ? 'justin' : ''}" data-id="${id}">
    <div class="row-head" data-toggle="${id}">
      <span class="dot">${DOT[lvl]}</span>
      <div class="who">
        <div class="name">${esc(a.vendor.ledgerName)}</div>
        <div class="sub">${esc(id)} · ${esc(a.invoice.invoiceDate)}${a.vendorFinding?.enterpriseClass ? ` · ${esc(a.vendorFinding.enterpriseClass)}` : ''}</div>
      </div>
      <div class="amt">${inr(a.invoice.amount)}${a.exposure ? `<span class="exp">${inr(a.exposure)} at stake</span>` : ''}</div>
      <div class="status"><span class="lead">${esc(a.risk.headline)}</span></div>
      <div class="row-actions">${pill}${action}</div>
    </div>
    <div class="detail" data-detail="${id}">${open ? detail(a) : ''}</div>
  </article>`;
}

function evidenceItem(label, value, quote, conf) {
  return `<li>
    <span class="lbl">${esc(label)}${conf != null ? ` <span class="conf">conf ${conf}</span>` : ''}</span>
    <span class="val">${esc(value)}</span>
    ${quote ? `<span class="quote">${esc(quote)}</span>` : ''}
  </li>`;
}

function detail(a) {
  const f = a.finding;
  const vf = a.vendorFinding || {};
  const rec = recommendations.get(a.invoice.id);
  const modeTag = (m, model) => `<span class="ai-badge">${esc(m === 'ai' ? (model || 'ai') : m)}</span>`;

  const review = a.risk.level === 'grey'
    ? `<div class="review-note"><strong>Held for review.</strong> ${esc(f.reviewReason || (a.coverage && a.coverage.workings.slice(-1)[0]) || 'Inputs unresolved.')}</div>`
    : '';

  return `
    ${review ? `<section>${review}</section>` : ''}

    <section>
      <h4>Recommendation
        <button class="small ghost reanalyse" data-reanalyse="${a.invoice.id}">Re-analyse this row</button>
      </h4>
      <div class="recommendation">${rec ? esc(rec.text) : '<span class="spinner">◌</span> generating…'}</div>
    </section>

    <div class="grid2">
      <section>
        <h4>Vendor evidence ${modeTag(vf.mode, vf.model)}</h4>
        <ul class="evidence">
          ${evidenceItem('identity', vf.registrationFound ? `${vf.registeredName} — ${vf.udyam}` : 'no registration resolved', vf.identityEvidence, vf.identityConfidence)}
          ${evidenceItem('registered activity', `${vf.registeredActivity || 'unknown'} · actually ${vf.actualActivity || 'unknown'}`, vf.activityEvidence)}
          ${vf.alternativeConsidered ? evidenceItem('alternative weighed', 'rival candidate', vf.alternativeConsidered) : ''}
        </ul>
        <h4 style="margin-top:14px">Coverage decision <span class="engine-badge">rule</span></h4>
        <ul class="workings">
          ${(a.coverage ? a.coverage.workings : ['Vendor not swept.']).map((w) => `<li>${esc(w)}</li>`).join('')}
          <li>→ ${esc(a.coverage ? a.coverage.result : 'unknown')} (${esc(a.coverage ? a.coverage.reasonCode : '')})</li>
        </ul>
      </section>

      <section>
        <h4>Invoice evidence ${modeTag(f.mode, f.model)}</h4>
        <ul class="evidence">
          ${evidenceItem('written agreement', f.agreement.exists ? `${f.agreement.governingDocument || 'on file'} — states ${f.agreement.statedTermDays ?? 'no'} day term` : 'none on file', f.agreement.evidence)}
          ${evidenceItem('clock start', `${f.clockStart.date} — ${String(f.clockStart.basis).replace(/_/g, ' ')}`, f.clockStart.evidence, f.clockStart.confidence)}
          ${evidenceItem('nature of supply', f.supplyNature, f.supplyEvidence)}
        </ul>
        <h4 style="margin-top:14px">Statutory calculation <span class="engine-badge">deterministic</span></h4>
        ${a.calc ? `<ul class="workings">
            ${a.calc.workings.map((w) => `<li>${esc(w)}</li>`).join('')}
            <li>Cost if missed: ${inr(a.invoice.amount)} × ${a.config.taxRatePct}% = ${inr(a.exposure)} extra tax this year.</li>
            <li>Recommended pay-by (deadline − ${a.config.bufferDays}d): ${esc(a.risk.payBy)}</li>
          </ul>`
    : '<ul class="workings"><li>No statutory deadline — the coverage rule did not place this supply in scope.</li></ul>'}
      </section>
    </div>

    <section>
      <h4>Investigation trail (${(vf.trace || []).length + f.trace.length} tool calls)</h4>
      <ul class="trace">
        ${(vf.trace || []).map((t) => `<li><span class="tool">${esc(t.tool)}</span> — ${esc(t.summary)}</li>`).join('')}
        ${f.trace.map((t) => `<li><span class="tool">${esc(t.tool)}</span> — ${esc(t.summary)}</li>`).join('')}
      </ul>
    </section>`;
}

// ------------------------------------------------------------ vendors view

function renderVendors() {
  const el = $('vendors');
  if (!vendorRows.length) {
    el.innerHTML = '<p class="empty">No vendors loaded.</p>';
    return;
  }
  const order = { unknown: 0, covered: 1, not_covered: 2 };
  const sorted = [...vendorRows].sort((a, b) => {
    const ra = a.coverage ? order[a.coverage.result] : -1;
    const rb = b.coverage ? order[b.coverage.result] : -1;
    if (ra !== rb) return ra - rb;
    return b.totalValue - a.totalValue;
  });
  el.innerHTML = sorted.map(vendorRow).join('');
  wireVendors();
}

function vendorRow(r) {
  const f = r.finding;
  const open = openVendors.has(r.vendor.id);
  const result = r.coverage ? r.coverage.result : 'unswept';
  const lvl = result === 'covered' ? 'green' : result === 'not_covered' ? 'grey' : result === 'unknown' ? 'amber' : '';

  return `
  <article class="row ${lvl} ${open ? 'open' : ''}" data-vid="${r.vendor.id}">
    <div class="row-head" data-vtoggle="${r.vendor.id}">
      <span class="dot">${result === 'covered' ? '🟢' : result === 'not_covered' ? '⚫' : '⚪'}</span>
      <div class="who">
        <div class="name">${esc(r.vendor.ledgerName)}</div>
        <div class="sub">${esc(r.vendor.id)} · GSTIN ${esc(r.vendor.gstin.slice(0, 2))}··· · ${r.invoiceCount} invoices</div>
      </div>
      <div class="amt">${inr(r.totalValue)}</div>
      <div class="status"><span class="lead">${f && f.registrationFound ? esc(f.registeredName) : 'no registration resolved'}</span>
        <br>${f ? `${esc(f.registeredActivity || '—')} registered · ${esc(f.actualActivity || '—')} in practice` : 'not swept'}</div>
      <div class="row-actions">
        <span class="deadline-pill ${result === 'unknown' ? 'amber' : ''}">${esc(r.coverage ? COV[result] : 'not swept')}</span>
        <button class="small ghost" data-resweep="${r.vendor.id}">Re-sweep</button>
      </div>
    </div>
    <div class="detail" data-vdetail="${r.vendor.id}">${open ? vendorDetail(r) : ''}</div>
  </article>`;
}

function vendorDetail(r) {
  const f = r.finding;
  if (!f) return '<p class="empty">Not swept yet.</p>';
  return `
    <div class="grid2">
      <section>
        <h4>Evidence <span class="ai-badge">${esc(f.mode === 'ai' ? (f.model || 'ai') : f.mode)}</span></h4>
        <ul class="evidence">
          ${evidenceItem('identity', f.registrationFound ? `${f.registeredName} — ${f.udyam}` : 'no registration resolved', f.identityEvidence, f.identityConfidence)}
          ${evidenceItem('registered activity', f.registeredActivity || 'unknown', f.activityEvidence)}
          ${evidenceItem('what they actually do', f.actualActivity || 'unknown', 'Read from the supply history.')}
          ${f.alternativeConsidered ? evidenceItem('alternative weighed', 'rival candidate', f.alternativeConsidered) : ''}
        </ul>
      </section>
      <section>
        <h4>Coverage decision <span class="engine-badge">hardcoded rule</span></h4>
        <ul class="workings">
          ${(r.coverage ? r.coverage.workings : []).map((w) => `<li>${esc(w)}</li>`).join('')}
          <li>→ ${esc(r.coverage ? r.coverage.result : '')} (${esc(r.coverage ? r.coverage.reasonCode : '')})</li>
        </ul>
        <p class="fieldnote" style="margin-top:10px">The agent never returns "covered". It reports identity, category and activity with evidence; this rule decides.</p>
      </section>
    </div>
    <section>
      <h4>Investigation trail (${(f.trace || []).length} tool calls)</h4>
      <ul class="trace">${(f.trace || []).map((t) => `<li><span class="tool">${esc(t.tool)}</span> — ${esc(t.summary)}</li>`).join('')}</ul>
    </section>`;
}

// -------------------------------------------------------------- retro view

function renderRetro() {
  const el = $('retro');
  if (!retroData) {
    el.innerHTML = `<p class="empty">Run the portfolio sweep, then open this tab to reconstruct last year.<br>
      <button id="btnRetro" class="primary" style="margin-top:14px">Reconstruct ${esc(state ? '' : '')}last year</button></p>`;
    const b = $('btnRetro');
    if (b) b.addEventListener('click', loadRetro);
    return;
  }
  const r = retroData;
  el.innerHTML = `
    <div class="panel">
      <h3>${esc(r.financialYear.label)} — reconstructed exposure</h3>
      <p class="fieldnote">${esc(r.invoicesReviewed)} invoices, ${inr(r.ledgerValue)}. Coverage judged as at each supply date, not as at today.</p>
      <div class="decomp">
        <div class="band red"><div class="v">${inr(r.confident.exposure)}</div><div class="k">confident</div><div class="s">${r.confident.count} invoices · ${inr(r.confident.value)} paid late</div></div>
        <div class="band amber"><div class="v">${inr(r.contingent.exposure)}</div><div class="k">contingent</div><div class="s">${r.contingent.count} invoices resting on ${r.contingent.vendors.length} uncertain vendor match(es)</div></div>
        <div class="band"><div class="v">${inr(r.excluded.value)}</div><div class="k">excluded</div><div class="s">${r.excluded.count} invoices out of scope</div></div>
        <div class="band"><div class="v">${r.unclassified.count}</div><div class="k">unclassified</div><div class="s">${esc(r.unclassified.reasons.join(', ') || 'none')}</div></div>
      </div>
      <p class="provenance">${esc(r.provenance)}</p>
    </div>

    <div class="panel">
      <h3>Why invoices were excluded</h3>
      <table class="tbl">
        <thead><tr><th>Reason</th><th>Invoices</th><th>Value</th></tr></thead>
        <tbody>${r.excluded.byReason.map((e) => `<tr><td>${esc(e.reasonCode.replace(/_/g, ' '))}</td><td>${e.count}</td><td>${inr(e.value)}</td></tr>`).join('')}</tbody>
      </table>
      <p class="fieldnote">A tool without a coverage rule would have counted every one of these as exposure.</p>
    </div>

    <div class="panel">
      <h3>Largest breaches</h3>
      <table class="tbl">
        <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Deadline</th><th>Paid</th><th>Late</th><th>Exposure</th><th>Conf</th></tr></thead>
        <tbody>${r.breaches.slice(0, 15).map((b) => `<tr>
          <td>${esc(b.invoice.id)}</td><td>${esc(b.vendorName)}</td><td>${inr(b.invoice.amount)}</td>
          <td>${esc(b.deadline)}</td><td>${esc(b.paidOn)}</td><td class="late">${b.daysLate}d</td>
          <td>${inr(b.exposure)}</td><td class="conf">${b.identityConfidence}</td></tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="panel next">
      <h3>The point of the number</h3>
      <p>The same pattern is live now. <a href="#" id="toQueue">Open the live queue</a> — ${state ? state.summary.byLevel.red : 0} payables are red today,
      ${state ? inr(state.summary.exposure) : ''} at stake this quarter. The audit is what proves it is worth acting on; it is not the deliverable.</p>
    </div>`;
  const link = $('toQueue');
  if (link) link.addEventListener('click', (e) => { e.preventDefault(); show('queue'); });
}

async function loadRetro() {
  hint('Reconstructing last year against per-date vendor status…', true);
  try {
    retroData = await api('/api/audit/retro');
    renderSummary();
    renderRetro();
    hint(`Reconstructed ${retroData.invoicesReviewed} invoices. Reported decomposed by confidence, never as one number.`);
  } catch (err) {
    hint(err.message);
    $('retro').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

// ----------------------------------------------------------------- wiring

function wireQueue() {
  document.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', (ev) => { if (!ev.target.closest('button')) toggle(el.dataset.toggle); });
  });
  document.querySelectorAll('[data-pay]').forEach((el) => {
    el.addEventListener('click', (ev) => { ev.stopPropagation(); pay(el.dataset.pay, el.dataset.auto === '1', el); });
  });
  document.querySelectorAll('[data-confirm]').forEach((el) => {
    el.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      el.disabled = true; el.textContent = 'Confirming…';
      try {
        const { payout, queue } = await api(`/api/invoices/${el.dataset.confirm}/confirm`, { method: 'POST' });
        render(queue);
        hint(`RazorpayX confirmed ${payout.payoutId} processed (UTR ${payout.utr}). Compliance item closed.`);
      } catch (err) { hint(err.message); el.disabled = false; el.textContent = 'Confirm payout'; }
    });
  });
  document.querySelectorAll('[data-reanalyse]').forEach((el) => {
    el.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const id = el.dataset.reanalyse;
      el.disabled = true; el.textContent = 'Investigating…';
      hint(`Re-running the invoice agent on ${id}…`, true);
      try {
        const queue = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ invoiceId: id, refresh: true }) });
        recommendations.delete(id);
        openRows.add(id);
        render(queue);
        toggle(id, true);
        const a = queue.assessments.find((x) => x.invoice.id === id);
        hint(`${id} re-analysed by ${a.finding.mode === 'ai' ? a.finding.model : a.finding.mode}.`);
      } catch (err) { hint(err.message); el.disabled = false; el.textContent = 'Re-analyse this row'; }
    });
  });
}

function wireVendors() {
  document.querySelectorAll('[data-vtoggle]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('button')) return;
      const id = el.dataset.vtoggle;
      const rowEl = document.querySelector(`.row[data-vid="${id}"]`);
      const det = document.querySelector(`[data-vdetail="${id}"]`);
      if (openVendors.has(id)) { openVendors.delete(id); rowEl.classList.remove('open'); return; }
      openVendors.add(id);
      rowEl.classList.add('open');
      det.innerHTML = vendorDetail(vendorRows.find((r) => r.vendor.id === id));
    });
  });
  document.querySelectorAll('[data-resweep]').forEach((el) => {
    el.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const id = el.dataset.resweep;
      el.disabled = true; el.textContent = 'Investigating…';
      hint(`Re-classifying ${id}…`, true);
      try {
        const out = await api('/api/sweep', { method: 'POST', body: JSON.stringify({ vendorId: id }) });
        vendorRows = out.vendors;
        openVendors.add(id);
        renderSummary();
        renderVendors();
        hint(`${id} re-classified by ${out.finding.mode === 'ai' ? out.finding.model : out.finding.mode}.`);
      } catch (err) { hint(err.message); el.disabled = false; el.textContent = 'Re-sweep'; }
    });
  });
}

async function toggle(id, forceOpen = false) {
  const a = state.assessments.find((x) => x.invoice.id === id);
  if (!a) return;
  const rowEl = document.querySelector(`.row[data-id="${id}"]`);
  const det = document.querySelector(`[data-detail="${id}"]`);
  if (!rowEl || !det) return;

  if (openRows.has(id) && !forceOpen) { openRows.delete(id); rowEl.classList.remove('open'); return; }
  openRows.add(id);
  rowEl.classList.add('open');
  det.innerHTML = detail(a);
  wireQueue();

  if (!recommendations.has(id)) {
    try {
      const { recommendation } = await api(`/api/invoices/${id}/recommendation`);
      recommendations.set(id, recommendation);
    } catch (err) {
      recommendations.set(id, { text: `Could not generate a recommendation: ${err.message}`, mode: 'error' });
    }
    if (openRows.has(id)) {
      document.querySelector(`[data-detail="${id}"]`).innerHTML = detail(state.assessments.find((x) => x.invoice.id === id));
      wireQueue();
    }
  }
}

async function pay(id, auto, btn) {
  btn.disabled = true;
  btn.textContent = auto ? 'Scheduling…' : 'Paying…';
  try {
    const { payout, queue } = await api(`/api/invoices/${id}/pay`, {
      method: 'POST', body: JSON.stringify({ auto, approver: 'finance.user@demo' }),
    });
    hint(`Payout ${payout.payoutId} ${payout.status} for ${payout.date} (${payout.source}). Not closed yet — confirm the payout to close the item.`);
    recommendations.delete(id);
    render(queue);
  } catch (err) {
    hint(`Could not execute: ${err.message}`);
    btn.disabled = false;
    btn.textContent = auto ? 'Auto-schedule' : 'Pay now';
  }
}

// ---------------------------------------------------------------- controls

document.querySelectorAll('.tab').forEach((el) => el.addEventListener('click', () => show(el.dataset.tab)));

async function runSweep(forceHeuristic) {
  const btns = [$('btnSweep'), $('btnSweepFast')];
  btns.forEach((b) => { b.disabled = true; });
  try {
    await api('/api/sweep', { method: 'POST', body: JSON.stringify({ refresh: true, forceHeuristic }) });
    show('vendors');

    // The sweep runs server-side; poll so the page never looks hung.
    let last = -1;
    for (;;) {
      const out = await api('/api/sweep/status');
      vendorRows = out.vendors;
      if (out.sweep.done !== last) {
        last = out.sweep.done;
        renderSummary();
        renderVendors();
      }
      if (state) { state.sweep = out.sweep; renderChrome(); }

      if (!out.sweep.running) {
        if (out.sweep.error) { hint(`Sweep failed: ${out.sweep.error}`); break; }
        state = await api('/api/state');
        renderChrome();
        const unknown = vendorRows.filter((r) => r.coverage && r.coverage.result === 'unknown').length;
        const excluded = vendorRows.filter((r) => r.coverage && r.coverage.result === 'not_covered');
        const fell = out.sweep.fellBack;
        hint(`Swept ${vendorRows.length} vendors. ${excluded.length} out of scope (${inr(excluded.reduce((s, r) => s + r.totalValue, 0))} of payments), ${unknown} unresolved.`
          + (fell ? ` ${fell} fell back to the heuristic arm — the AI provider was unavailable or out of quota.` : ''));
        break;
      }

      hint(`${out.sweep.mode === 'ai' ? 'Portfolio agent' : 'Heuristic classifier'} working — ${out.sweep.done}/${out.sweep.total} vendors`
        + (out.sweep.current ? ` (on ${out.sweep.current})` : '') + '. Results appear as they land.', true);
      await new Promise((r) => setTimeout(r, 700));
    }
  } catch (err) {
    hint(`Sweep failed: ${err.message}`);
  }
  btns.forEach((b) => { b.disabled = false; });
}

$('btnSweep').addEventListener('click', () => runSweep(false));
$('btnSweepFast').addEventListener('click', () => runSweep(true));

$('btnAnalyze').addEventListener('click', async () => {
  const btn = $('btnAnalyze');
  btn.disabled = true;
  hint(state?.mode.ai ? 'Invoice agent is reading contracts and acceptance documents…' : 'Running heuristic extraction over the live ledger…', true);
  try {
    recommendations.clear();
    render(await api('/api/analyze', { method: 'POST', body: JSON.stringify({ refresh: true }) }));
    show('queue');
    hint(`Analysed ${state.summary.count} live payables · ${state.summary.byLevel.red} red · ${state.summary.byLevel.grey} held for review. Click a row for the evidence chain.`);
  } catch (err) { hint(`Analysis failed: ${err.message}`); }
  btn.disabled = false;
});

$('btnAuto').addEventListener('click', async () => {
  const btn = $('btnAuto');
  btn.disabled = true;
  hint('Scheduling every actionable invoice at or under the threshold…', true);
  try {
    const { executed, queue } = await api('/api/auto-execute', { method: 'POST' });
    render(queue);
    show('queue');
    hint(executed.length
      ? `Auto-scheduled ${executed.length}: ${executed.map((e) => e.invoiceId).join(', ')}. Each still needs payout confirmation to close.`
      : 'Nothing eligible at or under the auto-execute threshold.');
  } catch (err) { hint(err.message); }
  btn.disabled = false;
});

$('btnConfig').addEventListener('click', async () => {
  try {
    render(await api('/api/config', {
      method: 'POST',
      body: JSON.stringify({
        bufferDays: $('cfgBuffer').value,
        taxRatePct: $('cfgTax').value,
        autoExecuteThreshold: $('cfgThreshold').value,
        identityConfidenceFloor: $('cfgFloor').value,
      }),
    }));
    recommendations.clear();
    vendorRows = (await api('/api/vendors')).vendors;
    retroData = null;
    renderSummary();
    hint('Policy updated and everything reclassified. The 45/15-day rule and the coverage rule are unchanged — only the buffer, rate, threshold and confidence floor are yours to set.');
  } catch (err) { hint(err.message); }
});

$('btnNew').addEventListener('click', async () => {
  const sel = $('niVendor');
  if (!sel.options.length) {
    const { vendors } = await api('/api/vendors');
    sel.innerHTML = vendors.map((r) => `<option value="${esc(r.vendor.id)}">${esc(r.vendor.ledgerName)} (${esc(r.vendor.id)})</option>`).join('');
  }
  if (!$('niInvoiceDate').value) $('niInvoiceDate').value = state?.today || new Date().toISOString().slice(0, 10);
  $('newDialog').showModal();
});

$('closeNew').addEventListener('click', () => $('newDialog').close());

$('newForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Analysing…';
  try {
    const { invoice, queue } = await api('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        vendorId: $('niVendor').value,
        amount: Number($('niAmount').value),
        invoiceDate: $('niInvoiceDate').value,
        acceptedOn: $('niAccepted').value || undefined,
        description: $('niDesc').value || 'Manual entry',
      }),
    });
    $('newDialog').close();
    justAdded = invoice.id;
    openRows.add(invoice.id);
    recommendations.delete(invoice.id);
    render(queue);
    show('queue');
    document.querySelector(`.row[data-id="${invoice.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toggle(invoice.id, true);
    const a = queue.assessments.find((x) => x.invoice.id === invoice.id);
    hint(a && a.calc
      ? `${invoice.id} → ${a.calc.allowedDays}-day period (${a.calc.rule.replace(/_/g, ' ')}), deadline ${a.calc.deadline}, ${a.risk.level.toUpperCase()}.`
      : `${invoice.id} → ${a?.coverage?.result || 'unresolved'} (${a?.coverage?.reasonCode || ''}). No statutory deadline.`);
  } catch (err) { hint(`Could not add the invoice: ${err.message}`); }
  btn.disabled = false; btn.textContent = 'Add and analyse';
});

$('btnAudit').addEventListener('click', async () => {
  const { audit } = await api('/api/audit');
  $('auditBody').innerHTML = audit.length
    ? audit.map((e) => `
      <div class="audit-entry">
        <div class="meta"><span class="type ${esc(e.type)}">${esc(e.type)}</span>${esc(e.at)}${e.invoiceId ? ` · ${esc(e.invoiceId)}` : ''}${e.vendorId ? ` · ${esc(e.vendorId)}` : ''} · ${esc(e.actor || 'system')}</div>
        <div class="detail-text">${esc(e.detail)}</div>
        ${e.reasoning ? `<div class="reasoning">${(e.reasoning.workings || []).map(esc).join('<br>')}${e.reasoning.coverage ? `<br>coverage: ${esc(e.reasoning.coverage.result)} (${esc(e.reasoning.coverage.reasonCode)})` : ''}${e.reasoning.exposureAvoided ? `<br>exposure avoided: ${inr(e.reasoning.exposureAvoided)}` : ''}</div>` : ''}
        ${e.trace ? `<div class="reasoning">${e.trace.map((t) => esc(`${t.tool} — ${t.summary}`)).join('<br>')}</div>` : ''}
      </div>`).join('')
    : '<p class="empty">Nothing logged yet.</p>';
  $('auditDialog').showModal();
});

$('closeAudit').addEventListener('click', () => $('auditDialog').close());

(async function boot() {
  try {
    state = await api('/api/state');
    vendorRows = (await api('/api/vendors')).vendors;
    render(state);
    if (!state.sweep.complete) {
      hint(`${state.sweep.total} vendors loaded, none classified yet. Start with <strong>Run portfolio sweep</strong> — coverage is a property of the vendor, and everything downstream depends on it.`);
      $('hint').innerHTML = $('hint').textContent.replace('Run portfolio sweep', '<strong>Run portfolio sweep</strong>');
    }
  } catch (err) { hint(`Could not load: ${err.message}`); }
})();
