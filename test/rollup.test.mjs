import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollupDay } from '../src/rollup.mjs';

const rec = (model, outcome, ms = 1000) => ({ ts: '2026-11-02T10:00:00.000Z', v: '1.0', model, outcome, ms });

test('counts each outcome, the usable rate over counted probes, and latency of answered ones', () => {
  const d = rollupDay('2026-11-02', [
    rec('m:free', 'usable', 1000), rec('m:free', 'usable', 3000), rec('m:free', 'unusable', 5000), rec('m:free', 'timeout', 45000),
    rec('n:free', 'rate_limited_upstream', 200), rec('n:free', 'rate_limited_upstream', 300),
  ]);
  const m = d.models.find((x) => x.model === 'm:free');
  assert.equal(m.n, 4);
  assert.equal(m.outcomes.usable, 2);
  assert.equal(m.usableRate, 50);
  assert.equal(m.latencyP50Ms, 3000);      // 1000, 3000, 5000: the timeout is not an answer
  assert.equal(m.latencyP95Ms, 5000);
  const n = d.models.find((x) => x.model === 'n:free');
  assert.equal(n.usableRate, 0);
  assert.equal(n.latencyP50Ms, null);
});
test('probes that hit our own limit are listed but never counted for or against a model', () => {
  const d = rollupDay('2026-11-02', [rec('m:free', 'usable'), rec('m:free', 'probe_budget'), rec('m:free', 'probe_budget')]);
  const m = d.models[0];
  assert.equal(m.probes, 3);
  assert.equal(m.n, 1);
  assert.equal(m.usableRate, 100);
  assert.equal(m.outcomes.probe_budget, 2);
});
test('a model with only budget probes has no rate rather than a made-up one', () => {
  const m = rollupDay('2026-11-02', [rec('m:free', 'probe_budget')]).models[0];
  assert.equal(m.n, 0);
  assert.equal(m.usableRate, null);
});
test('models come out in a stable order, with the method version', () => {
  const d = rollupDay('2026-11-02', [rec('z:free', 'usable'), rec('a:free', 'usable')]);
  assert.deepEqual(d.models.map((m) => m.model), ['a:free', 'z:free']);
  assert.equal(d.methodVersion, '1.0');
});

test('a restricted model (403) is listed but not rated', () => {
  const m = rollupDay('2026-11-02', [rec('i:free', 'restricted'), rec('i:free', 'restricted')]).models[0];
  assert.equal(m.probes, 2);
  assert.equal(m.n, 0);
  assert.equal(m.usableRate, null);
  assert.equal(m.outcomes.restricted, 2);
});
