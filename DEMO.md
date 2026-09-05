# Ledgr — full 5-minute script

Problem → solution → architecture → live demo → the number. One continuous
performance.

**Plain text is what you say. [Bold in brackets] is what you do.**

> **The time maths, measured not guessed.** Core speech is 675 words. At a calm
> 135 words a minute that's 5:00 of pure talking, and clicking, rendering and the
> one deliberate pause put it around **5:32 delivered.** That is over, so the
> script below is written to be cut, not recited whole.
>
> **Cut 1 by default: don't switch to tab 3 in section 5.** Say the number over
> the queue instead — *"and it reconstructs last year: twenty-nine lakh of
> exposure, ninety-three lakh correctly excluded"* — and you land at **~5:07.**
> That is the version to rehearse.
>
> **Section 7 is on top of everything** (~55s all in). Only if you're ahead at
> 3:10.
>
> **If you're still long on the day, keep cutting in this order:**
> 1. Section 7 entirely.
> 2. In section 3, drop everything after "there's a test asserting it."
> 3. In section 2, drop the middle paragraph — keep the opening line and the
>    "judgement, not arithmetic" close. Saves ~20 seconds and the handover into
>    the architecture survives.

Numbers are from the live app today — **re-check them on the day**, invoice dates
move with the calendar.

**Before anyone's watching:** `npm start`; banner must read
`Groq · openai/gpt-oss-120b (+1 fallback)`. If it warns findings are stale, run
`npm run complete` first. Browser on `localhost:3000`, **Vendor portfolio** tab.
Terminal in a second window. Slide up.

---

## 1 · The problem — 0:00 to 0:25

**[Slide: the problem]**

> Since FY24, if you pay a registered small supplier late, you don't just owe
> interest — you lose the tax deduction on that purchase for the whole year.
>
> Five lakh invoice, twenty-five percent tax: one and a quarter lakh gone, purely
> because of when you paid. Forty-five days if there's a contract, fifteen if
> there isn't.
>
> Almost nobody tracks it, because the hard part was never counting to
> forty-five. It's knowing which suppliers it applies to, and when the clock
> actually started.

---

## 2 · The solution — 0:25 to 0:55

**[Slide: the three phases]**

> So we built Ledgr. Three things, sitting on top of your unpaid bills.
>
> It works out which of your suppliers the law actually reaches. Then on every
> bill it works out the real deadline, flags what's about to breach, and pays
> through RazorpayX before it does. And it looks backwards — what last year
> already cost you.
>
> **[beat]** The two hard parts there are judgement, not arithmetic. Which
> supplier. And which date. That's where the AI is — and it's the only place it
> is.

*That last line is the handover into the architecture. Say it, then change the
slide — don't pause and let it land, section 3 is the landing.*

---

## 3 · The one design decision — 0:55 to 1:20

**[Slide: two columns — "agents report evidence" | "rules decide"]**

> One decision matters more than the rest, so I'll show you that rather than the
> whole diagram.
>
> Two agents do the reading — contracts, delivery notes, email threads — and
> report what they found, with the evidence attached.
>
> **[point at the split]** But they decide nothing. Two hardcoded rules do that:
> does the law apply, and what's the deadline. The agents *can't* produce a
> deadline — that field doesn't exist in what they submit, and there's a test
> asserting it.
>
> So the model can be wrong about something it read, and you'll see that on
> screen with its source. It can't be wrong about the answer.

---

## 4 · Who does the law reach? — 1:20 to 2:00

**[Vendor portfolio tab, already open]**

> Twenty-four suppliers. Which of them does the law actually cover? Sixteen in
> scope, six not, and two it won't answer.
>
> **[click Orion Steel Traders]** Registered, small, active — everything a simple
> check looks for. And still the wrong answer, because Orion is a registered
> wholesale *trader*, and trade sits outside this obligation.
>
> **[point at the two panels]** Left, what the agent found. Right, the rule that
> decided, showing its working.
>
> **[click Vindhya Timber — 5 seconds]** And this one it refuses. Nothing
> declared, nothing in the registry. Unresolved — not "not covered". Guessing
> there quietly loses a real deduction.

---

## 5 · What it's already cost — 2:00 to 2:20

**[Tab 3 → Reconstruct last year → let it render]** — *default cut: stay on the
queue and just say the numbers. See the top of this file.*

> That's today. This is last year — a hundred and eighty-five invoices.
>
> **[point]** Twenty-nine lakh of exposure. And ninety-three lakh it *excluded* —
> payments a naive check would have had you chasing for nothing.

*Don't scroll. Don't explain the bands.*

---

## 6 · The row we built this for — 2:20 to 3:10

**[Tab 1 → open INV-4124, Sharma Ent., ₹2,36,000]**

> Ten red right now. But this row is why the product exists.
>
> Dated the thirtieth of July, forty-five day terms. Every tool counts forty-five
> days from the invoice date. That's the wrong date — the clock runs from
> *acceptance*.
>
> **[scroll to investigation trail]** Here's what the agent found — an email from
> the buyer's own stores team.
>
> **[read slowly]** *"We have put the whole lot to one side in the yard and we
> are not booking them into stores or raising a receipt note until the
> certificates reach us."*
>
> That's a refusal to accept. It never says "reject". Never says "object". So
> keyword matching walks straight past it and starts the clock fifteen days
> early.
>
> They actually accepted on the fourteenth of August.

**[Pause. Two full seconds. Don't fill it.]**

---

## 7 · Proving it isn't staged — *only if ahead at 3:10*

**[+ New invoice → Orion Steel Traders, 200000, both dates today,
"TMT bars, bought in and resold" → Add and analyse]**

> One live. Two lakh, accepted today, registered small supplier. **[result]** Out
> of scope — Orion's a trader.
>
> **[+ New invoice → change only vendor to Sharma Ent., description to
> "Fabricated brackets, made to drawing"]**
>
> Same amount, same dates. Only the supplier changes. **[result]** Forty-five day
> deadline, fifty thousand of exposure. Nothing about the money changed.

---

## 8 · Money moves, and the loop closes — 3:10 to 3:45

**[Find INV-4101, Sharma Ent., ₹5,00,000 → Pay now]**

> Five lakh, over our auto-execute threshold, so it needs a person. Real
> RazorpayX payout call.
>
> **[point — the row has NOT gone green]** Watch this. The row hasn't closed.
> It's asking me to confirm.
>
> That's deliberate. A payout being *requested* isn't a compliance item being
> *closed*. It closes when RazorpayX confirms the money moved.
>
> **[click Confirm payout]** Now it's closed. Under ten thousand goes
> automatically. Above it, always a human.

---

## 9 · Does the AI earn its place? — 3:45 to 4:30

**[Switch to terminal]**

```powershell
npm run ablation
```

> This is the question I'd ask if I were sitting where you are.
>
> Same pipeline twice. Once with the agents, once with string matching and no
> model. Same data, same scoring, both against answers we know are right.
>
> **[results appear — point]** String matching gets twenty of twenty-four
> suppliers. The agent gets twenty-four. On last year's ledger the simple version
> misreads fifty-nine invoices — over a crore. The agent misreads eight.
>
> And the three it wrongly calls covered? Forty-five lakh you'd have rushed for
> nothing.
>
> Identical access to the registry. The difference is judgement, not data.

---

## 10 · Close — 4:30 to 4:40

> Everyone counts forty-five days from the invoice date. That's the wrong date —
> and we can show you exactly what it costs.

**[Stop talking.]**

---

## Delivery notes

- **The pause after section 6 is the most important second in the demo.** Don't
  fill it.
- **Read the stores email slowly.** It's your only quote, and it has to sound
  like a real person wrote a real email.
- **Say lakh and crore.** Don't convert — you're pitching in India.
- **Don't re-explain the architecture mid-demo.** It's on the slide and there are
  no seconds for it. You will want to. Don't.
- **If something breaks, say what you expected and move on.** Never debug live.
- Nothing here makes a live API call — everything replays from cache, so a dead
  quota changes nothing.

---

## The four questions you'll get

**"Where does the Udyam data come from?"**
> Suppliers declare it at onboarding — standard since FY24, and the half-yearly
> MSME return already forces you to know which suppliers are micro or small.
> Commercial APIs validate those numbers. What no API gives you is what a
> supplier's status *was* on a past supply date — and that's exactly what the
> audit reconstructs.

**"Is the trader exclusion actually correct?"**
> It's a live practitioner nuance and we've flagged it unconfirmed in the repo. It
> drives the biggest number in our comparison, so it needs a CA to sign off before
> it's load-bearing. Everything in the product says verify with your CA.

**"Is this real data?"**
> No, and we say so before any number appears. Synthetic, regenerates from a
> fixed seed. It's synthetic *because* an accuracy claim needs known-correct
> answers, and real vendor ledgers don't come labelled.

**"What if the model hallucinates?"**
> It structurally can't produce a deadline or a coverage decision — those fields
> don't exist in what it can submit, and there's a test asserting it. Worst case
> it reports a wrong input, and that input is on screen with the quote it came
> from.

---

## If something breaks

| | |
|---|---|
| Findings look stale | `npm run complete`, reload |
| State got overwritten | `Copy-Item demo-state.backup.json .ledgr-state.json -Force` |
| Row won't open | Reload — everything renders from cache |
| Quota exhausted | Doesn't matter, no live API calls |
