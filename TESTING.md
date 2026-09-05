# Live test — one scenario, end to end

One pass through the whole product, ~12 minutes. Every number is checkable by hand, which is the point.

> **Dates shift.** Written assuming today is **2026-09-05**. Live payables are dated relative to today, so if you run this next week every date moves. Check the *arithmetic*, not the literal strings.

---

## Setup

```powershell
npm install
npm start
```

Open **http://localhost:3000**. The header should read *24 vendors · 25 live · 185 historical*.

**Leave the AI off for this run.** The first pass should be fast and deterministic; there is a dedicated AI comparison at step 7. If you have `GEMINI_API_KEY` in `.env`, that's fine — the sweep will just take longer.

---

## The scenario

You are the finance lead at a mid-size manufacturer. You have 24 suppliers, 25 unpaid invoices, and a year of history. You do not know which suppliers carry a s.43B(h) obligation, because nobody has ever worked it out. You want to know what it already cost you, what is about to cost you, and to fix the ones you can still fix.

---

## Step 1 — Classify the portfolio

Click **Run portfolio sweep**. It lands on the **Vendor portfolio** tab.

Expected: **13 in scope · 5 out of scope · 6 unresolved**.

The five out of scope are the point. Click into them:

| Vendor | Why it is out of scope |
|---|---|
| **Orion Steel Traders** | Registered, small, active — and a **wholesale trader** (NIC 46721). Trade was admitted to Udyam for priority-sector lending, not for the s.15 obligation s.43B(h) hangs on. |
| **Sunrise Stationers**, **Tricity Hardware** | Retail trade. |
| **Vertex Industrial Systems** | Registered, but **medium**. The section reaches micro and small only. |
| **Zenith Packaging** | A manufacturer, but supplying imported film as received — a pass-through on this supply. |

Open **Orion Steel Traders** and read the two panels side by side. The left panel is what the agent found — identity, evidence, registered activity. The right panel is the **coverage rule**, and it shows its own working. **The agent never returns "covered".** That separation is deliberate: a hallucinated coverage call would cost exactly as much as a hallucinated date, so both determinations are hardcoded.

Now the six unresolved. Open **Vindhya Timber** — nothing declared at onboarding and nothing in the registry resembles the name. It is marked ⚪ *unresolved*, **not** "not covered". Guessing "not covered" here is how you silently lose a deduction.

---

## Step 2 — Reconstruct what it already cost

Go to **3 · Retroactive audit** → **Reconstruct last year**.

Expected, on 185 invoices worth ₹3.77 Cr:

| Band | |
|---|---|
| Confident breaches | **₹24,07,975** exposure · 50 invoices · ₹96.3L paid late |
| Contingent | ₹1,34,900 · 9 invoices resting on an uncertain vendor match |
| Excluded | ₹1,17,57,500 · 35 invoices out of scope |
| Unclassified | 21 |

**Two things to notice.**

It is never one number. A single "₹25 lakh" headline collapses the moment someone asks how confident you are in the vendor matches underneath it — so the part that rests on a shaky classification is broken out, and 21 invoices are declared unclassified rather than quietly counted.

And read *Why invoices were excluded*. **₹1.17 Cr of payments** would have been counted as exposure by a tool that checked only "registered + micro/small". The largest single line is **registration not live** and **trading enterprise** — vendors whose status a naive check gets wrong.

---

## Step 3 — Coverage is a function of the supply date

Still in the audit, note the excluded reason **registration not live** (5 invoices). That's Suvarna Textiles, whose registration lapsed on **2025-11-30** — mid financial year.

Go back to **Vendor portfolio** and open **Suvarna Textiles**: today it is out of scope. But its invoices from April to November 2025 **were** covered. The audit judged each supply on its own date rather than applying today's status backwards.

Same story with **Girish Auto Components**, reclassified small → medium on **2026-01-15**, carrying 18 historical invoices that straddle the change.

Verify the scale of that error:

```powershell
npm run corpus
```

Look for: **59 of 185 historical invoices misclassified, ₹1.06 Cr** by a baseline that classifies once, by today's status.

---

## Step 4 — The live queue

Click **Analyse live ledger**. Expected: **6 red · 2 amber · 2 held for review · 15 green** across 25 payables.

Open **INV-4124, Sharma Ent., ₹2,36,000**. Invoice dated ~37 days ago, 45-day terms. A naive reading starts the clock at delivery. Ledgr starts it 15 days later, at the goods receipt note. Read the *clock start* evidence and the investigation trail — the email says:

> "we have put the whole lot to one side in the yard and we are not booking them into stores or raising a receipt note until the certificates reach us"

That is a refusal to accept. It never uses the words *object* or *reject*, so keyword matching misses it entirely and starts the clock 15 days early — creating false urgency on an invoice that isn't due yet.

Then open **INV-4112, Falcon Freight**. There *is* an email with "Objection" in the subject line — but it objects to the **rate**, not the goods, which were already accepted. The clock must **not** restart. Keyword matching moves this deadline three days the wrong way.

---

## Step 5 — Execute, then close the loop

1. **INV-4125** (Tricity Hardware, ₹8,400) has no Pay button — its vendor is out of scope. Nothing to do; that's correct.
2. Find a red row above the threshold — **INV-4101, Sharma Ent., ₹5,00,000** — and click **Pay now**.
3. The row does **not** go green. It shows **Confirm payout**.

That is the important behaviour. A payout being *requested* is not a compliance item being *closed*. Click **Confirm payout** — now RazorpayX has confirmed the money moved, and only now does the item close. That feedback loop is what makes this a payment product rather than a tax spreadsheet with a button on the end.

4. Click **Auto-execute under threshold** — anything at or under ₹10,000 schedules without a click. Above it always needs a human.
5. Open **Audit log**. Every entry carries the coverage decision, the statutory workings, the approver and the tool trail.

---

## Step 6 — Prove the rules aren't cosmetic

Add a new invoice twice with **+ New invoice**, changing only one field:

| | A | B |
|---|---|---|
| Vendor | `Orion Steel Traders (V007)` | `Sharma Ent. (V001)` |
| Amount | 200000 | 200000 |
| Invoice date | today | today |
| Goods accepted on | today | today |
| Description | `TMT bars, bought in and resold` | `Fabricated brackets, made to drawing` |

**A** comes back out of scope — no deadline, no exposure, nothing to do. **B** comes back with a 45-day deadline and ₹50,000 of exposure. Same amount, same dates; the difference is who the supplier is and what they actually did.

Then change **Buffer** from 3 to 10 → **Apply policy**. The recommended pay-by date moves. **The deadline does not.** Buffer, tax rate, threshold and confidence floor are yours; the 45/15 rule and the coverage rule are statute.

---

## Step 7 — With the real agent

Add `GEMINI_API_KEY` to `.env` (free, no card: aistudio.google.com/apikey), restart, and use the per-row buttons rather than a full sweep — 24 vendors × ~60s each will hit a free-tier quota.

- **Vendor portfolio → Konark Printers → Re-sweep.** The declared number `UDYAM-OD-22-0061189` does not exist. The heuristic gives up. The agent should search by name and find *Konark Printing Press*.
- **Vendor portfolio → K.P. Works → Re-sweep.** Two Delhi micro registrations: *Kavya Print Works* (printing) and *K P Works Trading Company* (trading). Same state, so GSTIN cannot separate them — but the supply is printed catalogues. Picking wrong flips coverage.
- **Live queue → INV-4124 → Re-analyse this row.** Watch whether it catches the implicit refusal.

Compare each against the heuristic result it replaced. Where they agree, the AI is not earning its place on that case — and the report at step 3 tells you exactly which cases those are.

---

## What this run demonstrated

| Step | |
|---|---|
| 1 | Coverage is decided per vendor by a rule over agent evidence — traders and medium enterprises excluded, unknowns escalated |
| 2 | A costed reconstruction of last year, decomposed by confidence rather than asserted as one number |
| 3 | Coverage judged as at the supply date; 59 of 185 invoices misread by a today's-status baseline |
| 4 | Document reasoning a keyword match gets wrong in both directions |
| 5 | Bounded auto-execution, human approval, and closure only on confirmed money movement |
| 6 | Policy is configurable; statute is not |
| 7 | The AI arm measured against the non-AI arm, case by case |

## Reset

```powershell
curl.exe -s -X POST http://localhost:3000/api/reset
```
