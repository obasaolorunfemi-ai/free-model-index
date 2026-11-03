import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateModels } from '../src/catalogue.mjs';

const m = (id, over = {}) => ({ id, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] }, ...over });
const T1 = '2026-11-03T10:00:00.000Z', T2 = '2026-11-04T10:00:00.000Z', T3 = '2026-11-05T10:00:00.000Z';

test('the first run is a baseline: it records every free model but reports none as new, so it does not probe them all at once', () => {
  const r = updateModels(null, [m('a/chat:free'), m('n/content-safety:free'), m('x/paid', { pricing: { prompt: '0.1', completion: '0.1' } })], T1);
  assert.deepEqual(r.added, []);
  assert.ok(r.events.every((e) => e.baseline === true));
  assert.deepEqual(Object.keys(r.record.models), ['a/chat:free', 'n/content-safety:free']);
  assert.deepEqual(r.record.models['a/chat:free'], { kind: 'chat', status: 'active', firstSeen: '2026-11-03', lastSeen: '2026-11-03' });
  assert.equal(r.record.models['n/content-safety:free'].kind, 'excluded');
  assert.equal(r.events.length, 2);
});
test('nothing changed: no events, and lastSeen moves', () => {
  const first = updateModels(null, [m('a/chat:free')], T1);
  const r = updateModels(first.record, [m('a/chat:free')], T2);
  assert.deepEqual([r.added, r.removed, r.events], [[], [], []]);
  assert.equal(r.record.models['a/chat:free'].firstSeen, '2026-11-03');
  assert.equal(r.record.models['a/chat:free'].lastSeen, '2026-11-04');
});
test('a new model is added on the day it appears, and a vanished one is marked gone, never deleted', () => {
  const first = updateModels(null, [m('a/chat:free'), m('b/old:free')], T1);
  const r = updateModels(first.record, [m('a/chat:free'), m('c/new:free')], T2);
  assert.deepEqual(r.added, ['c/new:free']);
  assert.equal(r.events.find((e) => e.event === 'added').baseline, undefined);
  assert.deepEqual(r.removed, ['b/old:free']);
  assert.equal(r.record.models['c/new:free'].firstSeen, '2026-11-04');
  assert.deepEqual([r.record.models['b/old:free'].status, r.record.models['b/old:free'].goneAt], ['gone', '2026-11-04']);
  assert.deepEqual(r.events.map((e) => `${e.event}:${e.model}`).sort(), ['added:c/new:free', 'removed:b/old:free']);
});
test('a model that was gone and comes back is probed again, and keeps its first-seen date', () => {
  const a = updateModels(null, [m('a/x:free')], T1);
  const b = updateModels(a.record, [], T2);
  const c = updateModels(b.record, [m('a/x:free')], T3);
  assert.deepEqual(c.added, ['a/x:free']);
  assert.equal(c.record.models['a/x:free'].firstSeen, '2026-11-03');
  assert.equal(c.record.models['a/x:free'].status, 'active');
  assert.equal('goneAt' in c.record.models['a/x:free'], false);
  assert.equal(c.events[0].event, 'returned');
});
test('a gone model that stays gone raises no repeated event', () => {
  const a = updateModels(null, [m('a/x:free')], T1);
  const b = updateModels(a.record, [], T2);
  assert.equal(updateModels(b.record, [], T3).events.length, 0);
});
test('a damaged models file is refused, never overwritten', () => {
  assert.throws(() => updateModels({ models: 'nope' }, [m('a/x:free')], T1), /refusing to overwrite/);
  assert.throws(() => updateModels([], [m('a/x:free')], T1), /refusing to overwrite/);
});
test('the record is sorted, so the file only changes when something does', () => {
  const r = updateModels(null, [m('z/z:free'), m('a/a:free')], T1);
  assert.deepEqual(Object.keys(r.record.models), ['a/a:free', 'z/z:free']);
});
