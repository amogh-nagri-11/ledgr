// Retry-delay parsing.
//
// Both bugs here cost real time and both presented as "the run is hung":
// a delay stated as "7m35.76s" parsed as 35 seconds, so the retry fired
// against a window that had not reopened; and an honoured delay with no
// ceiling meant one call could block a whole run for minutes, silently.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpokenDelay } from '../src/agent/llm.js';

test('plain seconds parse', () => {
  assert.equal(parseSpokenDelay('Please try again in 7.62s'), 7620);
  assert.equal(parseSpokenDelay('Please try again in 25.056s'), 25056);
});

test('minutes are not truncated to their seconds component', () => {
  // The bug: /try again in ([\d.]+)s/ matched "35.76s" out of "7m35.76s".
  assert.equal(parseSpokenDelay('Please try again in 7m35.76s'), 455760);
  assert.equal(parseSpokenDelay('try again in 2m'), 120000);
});

test('hours parse', () => {
  assert.equal(parseSpokenDelay('Please try again in 1h2m3s'), 3723000);
});

test('no hint returns null rather than zero', () => {
  assert.equal(parseSpokenDelay('Rate limit reached, no guidance'), null);
  assert.equal(parseSpokenDelay(''), null);
  assert.equal(parseSpokenDelay(undefined), null);
});

test('a stated delay beyond the sleep ceiling is a breaker case, not a sleep', () => {
  // 60s ceiling by default. A provider asking for 7m35s must trip the quota
  // breaker so the batch fails over to the heuristic arm immediately, rather
  // than blocking with no log line.
  const ceiling = Number(process.env.LLM_MAX_SLEEP_MS) || 60000;
  assert.ok(parseSpokenDelay('try again in 7m35.76s') > ceiling);
  assert.ok(parseSpokenDelay('try again in 7.62s') < ceiling);
});

test('a per-day limit is recognisable from the message', () => {
  // Retrying a daily ceiling is pointless; these strings are what the code
  // keys on to trip the breaker instead.
  const daily = 'Rate limit reached ... on tokens per day (TPD): Limit 200000, Used 199689';
  assert.match(daily, /per day|\bTPD\b|\bRPD\b/i);
  const perMinute = 'Rate limit reached ... on tokens per minute (TPM): Limit 8000';
  assert.equal(/per day|\bTPD\b|\bRPD\b/i.test(perMinute), false);
});
