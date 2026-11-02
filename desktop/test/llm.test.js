const test = require('node:test');
const assert = require('node:assert');
const { createLlm, pullLocalModel } = require('../src/llm');
const { Settings, DEFAULTS } = require('../src/settings');
const { answerQuery } = require('../src/answer');

const msgs = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }];
const rec = (json, ok = true, status = 200) => { const calls = []; return { calls, f: async (u, init) => { calls.push({ u, init }); return { ok, status, json: async () => json }; } }; };

test('openai-compatible request shape and parsing', async () => {
  const { calls, f } = rec({ choices: [{ message: { content: ' hello ' } }] });
  const llm = createLlm({ provider: 'openai', openai: { baseUrl: 'https://api.example.com/v1/', model: 'm1', key: 'sk-test' } }, { fetchImpl: f });
  assert.strictEqual(await llm.chat(msgs), 'hello');
  assert.strictEqual(calls[0].u, 'https://api.example.com/v1/chat/completions');
  assert.strictEqual(calls[0].init.headers.authorization, 'Bearer sk-test');
  assert.strictEqual(llm.remote, true);
});
test('openai-compatible on localhost needs no key and is not remote', async () => {
  const llm = createLlm({ provider: 'openai', openai: { baseUrl: 'http://localhost:1234/v1', model: 'm', key: '' } });
  assert.ok(await llm.available());
  assert.strictEqual(llm.remote, false);
});
test('anthropic request shape and parsing', async () => {
  const { calls, f } = rec({ content: [{ type: 'text', text: 'hi there' }] });
  const llm = createLlm({ provider: 'anthropic', anthropic: { model: 'claude-x', key: 'k' } }, { fetchImpl: f });
  assert.strictEqual(await llm.chat(msgs), 'hi there');
  const body = JSON.parse(calls[0].init.body);
  assert.strictEqual(body.system, 'sys');
  assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'hi' }]);
  assert.strictEqual(calls[0].init.headers['x-api-key'], 'k');
});
test('anthropic: no empty system block, no temperature', async () => {
  const { calls, f } = rec({ content: [{ type: 'text', text: 'ok' }] });
  const llm = createLlm({ provider: 'anthropic', anthropic: { model: 'm', key: 'k' } }, { fetchImpl: f });
  await llm.chat([{ role: 'user', content: 'hi' }]);
  const body = JSON.parse(calls[0].init.body);
  assert.ok(!('system' in body));
  assert.ok(!('temperature' in body));
});
test('http errors carry the API message', async () => {
  const f = async () => ({ ok: false, status: 400, json: async () => ({ type: 'error', error: { type: 'invalid_request_error', message: 'model: bad name' } }) });
  const llm = createLlm({ provider: 'anthropic', anthropic: { model: 'x', key: 'k' } }, { fetchImpl: f });
  await assert.rejects(llm.chat(msgs), (e) => e.status === 400 && e.detail === 'model: bad name');
});
test('rejected key gives a clear error', async () => {
  const { f } = rec({}, false, 401);
  const llm = createLlm({ provider: 'anthropic', anthropic: { model: 'm', key: 'bad' } }, { fetchImpl: f });
  await assert.rejects(llm.chat(msgs), /keyRejected/);
});
test('provider off gives no model', () => assert.strictEqual(createLlm({ provider: 'off' }), null));
test('ollama pull reports progress', async () => {
  const lines = '{"status":"pulling","total":100,"completed":40}\n{"status":"pulling","total":100,"completed":100}\n{"status":"success"}\n';
  const seen = [];
  await pullLocalModel('http://127.0.0.1:11434', 'm', (p) => seen.push(p), async () => ({ ok: true, body: (async function* () { yield Buffer.from(lines.slice(0, 20)); yield Buffer.from(lines.slice(20)); })() }));
  assert.deepStrictEqual(seen.slice(0, 2), [0.4, 1]);
});

test('settings: blank key keeps the saved one, view never leaks it, clearKey removes it', () => {
  const s = new Settings();
  s.update({ provider: 'anthropic', anthropic: { key: 'secret' } });
  s.update({ anthropic: { model: 'claude-y', key: '' } });
  assert.strictEqual(s.get().anthropic.key, 'secret');
  assert.ok(!JSON.stringify(s.view()).includes('secret'));
  assert.strictEqual(s.view().anthropic.hasKey, true);
  s.update({ provider: 'off', clearKey: ['anthropic'] });
  assert.strictEqual(s.get().anthropic.key, '');
});
test('settings: validation', () => {
  const s = new Settings();
  assert.throws(() => s.update({ provider: 'anthropic' }), /set\.v\.key/);
  assert.throws(() => s.update({ provider: 'openai', openai: { baseUrl: 'http://api.example.com/v1', key: 'k' } }), /set\.v\.localhttp/);
  assert.throws(() => s.update({ provider: 'local', local: { url: 'ftp://x' } }), /set\.v\./);
  assert.throws(() => s.update({ language: 'xx' }), /set\.v\.lang/);
  assert.doesNotThrow(() => s.update({ provider: 'local', local: { url: 'http://localhost:11434' } }));
  assert.strictEqual(s.get().provider, 'local');
});
test('settings: failed update leaves the old config', () => {
  const s = new Settings();
  try { s.update({ provider: 'openai', openai: { baseUrl: 'http://evil.example/v1', key: 'k' } }); } catch {}
  assert.strictEqual(s.get().provider, DEFAULTS().provider);
});
test('settings persist through the store', () => {
  let disk;
  const a = new Settings({ save: (c) => { disk = JSON.parse(JSON.stringify(c)); } });
  a.update({ provider: 'openai', openai: { key: 'k1', model: 'gpt-x' } });
  const b = new Settings({ load: () => disk });
  assert.strictEqual(b.get().openai.model, 'gpt-x');
  assert.strictEqual(b.get().openai.key, 'k1');
});

test('remote model answers say where the question went', async () => {
  const llm = { label: 'api.example.com', model: 'm1', host: 'api.example.com', remote: true, available: async () => true, chat: async () => 'Da Nang is a city.' };
  const r = await answerQuery('what is Da Nang', { llm, wiki: async () => null });
  assert.match(r.meta, /sent to api\.example\.com/);
  assert.strictEqual(r.provider, 'api.example.com');
});

test('providers report when the answer stopped because it ran out of room', async () => {
  const { createLlm } = require('../src/llm');
  const reply = (body) => async () => ({ ok: true, json: async () => body });
  const o = createLlm({ provider: 'local', local: { url: 'http://127.0.0.1:1', model: 'm' } }, { fetchImpl: reply({ message: { content: 'x' }, done_reason: 'length' }) });
  await o.chat([{ role: 'user', content: 'hi' }]);
  assert.strictEqual(o.truncated, true);
  const a = createLlm({ provider: 'anthropic', anthropic: { model: 'm', key: 'k' } }, { fetchImpl: reply({ content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn' }) });
  await a.chat([{ role: 'user', content: 'hi' }]);
  assert.strictEqual(a.truncated, false);
});

test('Ollama is asked for a context window big enough for a whole page', async () => {
  const { createLlm } = require('../src/llm');
  let body;
  const f = async (_u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ message: { content: 'x' } }) }; };
  await createLlm({ provider: 'local', local: { url: 'http://127.0.0.1:1', model: 'm' } }, { fetchImpl: f }).chat([{ role: 'user', content: 'hi' }]);
  assert.ok(body.options.num_ctx >= 8192);
});

test('Gemini is reached through Google\'s OpenAI-compatible address with the key as a bearer token', async () => {
  let seen;
  const f = async (url, opt) => { seen = { url, opt }; return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 3 } }) }; };
  const m = createLlm({ provider: 'gemini', gemini: { model: 'gemini-2.5-flash', key: 'K' } }, { fetchImpl: f });
  assert.strictEqual(m.host, 'generativelanguage.googleapis.com');
  assert.ok(m.remote);
  assert.strictEqual(await m.chat([{ role: 'user', content: 'hi' }]), 'ok');
  assert.strictEqual(seen.url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.strictEqual(seen.opt.headers.authorization, 'Bearer K');
  assert.deepStrictEqual(m.usage, { in: 12, out: 3 });
});

test('pictures are sent in each provider\'s own shape, and only when a message has them', async () => {
  const seen = [];
  const f = async (url, opt) => { seen.push({ url, body: JSON.parse(opt.body) }); return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], content: [{ type: 'text', text: 'ok' }], message: { content: 'ok' } }) }; };
  const msgs = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'look', images: ['QUJD'] }];
  await createLlm({ provider: 'openai', openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', key: 'k' } }, { fetchImpl: f }).chat(msgs);
  assert.deepStrictEqual(seen[0].body.messages[1].content[1], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
  await createLlm({ provider: 'anthropic', anthropic: { model: 'claude-haiku-5-5', key: 'k' } }, { fetchImpl: f }).chat(msgs);
  assert.deepStrictEqual(seen[1].body.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
  await createLlm({ provider: 'openai', openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', key: 'k' } }, { fetchImpl: f }).chat([{ role: 'user', content: 'plain' }]);
  assert.strictEqual(seen[2].body.messages[0].content, 'plain');
  assert.ok(createLlm({ provider: 'local', local: { url: 'http://127.0.0.1:11434', model: 'qwen2.5vl:7b' } }).vision);
  assert.ok(!createLlm({ provider: 'local', local: { url: 'http://127.0.0.1:11434', model: 'qwen2.5:3b' } }).vision);
});
