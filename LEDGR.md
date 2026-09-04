# Ledgr — AI MSME Payment Compliance Controller

Razorpay Buildathon project spec.

---

## 1. The problem

Since the FY24 amendment to **Section 43B(h)** of the Income Tax Act, a business loses its tax deduction on any expense paid to a Udyam-registered micro or small enterprise if it pays later than the applicable deadline:

- **45 days** if there is a written agreement specifying that payment term
- **15 days** if there is no written agreement

This is not a soft compliance nudge. It is a hard, dated, quantifiable consequence.

### What "losing the deduction" means

Normal accrual accounting: an expense is claimable in the year it is *incurred* (goods delivered, obligation created), not the year it is paid.

Example — revenue ₹20,00,000, supplier delivers ₹5,00,000 of materials in March, unpaid:

| Scenario | Taxable profit | Tax owed (at 25%) |
|---|---|---|
| Deduction allowed | ₹15,00,000 | ₹3,75,000 |
| Deduction disallowed | ₹20,00,000 | ₹5,00,000 |

Paying that MSME vendor late costs **₹1,25,000 in extra tax** on a single invoice — not because more profit was made, but purely because of payment timing. The deduction is only recoverable in whichever future year the payment actually happens.

Finance teams currently track this manually or not at all, across hundreds of invoices, with nothing connecting "this invoice is due" to "here is the actual payout sitting in RazorpayX."

---

## 2. What Ledgr is

An AI payment-compliance controller that sits across the full workflow:

```
Invoice → MSME status → agreement terms → statutory deadline
       → RazorpayX payout schedule → compliance outcome
```

It does not just count down days. For every payable it determines **which payments need action, why, and what the finance team should do** — then executes the approved action through RazorpayX and logs the reasoning.

**Detect → reason → recommend → approve → execute → verify → audit.**

### What it is not

Not "another dashboard showing overdue invoices." The differentiator is that compliance risk is tied to *actual money movement*, and every recommendation carries an auditable explanation of how it was reached.

---

## 3. System architecture

```
┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Invoices   │  │  Contracts, POs  │  │  Udyam registry  │
│ PDFs, bills │  │ delivery, email  │  │  MSME status     │
└──────┬──────┘  └────────┬─────────┘  └────────┬─────────┘
       │                  │                     │
       └──────────────────┼─────────────────────┘
                          ↓
       ┌──────────────────────────────────────────┐
       │   AI EXTRACTION AND REASONING AGENT      │
       │  Extracts payment terms                  │
       │  Matches vendor names                    │
       │  Resolves when the clock starts          │
       │  Investigates ambiguity                  │
       │  Returns evidence + confidence           │
       └──────────────────┬───────────────────────┘
                          ↓
       ┌──────────────────────────────────────────┐
       │   DETERMINISTIC DEADLINE ENGINE          │
       │   45 / 15 day statutory rule (hardcoded) │
       └──────────────────┬───────────────────────┘
                          ↓
       ┌──────────────────────────────────────────┐
       │   RISK CLASSIFICATION                    │
       │   Red / amber / green / needs review     │
       └──────────────────┬───────────────────────┘
                          ↓
       ┌──────────────────────────────────────────┐
       │   ACTION QUEUE (ranked, with reasoning)  │
       └────────┬────────────────────────┬────────┘
                ↓                        ↓
     ┌────────────────────┐   ┌────────────────────┐
     │   AUTO-EXECUTE     │   │  HUMAN APPROVAL    │
     │ under threshold    │   │ high value/unclear │
     └─────────┬──────────┘   └─────────┬──────────┘
               └────────────┬───────────┘
                            ↓
            ┌──────────────────────────────┐
            │  RAZORPAYX PAYOUT            │
            │  Payouts API, sandbox keys   │
            └──────────────┬───────────────┘
                           ↓
            ┌──────────────────────────────┐
            │  AUDIT LOG                   │
            │  Evidence chain, approver    │
            └──────────────────────────────┘
```

### The critical design split

**AI layer (purple) = messy reasoning.** **Rule layer (teal) = deliberately dumb.**

The LLM never does the date arithmetic. When a judge asks *"what if the AI hallucinates a deadline and you pay late?"*, the answer is: **it can't — the statutory calculation is hardcoded; the AI only extracts inputs and shows its evidence.** Teams that hand compliance math to an LLM will fumble that question.

---

## 4. Where the AI genuinely earns its place

The naive version of this product is a date calculator with a dashboard, and judges will notice. The real AI work is in the inputs everyone else assumes are clean:

**a) Agreement term extraction**
Read the actual contract/PO PDF and answer: is there a written agreement, and what payment term does it specify? Real contracts say "net 30 from delivery" vs "60 days from receipt of invoice." A contract claiming 60 days does not override the statutory cap — detecting that conflict is genuine reasoning, not regex.

**b) When does the clock actually start?**
The deadline runs from acceptance or deemed acceptance of goods, not always the invoice date. If the buyer raised an objection to the delivery, the clock shifts. Determining this means reading delivery notes, GRNs, and email threads together. This is the meatiest AI task in the product.

**c) Vendor identity matching**
Invoice says "Sharma Ent." Udyam registry says "Sharma Enterprises Private Limited." Same entity? Fuzzy matching across messy real-world vendor names, with a confidence score.

**d) Invoice ↔ PO ↔ delivery-note reconciliation**
Determining which agreement governs which invoice. Genuinely unstructured.

### The agentic loop

On hitting ambiguity the system does not just flag and give up — it **investigates**: pulls the PO, re-reads the relevant clause, queries the Udyam registry, checks the delivery timeline, then returns a resolved answer with its evidence chain and confidence score. It escalates to a human only when it genuinely cannot resolve.

That multi-step tool-using loop is the agentic story, and it is demoable: a messy folder of documents goes in, a clean evidenced dated decision comes out.

---

## 5. Feature build order

Implement one at a time; each is independently testable and demoable.

| # | Feature | Notes |
|---|---|---|
| 1 | **Invoice intake** | Vendor, amount, invoice date, agreement flag. Structured input or manual entry — don't build real OCR. |
| 2 | **MSME status check** | Udyam-registered flag per vendor. Hardcode a small vendor list for the demo. |
| 3 | **Deadline calculator** | Agreement → +45 days. No agreement → +15 days. Not MSME → rule doesn't apply, skip. **Deterministic.** |
| 4 | **RazorpayX payout lookup** | Pull (or mock) scheduled/completed payout date per vendor. |
| 5 | **Risk classification** | 🔴 breach imminent · 🟡 schedule with buffer · 🟢 no action · ⚪ ambiguous, needs review |
| 6 | **Recommendation + explanation** | LLM turns structured data into a readable rationale. **Include the rupee cost of missing the deadline.** |
| 7 | **Action queue / dashboard** | Single screen, sorted by urgency, explanation visible per row. |
| 8 | **Bounded auto-execution** | Under threshold (e.g. ₹10,000) auto-schedules. Above → "Pay Now" button → RazorpayX Payouts API (sandbox). |
| 9 | **Audit log** | Every action logged with full reasoning trail, timestamp, approver. |
| 10 | **Disclaimer banner** | "Informational risk indicator — verify with your CA." |

**48-hour order:** 1 → 2 → 3 → 5 (get the deterministic engine correct first, it's the whole premise) → 4 → 7 (something visible on screen early) → 6 → 8 → 9 → 10.

Steps 1–7 alone are a coherent demoable product. Steps 8–10 push it from "tracker" to "controller."

---

## 6. Worked example (the demo script)

**The invoice:** supplier delivers ₹5,00,000 of materials on March 1, invoices, unpaid.

1. **Intake** — vendor, ₹5,00,000, invoice date March 1, agreement present.
2. **MSME check** — vendor confirmed Udyam-registered small enterprise. (If not registered → 🟢, 43B(h) doesn't apply.)
3. **Deadline** — agreement exists → March 1 + 45 days = **April 15**. (No agreement would have meant March 16.)
4. **Payout lookup** — nothing currently scheduled.
5. **Classification** — today is April 10, 5 days left, no payout in motion → **🔴 red**.
6. **Recommendation:**

   > Vendor confirmed MSME. Invoice: March 1, ₹5,00,000. Agreement on file → deadline April 15. No payout currently scheduled. Recommend: pay by April 12 to preserve a 3-day safety buffer. Missing this deadline forfeits the ₹5,00,000 deduction this year — an estimated ₹1,25,000 extra tax liability at 25%.

7. **Action queue** — surfaces near the top, explanation visible.
8. **Execution** — ₹5,00,000 exceeds the auto-execute threshold → "Pay Now" button → finance team clicks → RazorpayX Payouts API call.
9. **Audit log** — invoice, deadline reasoning, approver, timestamp all recorded.

The last line of step 6 is the point: it translates a dry deadline into the actual rupee cost of missing it.

---

## 7. Scope discipline — what NOT to build

**Do not build cash-flow / working-capital optimization.** There is no real treasury data in a hackathon, so "pay at the latest financially optimal moment" becomes a fabricated number dressed as a serious financial decision. A judge who has built anything real will ask where the cash position comes from, and the honest answer is "it's mocked."

Keep the buffer as a **configurable heuristic** ("pay N days before deadline, N adjustable"), not a pitch about optimizing working capital. The honest version is still a good demo; the oversold version collapses the moment someone probes it.

**Do not headline autonomous payout scheduling.** Squeezing a payment date right up against the statutory deadline based on an estimated safe buffer *is* a legal judgment call, not an operational one. If the buffer estimate is wrong (bank holiday, payout processing lag, T+1 settlement delay) and the payment lands a day late, the system did not fail to warn about a breach — it *caused* one by deciding to wait.

Sell **"reasoning + recommendation + one-click execute"** instead. Same architecture, same wow-moment, without claiming the AI made an unsupervised legal timing decision.

---

## 8. Legal and regulatory position

Low risk, but the framing matters.

- **No money moves without human consent.** The RazorpayX Payouts API is called only on a click (or under a low configurable threshold). Not an autonomous payment agent — a workflow trigger a human approves.
- **Not a payment aggregator.** RBI PA-PG licensing applies to entities holding or routing customer funds. Ledgr calls the merchant's *own* already-licensed RazorpayX account with their own API keys to pay their own vendors — same legal category as an internal automation tool.
- **Low-sensitivity data.** Vendor GST invoices and Udyam numbers are ordinary B2B business records, not personal/KYC data.
- **Not legal or tax advice.** 43B(h) eligibility involves judgment calls (does a valid agreement exist, is Udyam registration current). Every flag is framed as an **informational risk indicator — verify with your CA**, never a definitive compliance verdict.
- **Hackathon specifics:** use Razorpay test/sandbox keys, seed fake vendor and invoice data, never touch real money. This removes any remaining live liability surface.

**Positioning line:** *An AI-powered payment control system that identifies and prevents payment-timing risks under configurable MSME payment policies.* The legal rules are deterministic; the AI handles the messy operational reasoning around them.

---

## 9. Razorpay integration map

| API | When invoked |
|---|---|
| **RazorpayX Payouts API** | On approval (or auto-execute under threshold) — creates the actual vendor payout |
| **RazorpayX payout status / webhooks** | Feedback loop — confirms execution, closes the compliance item, updates the audit trail |
| **Payout scheduling** | For 🟡 amber items scheduled ahead of deadline with buffer |

Sandbox credentials throughout. Never hardcode keys.

---

## 10. Competitive position

Checked and cleared during idea selection:

- **Reconciliation** (Recko/Stripe, Razorpay Recon) — crowded, avoided.
- **Payment routing** (Razorpay Optimizer, Smart Router, Dynamic Router) — natively owned by Razorpay, avoided.
- **Dunning / recurring recovery** (Chargebee Revive, Razorpay Intelligent Revenue-Protect) — natively owned + category leader, avoided.
- **Card chargeback representment** (Chargeflow, $39M raised) — occupied, avoided.
- **MSME 43B(h) payment-timing compliance** — found only as a side-feature inside broader freelancer-payroll platforms. No dedicated payment-gateway-native tool watching actual payout execution against the statutory clock.

**Caveat:** genuinely zero-competitor Indian fintech ideas don't exist in 2026. The real bar is narrowest wedge, least crowded corner, hardest for an incumbent to bother copying. Worth one more live competitor check before committing.

**Honest ceiling:** this is a strong agentic-document-reasoning project with financial-workflow rigor, not a frontier-AI showcase. If the buildathon rewards raw AI ambition over a product that survives questioning, it caps around 8/10. If it rewards something that actually works and holds up under scrutiny, it's the strongest option available.

---

## 11. Naming

"Ledgr" is a placeholder. Names are irrelevant to the outcome — do not spend time here.