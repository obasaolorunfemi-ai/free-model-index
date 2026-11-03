// Asks OpenRouter about the key itself, with no completion, so it does not use any of the free-request allowance.
const KEY_URL = 'https://openrouter.ai/api/v1/key';

const errorText = (text) => {
  try { const j = JSON.parse(text); return (typeof j?.error === 'string' ? j.error : j?.error?.message ?? j?.message) || undefined; } catch { return undefined; }
};

/** Returns { ok, status, summary } where `summary` is a few plain lines safe to print: it never contains the key. */
export async function checkKey({ apiKey, fetchImpl = fetch }) {
  let res, text;
  try {
    res = await fetchImpl(KEY_URL, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
    text = await res.text();
  } catch (e) {
    return { ok: false, status: 0, summary: `Could not reach OpenRouter (${e?.name ?? 'error'}). Check your connection and try again.` };
  }
  if (!res.ok) {
    const why = errorText(text);
    const hint = res.status === 401
      ? 'OpenRouter does not recognise this key. It may be mistyped or truncated, deleted, or from another account. Create a new key at https://openrouter.ai/keys and paste it again.'
      : res.status === 403
        ? 'OpenRouter recognises the key but refuses it. Look at the key and the account at https://openrouter.ai/settings/keys (a disabled key, or a limit set on it).'
        : 'Unexpected answer from OpenRouter.';
    return { ok: false, status: res.status, summary: `Key refused: HTTP ${res.status}${why ? ` "${why}"` : ''}.\n${hint}` };
  }
  let d;
  try { d = JSON.parse(text)?.data ?? {}; } catch { d = {}; }
  const lines = ['Key accepted.'];
  if (d.label) lines.push(`  label: ${d.label}`);
  if (typeof d.is_free_tier === 'boolean') lines.push(`  free tier (no credits purchased): ${d.is_free_tier ? 'yes, so 50 free requests a day' : 'no'}`);
  if (d.limit !== undefined && d.limit !== null) lines.push(`  credit limit on this key: ${d.limit}${Number(d.limit) === 0 ? ' (a limit of 0 can block requests: raise it or remove it)' : ''}`);
  if (typeof d.usage === 'number') lines.push(`  usage so far: ${d.usage}`);
  return { ok: true, status: res.status, summary: lines.join('\n') };
}
