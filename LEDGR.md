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

### The problem beneath the problem

Before any of that arithmetic can run, someone has to answer a question nobody in the business has answered: **which of our 200 suppliers does this even apply to?**

That data does not exist in the buyer's system. It is not a typing problem. Vendor names in the ledger are messy, Udyam registration status changes, enterprise category changes as a firm grows, and — the trap most tools miss — registration alone does not settle it (see §4b). This is where the real work is, and it is why the product is agentic rather than a date calculator.

---

## 2. What Ledgr is

An AI payment-compliance controller that runs in three movements:

```
ASSESS    which vendors carry the statutory obligation, and why
QUANTIFY  what disallowance already sits in the books, and what is live now
CONTROL   schedule and execute the payouts that prevent the next one,
          and confirm the money actually moved
```

Concretely, the pipeline is:

```
Vendor master  → registration validation → activity classification → coverage
Invoice        → governing agreement → when the clock starts
               → statutory deadline (deterministic)
               → RazorpayX payout schedule → compliance outcome
               → payout confirmation → item closed
```

**Detect → reason → recommend → approve → execute → verify → audit.**

### What it is not

Not "another dashboard showing overdue invoices." Two things separate it: compliance risk is tied to *actual money movement*, and every recommendation carries an auditable explanation of how it was reached.

Nor is it an auditor. The retroactive exposure report (§6) is the way in — it proves a number rather than promising one — but it always terminates in a live action. A finding about last year that does not end in a payout run this quarter is a report, not a controller.

---

## 3. System architecture

Two agents, because the two questions have different shapes and different cardinality.

```
┌──────────────────────────────────────────────────────────────┐
│  PORTFOLIO AGENT          per vendor · cached · re-verified  │
│                                                              │
│  Validates the declared Udyam registration                   │
│  Resolves vendor-name ambiguity, with confidence             │
│  Reads registered activity / NIC against actual supply       │
│  Returns evidence for a coverage decision                    │
└───────────────────────────┬──────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  COVERAGE RULE                                    (hardcoded)│
│  micro/small AND registration current AND not excluded       │
│  activity  →  in scope                                       │
└───────────────────────────┬──────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  INVOICE AGENT                                   per invoice │
│                                                              │
│  Which agreement governs this supply                         │
│  What payment term it states, as written                     │
│  When the clock actually starts (acceptance, deemed          │
│    acceptance, or re-acceptance after an objection)          │
│  Returns evidence + confidence                               │
└───────────────────────────┬──────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  DEADLINE ENGINE                                  (hardcoded)│
│  45 / 15 day statutory rule, contractual term capped at 45   │
└───────────────────────────┬──────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  RISK CLASSIFICATION   red / amber / green / needs review    │
│  Deadline compared against the actual RazorpayX payout date  │
└────────┬─────────────────────────────────────┬───────────────┘
         ↓                                     ↓
┌────────────────────┐              ┌────────────────────┐
│   AUTO-EXECUTE     │              │  HUMAN APPROVAL    │
│  under threshold   │              │ high value/unclear │
└─────────┬──────────┘              └─────────┬──────────┘
          └──────────────┬────────────────────┘
                         ↓
          ┌──────────────────────────────────┐
          │  RAZORPAYX PAYOUT                │
          │  Payouts API, sandbox keys       │
          └──────────────┬───────────────────┘
                         ↓
          ┌──────────────────────────────────┐
          │  PAYOUT WEBHOOK / STATUS         │
          │  Item closes only on confirmed   │
          │  money movement                  │
          └──────────────┬───────────────────┘
                         ↓
          ┌──────────────────────────────────┐
          │  AUDIT LOG                       │
          │  Evidence chain, approver        │
          └──────────────────────────────────┘
```

### The critical design split

**AI layer = messy reasoning. Rule layer = deliberately dumb.**

The LLM never does the date arithmetic, and — equally important — **it never makes the coverage decision either.** Both agents return *evidence*; hardcoded rules turn evidence into determinations.

When a judge asks *"what if the AI hallucinates a deadline and you pay late?"*, the answer is: it can't — the statutory calculation is hardcoded. The follow-up question is sharper: *"but now the AI decides whether the rule applies at all — isn't that the same exposure?"* It would be, which is why coverage is a rule over AI-supplied evidence (NIC code, registered activity, supply description, contract quote) rather than a model verdict. Both load-bearing decisions are deterministic; only the inputs are inferred.

### Cardinality, and why the split matters operationally

Vendor status is a property of the **vendor**, not the invoice. 200 vendors and 4,000 invoices is 200 classifications, not 4,000. The portfolio agent runs as a cached sweep and is re-verified on a schedule; the invoice agent runs per payable against that cache. This is both correct design and the only way the work fits inside a rate-limited API budget.

---

## 4. Where the AI genuinely earns its place

The naive version of this product is a date calculator with a dashboard, and judges will notice. The real AI work is in the inputs everyone else assumes are clean.

**a) Vendor identity at portfolio scale**
Invoice says "Sharma Ent." The registry says "Sharma Enterprises Private Limited." Same entity? Hundreds of independent investigations, each with lookups, disambiguation and a confidence score. Corroborating signals exist and the agent should use them — the GSTIN state prefix against the registration's state, for one.

**b) Is the vendor in scope at all — the trader question**
This is the sharpest one, and most tools get it wrong.

Udyam registration was extended to wholesale and retail trade in 2021, but for the limited purpose of priority-sector lending. Trading enterprises can therefore hold a valid Udyam registration while sitting **outside** the MSMED s.15 delayed-payment obligation that 43B(h) hangs on. So the obvious check — *registered + micro/small → covered* — is wrong, and wrong in the direction that makes a business rush payments for no reason and burn working capital.

The signal is the registered activity: NIC divisions 45–47 are wholesale and retail trade. But the real work is that **the registered NIC often doesn't match what the vendor actually supplied you** — a firm registered under a trading code may have manufactured the item on your invoice, and vice versa. That determination reads the registry activity, the invoice line description and the contract's description of supply together. There is no regex answer and there is a clear right answer to a competent human. That is exactly the zone where the AI is load-bearing.

> **Open item:** confirm the current position with a CA before this appears in a pitch. It is a live practitioner nuance, not settled ground, and the product should present it as a flag to verify rather than a verdict.

**c) Agreement term extraction**
Read the actual contract or PO and answer: is there a written agreement, and what payment term does it specify? Real contracts say "net 30 from delivery" vs "60 days from receipt of invoice," bury the term in an amendment that supersedes the original clause, or write it in words rather than digits. A contract claiming 60 days does not override the statutory cap — reporting 60 faithfully and letting the rule cap it is the correct division of labour.

**d) When does the clock actually start?**
The deadline runs from acceptance or deemed acceptance of goods, not always the invoice date. If the buyer raised an objection to the delivery, the clock shifts — but only if the objection was raised inside the contractual window, and only if it was an objection to the *goods* rather than to the rate. Determining this means reading delivery notes, GRNs and email threads together.

### The agentic loop

On hitting ambiguity the system does not flag and give up — it **investigates**: pulls the PO, re-reads the relevant clause, re-queries the registry with a different name, checks the delivery timeline, then returns a resolved answer with its evidence chain and confidence score. It escalates to a human only when it genuinely cannot resolve.

Where it can act to close its own evidence gap, it should. The commonest gap in practice is that no GRN was ever raised — so rather than only flagging "acceptance not evidenced," the agent identifies who received the consignment and drafts the confirmation request, then files the answer back as evidence with provenance.

Volume alone is a batch job. Volume **plus** branching investigation **plus** persistent state **plus** escalation is an agent. That distinction is the pitch.

---

## 5. Proving the AI earns its place

Assertion is not evidence. The system ships with a non-AI path — the same tools, the same output shape, but string matching and regex instead of reasoning — and the two are diffed.

**The ablation is the headline metric:**

> Registered-and-small says 34 vendors covered. The agent says 27 — seven are trading enterprises. Those seven took ₹58 lakh of payments the naive check would have told you to rush for no reason.

A directional error with a rupee cost attached. That is "AI judgment applied appropriately" as a measurement rather than a claim, and it is also the honest-failure-rate reporting the brief asks for.

If the ablation shows no disagreement, the AI is decorative and the corpus is too easy. That is a finding to act on, not to hide.

---

## 6. Provenance discipline

`PROVENANCE.md` at the repo root, classifying every artifact class as **SYNTHETIC** or **API-DERIVED**, before any number appears anywhere.

This matters most for two things. The Udyam registry has no public bulk name-search API — production data comes from vendor self-declaration at onboarding, which the agent validates and classifies, plus flags for vendors who declared nothing. And the retroactive exposure figure is only as real as the ledger it reconstructs; on seeded data it is a synthetic number, and what is real in the demo is the reconstruction *method*.

Write the hard cases before the agent, and be ready to hand the panel the generator seed to regenerate the corpus live.

---

## 7. Feature build order

| # | Feature | Notes |
|---|---|---|
| 1 | **Vendor master intake** | Ledger name, GSTIN, declared Udyam number (often absent). |
| 2 | **Portfolio classification sweep** | Per vendor, cached. Validate registration, resolve name ambiguity, classify activity. Returns evidence. |
| 3 | **Coverage rule** | Micro/small + current + non-excluded activity. **Deterministic**, over the agent's evidence. |
| 4 | **Invoice intake** | Vendor, amount, invoice date, agreement flag. Structured input or manual entry — don't build real OCR. |
| 5 | **Deadline calculator** | Agreement → term, capped at 45. No agreement → 15. Not covered → skip. **Deterministic.** |
| 6 | **Clock-start resolution** | Acceptance / deemed acceptance / re-acceptance after objection. |
| 7 | **RazorpayX payout lookup** | Scheduled and completed payout dates per vendor. |
| 8 | **Risk classification** | 🔴 breach imminent · 🟡 schedule with buffer · 🟢 no action · ⚪ ambiguous, needs review |
| 9 | **Retroactive exposure audit** | Reconstruct last year's breaches. Report decomposed by confidence, never as one number. |
| 10 | **Recommendation + explanation** | LLM turns structured data into a readable rationale. **Include the rupee cost.** |
| 11 | **Action queue / dashboard** | Single screen, sorted by urgency, explanation visible per row. |
| 12 | **Bounded auto-execution** | Under threshold auto-schedules. Above → "Pay Now" → RazorpayX Payouts API (sandbox). |
| 13 | **Payout confirmation** | Webhook / status poll. **The compliance item closes only on confirmed money movement.** |
| 14 | **Ablation harness** | AI vs non-AI diff across the portfolio, costed in rupees. |
| 15 | **Audit log** | Every action logged with reasoning trail, timestamp, approver. |
| 16 | **Disclaimer banner** | "Informational risk indicator — verify with your CA." |

**Order:** 1 → 2 → 3 → 5 → 8 → 11 → 9 → 12 → 13 → 14 → the rest.

Get the deterministic layers right before anything else; they are the whole premise. Something visible on screen early. Then the audit, then execution and confirmation, then the ablation that proves the point.

**Continuous re-verification** — registrations lapse, categories change, new vendors onboard — is near-free once the portfolio sweep exists and is *not* built until it is. It demos as a scripted status change during the walkthrough, not as a cron job nobody can see.

---

## 8. The demo — four beats, one story

The arc must stay continuous. The audit is the proof that motivates the control; it is not a separate deliverable.

**1. Sweep.** Point it at the vendor master. It classifies each vendor with evidence: registration validated, name ambiguity resolved, activity assessed. Seven come back excluded as trading enterprises — with the reasoning shown.

**2. Audit — the number.** Reconstruct last year's payables against those classifications. Report it decomposed, never as a single figure:

> ₹31L from vendors classified with high confidence · ₹11L contingent on 14 vendors needing review · ₹6L excluded as trading enterprises

**3. Live queue — the same pattern, still happening.** The point of beat 2 is beat 3. *"That pattern is live on 23 vendors right now, ₹Y at stake this quarter."*

Worked example, the one to open on:

> Vendor confirmed a covered micro enterprise. Invoice: March 1, ₹5,00,000. Agreement on file → deadline April 15. The clock ran from acceptance on March 1, not the invoice date. No payout currently scheduled. Recommend paying by April 12 to preserve a 3-day safety buffer. Missing this deadline forfeits the ₹5,00,000 deduction this year — an estimated ₹1,25,000 extra tax liability at 25%.

**4. Execute and confirm.** ₹5,00,000 exceeds the auto-execute threshold → "Pay Now" → RazorpayX Payouts API → payout confirmation closes the compliance item → audit log records invoice, deadline reasoning, approver, timestamp.

The last line of beat 3 translates a dry deadline into the rupee cost of missing it. Beat 4 is what makes this a controller rather than a report — **do not let beats 1 and 2 eat the clock.**

---

## 9. Scope discipline — what NOT to build

**Do not build cash-flow / working-capital optimization.** There is no real treasury data in a hackathon, so "pay at the latest financially optimal moment" becomes a fabricated number dressed as a serious financial decision. Keep the buffer as a **configurable heuristic** ("pay N days before deadline, N adjustable"), not a pitch about optimizing working capital.

**Do not headline autonomous payout scheduling.** Squeezing a payment right up against the statutory deadline based on an estimated safe buffer *is* a legal judgment call. If the buffer estimate is wrong (bank holiday, T+1 settlement lag) and the payment lands a day late, the system did not fail to warn about a breach — it *caused* one. Sell **"reasoning + recommendation + one-click execute"** instead.

**Do not become an invoicing tool.** Issuing invoices ourselves would produce clean data for the one input that was already trivial — the invoice contributes a vendor pointer, an amount, and a fallback date — while changing nothing about the three hard ones: registration, agreement terms, and acceptance. It would also destroy the retroactive audit (no history), and it walks into a category incumbents own.

**Do not let the AI make coverage decisions.** Evidence from the model, determination from the rule. This is the same discipline as the deadline arithmetic, applied to the question that now matters just as much.

**Do not let the audit become the product.** It is the wedge, not the destination. Every finding ends in a live action or it is a report.

**Do not let RazorpayX become a button.** If the interesting work all happens before the payout, the answer to "why is this a Razorpay product" is thin. Payout confirmation closing the compliance item is what makes the integration structural rather than terminal — build it.

---

## 10. Legal and regulatory position

Low risk, but the framing matters.

- **No money moves without human consent.** The Payouts API is called only on a click (or under a low configurable threshold). Not an autonomous payment agent — a workflow trigger a human approves.
- **Not a payment aggregator.** RBI PA-PG licensing applies to entities holding or routing customer funds. Ledgr calls the merchant's *own* already-licensed RazorpayX account with their own API keys to pay their own vendors — same legal category as an internal automation tool.
- **Low-sensitivity data.** Vendor GST invoices and Udyam numbers are ordinary B2B business records, not personal/KYC data.
- **Not legal or tax advice.** 43B(h) eligibility involves judgment calls — does a valid agreement exist, is registration current, is the supplier a trader. Every flag is framed as an **informational risk indicator — verify with your CA**, never a definitive compliance verdict. This applies with extra force to the trading-enterprise exclusion, which is a live practitioner nuance.
- **Hackathon specifics:** use Razorpay test/sandbox keys, seed fake vendor and invoice data, never touch real money.

**Positioning line:** *An AI-powered payment control system that identifies and prevents payment-timing risks under configurable MSME payment policies.* The legal rules are deterministic; the AI handles the messy operational reasoning around them.

---

## 11. Razorpay integration map

| API | When invoked |
|---|---|
| **RazorpayX Payouts API** | On approval (or auto-execute under threshold) — creates the actual vendor payout |
| **Payout status / webhooks** | The feedback loop, and the load-bearing one. A compliance item **cannot close** until confirmed money movement comes back. |
| **Payout scheduling** | For 🟡 amber items scheduled ahead of deadline with buffer |

Sandbox credentials throughout. Never hardcode keys.

---

## 12. Competitive position

Checked and cleared during idea selection:

- **Reconciliation** (Recko/Stripe, Razorpay Recon) — crowded, avoided.
- **Payment routing** (Razorpay Optimizer, Smart Router, Dynamic Router) — natively owned by Razorpay, avoided.
- **Dunning / recurring recovery** (Chargebee Revive, Razorpay Intelligent Revenue-Protect) — natively owned + category leader, avoided.
- **Card chargeback representment** (Chargeflow, $39M raised) — occupied, avoided.
- **MSME 43B(h) payment-timing compliance** — found only as a side-feature inside broader freelancer-payroll platforms. No dedicated payment-gateway-native tool watching actual payout execution against the statutory clock.

**Note on the shift:** leading with portfolio classification moves the product adjacent to vendor master-data and compliance-enrichment tooling (ClearTax and similar), which is a different competitive set from the one cleared above. The defence is that classification here exists to drive a payout decision and closes against confirmed money movement — that is the part an enrichment vendor does not do, and it is why the RazorpayX half must stay real.

**Caveat:** genuinely zero-competitor Indian fintech ideas don't exist in 2026. The real bar is narrowest wedge, least crowded corner, hardest for an incumbent to bother copying.

**Honest ceiling:** this is a strong agentic-document-reasoning project with financial-workflow rigor, not a frontier-AI showcase. If the buildathon rewards raw AI ambition over a product that survives questioning, it caps around 8/10. If it rewards something that actually works and holds up under scrutiny, it's the strongest option available.

---

## 13. Naming

"Ledgr" is a placeholder. Names are irrelevant to the outcome — do not spend time here.
