# Demo script — 5 minutes

Hard-timed. Every figure was pulled from the live app, not remembered —
**re-check them on the day**, because live invoice dates move with the calendar.

> **If you fall behind:** at 3:00 you should be starting Beat 4. If you aren't,
> skip Beat 4 entirely and go straight to Pay/Confirm. It is the one beat that
> can go without breaking the argument.

---

## Setup, before anyone is watching

```powershell
npm start
```

The banner must read `AI layer:  Groq · openai/gpt-oss-120b (+1 fallback)`.
**If it warns findings are stale, run `npm run complete` and wait.** Do not demo
through that warning.

- Browser on **http://localhost:3000**, sitting on the **Vendor portfolio** tab
- A second window with the terminal, in the project directory, ready to type
- Your architecture slide up first

Nothing in this demo makes a live API call. If a quota is exhausted, it changes
nothing.

---

## 0:00 – 0:50 · Your slide

Two things need to land here, so the app never has to re-explain them:

**The problem, in one sentence with a number.**
> Pay a registered micro or small supplier late and you lose the *tax deduction*
> on that purchase for the whole year. ₹5 lakh invoice, 25% tax — ₹1.25 lakh
> gone, purely on timing.

**The architecture, in one line.**
> Two agents read the messy documents and report evidence. Two hardcoded rules
> make every decision. The AI cannot produce a deadline or a coverage call —
> those fields don't exist in what it's allowed to submit.

Say that second part *here*, on the slide. It pre-empts the hardest question,
and you don't want to spend live demo time on it.

Then: **"Let me show you it running."**

---

## 0:50 – 1:35 · Which suppliers does the law even reach?

**You're on Vendor portfolio.** Point at the tiles.

> "24 suppliers. **16 in scope, 6 out, 2 it won't answer.** No business knows
> this — it isn't in any system."

**Click Orion Steel Traders.**

> "Registered. Small. Active. Everything a naive check looks for — and it's
> wrong. Orion is a registered wholesale *trader*, and trade sits outside the
> obligation this section hangs on."

Point at the two panels.

> "Left: what the agent found, with evidence. Right: the rule that decided,
> showing its working. The agent never returns 'covered'."

**Click Vindhya Timber.** *(5 seconds — don't linger)*

> "And this one it refuses. Nothing declared, nothing in the registry —
> *unresolved*, not 'not covered'. Guessing there loses a deduction silently."

---

## 1:35 – 2:05 · What it already cost

**Tab 3 → Reconstruct last year.** Let it render, then point.

> "185 invoices from last year. **₹28.9 lakh of exposure it's confident about** —
> and separately, **₹93 lakh excluded** that a registered-and-small check would
> have counted as exposure."

> "It's never one number. The part resting on a shaky match is broken out, and
> eight it won't classify at all."

*Don't scroll. Don't explain the bands. 30 seconds, then move.*

---

## 2:05 – 3:00 · The one that matters

**Tab 1 → open INV-4124, Sharma Ent., ₹2,36,000.**

> "Same pattern, live — 10 red right now. But look at this one."

> "Invoice dated 30 July, 45-day terms. Every tool counts 45 days from the
> invoice date. **That's the wrong date** — the clock runs from *acceptance*."

**Scroll to the investigation trail. Read the email aloud:**

> *"we have put the whole lot to one side in the yard and we are not booking them
> into stores or raising a receipt note until the certificates reach us"*

> "That's a refusal to accept. It never says 'reject' or 'object', so keyword
> matching walks straight past it and starts the clock **fifteen days early**.
> Acceptance was actually 14 August, when the certificates came and the receipt
> note got signed."

**Pause here.** This is the whole pitch in one row. Let it sit for a beat.

---

## 3:00 – 3:45 · Prove it isn't staged  *(CUT IF BEHIND)*

**+ New invoice.** Vendor `Orion Steel Traders`, amount `200000`, both dates
today, description `TMT bars, bought in and resold`. **Add and analyse.**

> "Two lakh, accepted today, registered small supplier. Comes back **out of
> scope** — no deadline, nothing to chase."

**Again**, changing only the vendor to `Sharma Ent.` and the description to
`Fabricated brackets, made to drawing`.

> "Same amount. Same dates. **45-day deadline, ₹50,000 of exposure.** Nothing
> about the money changed — only who the supplier is and what they actually did."

*(Verified live: Orion → `not_covered / trading_enterprise`, ₹0. Sharma →
covered, 45 days, ₹50,000. Both resolved by the agent, not the fallback.)*

---

## 3:45 – 4:20 · Money moves, and the loop closes

**Find INV-4101, Sharma Ent., ₹5,00,000 — click Pay now.**

> "Above the auto-execute threshold, so it needs a human. RazorpayX Payouts API."

**Point at the row. It has NOT gone green — it says Confirm payout.**

> "This is the bit I'd watch. A payout being *requested* isn't a compliance item
> being *closed*. It closes when RazorpayX confirms the money actually moved."

**Click Confirm payout.** Row closes.

> "Now it's closed. Under ₹10,000 goes automatically. Above it, always a human —
> we don't let a model decide a legal deadline unsupervised."

---

## 4:20 – 4:55 · Does the AI actually earn its place?

**Switch to the terminal.**

```powershell
npm run ablation
```

> "The question I'd ask. We run the identical pipeline twice — once with the
> agent, once with string matching — over the same data, scored by the same code
> against known-correct answers."

| | naive | agent |
|---|---|---|
| Vendor identity | 20/24 | **24/24** |
| Clock start | 20/25 | **25/25** |
| False positives | 3 — **₹45 lakh** | **0** |
| Last year misread | 59/185 — ₹1.06 Cr | **8/185 — ₹27.6 lakh** |

> "Both arms had identical access to the registry. **The difference is judgement,
> not data.**"

---

## 4:55 – 5:00 · Close

> "Everyone counts 45 days from the invoice date. That's the wrong date — and we
> can show you what it costs."

Stop talking.

---

## The four questions you'll get

**"Where does Udyam data come from?"**
> Vendors declare it at onboarding — standard since FY24, and the half-yearly
> MSME return already requires knowing which suppliers are micro or small.
> Commercial APIs validate those numbers. What no API gives you is status *as at
> a past supply date* — that's what the audit reconstructs.

**"Is the trader exclusion right?"**
> It's a live practitioner nuance, flagged unconfirmed in `PROVENANCE.md`. It
> drives the biggest number in the ablation, so it needs a CA before it's
> load-bearing. Every flag in the product says verify with your CA.

**"Is the data real?"**
> No — synthetic, deterministic from a fixed seed, and `PROVENANCE.md` says so
> before any figure appears. It's synthetic *because* an accuracy claim needs
> known-correct answers, and real vendor data doesn't come labelled.

**"What if the model hallucinates?"**
> It can't produce a deadline or a coverage decision — neither field exists in
> what it can submit, and there's a test asserting it. Worst case it reports a
> wrong input, and that input is on screen with its source quote.

---

## If something breaks

| | |
|---|---|
| Findings look stale | `npm run complete`, reload |
| State got overwritten | `Copy-Item demo-state.backup.json .ledgr-state.json -Force` |
| Row won't open | Reload. Everything renders from cache |
| Quota exhausted | Irrelevant — no live API calls in this demo |
