import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffModels, excludedFreeModels, fetchCatalog, freeModels, isFreeModel } from '../src/catalog.mjs';

const m = (id, prompt = '0', completion = '0', out = ['text']) => ({ id, pricing: { prompt, completion }, architecture: { output_modalities: out } });

test('only :free ids priced at zero with text output are free models', () => {
  assert.equal(isFreeModel(m('a/b:free')), true);
  assert.equal(isFreeModel(m('a/b')), false);                       // not :free
  assert.equal(isFreeModel(m('a/b:free', '0.000001')), false);      // priced
  assert.equal(isFreeModel({ id: 'a/b:free', pricing: {} }), false);   // price unknown is not free
  assert.equal(isFreeModel({ id: 'a/b:free' }), false);
  assert.equal(isFreeModel(m('a/b:free', '0', '0', ['image'])), false);
  assert.equal(isFreeModel(m('openrouter/free')), false);           // the router is not a model
  assert.equal(isFreeModel(null), false);
});
test('freeModels filters and sorts', () => {
  assert.deepEqual(freeModels([m('z/z:free'), m('x/paid'), m('a/a:free')]).map((x) => x.id), ['a/a:free', 'z/z:free']);
});
test('diffModels says what was added and what went, sorted', () => {
  assert.deepEqual(diffModels(['a', 'b', 'c'], ['b', 'd', 'c', 'e']), { added: ['d', 'e'], removed: ['a'] });
});
test('fetchCatalog rejects a failed or oddly shaped response', async () => {
  await assert.rejects(fetchCatalog(async () => new Response('x', { status: 500 })), /catalogue: 500/);
  await assert.rejects(fetchCatalog(async () => new Response(JSON.stringify({ nope: 1 }))), /unexpected shape/);
  assert.equal((await fetchCatalog(async () => new Response(JSON.stringify({ data: [{ id: 'a' }, null, { nope: 1 }] })))).length, 1);
});
test('safety classifiers, code-only and other non-chat free models are left out of the default list, and named', () => {
  const cat = [m('a/chat:free'), m('n/content-safety:free'), m('c/mini-code:free'), m('e/embed-1:free'), m('x/paid')];
  assert.deepEqual(freeModels(cat).map((x) => x.id), ['a/chat:free']);
  assert.deepEqual(excludedFreeModels(cat).map((x) => x.id), ['c/mini-code:free', 'e/embed-1:free', 'n/content-safety:free']);
});
