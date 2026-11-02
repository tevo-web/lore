const test = require('node:test');
const assert = require('node:assert');
const { Memory } = require('../src/memory');

const mem = () => {
  const m = new Memory({ load: () => [], save: () => {} });
  m.items = [
    { url: 'https://a.example/fares', title: 'Hanoi to Da Nang flight fares', ts: Date.now(), text: 'Cheapest flight fares from Hanoi to Da Nang in November start at 1,190,000 VND.' },
    { url: 'https://b.example/news', title: 'Daily news', ts: Date.now(), text: 'The city opened a new flight museum. Fares for buses rose.' }
  ];
  return m;
};

test('minCover keeps only pages that cover most of the question', async () => {
  const m = mem();
  const loose = await m.search('cheapest flight fares Hanoi Da Nang', Date.now(), 5);
  assert.strictEqual(loose.length, 2, 'without a threshold one shared word is enough');
  const strict = await m.search('cheapest flight fares Hanoi Da Nang', Date.now(), 5, { minCover: 0.6 });
  assert.deepStrictEqual(strict.map((x) => x.url), ['https://a.example/fares']);
});

test('a question about something else finds nothing at the threshold', async () => {
  const m = mem();
  assert.strictEqual((await m.search('best pho restaurant in Saigon', Date.now(), 5, { minCover: 0.6 })).length, 0);
});
