// Provider adapter.
//
// Gemini, Groq, OpenRouter, Ollama and OpenAI all expose the same
// /chat/completions shape with tool calling, so one thin client covers all of
// them. Pick whichever free tier you can get a key for; the agent loop and the
// deterministic engine don't care which one answered.
//
// Auto-detects from whichever key is present. Force one with LLM_PROVIDER.

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    // Older ids (gemini-2.5-flash) 404 for accounts created after they were
    // retired. List what your key can actually see with:
    //   curl -H "Authorization: Bearer $GEMINI_API_KEY" \
    //     https://generativelanguage.googleapis.com/v1beta/openai/models
    defaultModel: 'gemini-3.6-flash',
    note: 'Free tier, no card required — aistudio.google.com/apikey',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    note: 'Free tier, very fast — console.groq.com/keys',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    note: 'Aggregator with free models — openrouter.ai/keys',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    keyEnv: null,                       // no key; enable with LLM_PROVIDER=ollama
    defaultModel: 'qwen2.5:7b',
    note: 'Runs on your own machine, no account at all',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    note: 'Paid',
  },
};

const AUTO_ORDER = ['gemini', 'groq', 'openrouter', 'openai'];

/** Which provider is configured right now, or null if none. */
export function activeProvider() {
  const forced = process.env.LLM_PROVIDER;
  if (forced) {
    const p = PROVIDERS[forced.toLowerCase()];
    if (!p) return null;
    if (p.keyEnv && !process.env[p.keyEnv]) return null;
    return build(forced.toLowerCase(), p);
  }
  for (const name of AUTO_ORDER) {
    const p = PROVIDERS[name];
    if (process.env[p.keyEnv]) return build(name, p);
  }
  return null;
}

function build(name, p) {
  return {
    name,
    label: p.label,
    baseUrl: process.env.LLM_BASE_URL || p.baseUrl,
    apiKey: p.keyEnv ? process.env[p.keyEnv] : 'not-needed',
    model: process.env.LLM_MODEL || p.defaultModel,
  };
}

export function llmAvailable() {
  return activeProvider() !== null;
}

/** Human-readable mode string for the UI chip. */
export function describeProvider() {
  const p = activeProvider();
  return p ? `${p.label} · ${p.model}` : null;
}

/**
 * One chat-completions call.
 * @param {object} p
 * @param {Array}  p.messages  OpenAI-shaped message array
 * @param {Array}  [p.tools]   OpenAI-shaped tool definitions
 * @param {number} [p.maxTokens]
 * @param {number} [p.temperature]
 * @returns {Promise<object>} the assistant message
 */
export async function chat({ messages, tools, maxTokens = 2000, temperature = 0 }) {
  const provider = activeProvider();
  if (!provider) throw new Error('No LLM provider configured');

  const body = {
    model: provider.model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  // Free tiers hand out 429s and 503s freely, and an agentic loop makes a lot
  // of calls. Retry the transient ones rather than dropping the whole invoice
  // to the heuristic over one blip.
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let res;
    try {
      res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = new Error(`${provider.label}: ${err.message}`);
      if (attempt === MAX_RETRIES) break;
      await sleep(backoffMs(attempt));
      continue;
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${provider.label} returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }

    // Gemini returns errors as a single-element array.
    const errorBody = Array.isArray(json) ? json[0]?.error : json?.error;

    if (!res.ok) {
      const msg = errorBody?.message || json?.message || `HTTP ${res.status}`;
      lastError = new Error(`${provider.label}: ${msg}`);
      if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(res, errorBody, attempt));
        continue;
      }
      throw lastError;
    }

    const message = json?.choices?.[0]?.message;
    if (!message) throw new Error(`${provider.label} returned no message: ${text.slice(0, 200)}`);
    return message;
  }

  throw lastError;
}

const MAX_RETRIES = 3;
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

const backoffMs = (attempt) => Math.round((2 ** attempt) * 1000 * (0.75 + Math.random() * 0.5));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * How long to wait before retrying. Quota errors need real patience -- free
 * tiers meter per minute, so a 1-2s backoff just burns another attempt.
 * Prefer whatever the provider tells us: a Retry-After header, or Google's
 * RetryInfo detail in the error body.
 */
function retryDelayMs(res, errorBody, attempt) {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return header * 1000;

  const info = (errorBody?.details || []).find((d) => String(d['@type'] || '').includes('RetryInfo'));
  const seconds = Number(String(info?.retryDelay || '').replace('s', ''));
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000) + 500;

  // Rate limiting is a per-minute window; transient 5xx is not.
  return res.status === 429 ? 20000 * (attempt + 1) : backoffMs(attempt);
}

/** Tool-call arguments arrive as a JSON string, and weak models mangle them. */
export function parseToolArgs(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    // Some models wrap the object in prose or a code fence.
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    throw new Error(`Could not parse tool arguments: ${String(raw).slice(0, 200)}`);
  }
}
