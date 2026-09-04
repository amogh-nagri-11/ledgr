# Live test script

Eight tests you can run in the browser in about ten minutes. Each one is written so you can **check the answer by hand** — that's the point. A dashboard that only ever agrees with itself proves nothing.

> **Dates shift.** Everything below assumes today is **2026-09-04**, because the seed data is dated relative to today. If you run this tomorrow every date moves by a day. The *arithmetic* is what to check, not the literal strings.

---

## Step 0 — optional, 2 minutes: turn the real AI on

The app runs fine without this, but in heuristic mode the "AI" is regex. To see actual reasoning:

1. Go to **https://aistudio.google.com/apikey** → *Create API key*. Free, no card.
2. In the project root:
   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```
   Put the key on the `GEMINI_API_KEY=` line, save.
3. Restart: `npm start`

The header chip should read **AI: Google Gemini · gemini-3.6-flash** instead of *heuristic fallback*. Every row is badged with whichever produced it, so you can tell them apart at a glance.

> **Free-tier throughput is the real constraint, and it shapes how you demo.**
> Each invoice is a full agentic loop — about 6 requests and ~60 seconds. Running all 11 at once trips Gemini's per-minute quota, and every row silently falls back to the heuristic. That fallback is correct behaviour, but it is not what you want on screen.
>
> **So: run the ledger on heuristic, then use the "Re-analyse this row" button** (inside a row's detail panel, top-right of *Investigation trail*) to run the real agent on just the two or three rows you're demonstrating. Tests 3 and 5 are the ones worth spending quota on.
>
> If a model id 404s saying it is no longer available, list what your key can actually see:
> ```powershell
> curl.exe -s -H "Authorization: Bearer $env:GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/openai/models
> ```
> and set `LLM_MODEL=` in `.env` to one of them.

## Setup

```powershell
npm start
```

Open **http://localhost:3000** and click **Run compliance analysis**. On heuristic this takes about a second.

You should see **6 red · 1 amber · 3 green · 1 needs review**, ₹11,69,400 at risk, ₹2,92,350 exposure.

---

## Test 1 — the falsification test *(do this one first)*

**Claim being tested:** the 45/15-day split is real logic, not a label attached to seeded rows.

Two invoices, **identical in every way except the vendor**. One vendor has a contract on file, the other doesn't.

**A.** Click **+ New invoice**:

| Field | Value |
|---|---|
| Vendor | `Aruna Pkg Solutions (V003)` |
| Amount | `120000` |
| Invoice date | `2026-08-30` |
| Goods accepted on | `2026-08-30` |
| Description | `Test A` |

**Add and analyse.**

**B.** Same again, changing **only** the vendor to `Sharma Ent. (V001)`.

### Expected

| | A — Aruna | B — Sharma |
|---|---|---|
| Rule | `no written agreement` | `agreement term` |
| Period | **15 days** | **45 days** |
| Deadline | **2026-09-14** | **2026-10-14** |
| Risk | 🟡 amber | 🟢 green |
| Exposure | ₹30,000 | ₹30,000 |

Same amount, same dates, **a month of difference in the deadline** — driven entirely by whether a contract exists. Open row A's *Extracted inputs* panel: agreement reads **none on file**. Open B's: it quotes clause 7.2, *"payment within forty-five (45) days from the date of acceptance"*.

Check it yourself: 30 Aug + 15 = 14 Sep. 30 Aug + 45 = 14 Oct.

---

## Test 2 — a contract cannot buy more time than the statute allows

**Row: INV-2042, Nandi Precision, ₹2,75,000.** Click it open.

The contract (`PO-TERMS-NANDI-2025`) says **"Payment terms are Net 60 days"** — and the evidence panel quotes exactly that. But the *Statutory calculation* panel says:

> Agreement states 60 days, which exceeds the statutory ceiling → capped at 45 days. A contractual term cannot override s.15 MSMED.

Deadline **2026-09-11**, not 2026-09-26. **The AI reported 60 and the engine overrode it to 45** — that separation is the whole architecture. Go by their own contract terms and this invoice looks comfortable; under the statute it's 7 days out and red.

---

## Test 3 — the clock does not start at the invoice date

**Row: INV-2044, Meghdoot Logistics, ₹1,85,000.** This is the best row in the demo. Spend AI quota here — click **Re-analyse this row**.

Invoice dated **2026-07-26**, 30-day terms. Naive arithmetic: 26 Jul + 30 = **25 Aug** → breached ten days ago.

Ledgr says **deadline 2026-09-08, 4 days left**. The *Investigation trail* shows it pulled the registry, the contract, the delivery timeline and the payout status before answering. The clock-start evidence, verbatim from a real run:

> Written objection EMAIL-2291 raised on 2026-07-29 within the 7-day contractual window following 2026-07-26 delivery. Replacement consignment delivered on 2026-08-06 and accepted in full via GRN-4502 on 2026-08-09.

Note what it did there: clause 4.2 only restarts the clock **if the objection was raised within seven days**. The model checked that precondition — 26 Jul to 29 Jul is 3 days — before applying the restart. The heuristic just sees "an objection exists" and takes the last GRN; it gets the same answer here by luck, not by reasoning.

Then 9 Aug + 30 = 8 Sep. ✓

A date calculator gets this wrong and sends someone chasing a breach that never happened.

---

## Test 4 — risk is tied to money, not to the calendar

**Row: INV-2049, Sharma Ent., ₹95,000.**

Deadline **2026-09-20** — 16 days away. Comfortable. Yet it's **🔴 red**:

> Payout scheduled 2026-09-22 — 2 day(s) past the deadline. Reschedule.

There *is* money in motion, which is exactly why a tracker that only watches deadlines marks this as handled. Ledgr reads the RazorpayX payout date and compares it to the statutory date.

Contrast with **INV-2050** (green): paid 2026-08-27 against a 2026-08-30 deadline — settled in time, item closed.

---

## Test 5 — it refuses to guess *(and where the two modes disagree)*

**Row: INV-2046, K.P. Works, ₹1,10,000.** On heuristic it is ⚪ needs review:

> No goods receipt note for INV-2046; the acceptance date is deemed rather than evidenced.

There is **no Pay now button** on this row. Prove the block is real, not just hidden UI:

```powershell
curl.exe -s -X POST http://localhost:3000/api/invoices/INV-2046/pay -H "Content-Type: application/json" -d "{}"
```

→ `409` and *"This item is flagged for human review; resolve the open question before paying."*

### Heuristic vs AI on this row — do this comparison

Click **Re-analyse this row** and watch it change:

- **Heuristic** flags ⚪ needs review, because it has a rule saying "deemed acceptance → escalate".
- **Gemini** typically **resolves it to 🔴 red instead.** It reads NOTE-771, confirms no GRN *and* no objection exists, applies deemed acceptance at delivery + 15 days, and — reasonably — doesn't think that needs a human. It also cross-checks the vendor in a way nothing instructed it to: *"both in Delhi (buyer ledger GSTIN prefix 07 and Udyam DL state code)"*, and makes a second registry search to confirm the match before submitting.

Both answers are defensible and the AI's is arguably the better one. But **know this before a panel demo**: if you say "it escalates when unsure" and then show a row that resolved, you'll get caught. Demo escalation with the intake below instead, which behaves the same in both modes.

**A known weakness, worth being honest about.** The registry holds *both* "K P Works Trading Company" and "Kavya Print Works" — both micro, both Delhi — and this invoice is for **printed catalogues**. In testing, Gemini picked K P Works Trading and then searched again to *confirm* it, rather than weighing Kavya Print Works as a rival candidate. That's confirmation-seeking, not comparison. If a judge probes vendor-matching ambiguity, this is the row where they'll find it.

### The deterministic escalation

Add a new invoice for `K.P. Works (V006)` **leaving "Goods accepted on" blank**. It comes back ⚪ grey — *"No delivery or acceptance record exists"* — in either mode. Add the same invoice again **with** an acceptance date and it resolves to a real deadline and a colour. The escalation is caused by missing evidence, not hardcoded per vendor.

---

## Test 6 — policy is configurable, statute is not

In the toolbar, change **Buffer** from `3` to `10` → **Apply policy**. Reopen **INV-2041**:

- Deadline: **2026-09-08 — unchanged.**
- Recommended pay-by: moves from 2026-09-05 to **2026-08-29**.

Now change **Tax rate** to `30` → exposure on INV-2041 goes ₹1,25,000 → **₹1,50,000** (30% of ₹5,00,000).

The knobs move the advice. **No knob moves the deadline** — that's statute, hardcoded in `src/engine/deadline.js`, with a unit test asserting exactly this invariant.

Set buffer back to `3` and tax back to `25` before continuing.

---

## Test 7 — execute, and check what got recorded

1. **INV-2048** (Aruna, ₹8,400) shows **Auto-schedule**, not *Pay now* — it's under the ₹10,000 threshold. Click **Auto-execute under threshold**. It schedules and the row turns green.
2. **INV-2041** (₹5,00,000) shows **Pay now** — above the threshold, so it needs a human. Click it.
3. Click **Audit log**.

Every entry carries the reasoning that produced it — approver, timestamp, payout id, the statutory workings, and the exposure avoided. The `analysis` entries carry the tool-call trail.

Set `RAZORPAYX_*` in `.env` and the same click hits the sandbox `POST /v1/payouts` instead of the mock; the payout id changes from `pout_mock_…` to a real one.

---

## Test 8 — vendors the rule doesn't touch

Both green, for different reasons — open each and read the evidence line:

- **INV-2045, Vertex, ₹9,20,000** — registered, but a **medium** enterprise. 43B(h) covers micro and small only.
- **INV-2047, Orion Steel, ₹3,40,000** — no Udyam registration found at all.

Neither gets a deadline. A tool that flagged every large unpaid invoice would light both of these up and waste the finance team's time.

---

## What each test proves

| Test | Proves |
|---|---|
| 1 | The 45/15 split is computed from evidence, not seeded |
| 2 | The AI extracts, the engine decides — and overrides the AI |
| 3 | Genuine document reasoning; a date calculator gets this one wrong |
| 4 | Compliance is tied to actual RazorpayX money movement |
| 5 | Escalation on missing evidence — plus an honest heuristic/AI comparison |
| 6 | Policy is tunable; statute is not |
| 7 | Bounded auto-execution, human approval, full audit trail |
| 8 | Correct negatives — it stays quiet when the rule doesn't apply |

## Reset

```powershell
Remove-Item .ledgr-state.json
npm start
```

Or while it's running:

```powershell
curl.exe -s -X POST http://localhost:3000/api/reset
```
