# Demo script

Roughly 6-7 minutes, or 5 if you drop beat 4's optional half. Six beats, in order. Every figure below is from the current
cached run — **check them again on the day**, because live invoice dates move
with the calendar and the numbers shift with them.

---

## Before you start

```powershell
npm start
```

Watch the boot banner. It must say:

```
AI layer:  Groq · openai/gpt-oss-120b (+1 fallback)
```

**If it warns that cached findings are stale**, run `npm run complete` and wait.
Live invoice dates are generated relative to today, so yesterday's findings cite
documents that have since shifted. Do not demo through that warning.

Open **http://localhost:3000**. Land on **Vendor portfolio** (tab 2) — not the
queue. The story starts with *who your suppliers are*, not with a list of bills.

Have the terminal visible in a second window. You will use it once, at the end.

---

## Beat 1 · The question nobody has answered (~60s)

> "This business has 24 suppliers. Under Section 43B(h), if you pay a registered
> micro or small enterprise late, you don't just owe interest — you lose the tax
> deduction on that purchase for the whole year. On a ₹5 lakh invoice at 25%,
> that's ₹1.25 lakh, purely because of timing.
>
> So the first question is: which of these 24 does that law actually apply to?
> Nobody in this business knows. It's not in any system."

Point at the tiles: **16 in scope · 6 out of scope · 2 unresolved.**

> "Six are out of scope, and that matters as much as the sixteen."

Open **Orion Steel Traders**.

> "Registered. Small. Active. Everything a naive check looks for — and it's
> wrong. Orion is a registered *wholesale trader*. Trade was admitted to Udyam
> registration for lending purposes, not for the delayed-payment obligation this
> section hangs on."

Point at the two panels side by side.

> "Left is what the agent found, with its evidence. Right is the rule that made
> the decision, showing its working. **The agent never returns 'covered'** —
> there is no such field in what it can submit, and there's a test that asserts
> it. A wrong coverage call costs exactly as much as a wrong date, so neither is
> left to a model."

Open **Vindhya Timber**.

> "And this one it refuses to answer. Nothing declared, nothing in the registry.
> It says *unresolved*, not 'not covered'. Guessing here silently loses a
> deduction, and nothing downstream would ever look again."

---

## Beat 2 · What it already cost (~60s)

Go to **Retroactive audit** → **Reconstruct last year**.

> "185 invoices from last financial year. This is what a business finds out at
> filing time, if at all."

| | |
|---|---|
| Confident breaches | **₹28,98,750** exposure |
| Contingent | resting on uncertain matches |
| Excluded | **₹93,03,100** out of scope |
| Unclassified | 8 |

> "Two things. It is never one number — the part resting on a shaky vendor match
> is broken out, and eight invoices it won't classify at all. A single headline
> figure collapses the moment someone asks how confident you are.
>
> And look at *excluded*: ₹93 lakh of payments a registered-and-small check
> would have counted as exposure. Being wrong in that direction means rushing
> payments that aren't owed early, and burning working capital."

Scroll to **Why invoices were excluded**.

> "Registration lapsed mid-year. Reclassified from small to medium in January.
> Retail traders. Coverage is judged as at *each supply date*, not today's
> status — a vendor that's medium now was still small last December."

---

## Beat 3 · The same thing, live (~90s)

Go to **Live queue**.

> "That was last year. The same pattern is running right now — **10 red, ₹5,04,600
> of deduction at stake this quarter.**"

Open **INV-4124, Sharma Ent., ₹2,36,000**. *(This is the row the whole demo is for.)*

> "Invoice dated 30 July, 45-day terms. Every tool on the market counts 45 days
> from the invoice date and tells you this is due in mid-September.
>
> It isn't. The clock runs from **acceptance**, not invoicing."

Read the email from the trail aloud:

> *"we have put the whole lot to one side in the yard and we are not booking them
> into stores or raising a receipt note until the certificates reach us"*

> "That's a refusal to accept. It never uses the word 'reject' or 'object' — so
> keyword matching sails straight past it and starts the clock fifteen days too
> early. The goods were actually accepted on 14 August, when the certificates
> arrived and the receipt note was finally signed.
>
> Fifteen days of false urgency on a ₹2.36 lakh invoice, and this is the single
> most common real-world mess in payables."

Open **INV-4112, Falcon Freight**, briefly.

> "And the opposite trap. There *is* an email here with 'Objection' in the
> subject line — but it objects to the **rate**, not the goods, which were
> already accepted. Keyword matching moves this deadline the wrong way. The
> agent read it and left the clock alone."

---

## Beat 4 · Prove the rules aren't cosmetic (~60s)

This is the beat that answers *"how do I know it isn't just labelling seeded
rows?"* — so do it live, and let them pick the numbers if they want.

Click **+ New invoice**. Enter:

| Field | Value |
|---|---|
| Vendor | `Orion Steel Traders (V007)` |
| Amount | `200000` |
| Invoice date | today |
| Goods accepted on | today |
| Description | `TMT bars, bought in and resold` |

**Add and analyse.**

> "Two lakh rupees, accepted today, from a registered small enterprise. Comes
> back **out of scope** — no deadline, no exposure, nothing to chase. Because
> Orion is a trader."

Now do it again, changing **only the vendor and what was supplied**:

| Field | Value |
|---|---|
| Vendor | `Sharma Ent. (V001)` |
| Amount | `200000` |
| Invoice date | today |
| Goods accepted on | today |
| Description | `Fabricated brackets, made to drawing` |

> "Same amount. Same dates. This one comes back with a **45-day deadline and
> ₹50,000 of exposure.**
>
> Nothing about the money changed. The difference is who the supplier is and
> what they actually did — and that determination is what the whole product is."

**Verified live, not remembered:** Orion returns `not_covered / trading_enterprise`,
no deadline, ₹0. Sharma returns covered, 45 days, **₹50,000 exposure**. Both
resolved by the agent, not the fallback.

Open the new row and show the coverage working, then the statutory calculation.

> "And it shows you why, line by line. This isn't a lookup table with an AI
> sticker on it."

**Optional, if you have 20 seconds:** change **Buffer** from 3 to 10 in the
toolbar and hit **Apply policy**.

> "The recommended pay-by date moves. **The deadline doesn't.** Buffer, tax rate,
> threshold, confidence floor — all yours. The 45/15-day rule and the coverage
> rule are statute, hardcoded, and unit-tested."

Set it back to 3.

---

## Beat 5 · Act, and close the loop (~60s)

Find a red row above the threshold — **INV-4101, Sharma Ent., ₹5,00,000** — and
click **Pay now**.

> "Above the auto-execute threshold, so it needs a human. One click, RazorpayX
> Payouts API."

**Point out that the row does not turn green.** It now shows **Confirm payout**.

> "This is the part I'd want you to notice. A payout being *requested* is not a
> compliance item being *closed*. It closes when RazorpayX confirms the money
> actually moved."

Click **Confirm payout**. Row closes.

> "Now it's closed."

Click **Auto-execute under threshold**.

> "Anything at or under ₹10,000 goes without a click. Above it, always a human.
> No autonomous decision about a legal deadline."

Open **Audit log**.

> "Every action carries the reasoning that produced it — the coverage decision,
> the statutory working, the approver, the tool trail."

---

## Beat 6 · Does the AI earn its place? (~45s)

Switch to the terminal.

```powershell
npm run ablation
```

> "This is the question I'd ask if I were you. We run the identical pipeline
> twice — once with the agent, once with string matching and regex — over the
> same data, scored against known-correct answers by the same code."

| | naive | **agent** |
|---|---|---|
| Vendor identity | 20/24 | **24/24** |
| Invoice clock start | 20/25 | **25/25** |
| Payment term | 22/25 | **25/25** |
| False positives | 3 — **₹45,19,100** | **0** |
| Historical misclassified | 59/185 — ₹1.06 Cr | **8/185 — ₹27.6L** |

> "Both arms had identical access to the registry. The difference is judgement,
> not data. And the report tells you when it's scoring an incomplete run, so the
> number can't be quoted while it's flattering."

---

## If they ask

**"Where does Udyam data come from?"**
> Vendors declare their number at onboarding — standard practice since FY24, and
> there's a half-yearly MCA return that already requires knowing which suppliers
> are micro or small. Commercial verification APIs validate those numbers against
> the portal. What no API gives you is status *as at a past supply date*, which is
> what the audit reconstructs.

**"Is the trader exclusion actually right?"**
> It's a live practitioner nuance and it's flagged unconfirmed in `PROVENANCE.md`.
> It drives the largest number in the ablation, so it needs a CA before it's
> load-bearing. Every flag in the product says verify with your CA.

**"Is this data real?"**
> No, and `PROVENANCE.md` says so before any figure appears. Synthetic and
> deterministic from a fixed seed — you can regenerate it. It's synthetic
> *because* the accuracy claim needs known-correct answers, and real vendor data
> doesn't come labelled.

**"What if the model hallucinates?"**
> It can't produce a deadline or a coverage decision — neither exists in what it
> can submit. It supplies evidence; hardcoded rules decide. Worst case it reports
> a wrong input, and that input is on screen with its source quote.

**"Which model?"**
> Two — Groq's gpt-oss-120b and Gemini flash-lite, with automatic failover. Each
> row is badged with the one that produced it. Two different model families
> reaching the same answers is a reasonable sign it isn't tuned to one model's
> quirks.

---

## Recovery

| | |
|---|---|
| Findings look stale | `npm run complete`, then reload |
| Something got overwritten | `Copy-Item demo-state.backup.json .ledgr-state.json -Force` |
| Row won't open | Reload — the queue renders from cache, nothing is lost |
| Quota exhausted mid-demo | Doesn't matter. Everything replays from cache; no live API calls |
