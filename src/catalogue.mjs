#!/usr/bin/env node
// The catalogue watcher: reads OpenRouter's public catalogue (not a completion, so it does not use the free-request allowance),
// keeps data/models.json up to date and appends what changed to data/events.jsonl.
//   node src/catalogue.mjs --data data-repo
// A model that disappears is marked gone, never deleted. The models printed as `added` are the free chat models seen for the first
// time (or back after being gone): the scheduled run probes them straight away, so a new model is measured the day it appears.
// The very first run is a baseline: it records the models already there, with that day as the day first seen, and reports none as added.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCatalog, freeModels, excludedFreeModels } from './catalog.mjs';

const day = (iso) => iso.slice(0, 10);

/**
 * Brings a models record up to date with a catalogue. Returns the new record and what changed.
 * `previous` is what was saved last time (null the first time). Throws if it is not an object, so a damaged file is never silently replaced.
 */
export function updateModels(previous, catalog, nowIso) {
  if (previous !== null && (typeof previous !== 'object' || Array.isArray(previous) || typeof previous.models !== 'object' || previous.models === null)) {
    throw new Error('data/models.json is not in the expected shape; refusing to overwrite it');
  }
  const models = { ...(previous?.models ?? {}) };
  const chat = freeModels(catalog).map((m) => m.id);
  const other = excludedFreeModels(catalog).map((m) => m.id);
  const current = new Map([...chat.map((id) => [id, 'chat']), ...other.map((id) => [id, 'excluded'])]);
  const events = [];
  const added = [];
  const today = day(nowIso);
  const baseline = previous === null; // the first run only records what is already there: it is not "new", and the scheduled probe covers it

  for (const [id, kind] of current) {
    const was = models[id];
    if (!was) {
      models[id] = { kind, status: 'active', firstSeen: today, lastSeen: today };
      events.push({ ts: nowIso, model: id, event: 'added', kind, ...(baseline ? { baseline: true } : {}) });
      if (kind === 'chat' && !baseline) added.push(id);
    } else {
      if (was.status === 'gone') {
        events.push({ ts: nowIso, model: id, event: 'returned', kind });
        if (kind === 'chat') added.push(id);
      }
      models[id] = { ...was, kind, status: 'active', lastSeen: today };
      delete models[id].goneAt;
    }
  }
  const removed = [];
  for (const [id, m] of Object.entries(models)) {
    if (!current.has(id) && m.status !== 'gone') {
      models[id] = { ...m, status: 'gone', goneAt: today };
      events.push({ ts: nowIso, model: id, event: 'removed', kind: m.kind });
      removed.push(id);
    }
  }
  const sorted = Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b)));
  return { record: { updated: nowIso, models: sorted }, events, added: added.sort(), removed: removed.sort() };
}

export function readJson(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function main() {
  const args = process.argv.slice(2);
  const dataDir = args.includes('--data') ? args[args.indexOf('--data') + 1] : 'data';
  mkdirSync(dataDir, { recursive: true });
  const modelsFile = join(dataDir, 'models.json');
  const eventsFile = join(dataDir, 'events.jsonl');
  const nowIso = new Date().toISOString();
  const { record, events, added, removed } = updateModels(readJson(modelsFile), await fetchCatalog(), nowIso);
  writeFileSync(modelsFile, JSON.stringify(record, null, 2) + '\n');
  for (const e of events) appendFileSync(eventsFile, JSON.stringify(e) + '\n');
  console.log(JSON.stringify({ added, removed }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `added=${added.join(',')}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
