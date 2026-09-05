// Provider failover.
//
// Free tiers meter per DAY, so a ceiling does not clear within a session. When
// one provider is exhausted the only useful move is the next one with budget --
// otherwise a run drops to the heuristic arm halfway, which is what happened
// before this existed.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { providerChain, chat, quotaState, resetQuotaBreaker } from '../src/agent/llm.js';

function server(handler) {
  const s = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(JSON.parse(body), res));
  });
  return s;
}

const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const close = (s) => new Promise((r) => s.close(r));

function clearEnv() {
  for (const k of ['LLM_PROVIDER', 'LLM_FALLBACK', 'LLM_BASE_URL', 'LLM_MODEL',
    'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY']) delete process.env[k];
  resetQuotaBreaker();
}

test('LLM_PROVIDER names a preference, and the rest of the chain follows', () => {
  clearEnv();
  process.env.GEMINI_API_KEY = 'g';
  process.env.GROQ_API_KEY = 'q';
  process.env.LLM_PROVIDER = 'groq';

  const chain = providerChain();
  assert.equal(chain[0].name, 'groq', 'the preferred provider goes first');
  assert.ok(chain.some((p) => p.name === 'gemini'), 'the other keyed provider stays available');
  clearEnv();
});

test('LLM_FALLBACK=false pins a single provider', () => {
  clearEnv();
  process.env.GEMINI_API_KEY = 'g';
  process.env.GROQ_API_KEY = 'q';
  process.env.LLM_PROVIDER = 'groq';
  process.env.LLM_FALLBACK = 'false';

  assert.deepEqual(providerChain().map((p) => p.name), ['groq']);
  clearEnv();
});

test('a provider with no key never enters the chain', () => {
  clearEnv();
  process.env.GEMINI_API_KEY = 'g';
  assert.deepEqual(providerChain().map((p) => p.name), ['gemini']);
  clearEnv();
});

test('an exhausted provider is skipped and the next one serves the call', async () => {
  clearEnv();

  let firstHits = 0;
  let secondHits = 0;

  // Stands in for the exhausted provider: a per-day quota error.
  const dead = server((_body, res) => {
    firstHits += 1;
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: { message: 'Rate limit reached on tokens per day (TPD): Limit 200000, Used 199999. Please try again in 7m35.76s' },
    }));
  });
  const alive = server((_body, res) => {
    secondHits += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'from the fallback' } }] }));
  });

  const deadPort = await listen(dead);
  const alivePort = await listen(alive);

  // Two providers pointed at the two stubs.
  process.env.GROQ_API_KEY = 'q';
  process.env.GEMINI_API_KEY = 'g';
  const { PROVIDERS } = await import('../src/agent/llm.js');
  const realGroq = PROVIDERS.groq.baseUrl;
  const realGemini = PROVIDERS.gemini.baseUrl;
  PROVIDERS.groq.baseUrl = `http://127.0.0.1:${deadPort}/v1`;
  PROVIDERS.gemini.baseUrl = `http://127.0.0.1:${alivePort}/v1`;
  process.env.LLM_PROVIDER = 'groq';

  try {
    const msg = await chat({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(msg.content, 'from the fallback', 'the second provider answered');
    assert.equal(firstHits, 1, 'the exhausted provider was tried once, not retried');
    assert.equal(secondHits, 1);

    // And it is now marked exhausted, so the next call skips it entirely.
    const q = quotaState();
    const groq = q.providers.find((p) => p.name === 'groq');
    assert.equal(groq.tripped, true);
    assert.equal(q.tripped, false, 'the chain as a whole still has budget');

    await chat({ messages: [{ role: 'user', content: 'again' }] });
    assert.equal(firstHits, 1, 'the exhausted provider was not tried a second time');
    assert.equal(secondHits, 2);
  } finally {
    PROVIDERS.groq.baseUrl = realGroq;
    PROVIDERS.gemini.baseUrl = realGemini;
    await close(dead);
    await close(alive);
    clearEnv();
  }
});

test('with every provider exhausted the chain reports itself as tripped', async () => {
  clearEnv();
  const dead = server((_body, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'quota exceeded for the day' } }));
  });
  const port = await listen(dead);

  process.env.GEMINI_API_KEY = 'g';
  const { PROVIDERS } = await import('../src/agent/llm.js');
  const real = PROVIDERS.gemini.baseUrl;
  PROVIDERS.gemini.baseUrl = `http://127.0.0.1:${port}/v1`;

  try {
    await assert.rejects(() => chat({ messages: [{ role: 'user', content: 'hi' }] }));
    assert.equal(quotaState().tripped, true);
  } finally {
    PROVIDERS.gemini.baseUrl = real;
    await close(dead);
    clearEnv();
  }
});
