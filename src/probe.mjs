import { MAX_TOKENS, METHOD_VERSION, PROMPT, PROMPT_HASH, TEMPERATURE, TIMEOUT_MS } from './spec.mjs';
import { classify } from './outcomes.mjs';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Sends the one probe request to one model and says what happened. Time is measured to the last byte of the response,
 * never to the headers: OpenRouter sends headers early and the body seconds later, which made every model look faster on 28 Oct 2026.
 * Returns one record; the answer's text is never kept, only its length and whether it was valid.
 */
export async function probeModel({ model, apiKey, fetchImpl = fetch, now = Date.now, clock = () => performance.now(), timeoutMs = TIMEOUT_MS }) {
  const ts = new Date(now()).toISOString();
  const t0 = clock();
  const base = { ts, v: METHOD_VERSION, prompt: PROMPT_HASH, model };
  try {
    const res = await fetchImpl(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Free Model Index' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT }], temperature: TEMPERATURE, max_tokens: MAX_TOKENS }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();            // the whole body, inside the same timeout
    const ms = Math.round(clock() - t0);
    const remaining = Number(res.headers?.get?.('x-ratelimit-remaining'));
    const c = classify({ status: res.status, text, ms });
    return { ...base, outcome: c.outcome, status: c.status, ms, ...(c.answeredChars !== undefined ? { answeredChars: c.answeredChars } : {}), ...(c.invalid ? { invalid: c.invalid } : {}), ...(c.provider ? { provider: c.provider } : {}), ...(Number.isFinite(remaining) && res.headers.get('x-ratelimit-remaining') !== null ? { accountRemaining: remaining } : {}) };
  } catch (e) {
    const ms = Math.round(clock() - t0);
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return { ...base, outcome: 'timeout', ms };
    return { ...base, outcome: 'other', status: 599, ms };
  }
}

