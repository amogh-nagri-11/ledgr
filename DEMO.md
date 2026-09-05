# Ledgr — full 5-minute script

One continuous performance: problem → architecture → live demo → the number.

**Plain text is what you say. [Bold in brackets] is what you do.**

> **The time maths, honestly.** About 650 words of speech fits five minutes if
> you don't rush. The opening below is ~170 words — call it 75 seconds with the
> slide. That leaves roughly 3½ minutes of app and 30 seconds of close.
> **Checkpoint: at 3:15 you should be starting section 5.** If you're not, skip
> section 5 entirely — it's the only one the argument survives without.

Numbers are from the live app today. **Re-check them on the day**; invoice dates
move with the calendar.

**Before anyone's watching:** `npm start`, banner must read
`Groq · openai/gpt-oss-120b (+1 fallback)`. If it warns findings are stale, run
`npm run complete` first. Browser on `localhost:3000` on the **Vendor portfolio**
tab. Terminal in a second window. Slide up.

---

## 1 · The problem — 0:00 to 0:35

**[Slide: the problem]**

> There's a rule in Indian tax law that most businesses still haven't caught up
> with. If you buy from a registered small supplier and you pay them late, you
> don't just owe them interest. You lose the tax deduction on that purchase — for
> the whole year.
>
> So: a five lakh rupee invoice, twenty-five percent tax. Paying late costs you
> an extra one and a quarter lakh. Not because you earned more. Purely because of
> when you paid.
>
> Forty-five days if there's a written contract. Fifteen if there isn't.
>
> And almost nobody tracks it — because the hard part was never counting to
> forty-five. It's knowing which of your two hundred suppliers this even applies
> to, and knowing when the clock actually started.

---

## 2 · The architecture — 0:35 to 1:15

**[Slide: architecture diagram]**

> So here's how it's built, and the shape matters more than the components.
>
> Two agents do the reading. One works through your supplier list — who is this
> company really, are they registered, what do they actually do. The other reads
> each unpaid bill: which contract governs it, what it says, and when the goods
> were actually accepted. They read the messy things — contracts, delivery notes,
> email threads — and they report back what they found, with the evidence
> attached.
>
> Then two hardcoded rules make every decision. Does the law apply. What's the
> deadline.
>
> **[point at the split]** And this is the bit I'd want you to hold onto. The
> agents *cannot* produce a deadline. They cannot decide whether the law applies.
> Those fields don't exist in what they're allowed to submit — there's a test
> that asserts it.
>
> So the model can be wrong about something it read, and you'll see that thing on
> screen with its source. It can't be wrong about the answer.
>
> Let me show you.

---

## 3 · Who does the law reach? — 1:15 to 2:00

**[Vendor portfolio tab, already open]**

> Twenty-four suppliers. The first question no business can answer: which of
> these does the law actually cover?
>
> **[point at tiles]** Sixteen are in scope. Six aren't. Two it won't answer.
>
> **[click Orion Steel Traders]** This one's the interesting one. Orion is
> registered, it's small, the registration is active — everything a simple check
> looks for. And it's still the wrong answer, because Orion is a registered
> wholesale *trader*, and trade sits outside the obligation this law hangs on.
>
> **[point at the two panels]** Left: what the agent found, and why. Right: the
> rule that decided, showing its working.
>
> **[click Vindhya Timber — five seconds, don't linger]** And this one it refuses
> to answer. Nothing declared, nothing in the registry. It says *unresolved*, not
> "not covered" — because guessing here quietly loses you a real deduction.

---

## 4 · What it's already cost — 2:00 to 2:30

**[Tab 3 → Reconstruct last year → let it render]**

> That's today. This is last year — a hundred and eighty-five invoices.
>
> **[point]** Twenty-nine lakh of exposure it's confident about. And separately,
> ninety-three lakh it *excluded* — payments a naive check would have counted and
> had you chasing for nothing.
>
> It's deliberately not one number. The part resting on a shaky supplier match is
> broken out, and there are eight it won't classify at all.

*Don't scroll. Don't explain the bands. Move.*

---

## 5 · The row the product exists for — 2:30 to 3:15

**[Tab 1 → open INV-4124, Sharma Ent., ₹2,36,000]**

> Same pattern running right now — ten red today. But this row is the reason we
> built it.
>
> Invoice dated the thirtieth of July, forty-five day terms. Every tool on the
> market counts forty-five days from the invoice date and says it's due
> mid-September.
>
> That's the wrong date. The clock runs from *acceptance* — from when the buyer
> actually took the goods.
>
> **[scroll to investigation trail]** Here's what the agent found. An email from
> the buyer's own stores team.
>
> **[read slowly]** *"We have put the whole lot to one side in the yard and we
> are not booking them into stores or raising a receipt note until the
> certificates reach us."*
>
> That's a refusal to accept. But it never says "reject". Never says "object". So
> anything doing keyword matching walks straight past it, and starts the clock
> fifteen days early.
>
> They actually accepted on the fourteenth of August, when the certificates
> arrived and someone finally signed.

**[Pause. Let it sit. Don't fill it.]**

---

## 6 · Proving it isn't staged — 3:15 to 3:55  *(CUT IF BEHIND)*

**[+ New invoice → Orion Steel Traders, 200000, both dates today, description
"TMT bars, bought in and resold" → Add and analyse]**

> Let me add one live. Two lakh, accepted today, registered small supplier.
>
> **[result]** Out of scope. No deadline, nothing to chase — because Orion's a
> trader.
>
> **[+ New invoice → change only vendor to Sharma Ent., description to
> "Fabricated brackets, made to drawing"]**
>
> Same invoice again. Same two lakh, same dates. Only the supplier and what they
> made are different.
>
> **[result]** Forty-five day deadline. Fifty thousand of exposure. Nothing about
> the money changed — just who they are and what they did.

---

## 7 · Money moves, and the loop closes — 3:55 to 4:25

**[Find INV-4101, Sharma Ent., ₹5,00,000 → Pay now]**

> Five lakh, over our auto-execute threshold, so it needs a person. That's a real
> RazorpayX payout call.
>
> **[point — the row has NOT gone green]** Now watch. The row hasn't closed. It's
> asking me to confirm.
>
> That's deliberate. A payout being *requested* isn't a compliance item being
> *closed*. It closes when RazorpayX confirms the money actually moved.
>
> **[click Confirm payout]** Now it's closed.
>
> Under ten thousand goes automatically. Above it, always a human. We don't let a
> model decide a legal deadline on its own.

---

## 8 · Does the AI earn its place? — 4:25 to 4:55

**[Switch to terminal]**

```powershell
npm run ablation
```

> This is the question I'd ask if I were sitting where you are.
>
> We run the same pipeline twice. Once with the agents. Once with string matching
> and regex, no model at all. Same data, same scoring code, both against answers
> we already know are right.
>
> **[results appear — point]** String matching gets twenty of twenty-four
> suppliers. The agent gets twenty-four. On last year's ledger the simple version
> misreads fifty-nine invoices, over a crore. The agent misreads eight.
>
> And the three suppliers it wrongly calls covered — that's forty-five lakh of
> payments you'd have rushed for nothing.
>
> Both had identical access to the registry. The difference is judgement, not
> data.

---

## 9 · Close — 4:55 to 5:00

> Everyone counts forty-five days from the invoice date. That's the wrong date —
> and we can show you exactly what it costs.

**[Stop talking.]**

---

## Delivery notes

- **The pause after section 5 is the most important second in the demo.** Don't
  fill it.
- **Read the stores email slowly.** It's your only quote and it has to sound like
  a real person wrote a real email.
- **Say lakh and crore.** Don't convert — you're pitching in India.
- **Don't re-explain the architecture during the demo.** It's on the slide and
  there are no seconds for it. You will want to. Don't.
- **If something breaks, say what you expected and move on.** Never debug live.
- Nothing in this demo makes a live API call. Everything replays from cache — a
  dead quota changes nothing.

---

## The four questions you'll get

**"Where does the Udyam data come from?"**
> Suppliers declare it when you onboard them — standard practice since FY24, and
> the half-yearly MSME return already forces you to know which of your suppliers
> are micro or small. There are commercial APIs that validate those numbers. What
> no API gives you is what a supplier's status *was* on a past supply date, and
> that's exactly what the audit reconstructs.

**"Is the trader exclusion actually correct?"**
> It's a live practitioner nuance and we've flagged it unconfirmed in the repo. It
> drives the biggest number in our comparison, so it needs a CA to sign off before
> it's load-bearing. Everything in the product says verify with your CA.

**"Is this real data?"**
> No, and we say so before any number appears. It's synthetic and regenerates
> from a fixed seed. It's synthetic *because* an accuracy claim needs known
> correct answers, and real vendor ledgers don't come labelled.

**"What if the model hallucinates?"**
> It structurally can't produce a deadline or a coverage decision — those fields
> don't exist in what it can submit, and there's a test asserting it. The worst it
> can do is report a wrong input, and that input is on screen with the quote it
> came from.

---

## If something breaks

| | |
|---|---|
| Findings look stale | `npm run complete`, reload |
| State got overwritten | `Copy-Item demo-state.backup.json .ledgr-state.json -Force` |
| Row won't open | Reload — everything renders from cache |
| Quota exhausted | Doesn't matter, no live API calls |
