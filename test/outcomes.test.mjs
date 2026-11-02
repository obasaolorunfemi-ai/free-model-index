import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/outcomes.mjs';
import { checkAnswer } from '../src/spec.mjs';
import { GOOD, completion } from './helpers.mjs';

test('a valid answer inside the budget is usable, after it usable_late', () => {
  assert.equal(classify({ status: 200, text: completion(GOOD), ms: 3000 }).outcome, 'usable');
  assert.equal(classify({ status: 200, text: completion(GOOD), ms: 24_000 }).outcome, 'usable');
  assert.equal(classify({ status: 200, text: completion(GOOD), ms: 24_001 }).outcome, 'usable_late');
});
test('the validity rule: JSON in code fences passes; wrong shape, wrong value, empty and prose do not', () => {
  assert.equal(checkAnswer('```json\n' + GOOD + '\n```').valid, true);
  assert.deepEqual(checkAnswer('').reason, 'empty');
  assert.deepEqual(checkAnswer('Sure! Here you go.').reason, 'not_json_object');
  assert.deepEqual(checkAnswer('[1,2]').reason, 'not_json_object');
  assert.deepEqual(checkAnswer(JSON.stringify({ title: 'Baker', remote: true })).reason, 'title');
  assert.deepEqual(checkAnswer(JSON.stringify({ title: 'Data Engineer', remote: 'yes' })).reason, 'remote');
});
test('an answer that fails the rule is unusable, with the reason; the text is not kept', () => {
  const c = classify({ status: 200, text: completion('I cannot help with that.'), ms: 900 });
  assert.equal(c.outcome, 'unusable');
  assert.equal(c.invalid, 'not_json_object');
  assert.equal(c.answeredChars, 'I cannot help with that.'.length);
  assert.equal('text' in c, false);
});
test('an empty completion is unusable, and the provider named in the body is recorded', () => {
  const c = classify({ status: 200, text: completion(''), ms: 100 });
  assert.equal(c.outcome, 'unusable');
  assert.equal(c.provider, 'Fake');
});
test('a 200 with an error object takes the error code', () => {
  assert.equal(classify({ status: 200, text: JSON.stringify({ error: { code: 502, message: 'bad gateway' } }), ms: 5 }).outcome, 'unavailable');
  assert.equal(classify({ status: 200, text: JSON.stringify({ error: { code: 404, message: 'gone' } }), ms: 5 }).outcome, 'withdrawn');
});
test('status codes: 404 withdrawn, 5xx unavailable, 402 other, 401 and 403 are an auth problem, not a model outcome', () => {
  assert.equal(classify({ status: 404, text: '' }).outcome, 'withdrawn');
  assert.equal(classify({ status: 503, text: '' }).outcome, 'unavailable');
  assert.equal(classify({ status: 402, text: '' }).outcome, 'other');
  assert.equal(classify({ status: 401, text: '' }).outcome, 'auth');
  assert.equal(classify({ status: 403, text: '' }).outcome, 'auth');
});
test('429: the account-wide daily and per-minute limits are ours (probe_budget); an upstream 429 is the model\'s', () => {
  const body = (message, extra = {}) => JSON.stringify({ error: { message, ...extra } });
  assert.equal(classify({ status: 429, text: body('Rate limit exceeded: free-models-per-day. Add credits.') }).outcome, 'probe_budget');
  assert.equal(classify({ status: 429, text: body('Rate limit exceeded: requests per minute') }).outcome, 'probe_budget');
  assert.equal(classify({ status: 429, text: body('Provider returned error', { metadata: { provider_name: 'Venice', raw: 'temporarily rate-limited upstream' } }) }).outcome, 'rate_limited_upstream');
  assert.equal(classify({ status: 429, text: 'slow down' }).outcome, 'rate_limited_other');
});
