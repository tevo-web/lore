// Model providers behind one interface: { label, model, remote, host, available(), chat(messages) }.
//   local      Ollama on this machine (nothing leaves the device)
//   openai     any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, LM Studio, ...)
//   anthropic  Anthropic Messages API
//   gemini     Google Gemini API (OpenAI-compatible endpoint)
//   mistral    Mistral AI (OpenAI-compatible endpoint, servers in the EU)
// Remote providers send the user's question to that host, and answerQuery says so in the UI.

const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
const isLocalHost = (u) => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname); } catch { return false; } };
const trimSlash = (u) => u.replace(/\/+$/, '');
// A message may carry pictures (base64 JPEG) in `images`; each provider wants them in its own shape.
const VISION_MODEL = /vl\b|vision|llava|minicpm-v|moondream|bakllava|gemma3|pixtral|gpt-4o|gpt-4\.1|gpt-5|gemini|claude|mistral-(small|medium|large)/i;
const asOpenAi = (m) => (m.images && m.images.length ? { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((b) => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b } }))] } : { role: m.role, content: m.content });
const asAnthropic = (m) => (m.images && m.images.length ? { role: m.role, content: [...m.images.map((b) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b } })), { type: 'text', text: m.content }] } : { role: m.role, content: m.content });
// Errors carry an i18n key as the message; the UI translates it.
// The API's own explanation ("model: not found", ...) is what makes a 400 fixable, so keep it.
async function httpError(r) {
  const e = new Error(r.status === 401 ? 'llm.keyRejected' : 'llm.http');
  e.status = r.status;
  try {
    const j = await r.json();
    const m = j && (j.error && (j.error.message || j.error) || j.message);
    if (typeof m === 'string') e.detail = m.slice(0, 240);
  } catch { /* no readable body */ }
  return e;
}
const TEMP = 0.2;
// Generous on purpose: a Vietnamese answer takes about twice the tokens of the same English one, and a cut-off sentence
// is worse than a long one. Callers that want less ask for less.
const MAX_TOKENS = 1200;
// Ollama reads only the first 2048 to 4096 tokens of a prompt unless told otherwise, and drops the rest without a word.
// A page of Vietnamese is easily more than that, so ask for room.
const NUM_CTX = 8192;

function ollama({ url, model }, f) {
  const base = trimSlash(url);
  return {
    vision: VISION_MODEL.test(model), label: 'On-device AI', model, remote: false, host: hostOf(base),
    async available() {
      try {
        const r = await f(base + '/api/tags', { signal: AbortSignal.timeout(700) });
        if (!r.ok) return false;
        const j = await r.json();
        return (j.models || []).some((m) => (model.includes(':') ? m.name === model : m.name.startsWith(model + ':')));
      } catch { return false; }
    },
    async chat(messages, { timeoutMs = 30000, maxTokens = MAX_TOKENS, temperature = TEMP } = {}) {
      const r = await f(base + '/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false, options: { temperature, num_predict: maxTokens, num_ctx: NUM_CTX } }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!r.ok) throw await httpError(r);
      const j = await r.json();
      this.truncated = j.done_reason === 'length';
      this.usage = { in: j.prompt_eval_count | 0, out: j.eval_count | 0 };
      return String((j.message && j.message.content) || '').trim();
    }
  };
}

function openai({ baseUrl, model, key }, f) {
  const base = trimSlash(baseUrl);
  const remote = !isLocalHost(base);
  return {
    vision: VISION_MODEL.test(model), label: hostOf(base), model, remote, host: hostOf(base),
    async available() { return !!model && (!!key || !remote); },
    async chat(messages, { timeoutMs = 30000, maxTokens = MAX_TOKENS, temperature = TEMP } = {}) {
      const headers = { 'content-type': 'application/json' };
      if (key) headers.authorization = 'Bearer ' + key;
      const r = await f(base + '/chat/completions', {
        method: 'POST', headers, signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ model, messages: messages.map(asOpenAi), temperature, max_tokens: maxTokens })
      });
      if (!r.ok) throw await httpError(r);
      const j = await r.json();
      this.truncated = !!(j.choices && j.choices[0] && j.choices[0].finish_reason === 'length');
      this.usage = { in: (j.usage && j.usage.prompt_tokens) | 0, out: (j.usage && j.usage.completion_tokens) | 0 };
      return String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
    }
  };
}

function anthropic({ model, key }, f) {
  return {
    vision: true, label: 'api.anthropic.com', model, remote: true, host: 'api.anthropic.com',
    async available() { return !!model && !!key; },
    async chat(messages, { timeoutMs = 30000, maxTokens = MAX_TOKENS } = {}) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const r = await f('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        // No temperature (newer Claude models reject it) and no empty system block (the API returns 400 for it).
        body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: messages.filter((m) => m.role !== 'system').map(asAnthropic) })
      });
      if (!r.ok) throw await httpError(r);
      const j = await r.json();
      this.truncated = j.stop_reason === 'max_tokens';
      this.usage = { in: (j.usage && j.usage.input_tokens) | 0, out: (j.usage && j.usage.output_tokens) | 0 };
      return String((j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')).trim();
    }
  };
}

const MISTRAL_URL = 'https://api.mistral.ai/v1';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

function createLlm(cfg, { fetchImpl = fetch } = {}) {
  if (cfg.provider === 'local') return ollama(cfg.local, fetchImpl);
  if (cfg.provider === 'openai') return openai(cfg.openai, fetchImpl);
  if (cfg.provider === 'anthropic') return anthropic(cfg.anthropic, fetchImpl);
  // Google's Gemini API speaks the OpenAI chat format at this address, so the same client serves it.
  if (cfg.provider === 'mistral') return openai({ baseUrl: MISTRAL_URL, model: cfg.mistral.model, key: cfg.mistral.key }, fetchImpl);
  if (cfg.provider === 'gemini') return openai({ baseUrl: GEMINI_URL, model: cfg.gemini.model, key: cfg.gemini.key }, fetchImpl);
  return null;
}

// Ollama-only helpers for the settings page.
async function listLocalModels(url, fetchImpl = fetch) {
  const r = await fetchImpl(trimSlash(url) + '/api/tags', { signal: AbortSignal.timeout(1500) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return ((await r.json()).models || []).map((m) => m.name);
}

// Streams `ollama pull`, reporting 0..1 progress. Throws if Ollama is unreachable or the model is unknown.
async function pullLocalModel(url, model, onProgress, fetchImpl = fetch) {
  const r = await fetchImpl(trimSlash(url) + '/api/pull', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, stream: true })
  });
  if (!r.ok) throw new Error('Ollama returned HTTP ' + r.status);
  let buf = '';
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      onProgress(j.total ? j.completed / j.total : 0, j.status || '');
    }
  }
  onProgress(1, 'success');
}

module.exports = { createLlm, listLocalModels, pullLocalModel, isLocalHost };
