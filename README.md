# Ledgr

**Section 43B(h) payment-compliance controller.**

Pay a Udyam-registered micro or small enterprise late and you lose the income-tax deduction on that expense for the year. Not a fine — the expense simply stops being deductible, so the tax bill goes up. On a ₹5,00,000 invoice at 25% that is ₹1,25,000, purely from timing.

Ledgr works out which suppliers the section actually reaches, what the real deadline is on each unpaid bill, and what last year already cost — then executes the payout through RazorpayX and closes the item only when the money is confirmed to have moved.

```
npm install
cp .env.example .env      # optional — runs fully without any keys
npm start                 # http://localhost:3000
```

Then, in order: **Run portfolio sweep** → **Analyse live ledger** → the **Retroactive audit** tab.

For a hands-on walkthrough with expected values, follow [`TESTING.md`](./TESTING.md).

---

## What it does

**1 · Portfolio sweep** — one investigation per *vendor*, cached. Validates a declared Udyam number or finds one by name, resolves identity ambiguity using the GSTIN state prefix and the supply history, and separates registered activity from what the vendor actually does. 24 vendors and 210 invoices is 24 investigations, not 210.

**2 · Live queue** — one investigation per *payable*. Which agreement governs, what term it states, and — the part nothing else does — **when the statutory clock actually started.** That is not the invoice date; it is when the goods were accepted, which moves if there was a dispute or nobody signed for delivery.

**3 · Retroactive audit** — reconstructs FY 2025-26 by judging coverage as at *each supply date*, and reports decomposed by confidence rather than as one number.

Then execution: auto-execute under a configurable threshold, human approval above it, and a compliance item that **closes only when RazorpayX confirms the money moved**.

## The architectural split

**`src/agent/` may never decide anything.** Both agents return evidence and confidence. Neither can return "covered" or a deadline — the submission schemas have no such field, and a test asserts the model is never offered one.

**`src/engine/` decides**, with hardcoded rules:

- `deadline.js` — the 45/15-day arithmetic and the statutory cap
- `coverage.js` — does s.43B(h) engage: micro or small, registration live *on the supply date*, and not a trading enterprise unless the supply itself rebuts the registered activity
- `risk.js` — the deadline against the actual RazorpayX payout date

Coverage is a rule for the same reason the dates are: a wrong coverage call costs exactly as much as a wrong deadline, so neither is left to a model.

## Measuring whether the AI earns its place

```
npm run corpus      # the corpus, and the non-AI baseline against ground truth
npm run ablation    # naive vs agent vs truth, scored and costed
```

Neither makes an API call. `ablation` reads cached findings, so it reruns instantly.

Both arms are graded through `src/corpus/score.js`, so they cannot be judged on different criteria, and errors are split by direction because they cost different things — a false positive burns working capital, a false negative silently loses a deduction, an escalation costs a human five minutes. The report also states how much of the run it is scoring, and warns when the AI arm is incomplete.

Latest complete vendor-arm result:

| | naive | agent |
|---|---|---|
| identity correct | 20/24 | **24/24** |
| coverage correct | 19/24 | **23/24** |
| false positives | 3 — ₹45,19,100 of payments | **0** |
| false negatives | 1 | **0** |
| historical invoices misclassified | 59/185 — ₹1.06 Cr | **8/185 — ₹27.6L** |

Both arms had identical registry access. The difference is judgement, not data.

## Providers

The agent runs on any OpenAI-compatible chat-completions endpoint. `src/agent/llm.js` auto-detects from whichever key is present.

| Provider | Env var | Default model |
|---|---|---|
| **Groq** | `GROQ_API_KEY` | `openai/gpt-oss-120b` |
| **Google Gemini** | `GEMINI_API_KEY` | `gemini-3.5-flash-lite` |
| **OpenRouter** | `OPENROUTER_API_KEY` | see note below |
| **Ollama** | none — set `LLM_PROVIDER=ollama` | `qwen2.5:7b` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o-mini` |

Override with `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_CONCURRENCY`, `LLM_TIMEOUT_MS`.

**Model ids get retired, and a dead one is the most misleading failure in this system** — every finding silently falls back to the heuristic arm, the UI honestly says "heuristic", and it looks like the AI underperformed when it never ran. Both defaults above were wrong at some point during this project for exactly that reason. A 404 now names the model and lists what your key can actually see. To check first:

```powershell
curl.exe -s -H "Authorization: Bearer $env:GROQ_API_KEY" https://api.groq.com/openai/v1/models
```

**Free-tier throughput is the binding constraint, and it is tokens per minute, not requests.** Groq meters 8,000 TPM; the document-heavy invoices cost ~2,000 tokens a call. A full pass therefore takes a while and may not finish in one go — so sweeps and analyses **retry anything that fell back**, letting AI coverage accumulate across runs. Quota exhaustion trips a circuit breaker rather than retrying a ceiling that cannot recover.

## Running with no keys at all

Both external dependencies degrade rather than fail:

- **No provider key** → the heuristic arm runs the same tools in the same order and emits the same finding shape, using regex and token overlap. Every row is badged with the arm that produced it.
- **No `RAZORPAYX_*` keys** → payouts are simulated and stamped `source: "mock"`. With sandbox keys the same click hits `POST /v1/payouts`.

A provider error or timeout falls back the same way and records the reason on the finding.

## The corpus

`src/corpus/` — 24 vendors, a 26-entry Udyam registry with NIC activity codes, 19 contract documents, 55 raw acceptance documents, 25 live payables and 185 historical invoices, all with ground-truth labels. Synthetic and deterministic from a fixed seed — an accuracy claim needs known-correct answers, and real vendor ledgers do not come labelled.

Acceptance evidence is deliberately **untyped** — documents carry a medium (email, scan, system note) and a body, nothing more. An earlier corpus tagged events `objection_raised`, which handed the model its answer and let a regex reproduce the agent's output exactly. A test now asserts no document carries a `type` field.

## Policy vs statute

Buffer days, red/amber windows, tax rate, auto-execute threshold and the identity confidence floor are all configurable from the toolbar. **The 45/15-day rule and the coverage rule are not** — they are statute, hardcoded, and unit-tested.

Ledgr recommends a pay-by date; it does not decide to wait. Nothing above the threshold moves without a click.

## Tests

```
npm test
```

40 tests, no API calls and no key required — the statutory engine, the coverage rule, corpus integrity (including that the naive baseline actually fails on it), and both agent loops driven against a stub OpenAI-compatible server.

## Not legal or tax advice

Every flag is an informational risk indicator to verify with a CA. The trading-enterprise exclusion in particular is a live practitioner nuance and is flagged unconfirmed; it drives the largest single number in the ablation.
