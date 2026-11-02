const test = require('node:test');
const assert = require('node:assert');
const { tabIntent, findTab } = require('../src/tabfind');

const tabs = [
  { id: 1, title: 'Tevo Product - Notion', url: 'https://notion.so/tevo' },
  { id: 2, title: 'Hanoi - Wikipedia', url: 'https://en.wikipedia.org/wiki/Hanoi' },
  { id: 3, title: 'Tevo Product (private)', url: 'https://x.test/', private: true }
];

test('recognises asking for a tab, with and without accents', () => {
  assert.deepStrictEqual(tabIntent('mở tab Tevo Product'), { name: 'tevo product', shown: 'Tevo Product', sure: true });
  assert.deepStrictEqual(tabIntent('open the tab about Hanoi'), { name: 'hanoi', shown: 'Hanoi', sure: true });
  assert.deepStrictEqual(tabIntent('tìm giúp tôi tab Tevo'), { name: 'tevo', shown: 'Tevo', sure: true });
  assert.strictEqual(tabIntent('mở trang wikipedia').sure, false);
  assert.strictEqual(tabIntent('giá vé hà nội đà nẵng'), null);
});

test('picks the open tab that matches and never a private one', () => {
  assert.strictEqual(findTab(tabs, 'tevo product').id, 1);
  assert.strictEqual(findTab(tabs, 'wikipedia').id, 2);
  assert.strictEqual(findTab(tabs, 'pho restaurant'), null);
});
