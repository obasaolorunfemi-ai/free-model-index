// The free models on OpenRouter, from its public catalogue. Reading the catalogue is not a completion, so it does not use the free-request limit.
const CATALOG_URL = 'https://openrouter.ai/api/v1/models';

const zero = (v) => v !== undefined && v !== null && v !== '' && Number(v) === 0;

/** A model may be probed only if its id ends in `:free` and the catalogue prices it at zero for both prompt and completion, and it produces text. */
export function isFreeModel(m) {
  if (!m || typeof m.id !== 'string' || !m.id.endsWith(':free')) return false;
  if (!zero(m.pricing?.prompt) || !zero(m.pricing?.completion)) return false;
  const out = m.architecture?.output_modalities;
  return !Array.isArray(out) || (out.length === 1 && out[0] === 'text');
}

export async function fetchCatalog(fetchImpl = fetch) {
  const res = await fetchImpl(CATALOG_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`catalogue: ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.data)) throw new Error('catalogue: unexpected shape');
  return body.data.filter((m) => m && typeof m.id === 'string');
}

/** Free models that are not general chat models: safety classifiers, embedders, speech, OCR and code-only models. The same exclusions Lodestone applies when it picks models.
 *  A classifier that answers "safe" to a job posting would show as a model that "fails", which measures the probe, not the model. */
const NOT_CHAT = /safety|guard|moderation|lyria|embed|rerank|tts|whisper|code|coder|preview-audio|ocr/i;
export const isGeneralChat = (m) => !NOT_CHAT.test(m.id);

/** The free general-chat models in a catalogue, in a stable order: what the index probes by default. */
export function freeModels(catalog) {
  return catalog.filter((m) => isFreeModel(m) && isGeneralChat(m)).sort((a, b) => a.id.localeCompare(b.id));
}

/** Free models left out of the default list, and so named in the methodology rather than silently dropped. */
export function excludedFreeModels(catalog) {
  return catalog.filter((m) => isFreeModel(m) && !isGeneralChat(m)).sort((a, b) => a.id.localeCompare(b.id));
}

/** What changed between the last list of free models and this one. A model that disappeared is marked, never deleted. */
export function diffModels(previousIds, currentIds) {
  const prev = new Set(previousIds), cur = new Set(currentIds);
  return { added: [...cur].filter((id) => !prev.has(id)).sort(), removed: [...prev].filter((id) => !cur.has(id)).sort() };
}
