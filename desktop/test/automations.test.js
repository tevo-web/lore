const test = require('node:test');
const assert = require('node:assert');
const { AutomationStore } = require('../src/automations');
const { featurePosts } = require('../src/featureposts');

const T = (h, m = 0) => new Date(2026, 10, 2, h, m).getTime();
const spec = (o = {}) => ({ kind: 'post', site: 'facebook', name: 'Intro', drafts: ['one', 'two', 'three'], schedule: { type: 'every', minutes: 60 }, startAt: T(9), until: T(23, 59), ...o });

test('a new automation does nothing until it is approved', () => {
  const s = new AutomationStore();
  const a = s.add(spec());
  assert.deepStrictEqual([a.approved, a.enabled], [false, false]);
  assert.strictEqual(s.due(T(9, 1)).length, 0);
  s.approve(a.id, T(8));
  assert.strictEqual(s.due(T(9, 1)).length, 1);
});

test('changing the texts, the site or the schedule takes the approval away', () => {
  const s = new AutomationStore();
  const a = s.add(spec());
  s.approve(a.id);
  s.update(a.id, { name: 'Renamed' });
  assert.ok(s.get(a.id).approved, 'a new name is harmless');
  s.update(a.id, { drafts: ['one', 'two', 'something else'] });
  assert.deepStrictEqual([s.get(a.id).approved, s.get(a.id).enabled], [false, false]);
  s.approve(a.id);
  s.update(a.id, { schedule: { type: 'every', minutes: 15 } });
  assert.ok(!s.get(a.id).approved);
});

test('a file that was edited by hand cannot switch posting on', () => {
  let saved;
  const s = new AutomationStore({ save: (d) => { saved = d; } });
  const a = s.add(spec());
  s.approve(a.id);
  const forged = JSON.parse(JSON.stringify(saved));
  forged.items[0].drafts[0] = 'buy my coins';
  assert.ok(!new AutomationStore({ load: () => forged }).items[0].approved);
  assert.ok(new AutomationStore({ load: () => saved }).items[0].approved);
});

test('each text goes out once, in order; a failure retries the same one and three failures pause it', () => {
  const s = new AutomationStore();
  const a = s.add(spec()); s.approve(a.id);
  assert.strictEqual(s.nextText(a), 'one');
  s.recordRun(a.id, { ok: true }, T(9, 1));
  assert.strictEqual(s.nextText(a), 'two');
  s.recordRun(a.id, { ok: false, note: 'no composer' }, T(10, 1));
  assert.strictEqual(s.nextText(a), 'two');
  s.recordRun(a.id, { ok: false }, T(11, 1)); s.recordRun(a.id, { ok: false }, T(12, 1));
  assert.ok(!a.enabled, 'paused after three failures in a row');
  assert.strictEqual(s.due(T(13, 1)).length, 0);
});

test('it stops after the last text and after the end time', () => {
  const s = new AutomationStore();
  const a = s.add(spec({ drafts: ['one'] })); s.approve(a.id);
  s.recordRun(a.id, { ok: true }, T(9, 1));
  assert.strictEqual(s.due(T(10, 1)).length, 0);
  const b = s.add(spec({ until: T(9, 30) })); s.approve(b.id);
  s.recordRun(b.id, { ok: true }, T(9, 1));
  assert.strictEqual(s.due(T(10, 1)).filter((x) => x.id === b.id).length, 0);
});

test('bad specs are refused and texts are cleaned', () => {
  const s = new AutomationStore();
  assert.throws(() => s.add(spec({ site: 'nowhere' })));
  assert.throws(() => s.add(spec({ drafts: ['  ', ''] })));
  assert.throws(() => s.add(spec({ schedule: { type: 'every', minutes: 2 } })));
  assert.strictEqual(s.add(spec({ drafts: ['hi​ there '] })).drafts[0], 'hi there');
});

test('the ready-made posts: eight, each with the link, in both languages', () => {
  for (const l of ['vi', 'en']) { const p = featurePosts(l); assert.strictEqual(p.length, 8); assert.ok(p.every((t) => t.includes('https://tevo-web.github.io/lore/') && t.length < 700)); }
  assert.notStrictEqual(featurePosts('vi')[0], featurePosts('en')[0]);
});
