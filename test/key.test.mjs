import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkKey } from '../src/key.mjs';
import { respond } from './helpers.mjs';

const f = (status, body) => async () => respond(status, JSON.stringify(body));

test('an accepted key reports the free-tier status and the credit limit, never the key', async () => {
  const r = await checkKey({ apiKey: 'sk-or-v1-secret', fetchImpl: f(200, { data: { label: 'sk-or-v1-abc...xyz', is_free_tier: true, limit: null, usage: 0 } }) });
  assert.equal(r.ok, true);
  assert.match(r.summary, /Key accepted/);
  assert.match(r.summary, /50 free requests a day/);
  assert.equal(r.summary.includes('sk-or-v1-secret'), false);
});
test('a key limit of zero is called out', async () => {
  const r = await checkKey({ apiKey: 'k', fetchImpl: f(200, { data: { limit: 0 } }) });
  assert.match(r.summary, /limit of 0 can block requests/);
});
test('a 401 says the key is not recognised and where to make a new one', async () => {
  const r = await checkKey({ apiKey: 'k', fetchImpl: f(401, { error: { message: 'No auth credentials found', code: 401 } }) });
  assert.deepEqual([r.ok, r.status], [false, 401]);
  assert.match(r.summary, /does not recognise this key/);
  assert.match(r.summary, /openrouter\.ai\/keys/);
});
test('a 403 says the key is recognised but refused', async () => {
  const r = await checkKey({ apiKey: 'k', fetchImpl: f(403, { error: { message: 'Forbidden' } }) });
  assert.match(r.summary, /recognises the key but refuses it/);
});
test('a network failure is reported plainly', async () => {
  const r = await checkKey({ apiKey: 'k', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(r.ok, false);
  assert.match(r.summary, /Could not reach OpenRouter/);
});
