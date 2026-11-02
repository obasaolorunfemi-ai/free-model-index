// The probe, written down once. Changing anything in this file changes the method: bump METHOD_VERSION and say so in METHODOLOGY.md.
import { createHash } from 'node:crypto';
import { tryParseJson } from '@extrafemi-ai/lodestone';

export const METHOD_VERSION = '1.0';

/** One fixed request, the kind of small structured call a serverless tool makes. Temperature 0, no system prompt, no reasoning option. */
export const PROMPT = 'Return only JSON with two keys, "title" (a string) and "remote" (a boolean), for this job posting: "Senior Data Engineer, remote (UK time zones), 5+ years of SQL."';
export const MAX_TOKENS = 200;
export const TEMPERATURE = 0;

/** A probe that has not finished its whole response by now is a timeout (the hang length seen on 28 Oct 2026). */
export const TIMEOUT_MS = 45_000;
/** A valid answer inside this is "usable": Lodestone's serverless budget, under a 30 s gateway limit. Later is "usable_late". */
export const BUDGET_MS = 24_000;

export const PROMPT_HASH = createHash('sha256').update(PROMPT).digest('hex').slice(0, 12);

/** The validity rule: the answer parses as JSON (code fences allowed), `title` mentions the role, `remote` is true. */
export function checkAnswer(text) {
  if (typeof text !== 'string' || !text.trim()) return { valid: false, reason: 'empty' };
  const v = tryParseJson(text);
  if (v === undefined || v === null || typeof v !== 'object' || Array.isArray(v)) return { valid: false, reason: 'not_json_object' };
  if (typeof v.title !== 'string' || !/data\s+engineer/i.test(v.title)) return { valid: false, reason: 'title' };
  if (v.remote !== true) return { valid: false, reason: 'remote' };
  return { valid: true };
}
