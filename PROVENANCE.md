# Provenance

Every artifact in this repository, classified. Nothing here is API-derived yet.
No figure produced by this project should be quoted without reading this page.

| Artifact | Location | Classification | Notes |
|---|---|---|---|
| Udyam registry | `src/corpus/registry.js` | **SYNTHETIC** | 26 fabricated registrations. See "The registry" below — this is the most consequential synthetic layer. |
| NIC codes and descriptions | `src/corpus/nic.js` | **REFERENCE** | Real NIC 2008 codes and division structure. The classification of divisions 45–47 as trade is factual; the legal consequence drawn from it is an open question (below). |
| Vendor master | `src/corpus/vendors.js` | **SYNTHETIC** | 24 fabricated vendors. Names, GSTINs and declared registration numbers are invented. GSTIN state prefixes are real state codes. |
| Contracts and PO terms | `src/corpus/contracts.js` | **SYNTHETIC** | 19 fabricated documents. Clause structure and phrasing are modelled on ordinary Indian commercial drafting; no real contract was used. |
| Acceptance documents | `src/corpus/documents.js` | **SYNTHETIC** | 55 fabricated delivery notes, GRNs, emails and internal notes. |
| Live payables | `src/corpus/ledger.js` | **SYNTHETIC** | 25 invoices, hand-authored, dated relative to today. |
| Historical ledger | `src/corpus/ledger.js` | **SYNTHETIC, GENERATED** | 185 invoices and payouts for FY 2025-26, produced deterministically from `CORPUS_SEED = 20260904`. Regenerable — see below. |
| Ground truth labels | `src/corpus/truth.js` | **SYNTHETIC, AUTHORED** | The correct answer for every vendor and live invoice, written by hand alongside the data. |
| Naive baseline | `src/corpus/naive.js` | **CODE** | The non-AI arm of the ablation. |
| Statutory engine | `src/engine/` | **CODE** | The 45/15-day rule and risk bands. Hardcoded, unit-tested, no model involvement. |
| RazorpayX payouts | `src/razorpayx.js` | **MOCK by default** | Simulated and stamped `source: "mock"` unless `RAZORPAYX_*` credentials are set, in which case it calls the real sandbox. |

## Why the corpus is synthetic

Not for convenience. Three of the four data layers are genuinely unobtainable, and the fourth is what makes measurement possible.

**Obtainable but not used:** company names, GSTINs, state and business activity are public through GST taxpayer search and MCA master data. Real payment clauses are public through government e-procurement portals. These were considered and rejected: the only thing they would contribute is realistic *names*, and using real company names would mean fabricating commercial relationships and compliance failures involving identifiable businesses.

**Not obtainable:** entity-level Udyam data in bulk (no public name-search API), real vendor invoices, real delivery and acceptance trails, and real accounts-payable history. All private or unpublished.

**The deciding reason:** the headline metric is an accuracy claim, and accuracy needs a correct answer to score against. Real vendor data does not come labelled — obtaining labels would mean a chartered accountant classifying forty vendors by hand. Constructing the corpus produces the labels as a by-product, which is what makes `npm run corpus` a measurement rather than an assertion.

## The registry, and what production would actually use

`src/corpus/registry.js` is the largest liberty taken. There is no public bulk Udyam name-search API; verification is per-registration-number through the Udyam portal, and the MSME dashboard publishes aggregates only.

The production design does not assume otherwise. Vendors declare their Udyam number at onboarding — many businesses already collect certificates — and the portfolio agent's job is to **validate and classify those declarations**, plus flag vendors who have declared nothing. `vendors.declaredUdyam` is that entry point, and it is deliberately absent for some vendors and wrong for one (`V017`), because both happen.

## Regenerating the corpus

The historical ledger is pure and seeded, so it reproduces exactly:

```
node scripts/corpus-report.mjs
```

Change `CORPUS_SEED` in `src/corpus/ledger.js` to generate a different ledger with the same statistical shape. The live payables and every ground-truth label are hand-authored and do not move with the seed.

## What the numbers mean

`npm run corpus` reports rupee figures — misclassified payment value, deadline drift, exposure. **These are properties of a fabricated ledger.** They quantify how far the naive baseline diverges from a known-correct answer on data designed to separate them. They are not a claim about any real business's exposure.

What is real is the *method*: the classification rules, the statutory arithmetic, the reconstruction of coverage as at the supply date, and the divergence measurement itself. Those transfer to a real ledger. The totals do not.

## Open legal question

The corpus treats trading enterprises (NIC divisions 45–47) as outside the MSMED s.15 delayed-payment obligation that s.43B(h) depends on, on the basis that trade was admitted to Udyam registration in 2021 for priority-sector-lending purposes. **This has not been confirmed with a chartered accountant.** It is the sharpest case in the corpus and it drives the largest single number in the ablation, so it is also the thing most in need of verification before any of this appears in a pitch. Treat it as an informational flag, not a settled position.
