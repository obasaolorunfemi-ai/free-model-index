#!/usr/bin/env node
// Probes free models one at a time and appends one line per probe to data/probes/YYYY-MM-DD.jsonl.
//   FMI_OPENROUTER_API_KEY=... node src/run.mjs --from-catalog --max 15
//   FMI_OPENROUTER_API_KEY=... node src/run.mjs --models google/gemma-4-31b-it:free,nvidia/nemotron-3-ultra-550b-a55b:free
//   node src/run.mjs --from-catalog --dry-run          (shows the plan; sends nothing; needs no key)
//   node --env-file=.env src/run.mjs --check-key       (asks OpenRouter about the key itself; sends no completion)
// The key is read from FMI_OPENROUTER_API_KEY on purpose, never OPENROUTER_API_KEY: this index must have its own key and its own
// account, or its probes would use up the free-request allowance of every other tool.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { excludedFreeModels, fetchCatalog, freeModels, isFreeModel } from './catalog.mjs';
import { checkKey } from './key.mjs';
import { probeModel } from './probe.mjs';

const day = (iso) => iso.slice(0, 10);

/** How many probes have already been sent today (UTC), counted from the day's file, so the daily allowance holds across runs. */
export function sentToday(outDir, now = Date.now()) {
  const file = join(outDir, `${day(new Date(now).toISOString())}.jsonl`);
  if (!existsSync(file)) return 0;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
}

/**
 * Probes `models` in order. Refuses any model that is not free by the catalogue, so a probe can never spend money.
 * Stops when the daily allowance is used, when our own account's limit is hit (a `probe_budget` outcome), or when the key is refused.
 */
export async function runProbes({ models, catalog, apiKey, outDir, dailyLimit = 45, paceMs = 3500, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, clock, log = () => {} }) {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  for (const id of models) {
    if (!id.endsWith(':free')) throw new Error(`refusing ${id}: only models whose id ends in ":free" are probed`);
    if (!isFreeModel(byId.get(id))) throw new Error(`refusing ${id}: the catalogue does not list it as free (price zero, text output)`);
  }
  mkdirSync(outDir, { recursive: true });
  const used = sentToday(outDir, now());
  let room = Math.max(0, dailyLimit - used);
  const records = [];
  let stopped = null;
  let restrictedInARow = 0;
  if (room === 0) stopped = `daily allowance of ${dailyLimit} probes already used`;
  for (let i = 0; i < models.length && !stopped; i++) {
    if (room === 0) { stopped = `daily allowance of ${dailyLimit} probes used`; break; }
    if (records.length > 0) await sleep(paceMs);     // OpenRouter allows 20 requests a minute: stay well under it
    const r = await probeModel({ model: models[i], apiKey, fetchImpl, now, ...(clock ? { clock } : {}) });
    if (r.outcome === 'auth') {
      stopped = 'the key was refused';
      throw new Error(`OpenRouter answered ${r.status} for ${r.model}${r.message ? `: "${r.message}"` : ''}. Nothing was recorded for it. Run "node --env-file=.env src/run.mjs --check-key" to test the key itself.`);
    }
    appendFileSync(join(outDir, `${day(r.ts)}.jsonl`), JSON.stringify(r) + '\n');
    records.push(r);
    room--;
    log(`${r.outcome.padEnd(22)} ${String(r.ms).padStart(6)} ms  ${r.model}`);
    if (r.outcome === 'probe_budget') stopped = 'our own account hit its limit';
    restrictedInARow = r.outcome === 'restricted' ? restrictedInARow + 1 : 0;
    if (restrictedInARow >= 3) stopped = 'three models in a row answered 403; that looks like the key, not the models. Run --check-key';
  }
  return { sentBefore: used, probed: records.length, notProbed: models.length - records.length, stopped, records };
}

function parseArgs(argv) {
  const a = { max: 15, out: 'data/probes', dailyLimit: 45, paceMs: 3500, models: null, fromCatalog: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--models') a.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--from-catalog') a.fromCatalog = true;
    else if (k === '--max') a.max = Number(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--daily-limit') a.dailyLimit = Number(argv[++i]);
    else if (k === '--pace-ms') a.paceMs = Number(argv[++i]);
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--check-key') a.checkKey = true;
    else throw new Error(`unknown option ${k}`);
  }
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.checkKey) {
    const apiKey = process.env.FMI_OPENROUTER_API_KEY;
    if (!apiKey) { console.error('FMI_OPENROUTER_API_KEY is not set. With the key in .env, run: node --env-file=.env src/run.mjs --check-key'); process.exit(2); }
    const r = await checkKey({ apiKey });
    console.log(r.summary);
    process.exit(r.ok ? 0 : 1);
  }
  if (!a.models && !a.fromCatalog) { console.error('Pass --from-catalog or --models id1,id2. Add --dry-run to see the plan without sending anything.'); process.exit(2); }
  const catalog = await fetchCatalog();
  const models = a.models ?? freeModels(catalog).map((m) => m.id).slice(0, a.max);
  const used = sentToday(a.out);
  console.log(`${models.length} model(s) planned; ${used} probe(s) already sent today of ${a.dailyLimit}.`);
  if (a.dryRun) {
    console.log(models.join('\n'));
    if (a.fromCatalog) console.log(`\nfree but not general-chat models, left out: ${excludedFreeModels(catalog).map((m) => m.id).join(', ') || 'none'}`);
    return;
  }
  const apiKey = process.env.FMI_OPENROUTER_API_KEY;
  if (!apiKey) { console.error('Set FMI_OPENROUTER_API_KEY to the index\'s own key. It is deliberately not OPENROUTER_API_KEY.'); process.exit(2); }
  const r = await runProbes({ models, catalog, apiKey, outDir: a.out, dailyLimit: a.dailyLimit, paceMs: a.paceMs, log: console.log });
  console.log(`probed ${r.probed}, not probed ${r.notProbed}${r.stopped ? `; stopped: ${r.stopped}` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
