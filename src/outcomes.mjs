// Every probe ends in exactly one outcome. The names follow Lodestone's failure kinds where there is one.
import { readRateLimit } from '@extrafemi-ai/lodestone';
import { BUDGET_MS, checkAnswer } from './spec.mjs';

export const OUTCOMES = [
  'usable',                 // a valid answer within BUDGET_MS
  'usable_late',            // a valid answer after BUDGET_MS but before the timeout
  'unusable',               // answered, but empty or failed the validity rule
  'timeout',                // no complete response before the timeout
  'rate_limited_upstream',  // a 429 from the model's own provider
  'rate_limited_other',     // a 429 we could not tell apart
  'withdrawn',              // 404
  'unavailable',            // 5xx
  'other',                  // anything else, with the status
  'probe_budget',           // OUR account's limit: never counted for or against the model
];

/** The outcomes that mean the model answered at all, for the latency figures. */
export const ANSWERED = new Set(['usable', 'usable_late', 'unusable']);

/** The outcomes counted when working out a rate. A probe that hit our own limit says nothing about the model. */
export const COUNTED = (outcome) => outcome !== 'probe_budget';

/**
 * Turns an HTTP result into an outcome. `auth` is not a model's outcome: it means our key was refused, so the run stops.
 * OpenRouter's 'daily' and 'minute' rate limits are limits on the whole account, so they are `probe_budget`; only a limit from the
 * model's own provider counts against the model.
 */
export function classify({ status, text, ms }) {
  if (status === 401 || status === 403) return { outcome: 'auth', status };
  if (status === 200) {
    let data;
    try { data = JSON.parse(text); } catch { return { outcome: 'other', status }; }
    if (data && typeof data === 'object' && data.error) {
      // OpenRouter can answer 200 with an error object: its own code is the status that matters.
      const code = Number(data.error.code);
      return classify({ status: Number.isInteger(code) && code >= 400 ? code : 502, text: JSON.stringify(data), ms });
    }
    const content = data?.choices?.[0]?.message?.content;
    const provider = typeof data?.provider === 'string' ? data.provider : undefined;
    const answeredChars = typeof content === 'string' ? content.length : 0;
    const check = checkAnswer(content);
    const outcome = !check.valid ? 'unusable' : ms <= BUDGET_MS ? 'usable' : 'usable_late';
    return { outcome, status, answeredChars, ...(check.valid ? {} : { invalid: check.reason }), ...(provider ? { provider } : {}) };
  }
  if (status === 404) return { outcome: 'withdrawn', status };
  if (status === 429) {
    const kind = readRateLimit(text ?? '').kind;
    return { outcome: kind === 'daily' || kind === 'minute' ? 'probe_budget' : kind === 'upstream' ? 'rate_limited_upstream' : 'rate_limited_other', status };
  }
  if (status >= 500) return { outcome: 'unavailable', status };
  return { outcome: 'other', status };
}
