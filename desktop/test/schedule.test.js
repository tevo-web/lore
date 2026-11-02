const test = require('node:test');
const assert = require('node:assert');
const { nextRun, status, valid } = require('../src/schedule');

const T = (h, m = 0, d = 2) => new Date(2026, 10, d, h, m).getTime();

test('every N minutes: starts at the start time, then keeps the interval, and stops at the end', () => {
  const a = { schedule: { type: 'every', minutes: 60 }, startAt: T(9), until: T(23, 59), maxRuns: 8, enabled: true, approved: true };
  assert.strictEqual(nextRun(a, T(8)), T(9));
  assert.strictEqual(nextRun({ ...a, lastRun: T(9), runCount: 1 }, T(9, 5)), T(10));
  assert.strictEqual(nextRun({ ...a, lastRun: T(23), runCount: 3 }, T(23, 5)), 0, 'the next one would be after the end');
  assert.strictEqual(nextRun({ ...a, lastRun: T(10), runCount: 8 }, T(10, 5)), 0, 'all runs used');
});

test('daily and weekly slots', () => {
  const d = { schedule: { type: 'daily', at: '08:00' }, enabled: true, approved: true };
  assert.strictEqual(nextRun(d, T(7)), T(8));
  assert.strictEqual(nextRun({ ...d, lastRun: T(8) }, T(9)), T(8, 0, 3));
  const w = { schedule: { type: 'weekly', day: 3, at: '09:30' }, enabled: true, approved: true }; // Wednesday
  assert.strictEqual(new Date(nextRun(w, T(12))).getDay(), 3);
});

test('bad schedules are refused, and nothing runs more often than every 15 minutes', () => {
  assert.ok(!valid({ type: 'every', minutes: 5 }));
  assert.ok(!valid({ type: 'daily', at: '25:00' }));
  assert.ok(!valid({ type: 'weekly', at: '10:00' }));
  assert.ok(valid({ type: 'every', minutes: 15 }));
  assert.strictEqual(nextRun({ schedule: { type: 'every', minutes: 1 } }, T(9)), 0);
});

test('status: off until approved, waiting, due, and a slot that is long past is not made up', () => {
  const a = { schedule: { type: 'every', minutes: 60 }, startAt: T(9), enabled: true, approved: false };
  assert.strictEqual(status(a, T(10)).state, 'off');
  const b = { ...a, approved: true };
  assert.strictEqual(status(b, T(8)).state, 'waiting');
  assert.strictEqual(status(b, T(9, 5)).state, 'due');
  assert.strictEqual(status({ ...b, lastRun: T(9) }, T(12)).state, 'late');
  assert.strictEqual(status({ ...b, enabled: false }, T(9, 5)).state, 'off');
});
