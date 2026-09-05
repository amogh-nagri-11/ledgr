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
    // A "lite" model by default, and deliberately. The free tier meters the
    // full flash models at ~20 requests per DAY, which one portfolio sweep
    // exhausts before it finishes; the lite tiers are far more generous and
    // this workload is extraction, not deep reasoning. Override with LLM_MODEL
    // (gemini-3.6-flash and gemini-3.8-flash are stronger and much scarcer).
    //
    // Older ids (gemini-2.5-*) 404 for accounts created after they were
    // retired. List what your key can actually see with:
    //   curl -H "Authorization: Bearer $GEMINI_API_KEY" \
    //     https://generativelanguage.googleapis.com/v1beta/openai/models
    defaultModel: 'gemini-3.5-flash-lite',
    note: 'Free tier, no card required — aistudio.google.com/apikey',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    // The Llama line has been retired from Groq. Verified live: this model
    // does tool calling in well under a second, which is what makes a full
    // 24-vendor ablation run practical rather than a multi-day exercise.
    defaultModel: 'openai/gpt-oss-120b',
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

  // If the provider has already told us the quota is gone, fail immediately.
  // Without this, a 24-vendor sweep spends minutes retrying a daily cap that
  // cannot recover, and every vendor lands on the heuristic anyway -- just
  // several minutes later.
  if (Date.now() < quotaExhaustedUntil) {
    throw new Error(`${provider.label}: quota exhausted, skipping (retry after ${new Date(quotaExhaustedUntil).toISOString().slice(11, 19)}Z)`);
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

      // A retired or misspelled model id is the single most misleading failure
      // in this system: every vendor silently falls back to the heuristic arm,
      // the UI honestly reports "heuristic", and you conclude the AI did not
      // help -- when it never ran. Providers retire models regularly (Gemini
      // 2.5 and Groq's Llama line both went during this project), so say so
      // loudly and name what the key can actually see.
      if (res.status === 404 || /model .*(not found|no longer available|does not exist|decommissioned)/i.test(msg)) {
        const available = await listModels(provider).catch(() => []);
        modelUnavailable = {
          model: provider.model,
          provider: provider.label,
          message: msg,
          available: available.slice(0, 40),
        };
        console.error(`\n[llm] MODEL "${provider.model}" IS NOT AVAILABLE on ${provider.label}.`);
        console.error(`[llm] ${msg}`);
        if (available.length) {
          console.error(`[llm] Set LLM_MODEL in .env to one of: ${available.slice(0, 12).join(', ')}${available.length > 12 ? ' …' : ''}`);
        }
        console.error('[llm] Until then every finding will come from the heuristic arm, which is NOT an AI result.\n');
        throw new Error(`${provider.label}: model "${provider.model}" is not available. ${msg}`);
      }

      // A quota ceiling is not a transient blip. Trip the breaker so the rest
      // of the batch stops immediately instead of retrying it 24 more times.
      if (res.status === 429 && /quota|exceeded your current/i.test(msg)) {
        quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.warn(`[llm] ${provider.label} quota exhausted — falling back to the heuristic arm for the next ${QUOTA_COOLDOWN_MS / 60000} minutes.`);
        throw lastError;
      }

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

/** Circuit breaker for quota ceilings, which retrying cannot fix. */
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
let quotaExhaustedUntil = 0;

/** Set when the configured model id is rejected by the provider. */
let modelUnavailable = null;

/** What the provider says this key can actually use. */
export async function listModels(provider = activeProvider()) {
  if (!provider) return [];
  const res = await fetch(`${provider.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${provider.apiKey}` },
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  return (json.data || [])
    .map((m) => String(m.id).replace(/^models\//, ''))
    .filter((id) => !/whisper|tts|guard|embedding|orpheus|imagen|veo|lyria/i.test(id))
    .sort();
}

/**
 * Is the AI arm usable? Reports both failure modes the UI must not confuse
 * with "the model tried and did no better": an exhausted quota, and a model id
 * the provider will not serve.
 */
export function quotaState() {
  const tripped = Date.now() < quotaExhaustedUntil;
  return {
    tripped,
    until: tripped ? new Date(quotaExhaustedUntil).toISOString() : null,
    modelUnavailable,
  };
}

/** Clear the breaker — used when the user switches model or provider. */
export function resetQuotaBreaker() {
  quotaExhaustedUntil = 0;
  modelUnavailable = null;
}

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

  // Groq states the wait in prose: "Please try again in 7.62s". Honouring it
  // turns a 20-second blind backoff into an 8-second accurate one, which is
  // the difference between a sweep that completes and one that grinds.
  const spoken = String(errorBody?.message || '').match(/try again in ([\d.]+)\s*s/i);
  if (spoken) {
    const secs = Number(spoken[1]);
    if (Number.isFinite(secs) && secs > 0) return Math.ceil(secs * 1000) + 750;
  }

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
