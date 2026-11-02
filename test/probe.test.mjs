import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeModel } from '../src/probe.mjs';
import { METHOD_VERSION, PROMPT, PROMPT_HASH } from '../src/spec.mjs';
import { GOOD, completion, fakeFetch, respond, wait } from './helpers.mjs';

const MODEL = 'vendor/model-1:free';

test('it sends the fixed request, with the model, temperature 0, no reasoning option and no system prompt', async () => {
  const f = fakeFetch(() => respond(200, completion(GOOD)));
  const r = await probeModel({ model: MODEL, apiKey: 'k', fetchImpl: f });
  const { url, init, body } = f.calls[0];
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer k');
  assert.deepEqual(body.messages, [{ role: 'user', content: PROMPT }]);
  assert.equal(body.model, MODEL);
  assert.equal(body.temperature, 0);
  assert.equal('reasoning' in body, false);
  assert.equal(r.outcome, 'usable');
  assert.equal(r.v, METHOD_VERSION);
  assert.equal(r.prompt, PROMPT_HASH);
});
test('the record keeps the length of the answer and whether it was valid, never the text', async () => {
  const f = fakeFetch(() => respond(200, completion('the secret model answer')));
  const r = await probeModel({ model: MODEL, apiKey: 'k', fetchImpl: f });
  assert.equal(JSON.stringify(r).includes('secret model answer'), false);
  assert.equal(r.answeredChars, 'the secret model answer'.length);
});
test('time is measured to the last byte of the body, not to the headers', async () => {
  const slowBody = async () => ({ status: 200, headers: new Headers(), text: async () => { await wait(80); return completion(GOOD); } });
  const r = await probeModel({ model: MODEL, apiKey: 'k', fetchImpl: slowBody });
  assert.ok(r.ms >= 75, `measured ${r.ms} ms`);
  assert.equal(r.outcome, 'usable');
});
test('a response that never completes is a timeout at the limit', async () => {
  // AbortSignal.timeout's own timer does not keep a process alive (a real socket does), so the fake holds the loop open as a real hung request would.
  const hang = (url, init) => new Promise((_, reject) => { const hold = setTimeout(() => {}, 5000); init.signal.addEventListener('abort', () => { clearTimeout(hold); reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })); }); });
  const r = await probeModel({ model: MODEL, apiKey: 'k', fetchImpl: hang, timeoutMs: 40 });
  assert.equal(r.outcome, 'timeout');
  assert.ok(r.ms >= 35);
});
test('a body that stalls after the headers also times out', async () => {
  const stall = (url, init) => Promise.resolve({ status: 200, headers: new Headers(), text: () => new Promise((_, reject) => { const hold = setTimeout(() => {}, 5000); init.signal.addEventListener('abort', () => { clearTimeout(hold); reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })); }); }) });
  const r = await probeModel({ model: MODEL, apiKey: 'k', fetchImpl: stall, timeoutMs: 40 });
  assert.equal(r.outcome, 'timeout');
});
test('a network failure is "other" with status 599', async () => {
  const r = await probeModel({ model: MODEL, apiKey: 'k', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual([r.outcome, r.status], ['other', 599]);
});
test('the account\'s remaining allowance is recorded when OpenRouter reports it', async () => {
  const f = fakeFetch(() => respond(200, completion(GOOD), { 'x-ratelimit-remaining': '41' }));
  assert.equal((await probeModel({ model: MODEL, apiKey: 'k', fetchImpl: f })).accountRemaining, 41);
  const g = fakeFetch(() => respond(200, completion(GOOD)));
  assert.equal('accountRemaining' in (await probeModel({ model: MODEL, apiKey: 'k', fetchImpl: g })), false);
});
test('the key never appears in the record', async () => {
  const f = fakeFetch(() => respond(200, completion(GOOD)));
  assert.equal(JSON.stringify(await probeModel({ model: MODEL, apiKey: 'sk-or-secret', fetchImpl: f })).includes('sk-or-secret'), false);
});
