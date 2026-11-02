#!/usr/bin/env node
// Turns each day's probe records into data/daily/YYYY-MM-DD.json: for every model, how each probe ended, the usable rate and the latency.
//   node src/rollup.mjs [--in data/probes] [--out data/daily]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANSWERED, COUNTED, OUTCOMES } from './outcomes.mjs';
import { METHOD_VERSION } from './spec.mjs';

/** Nearest-rank percentile of a sorted list. */
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null);
const round1 = (n) => Math.round(n * 10) / 10;

/** One day's records to one summary. Probes that hit our own account's limit are listed but never counted for or against a model. */
export function rollupDay(date, records) {
  const byModel = new Map();
  for (const r of records) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model).push(r);
  }
  const models = [...byModel.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([model, rs]) => {
    const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
    for (const r of rs) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    const counted = rs.filter((r) => COUNTED(r.outcome));
    const times = counted.filter((r) => ANSWERED.has(r.outcome)).map((r) => r.ms).sort((a, b) => a - b);
    return {
      model,
      probes: rs.length,
      n: counted.length,
      outcomes: counts,
      usableRate: counted.length ? round1((counts.usable / counted.length) * 100) : null,
      latencyP50Ms: percentile(times, 50),
      latencyP95Ms: percentile(times, 95),
    };
  });
  return { date, methodVersion: METHOD_VERSION, models };
}

export function readRecords(file) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function main() {
  const args = process.argv.slice(2);
  const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const inDir = get('--in', 'data/probes'), outDir = get('--out', 'data/daily');
  mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const f of readdirSync(inDir).filter((f) => f.endsWith('.jsonl')).sort()) {
    const date = f.replace('.jsonl', '');
    writeFileSync(join(outDir, `${date}.json`), JSON.stringify(rollupDay(date, readRecords(join(inDir, f))), null, 2) + '\n');
    n++;
  }
  console.log(`rolled up ${n} day(s) into ${outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
