# Ledgr — MVP

AI payment-compliance controller for **Section 43B(h)**. Full spec in [`LEDGR.md`](./LEDGR.md).

Pay a Udyam-registered micro or small enterprise late and you lose the tax deduction on that expense for the year. Ledgr ties that statutory clock to the payout actually sitting in RazorpayX, explains each call, and executes on approval.

```
npm install
cp .env.example .env      # optional — runs without any keys
npm start                 # http://localhost:3000
```

Click **Run compliance analysis**, then click any row to see the evidence chain.

**To convince yourself it actually works, follow [`TESTING.md`](./TESTING.md)** — eight browser tests, ten minutes, each one checkable by hand.

## What's built

All ten features from the spec's build order:

| # | Feature | Where |
|---|---|---|
| 1 | Invoice intake (structured, no OCR) | `POST /api/invoices`, `src/data/seed.js` |
| 2 | MSME status check against a Udyam registry | `src/agent/tools.js` |
| 3 | Deadline calculator, 45 / 15 day | `src/engine/deadline.js` |
| 4 | RazorpayX payout lookup | `src/razorpayx.js` |
| 5 | Risk classification 🔴🟡🟢⚪ | `src/engine/risk.js` |
| 6 | Recommendation with the rupee cost | `src/agent/explain.js` |
| 7 | Ranked action queue | `public/` |
| 8 | Bounded auto-execution | `POST /api/auto-execute` |
| 9 | Audit log with the full reasoning trail | `src/store.js`, Audit log button |
| 10 | Disclaimer banner | `public/index.html` |

## The architectural split

**`src/agent/` may never compute a date.** It resolves three messy inputs and attaches evidence and a confidence score to each:

1. **Vendor identity** — "Sharma Ent." in the ledger vs "Sharma Enterprises Private Limited" in the Udyam registry.
2. **The agreement and its stated term** — read out of the actual contract text, reported *as written* even when it exceeds 45 days.
3. **When the clock starts** — usually not the invoice date. A signed GRN is acceptance; a timely written objection restarts the clock at re-acceptance; no GRN and no objection means deemed acceptance 15 days after delivery.

**`src/engine/` does all the arithmetic and is deliberately dumb.** The 45/15-day rule, the statutory cap, the disallowance cost and the risk bands are hardcoded and unit-tested.

So the answer to *"what if the AI hallucinates a deadline?"* is that it structurally cannot. It can only hallucinate an input — and every input is displayed with its source quote next to the calculation that consumed it.

The agent investigates rather than escalating on first ambiguity: it queries the registry, pulls the contract, walks the delivery trail, and checks RazorpayX, then submits a resolved finding. Every tool call is recorded and shown in the row's **Investigation trail**.

## Choosing an AI provider

The agent runs on any OpenAI-compatible chat-completions endpoint, so you can use whichever free tier you can get. `src/agent/llm.js` auto-detects from whichever key is present:

| Provider | Env var | Default model | Cost |
|---|---|---|---|
| **Google Gemini** | `GEMINI_API_KEY` | `gemini-3.6-flash` | Free tier, no card — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Free tier, very fast — [console.groq.com/keys](https://console.groq.com/keys) |
| **OpenRouter** | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` | Free models — [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Ollama** | none | `qwen2.5:7b` | Local, no account — set `LLM_PROVIDER=ollama` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o-mini` | Paid |

Override with `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`. Model ids get retired — if you get a 404 saying the model is no longer available, list what your key can actually see:

```powershell
curl.exe -s -H "Authorization: Bearer $env:GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/openai/models
```

**Free-tier throughput is the real constraint.** Each invoice is a full agentic loop (~5-6 requests, ~60s), so the ledger is analysed at a concurrency of 2 (`LLM_CONCURRENCY`) and 429/503 responses are retried with backoff. Even so, analysing all 11 invoices on a free key will trip a per-minute quota. For a live demo, leave the bulk on heuristic and use **Re-analyse this row** on the two or three rows you want to show. The provider in use is shown in the header chip and badged on every row, so you always know what produced a finding.

Because free-tier models are small, `submit_finding` takes a **flat** object of scalars rather than a nested one — far more reliable tool-calling — and `normalise()` in `src/agent/resolve.js` rebuilds the structured finding and clamps whatever comes back.

## Running without any keys

Both external dependencies degrade instead of failing:

- **No provider key** → `src/agent/heuristic.js` runs the same tools in the same order and emits the same finding shape using regex and token overlap. The header chip reads *heuristic fallback*, and each row is badged with the mode that produced it. This is also what the AI is measured against — the heuristic cannot tell a payment term from an objection window in a clause it hasn't been hand-tuned for.
- **No `RAZORPAYX_*` keys** → payouts are simulated and stamped `source: "mock"`. With sandbox keys set, the same click hits `POST /v1/payouts` for real.

A provider error or timeout at runtime falls back the same way rather than breaking the queue, and the reason is recorded on the finding for the audit trail.

## Demo script

The seeded ledger is 11 invoices, dated relative to today, covering every branch:

| Invoice | What it demonstrates |
|---|---|
| **INV-2041** Sharma Ent. ₹5,00,000 | The spec's worked example. Agreement → 45 days → red, ₹1,25,000 at stake. |
| **INV-2042** Nandi Precision ₹2,75,000 | Contract says **Net 60**. The statute caps it at 45, moving the deadline two weeks earlier. |
| **INV-2044** Meghdoot ₹1,85,000 | Delivered 40 days ago, but a written objection over damaged crates restarted the clock at re-acceptance. Counting from the invoice date would call this a breach; counting correctly, there are days left. |
| **INV-2043 / 2048** Aruna Pkg | No written agreement → 15 days. INV-2048 (₹8,400) is under the auto-execute threshold. |
| **INV-2045** Vertex | Registered but **medium** — 43B(h) doesn't engage. Green. |
| **INV-2046** K.P. Works | No GRN was ever raised, and two Delhi registrations plausibly match the name → ⚪ needs review, and paying it is blocked. |
| **INV-2047** Orion Steel | Not in the registry at all. Green. |
| **INV-2049** Sharma Ent. ₹95,000 | A payout **is** scheduled — two days after the deadline. Red. A calendar-only tracker calls this handled. |
| **INV-2051** Meghdoot ₹42,000 | Amber: 12 days out, schedule with buffer. |
| **INV-2050** Nandi ₹1,50,000 | Paid inside the deadline. Closed. |

## Policy vs statute

The buffer, the red/amber windows, the tax rate and the auto-execute threshold are configurable from the toolbar. **The 45/15-day rule is not** — it is statute, hardcoded in `src/engine/deadline.js`.

Ledgr recommends a pay-by date; it does not decide to wait. Nothing above the threshold moves without a click.

## The corpus and the ablation

`src/corpus/` is the test corpus the agent reasons over: 24 vendors, a 26-entry Udyam registry with NIC activity codes, 19 contract documents, 55 raw acceptance documents, 25 live payables and 185 historical invoices for FY 2025-26. Fully synthetic and fully labelled — see [`PROVENANCE.md`](./PROVENANCE.md).

```
npm run corpus
```

That prints what the corpus contains, what each designed case is built to defeat, and then scores a **non-AI baseline** — string matching and regex, no model — against ground truth. That is the floor the agent has to beat, and the reason the corpus is synthetic: accuracy claims need a correct answer to score against, and real vendor data does not come labelled.

The report also names the designed cases the naive arm *survives*, so cases that fail to discriminate are visible rather than hidden.

Acceptance evidence is deliberately untyped. The previous corpus tagged events `objection_raised`, which handed the model its answer — a regex reproduced the agent's deadlines exactly. Documents now carry only a medium (email, scan, system note); what a document *means* has to be read out of its body.

## Tests

```
npm test
```

18 tests, no API calls and no key needed:

- **`test/engine.test.js`** — the statutory calculation and risk classification: the 45-day cap, the no-agreement default, medium-enterprise exclusion, a payout scheduled past the deadline, and the invariant that changing the buffer never moves the deadline.
- **`test/agent-loop.test.js`** — the agentic loop against a stub OpenAI-compatible server: multi-turn tool calls, real tool output fed back by `tool_call_id`, the flat→nested mapping, junk values from a weak model getting clamped, a prose answer being nudged back to the tools, and a dead provider degrading to the heuristic.

## Not built, deliberately

Cash-flow / working-capital optimisation. There is no real treasury data here, so "the financially optimal moment to pay" would be a fabricated number dressed as a financial decision. The buffer is an honest configurable heuristic instead.

## Legal position

Sandbox keys only, seeded fake vendors, no real money. Every flag is framed as an informational risk indicator to verify with a CA, not a compliance verdict.
