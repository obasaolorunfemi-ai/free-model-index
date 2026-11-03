import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProbes, sentToday } from '../src/run.mjs';
import { GOOD, completion, fakeFetch, respond } from './helpers.mjs';

const free = (id) => ({ id, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } });
const CATALOG = [free('a/one:free'), free('b/two:free'), free('c/three:free'), { id: 'paid/model', pricing: { prompt: '0.000001', completion: '0.000002' } }, { id: 'sneaky/x:free', pricing: { prompt: '0.000001', completion: '0' } }];
const dir = () => mkdtempSync(join(tmpdir(), 'fmi-'));
const NOW = Date.parse('2026-11-02T10:00:00Z');
const base = (over) => ({ catalog: CATALOG, apiKey: 'k', paceMs: 0, sleep: async () => {}, now: () => NOW, ...over });

test('it refuses a model whose id does not end in :free, and a :free id the catalogue prices above zero', async () => {
  const f = fakeFetch(() => respond(200, completion(GOOD)));
  await assert.rejects(runProbes(base({ models: ['paid/model'], outDir: dir(), fetchImpl: f })), /ends in ":free"/);
  await assert.rejects(runProbes(base({ models: ['sneaky/x:free'], outDir: dir(), fetchImpl: f })), /does not list it as free/);
  await assert.rejects(runProbes(base({ models: ['unknown/model:free'], outDir: dir(), fetchImpl: f })), /does not list it as free/);
  assert.equal(f.calls.length, 0, 'nothing was sent');
});
test('it probes each model once, in order, and appends one line each to the day\'s file', async () => {
  const out = dir();
  const f = fakeFetch(() => respond(200, completion(GOOD)));
  const r = await runProbes(base({ models: ['a/one:free', 'b/two:free'], outDir: out, fetchImpl: f }));
  assert.deepEqual(f.calls.map((c) => c.body.model), ['a/one:free', 'b/two:free']);
  assert.deepEqual(readdirSync(out), ['2026-11-02.jsonl']);
  const lines = readFileSync(join(out, '2026-11-02.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.model), ['a/one:free', 'b/two:free']);
  assert.equal(r.probed, 2);
  assert.equal(sentToday(out, NOW), 2);
});
test('a second run the same day appends and counts against the same daily allowance', async () => {
  const out = dir();
  const f = fakeFetch(() => respond(200, completion(GOOD)));
  await runProbes(base({ models: ['a/one:free', 'b/two:free'], outDir: out, fetchImpl: f, dailyLimit: 3 }));
  const r = await runProbes(base({ models: ['a/one:free', 'b/two:free', 'c/three:free'], outDir: out, fetchImpl: f, dailyLimit: 3 }));
  assert.equal(r.probed, 1);
  assert.match(r.stopped, /daily allowance/);
  assert.equal(f.calls.length, 3);
});
test('when our own account hits its limit, the probe is recorded and the run stops', async () => {
  const out = dir();
  const f = fakeFetch((n) => (n === 2 ? respond(429, JSON.stringify({ error: { message: 'Rate limit exceeded: free-models-per-day' } })) : respond(200, completion(GOOD))));
  const r = await runProbes(base({ models: ['a/one:free', 'b/two:free', 'c/three:free'], outDir: out, fetchImpl: f }));
  assert.equal(f.calls.length, 2);
  assert.equal(r.records[1].outcome, 'probe_budget');
  assert.match(r.stopped, /own account/);
});
test('a refused key stops the run and records nothing for the model', async () => {
  const out = dir();
  const f = fakeFetch(() => respond(401, '{"error":{"message":"No auth"}}'));
  await assert.rejects(runProbes(base({ models: ['a/one:free', 'b/two:free'], outDir: out, fetchImpl: f })), /answered 401 for a\/one:free.*Nothing was recorded/s);
  assert.deepEqual(readdirSync(out), []);
  assert.equal(f.calls.length, 1);
});
test('it waits between probes, and not before the first', async () => {
  const waits = [];
  const f = fakeFetch(() => respond(200, completion(GOOD)));
  await runProbes(base({ models: ['a/one:free', 'b/two:free', 'c/three:free'], outDir: dir(), fetchImpl: f, paceMs: 3500, sleep: async (ms) => { waits.push(ms); } }));
  assert.deepEqual(waits, [3500, 3500]);
});
test('a model that fails is recorded as that model\'s outcome and the run carries on', async () => {
  const out = dir();
  const f = fakeFetch((n) => (n === 1 ? respond(404, '{"error":{"message":"No endpoints found"}}') : respond(200, completion(GOOD))));
  const r = await runProbes(base({ models: ['a/one:free', 'b/two:free'], outDir: out, fetchImpl: f }));
  assert.deepEqual(r.records.map((x) => x.outcome), ['withdrawn', 'usable']);
});

test('a refused key says which status OpenRouter answered and what it said, and points at --check-key', async () => {
  const f = fakeFetch(() => respond(401, JSON.stringify({ error: { code: 401, message: 'No auth credentials found' } })));
  await assert.rejects(runProbes(base({ models: ['a/one:free'], outDir: dir(), fetchImpl: f })), /answered 401 for a\/one:free: "No auth credentials found".*--check-key/s);
});

test('a model that answers 403 is recorded as restricted and the run carries on', async () => {
  const out = dir();
  const f = fakeFetch((n) => (n === 1 ? respond(403, JSON.stringify({ error: { message: 'only available on agentic harnesses' } })) : respond(200, completion(GOOD))));
  const r = await runProbes(base({ models: ['a/one:free', 'b/two:free'], outDir: out, fetchImpl: f }));
  assert.deepEqual(r.records.map((x) => x.outcome), ['restricted', 'usable']);
  assert.match(r.records[0].message, /agentic harnesses/);
});
test('three 403s in a row look like a key problem, so the run stops', async () => {
  const f = fakeFetch(() => respond(403, '{"error":{"message":"Forbidden"}}'));
  const r = await runProbes(base({ models: ['a/one:free', 'b/two:free', 'c/three:free'], outDir: dir(), fetchImpl: f }));
  assert.equal(r.probed, 3);
  assert.match(r.stopped, /three models in a row/);
});
