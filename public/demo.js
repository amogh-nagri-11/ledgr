/**
 * ?demo=1 — the autopilot.
 *
 * Drives the whole DEMO.md script hands-free: slides, tab switches, row opens,
 * the payout and its confirmation, with a caption bar and optional narration.
 * The point is to record a demo video in one take, with no editing and no
 * syncing: the audio plays inside the page, so a screen recorder capturing
 * system audio gets picture and sound already aligned.
 *
 *   ?demo=1            captions, timed from word count
 *   &voice=0           force silence even if narration has been generated
 *   &full=1            include the optional section 7 beats
 *   &wpm=150           override the caption pace
 *   &from=s6a          start at a given beat (rehearsing one section)
 *
 * Keys: space play/pause · arrows step · r restart · h hide the chrome.
 *
 * This file is loaded only when ?demo=1 is present, and it never modifies app
 * state directly -- it calls the same functions the buttons call, so what gets
 * recorded is the real application, not a reenactment of it.
 */
(function () {
  const params = new URLSearchParams(location.search);
  if (params.get('demo') !== '1') return;

  const WANT_VOICE = params.get('voice') !== '0';
  const WANT_FULL = params.get('full') === '1';
  const WPM_OVERRIDE = Number(params.get('wpm')) || null;
  const START_AT = params.get('from');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (sel) => document.querySelector(sel);

  let script = null;
  let beats = [];
  let index = 0;
  let playing = false;
  let aborted = 0;          // bumped to cancel an in-flight beat
  let audio = null;
  let chromeHidden = false;

  // ------------------------------------------------------------------ layout

  const layer = document.createElement('div');
  layer.id = 'dmo';
  layer.innerHTML = `
    <div id="dmo-slide" hidden></div>
    <div id="dmo-caption" hidden><span id="dmo-section"></span><p id="dmo-text"></p></div>
    <div id="dmo-bar">
      <button id="dmo-play" title="Space">Play</button>
      <button id="dmo-prev" title="Left arrow">&lsaquo;</button>
      <button id="dmo-next" title="Right arrow">&rsaquo;</button>
      <button id="dmo-restart" title="R">Restart</button>
      <span id="dmo-pos">—</span>
      <span id="dmo-mode"></span>
    </div>`;
  document.body.appendChild(layer);

  const $slide = q('#dmo-slide');
  const $caption = q('#dmo-caption');
  const $section = q('#dmo-section');
  const $text = q('#dmo-text');
  const $bar = q('#dmo-bar');
  const $pos = q('#dmo-pos');
  const $mode = q('#dmo-mode');

  // ------------------------------------------------------------- pausable wait

  /**
   * Sleeping in one lump makes pause impossible, so tick instead and push the
   * deadline forward while paused. `aborted` lets prev/next/restart cut a beat
   * short without leaving an orphaned timer to fire later over the next one.
   */
  async function wait(ms) {
    const mine = aborted;
    let end = Date.now() + ms;
    for (;;) {
      if (aborted !== mine) throw new Error('cancelled');
      const now = Date.now();
      if (!playing) { end = now + (end - now); await sleep(60); continue; }
      if (now >= end) return;
      await sleep(Math.min(60, end - now));
    }
  }

  // ------------------------------------------------------------------ actions

  function ripple(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'dmo-ripple';
    dot.style.left = `${r.left + r.width / 2}px`;
    dot.style.top = `${r.top + r.height / 2}px`;
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 800);
  }

  function pulse(el) {
    if (!el) return;
    el.classList.add('dmo-pulse');
    setTimeout(() => el.classList.remove('dmo-pulse'), 2600);
  }

  function showSlide(id) {
    const s = script.slides[id];
    if (!s) return warn(`no slide "${id}"`);
    $slide.innerHTML = `<div class="dmo-slide-inner">
      ${s.kicker ? `<div class="dmo-kicker">${s.kicker}</div>` : ''}
      <h2>${s.title}</h2>
      <div class="dmo-body">${s.body || ''}</div>
    </div>`;
    $slide.hidden = false;
  }

  const hideSlide = () => { $slide.hidden = true; };

  function warn(msg) {
    console.warn(`[demo] ${msg}`);
  }

  /**
   * Every action is best-effort. A demo that stops dead because one selector
   * moved is worse than one that carries on with the narration -- especially
   * mid-recording, and especially on a second run where a payout already
   * exists and "Pay now" has become "Confirm payout".
   */
  async function act(a) {
    if (!a) return;
    if (a.type !== 'slide') hideSlide();

    switch (a.type) {
      case 'slide':
        return showSlide(a.id);

      case 'tab':
        show(a.id);
        return wait(400);

      case 'openRow': {
        if (a.close && openRows.has(a.close)) await toggle(a.close);
        show('queue');
        await wait(250);
        const head = q(`[data-toggle="${a.id}"]`);
        if (!head) return warn(`no invoice row ${a.id}`);
        ripple(head);
        if (!openRows.has(a.id)) await toggle(a.id, true);
        await wait(350);
        const rowEl = q(`.row[data-id="${a.id}"]`);
        if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return wait(500);
      }

      case 'openVendor': {
        show('vendors');
        await wait(250);
        if (a.close && openVendors.has(a.close)) {
          const prev = q(`[data-vtoggle="${a.close}"]`);
          if (prev) prev.click();
          await wait(200);
        }
        const head = q(`[data-vtoggle="${a.id}"]`);
        if (!head) return warn(`no vendor row ${a.id} — has the sweep been run?`);
        ripple(head);
        if (!openVendors.has(a.id)) head.click();
        await wait(350);
        const rowEl = q(`.row[data-vid="${a.id}"]`);
        if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return wait(500);
      }

      case 'retro': {
        show('retro');
        await wait(250);
        if (typeof retroData === 'undefined' || !retroData) await loadRetro();
        return wait(500);
      }

      case 'click': {
        const el = q(a.selector);
        if (!el) return warn(`nothing matches ${a.selector}`);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(400);
        ripple(el);
        el.click();
        return wait(600);
      }

      case 'scrollTo': {
        const el = q(a.selector);
        if (!el) return warn(`nothing matches ${a.selector}`);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return wait(600);
      }

      case 'highlight': {
        const el = q(a.selector);
        if (!el) return warn(`nothing matches ${a.selector}`);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(300);
        pulse(el);
        return wait(300);
      }

      case 'newInvoice': {
        show('queue');
        const today = new Date().toISOString().slice(0, 10);
        q('#btnNew').click();
        await wait(500);
        q('#niVendor').value = a.vendor;
        q('#niAmount').value = a.amount;
        q('#niInvoiceDate').value = today;
        q('#niAccepted').value = today;
        q('#niDesc').value = a.desc;
        await wait(700);
        const submit = q('#newForm button[type="submit"]');
        ripple(submit);
        q('#newForm').requestSubmit();
        return wait(1200);
      }

      default:
        return warn(`unknown action "${a.type}"`);
    }
  }

  // -------------------------------------------------------------------- beats

  function captionOf(b) {
    $section.textContent = b.section || '';
    $text.textContent = b.caption;
    $caption.classList.toggle('quote', b.style === 'quote');
    $caption.hidden = false;
  }

  function durationOf(b) {
    if (b.seconds) return b.seconds * 1000;
    const wpm = WPM_OVERRIDE || script.wpm || 135;
    const words = b.caption.trim().split(/\s+/).length;
    return (words / wpm) * 60000;
  }

  function stopAudio() {
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
  }

  /** Resolves when the clip ends, or immediately if it cannot be played. */
  function speak(b) {
    return new Promise((resolve) => {
      if (!WANT_VOICE || !b.audio) return resolve(false);
      audio = new Audio(b.audio);
      audio.onended = () => resolve(true);
      audio.onerror = () => { warn(`missing narration ${b.audio}`); resolve(false); };
      audio.play().catch(() => resolve(false));
    });
  }

  async function playBeat(b) {
    captionOf(b);
    $pos.textContent = `${index + 1} / ${beats.length}`;
    await act(b.action);

    // Narration, where it exists, is the clock: the beat ends when the clip
    // does. Without it, fall back to reading pace so the captions still land.
    const spoken = await speak(b);
    if (!spoken) await wait(durationOf(b));

    if (b.hold) await wait(b.hold * 1000);
  }

  async function run() {
    while (playing && index < beats.length) {
      try {
        await playBeat(beats[index]);
      } catch (err) {
        if (err.message === 'cancelled') return;   // prev/next/restart took over
        console.error('[demo]', err);
      }
      if (!playing) return;
      index += 1;
    }
    if (index >= beats.length) {
      playing = false;
      $pos.textContent = 'done';
      setPlayLabel();
      $bar.classList.remove('idle');
    }
  }

  // ----------------------------------------------------------------- controls

  const setPlayLabel = () => { q('#dmo-play').textContent = playing ? 'Pause' : 'Play'; };

  function start() {
    if (playing) return;
    playing = true;
    setPlayLabel();
    $bar.classList.add('idle');
    // Resuming mid-sentence picks the clip up where it stopped rather than
    // restarting the beat, so a pause is invisible in the recording.
    if (audio && audio.paused && !audio.ended) { audio.play().catch(() => {}); return; }
    run();
  }

  function pause() {
    playing = false;
    if (audio) audio.pause();
    setPlayLabel();
    $bar.classList.remove('idle');
  }

  function jump(to) {
    aborted += 1;
    stopAudio();
    index = Math.max(0, Math.min(beats.length - 1, to));
    const wasPlaying = playing;
    playing = false;
    captionOf(beats[index]);
    $pos.textContent = `${index + 1} / ${beats.length}`;
    if (wasPlaying) setTimeout(start, 30);
  }

  q('#dmo-play').addEventListener('click', () => (playing ? pause() : start()));
  q('#dmo-next').addEventListener('click', () => jump(index + 1));
  q('#dmo-prev').addEventListener('click', () => jump(index - 1));
  q('#dmo-restart').addEventListener('click', () => { jump(0); hideSlide(); });

  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, select, textarea')) return;
    if (ev.code === 'Space') { ev.preventDefault(); playing ? pause() : start(); }
    if (ev.code === 'ArrowRight') jump(index + 1);
    if (ev.code === 'ArrowLeft') jump(index - 1);
    if (ev.key === 'r') { jump(0); hideSlide(); }
    if (ev.key === 'h') {
      chromeHidden = !chromeHidden;
      layer.classList.toggle('bare', chromeHidden);
    }
  });

  // The bar fades while playing so it stays out of the recording, and comes
  // back the moment the mouse moves -- you still need to be able to stop.
  let idleTimer = null;
  document.addEventListener('mousemove', () => {
    $bar.classList.remove('idle');
    clearTimeout(idleTimer);
    if (playing) idleTimer = setTimeout(() => $bar.classList.add('idle'), 2000);
  });

  // -------------------------------------------------------------------- boot

  (async function boot() {
    // app.js boots asynchronously; driving it before state lands opens rows
    // that have not been rendered yet.
    for (let i = 0; i < 100 && typeof state !== 'undefined' && !state; i += 1) await sleep(100);

    try {
      script = await (await fetch('demo-script.json')).json();
    } catch (err) {
      hint(`Demo script failed to load: ${err.message}`);
      return;
    }

    beats = script.beats.filter((b) => WANT_FULL || !b.optional);
    if (START_AT) {
      const at = beats.findIndex((b) => b.id === START_AT);
      if (at >= 0) index = at; else warn(`no beat "${START_AT}"`);
    }

    const voiced = beats.filter((b) => b.audio).length;
    $mode.textContent = !WANT_VOICE ? 'silent'
      : voiced === beats.length ? 'narrated'
      : voiced ? `narrated ${voiced}/${beats.length}`
      : 'captions only — run npm run demo:voice';

    captionOf(beats[index]);
    $pos.textContent = `${index + 1} / ${beats.length}`;
    $caption.hidden = false;

    const swept = typeof state !== 'undefined' && state && state.sweep && state.sweep.complete;
    hint(swept
      ? 'Demo autopilot ready. Press Play, or Space. Arrows step, R restarts, H hides the controls.'
      : 'Demo autopilot loaded — but the portfolio sweep has not been run, so the vendor and audit beats will have nothing to show.');
  })();
}());
