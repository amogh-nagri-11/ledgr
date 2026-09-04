const $ = (id) => document.getElementById(id);
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DOT = { red: '\u{1F534}', amber: '\u{1F7E1}', green: '\u{1F7E2}', grey: '⚪' };

let state = null;
let justAdded = null;
const openRows = new Set();
const recommendations = new Map();

function hint(msg, spinning = false) {
  $('hint').innerHTML = spinning ? `<span class="spinner">◌</span> ${esc(msg)}` : esc(msg);
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function render(data) {
  if (data) state = data;
  if (!state) return;

  $('modeAi').textContent = `AI: ${state.mode.provider || 'heuristic fallback'}`;
  $('modeAi').classList.toggle('live', state.mode.ai);
  $('modePayout').textContent = `Payouts: RazorpayX ${state.mode.payouts}`;
  $('modePayout').classList.toggle('live', state.mode.payouts === 'sandbox');
  $('modeDate').textContent = `Today ${state.today}`;

  $('cfgBuffer').value = state.config.bufferDays;
  $('cfgTax').value = state.config.taxRatePct;
  $('cfgThreshold').value = state.config.autoExecuteThreshold;

  const s = state.summary;
  $('summary').innerHTML = `
    ${tile('Breach imminent', s.byLevel.red, `${s.byLevel.amber} amber · ${s.byLevel.grey} need review`, 'red')}
    ${tile('Payables at risk', inr(s.atRisk), 'red + amber invoices', '')}
    ${tile('Deduction exposure', inr(s.exposure), `extra tax at ${state.config.taxRatePct}% if missed`, 'exposure')}
    ${tile('Clear', s.byLevel.green, `of ${s.count} invoices assessed`, '')}
  `;

  const q = $('queue');
  if (!state.assessments.length) {
    q.innerHTML = '<p class="empty">No analysis yet. Click <strong>Run compliance analysis</strong> to walk the ledger.</p>';
    return;
  }
  q.innerHTML = state.assessments.map(row).join('');
  wire();
}

function tile(k, v, s, cls) {
  return `<div class="tile ${cls}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`;
}

function row(a) {
  const id = a.invoice.id;
  const open = openRows.has(id);
  const lvl = a.risk.level;
  const pill = a.calc
    ? `<span class="deadline-pill ${lvl}">due ${a.calc.deadline}${a.risk.daysLeft != null ? ` · ${a.risk.daysLeft}d` : ''}</span>`
    : '<span class="deadline-pill">no statutory deadline</span>';

  let action = '';
  if (a.payout) {
    action = `<span class="deadline-pill">${a.payout.status} ${a.payout.date}</span>`;
  } else if (a.finding.needsHumanReview) {
    action = '<span class="deadline-pill">needs review</span>';
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
        <div class="sub">${esc(id)} · ${esc(a.invoice.invoiceDate)}${a.finding.vendorMatch.enterpriseClass ? ` · ${esc(a.finding.vendorMatch.enterpriseClass)}` : ''}</div>
      </div>
      <div class="amt">${inr(a.invoice.amount)}${a.exposure ? `<span class="exp">${inr(a.exposure)} at stake</span>` : ''}</div>
      <div class="status"><span class="lead">${esc(a.risk.headline)}</span></div>
      <div class="row-actions">${pill}${action}</div>
    </div>
    <div class="detail" data-detail="${id}">${open ? detail(a) : ''}</div>
  </article>`;
}

function detail(a) {
  const f = a.finding;
  const rec = recommendations.get(a.invoice.id);

  const review = f.needsHumanReview
    ? `<div class="review-note"><strong>Held for review.</strong> ${esc(f.reviewReason)}</div>`
    : '';

  const aiTag = `<span class="ai-badge">${esc(f.mode === 'ai' ? (f.model || 'ai') : f.mode)}</span>`;

  return `
    ${review ? `<section>${review}</section>` : ''}

    <section>
      <h4>Recommendation ${rec ? (rec.mode === 'ai' ? '<span class="ai-badge">generated</span>' : '<span class="ai-badge">template</span>') : ''}</h4>
      <div class="recommendation">${rec ? esc(rec.text) : '<span class="spinner">◌</span> generating…'}</div>
    </section>

    <div class="grid2">
      <section>
        <h4>Extracted inputs &amp; evidence ${aiTag}</h4>
        <ul class="evidence">
          <li>
            <span class="lbl">vendor identity <span class="conf">conf ${f.vendorMatch.confidence}</span></span>
            <span class="val">${f.vendorMatch.found
              ? `${esc(f.vendorMatch.registeredName)} — ${esc(f.vendorMatch.udyamNumber)} (${esc(f.vendorMatch.enterpriseClass)})`
              : 'no Udyam registration matched'}</span>
            <span class="quote">${esc(f.vendorMatch.evidence)}</span>
          </li>
          <li>
            <span class="lbl">written agreement</span>
            <span class="val">${f.agreement.exists
              ? `yes — ${esc(f.agreement.documentRef)}, states ${f.agreement.statedTermDays ?? 'no'} day term`
              : 'none on file'}</span>
            <span class="quote">${esc(f.agreement.evidence)}</span>
          </li>
          <li>
            <span class="lbl">clock start <span class="conf">conf ${f.clockStart.confidence}</span></span>
            <span class="val">${esc(f.clockStart.date)} — ${esc(String(f.clockStart.basis).replace(/_/g, ' '))}</span>
            <span class="quote">${esc(f.clockStart.evidence)}</span>
          </li>
        </ul>
      </section>

      <section>
        <h4>Statutory calculation <span class="engine-badge">deterministic</span></h4>
        ${a.calc ? `<ul class="workings">${a.calc.workings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
          <ul class="workings"><li>Cost if missed: ${inr(a.invoice.amount)} deduction disallowed × ${a.config.taxRatePct}% = ${inr(a.exposure)} extra tax this year.</li>
          <li>Recommended pay-by (deadline − ${a.config.bufferDays}d buffer): ${esc(a.risk.payBy)}</li></ul>`
        : '<ul class="workings"><li>Vendor is not a micro or small enterprise under the Udyam registry, so s.43B(h) does not engage. No statutory deadline.</li></ul>'}
      </section>
    </div>

    <section>
      <h4>Investigation trail (${f.trace.length} tool calls)
        <button class="small ghost reanalyse" data-reanalyse="${a.invoice.id}">Re-analyse this row</button>
      </h4>
      <ul class="trace">
        ${f.trace.map((t) => `<li><span class="tool">${esc(t.tool)}</span> — ${esc(t.summary)}</li>`).join('')}
      </ul>
    </section>`;
}

function wire() {
  document.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('button')) return;
      toggle(el.dataset.toggle);
    });
  });
  document.querySelectorAll('[data-reanalyse]').forEach((el) => {
    el.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const id = el.dataset.reanalyse;
      el.disabled = true;
      el.textContent = 'Investigating…';
      hint(`Re-running the agent on ${id}…`, true);
      try {
        const queue = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ invoiceId: id, refresh: true }) });
        recommendations.delete(id);
        openRows.add(id);
        render(queue);
        const a = queue.assessments.find((x) => x.invoice.id === id);
        toggle(id, true);
        hint(`${id} re-analysed by ${a.finding.mode === 'ai' ? a.finding.model : a.finding.mode}.`);
      } catch (err) {
        hint(`Re-analysis failed: ${err.message}`);
        el.disabled = false;
        el.textContent = 'Re-analyse this row';
      }
    });
  });
  document.querySelectorAll('[data-pay]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      pay(el.dataset.pay, el.dataset.auto === '1', el);
    });
  });
}

async function toggle(id, forceOpen = false) {
  const a = state.assessments.find((x) => x.invoice.id === id);
  if (!a) return;
  const rowEl = document.querySelector(`.row[data-id="${id}"]`);
  const detailEl = document.querySelector(`[data-detail="${id}"]`);
  if (!rowEl || !detailEl) return;

  if (openRows.has(id) && !forceOpen) {
    openRows.delete(id);
    rowEl.classList.remove('open');
    return;
  }
  openRows.add(id);
  rowEl.classList.add('open');
  detailEl.innerHTML = detail(a);

  if (!recommendations.has(id)) {
    try {
      const { recommendation } = await api(`/api/invoices/${id}/recommendation`);
      recommendations.set(id, recommendation);
    } catch (err) {
      recommendations.set(id, { text: `Could not generate a recommendation: ${err.message}`, mode: 'error' });
    }
    if (openRows.has(id)) detailEl.innerHTML = detail(state.assessments.find((x) => x.invoice.id === id));
  }
}

async function pay(id, auto, btn) {
  btn.disabled = true;
  btn.textContent = auto ? 'Scheduling…' : 'Paying…';
  try {
    const { payout, queue } = await api(`/api/invoices/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ auto, approver: 'finance.user@demo' }),
    });
    hint(`Payout ${payout.payoutId} ${payout.status} for ${payout.date} via RazorpayX (${payout.source}). Logged to audit.`);
    recommendations.delete(id);
    render(queue);
  } catch (err) {
    hint(`Could not execute: ${err.message}`);
    btn.disabled = false;
    btn.textContent = auto ? 'Auto-schedule' : 'Pay now';
  }
}

$('btnAnalyze').addEventListener('click', async () => {
  const btn = $('btnAnalyze');
  btn.disabled = true;
  hint(state?.mode.ai
    ? `Agent (${state.mode.provider}) is reading contracts, querying the Udyam registry and walking delivery trails…`
    : 'Running heuristic extraction over the ledger…', true);
  try {
    recommendations.clear();
    render(await api('/api/analyze', { method: 'POST', body: JSON.stringify({ refresh: true }) }));
    hint(`Analysed ${state.summary.count} invoices · ${state.summary.byLevel.red} red · ${state.summary.byLevel.grey} need review. Click any row for the evidence chain.`);
  } catch (err) {
    hint(`Analysis failed: ${err.message}`);
  }
  btn.disabled = false;
});

$('btnAuto').addEventListener('click', async () => {
  const btn = $('btnAuto');
  btn.disabled = true;
  hint('Scheduling every actionable invoice at or under the threshold…', true);
  try {
    const { executed, queue } = await api('/api/auto-execute', { method: 'POST' });
    render(queue);
    hint(executed.length
      ? `Auto-scheduled ${executed.length} payout(s): ${executed.map((e) => e.invoiceId).join(', ')}. Logged to audit.`
      : 'Nothing eligible: no actionable invoice is at or under the auto-execute threshold.');
  } catch (err) {
    hint(`Auto-execute failed: ${err.message}`);
  }
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
      }),
    }));
    recommendations.clear();
    hint('Policy updated and the queue reclassified. The statutory 45/15-day rule is unchanged — only the buffer and thresholds are configurable.');
  } catch (err) {
    hint(`Could not update policy: ${err.message}`);
  }
});

$('btnNew').addEventListener('click', async () => {
  const sel = $('niVendor');
  if (!sel.options.length) {
    const { vendors } = await api('/api/vendors');
    sel.innerHTML = vendors
      .map((v) => `<option value="${esc(v.id)}">${esc(v.ledgerName)} (${esc(v.id)})</option>`)
      .join('');
  }
  const today = state?.today || new Date().toISOString().slice(0, 10);
  if (!$('niInvoiceDate').value) $('niInvoiceDate').value = today;
  $('newDialog').showModal();
});

$('closeNew').addEventListener('click', () => $('newDialog').close());

$('newForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Analysing…';
  try {
    const body = {
      vendorId: $('niVendor').value,
      amount: Number($('niAmount').value),
      invoiceDate: $('niInvoiceDate').value,
      acceptedOn: $('niAccepted').value || undefined,
      description: $('niDesc').value || 'Manual entry',
    };
    const { invoice, queue } = await api('/api/invoices', { method: 'POST', body: JSON.stringify(body) });
    $('newDialog').close();
    justAdded = invoice.id;
    openRows.add(invoice.id);
    recommendations.delete(invoice.id);
    render(queue);
    const el = document.querySelector(`.row[data-id="${invoice.id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toggle(invoice.id, true);     // fetch and show the recommendation
    const a = queue.assessments.find((x) => x.invoice.id === invoice.id);
    hint(a && a.calc
      ? `${invoice.id} added and analysed → ${a.calc.allowedDays}-day period (${a.calc.rule.replace(/_/g, ' ')}), deadline ${a.calc.deadline}, ${a.risk.level.toUpperCase()}.`
      : `${invoice.id} added and analysed → outside s.43B(h), no statutory deadline.`);
  } catch (err) {
    hint(`Could not add the invoice: ${err.message}`);
  }
  btn.disabled = false;
  btn.textContent = 'Add and analyse';
});

$('btnAudit').addEventListener('click', async () => {
  const { audit } = await api('/api/audit');
  $('auditBody').innerHTML = audit.length
    ? audit.map((e) => `
      <div class="audit-entry">
        <div class="meta"><span class="type ${esc(e.type)}">${esc(e.type)}</span>${esc(e.at)}${e.invoiceId ? ` · ${esc(e.invoiceId)}` : ''} · ${esc(e.actor || 'system')}</div>
        <div class="detail-text">${esc(e.detail)}</div>
        ${e.reasoning ? `<div class="reasoning">${(e.reasoning.workings || []).map(esc).join('<br>')}${e.reasoning.clockStart ? `<br>clock start: ${esc(e.reasoning.clockStart.date)} (${esc(e.reasoning.clockStart.basis)})` : ''}${e.reasoning.exposureAvoided ? `<br>exposure avoided: ${inr(e.reasoning.exposureAvoided)}` : ''}</div>` : ''}
        ${e.trace ? `<div class="reasoning">${e.trace.map((t) => esc(`${t.tool} — ${t.summary}`)).join('<br>')}</div>` : ''}
      </div>`).join('')
    : '<p class="empty">Nothing logged yet.</p>';
  $('auditDialog').showModal();
});

$('closeAudit').addEventListener('click', () => $('auditDialog').close());

(async function boot() {
  try {
    render(await api('/api/queue'));
    if (!state.assessments.length) {
      hint('Ledger loaded with 10 demo invoices. Run the analysis to resolve MSME status, agreement terms and acceptance dates.');
    }
  } catch (err) {
    hint(`Could not load: ${err.message}`);
  }
})();
