# Demo script — 5 minutes, word for word

**Plain text is what you say. [Bold in brackets] is what you do.**

Roughly 640 words of speech. That's about right for five minutes *if you don't
rush* — the pauses while you click are part of the timing, not lost time. If you
find yourself racing, you're better off cutting Beat 4 than talking faster.

> **Checkpoint:** at 3:00 you should be starting Beat 4. If you're not, skip it
> and go straight to Pay/Confirm.

Numbers below are from the live app today. **Re-check them on the day** — invoice
dates move with the calendar.

---

## Setup, before anyone's watching

```powershell
npm start
```

Banner must read `Groq · openai/gpt-oss-120b (+1 fallback)`. If it warns findings
are stale, run `npm run complete` and wait.

Browser on `localhost:3000`, **Vendor portfolio** tab. Terminal in a second
window. Slide up first.

---

## 0:00 – 0:50 · Your slide

> There's a rule in Indian tax law that most businesses haven't caught up with
> yet. If you buy from a registered small supplier and you pay them late, you
> don't just owe them interest — you lose the tax deduction on that purchase.
> For the whole year.
>
> So a five lakh rupee invoice, at twenty-five percent tax, costs you an extra
> one and a quarter lakh. Not because you made more money. Purely because of when
> you paid.
>
> Forty-five days if you've got a written contract. Fifteen if you haven't.
>
> **[point at architecture]** Here's how we've built it. Two agents read the
> messy stuff — the contracts, the delivery notes, the email threads — and they
> report back what they found, with evidence. Then two hardcoded rules make every
> actual decision.
>
> The agents can't produce a deadline. They can't decide whether the law applies.
> Those fields don't exist in what they're allowed to submit — there's a test
> that checks it. So the model can be wrong about an input, and you'll see that
> input on screen. It can't be wrong about the answer.
>
> Let me show you it running.

---

## 0:50 – 1:35 · Which suppliers does this even apply to?

**[Vendor portfolio tab is already open]**

> This business has twenty-four suppliers. First question nobody can answer:
> which of them does this law actually cover?
>
> **[point at tiles]** Sixteen are in scope. Six aren't. And two it won't answer.
>
> **[click Orion Steel Traders]** This is the one I'd look at. Orion is
> registered, it's small, the registration's active — everything a simple check
> looks for. And it's the wrong answer. Orion is a registered wholesale *trader*,
> and trade sits outside the obligation this section hangs on.
>
> **[point at the two panels]** On the left, what the agent found and why. On the
> right, the rule that made the call, showing its working. The agent never
> returns "covered" — it just reports what it read.
>
> **[click Vindhya Timber — five seconds, don't linger]** And this one it flatly
> refuses. Nothing declared, nothing in the registry. It says *unresolved* — not
> "not covered". Because guessing here loses you a real deduction, quietly.

---

## 1:35 – 2:05 · What it's already cost

**[Tab 3 → Reconstruct last year → let it render]**

> That's today. This is last year — a hundred and eighty-five invoices.
>
> **[point]** Twenty-nine lakh of exposure it's confident about. And separately,
> ninety-three lakh it *excluded* — payments a naive check would have counted as
> exposure and had you chasing.
>
> It's deliberately not one number. The part resting on a shaky vendor match is
> broken out on its own, and there are eight it won't classify at all.

*Don't scroll. Don't explain the bands. Move.*

---

## 2:05 – 3:00 · The one that matters

**[Tab 1 → open INV-4124, Sharma Ent., ₹2,36,000]**

> Same pattern running right now — ten red today. But this row is the reason the
> product exists.
>
> Invoice dated the thirtieth of July. Forty-five day terms. Every tool on the
> market counts forty-five days from the invoice date and tells you it's due
> mid-September.
>
> That's the wrong date. The clock runs from *acceptance* — from when the buyer
> actually took the goods.
>
> **[scroll to the investigation trail]** And here's what the agent found. This
> is an email from the buyer's stores team.
>
> **[read it out]** *"We have put the whole lot to one side in the yard and we
> are not booking them into stores or raising a receipt note until the
> certificates reach us."*
>
> That's a refusal to accept. But it never says "reject". Never says "object". So
> anything doing keyword matching walks straight past it and starts the clock
> fifteen days early.
>
> They actually accepted on the fourteenth of August, when the certificates
> turned up and someone finally signed the receipt note.

**[Pause. Let it land. This is the pitch.]**

---

## 3:00 – 3:45 · Proving it isn't staged  *(CUT IF BEHIND)*

**[+ New invoice → Orion Steel Traders, 200000, both dates today, description
"TMT bars, bought in and resold" → Add and analyse]**

> Let me add one live. Two lakh rupees, accepted today, from a registered small
> supplier.
>
> **[result appears]** Out of scope. No deadline, nothing to chase — because
> Orion's a trader.
>
> **[+ New invoice again → change only vendor to Sharma Ent. and description to
> "Fabricated brackets, made to drawing"]**
>
> Now the same invoice again. Same two lakh. Same dates. Only the supplier and
> what they made is different.
>
> **[result appears]** Forty-five day deadline. Fifty thousand rupees of
> exposure. Nothing about the money changed — just who the supplier is, and what
> they actually did.

---

## 3:45 – 4:20 · Money moves, and the loop closes

**[Find INV-4101, Sharma Ent., ₹5,00,000 → click Pay now]**

> Five lakh, and it's over our auto-execute threshold, so it needs a person.
> That's a real RazorpayX payout call.
>
> **[point at the row — it has NOT gone green]** Now watch this. The row hasn't
> closed. It's asking me to confirm.
>
> That's on purpose. A payout being *requested* isn't the same as a compliance
> item being *closed*. It closes when RazorpayX confirms the money actually
> moved.
>
> **[click Confirm payout]** Now it's closed.
>
> Anything under ten thousand goes automatically. Above that, always a human. We
> don't let a model decide a legal deadline on its own.

---

## 4:20 – 4:55 · Does the AI actually earn its place?

**[Switch to terminal]**

```powershell
npm run ablation
```

> This is the question I'd ask if I were sitting where you are.
>
> We run the exact same pipeline twice. Once with the agent. Once with string
> matching and regex, no model at all. Same data, same scoring code, both against
> answers we already know are correct.
>
> **[results appear — point]** String matching gets twenty of twenty-four
> suppliers right. The agent gets twenty-four. On last year's ledger, the simple
> version misreads fifty-nine invoices — over a crore. The agent misreads eight.
>
> And the three suppliers it wrongly says are covered? Forty-five lakh of
> payments you'd have rushed for no reason.
>
> Both had identical access to the registry. The difference is judgement, not
> data.

---

## 4:55 – 5:00 · Close

> Everyone counts forty-five days from the invoice date. That's the wrong date —
> and we can show you what it costs.

**[Stop talking.]**

---

## Delivery notes

- **The pause after INV-4124 is the most important second in the demo.** Don't
  fill it.
- Read the stores email *slowly*. It's the only quote in five minutes and it has
  to land as a real person writing a real email.
- Say "crore" and "lakh" — don't convert. You're pitching in India.
- If something breaks, say what you expected to happen and move on. Don't debug
  live.
- You'll want to explain the architecture again during the demo. Don't — it's on
  the slide, and you don't have the seconds.

---

## The four questions you'll get

**"Where does the Udyam data come from?"**
> Suppliers declare it when you onboard them — that's been standard since FY24,
> and the half-yearly MSME return already forces you to know which suppliers are
> micro or small. There are commercial APIs that validate those numbers. What no
> API gives you is what a supplier's status was on a past supply date, and that's
> exactly what the audit reconstructs.

**"Is the trader exclusion actually correct?"**
> It's a live practitioner nuance and we've flagged it as unconfirmed in the
> repo. It drives the biggest number in our comparison, so it needs a CA to sign
> off before it's load-bearing. Everything in the product says verify with your
> CA.

**"Is this real data?"**
> No, and we say so before any number appears. It's synthetic and it regenerates
> from a fixed seed. It's synthetic *because* an accuracy claim needs known
> correct answers, and real vendor ledgers don't come labelled.

**"What if the model hallucinates?"**
> It structurally can't produce a deadline or a coverage decision — those fields
> don't exist in what it can submit, and there's a test asserting it. The worst
> it can do is report a wrong input, and that input's on screen with the quote it
> came from.

---

## If something breaks

| | |
|---|---|
| Findings look stale | `npm run complete`, reload |
| State got overwritten | `Copy-Item demo-state.backup.json .ledgr-state.json -Force` |
| Row won't open | Reload — everything renders from cache |
| Quota exhausted | Doesn't matter, no live API calls in this demo |
