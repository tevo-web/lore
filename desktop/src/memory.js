// On-device memory of pages seen (MEM-01, MEM-03). Everything here stays on this computer, encrypted at rest.
//  - keyword search: BM25 over title, address and a short text excerpt of each page
//  - meaning search: optional embeddings from a local model (Ollama); results blend both when it is available
//  - review and delete: list, search, remove one page / one site / a time range, export
const fs = require('fs');
const { norm } = require('./router');
const { BRANDS } = require('./scam');

const DAY = 86400000;
const STOP = new Set(['tim', 'lai', 'bai', 'bao', 'trang', 've', 'cua', 'toi', 'minh', 'cho', 'da', 'xem', 'tuan', 'truoc', 'hom', 'qua', 'nay', 'nhung', 'cac', 'mot',
  'find', 'the', 'about', 'article', 'articles', 'last', 'week', 'that', 'back', 'again', 'page', 'pages', 'read', 'visited', 'saw', 'yesterday', 'today', 'for', 'and', 'of', 'an', 'on', 'in', 'my', 'me', 'i', 'to', 'search',
  'nao', 'noi', 'doc', 'viet', 'kia', 'thang', 'which', 'did', 'visit', 'history', 'with', 'from']);
const MAX_TEXT = 3000;

function tokens(s) {
  return norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
}

// Returns [fromTs, toTs] for phrases like "last week", "yesterday" (or the Vietnamese equivalents), or null.
function timeRange(query, now) {
  const n = norm(query);
  if (/tuan truoc|last week/.test(n)) return [now - 14 * DAY, now - 3 * DAY];
  if (/hom qua|yesterday/.test(n)) return [now - 2 * DAY, now - 0.5 * DAY];
  if (/hom kia/.test(n)) return [now - 3 * DAY, now - 1.5 * DAY];
  if (/hom nay|\btoday\b/.test(n)) return [now - DAY, now];
  return null;
}

const RANGES = { hour: 3600000, day: DAY, week: 7 * DAY, month: 30 * DAY };

// Pages we never keep text or history for: online banking and wallets, and webmail.
const SENSITIVE = new Set(['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com', 'mail.zoho.com',
  ...BRANDS.filter((b) => !['Shopee', 'Lazada', 'Tiki', 'EVN', 'VNeID', 'Giao Hàng Nhanh', 'Giao Hàng Tiết Kiệm', 'Viettel Post', 'VNPost'].includes(b.name)).flatMap((b) => b.official)]);
function isSensitiveHost(host) {
  host = host.toLowerCase();
  for (const d of SENSITIVE) if (host === d || host.endsWith('.' + d)) return true;
  return false;
}

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

function cosine(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d; // vectors are stored normalized
}
const toB64 = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64');
const fromB64 = (s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}

function snippetFor(item, qTokens) {
  const text = item.text || '';
  if (!text) return '';
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 20);
  let best = sentences[0] || text.slice(0, 200);
  let top = -1;
  for (const s of sentences) {
    const n = norm(s);
    const hits = qTokens.filter((t) => n.includes(t)).length;
    if (hits > top) { top = hits; best = s; }
  }
  return best.length > 220 ? best.slice(0, 217) + '…' : best;
}

class Memory {
  constructor({ load, save, embedder, saveDelayMs = 2000 } = {}) {
    this._save = save || (() => {});
    this.embedder = embedder || null;
    this.delay = saveDelayMs;
    this.items = load ? load() : [];
    this._timer = null;
    this._queue = Promise.resolve();
  }

  // Saves are batched: a page load touches memory several times.
  save() {
    if (!this.delay) return this._save(this.items);
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this._save(this.items); }, this.delay);
    if (this._timer.unref) this._timer.unref();
  }
  flush() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } this._save(this.items); }

  add({ url, title, ts = Date.now() }) {
    if (!/^https?:/.test(url) || isSensitiveHost(hostOf(url))) return;
    const prev = this.items.find((i) => i.url === url);
    if (prev) { prev.ts = ts; if (title) prev.title = title; }
    else this.items.push({ url, title: title || url, ts });
    this.save();
  }

  setTitle(url, title) {
    const it = this.items.find((i) => i.url === url);
    if (it && title) { it.title = title; this.save(); }
  }

  // Keeps a short excerpt of the page text so memory can answer by content, not just by title.
  setText(url, text) {
    const it = this.items.find((i) => i.url === url);
    if (!it || !text) return;
    it.text = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    this.save();
    this.index(it);
  }

  // Embeds a page in the background when a local embedding model is available.
  index(it) {
    if (!this.embedder) return Promise.resolve();
    this._queue = this._queue.then(async () => {
      try {
        if (!(await this.embedder.available())) return;
        const v = await this.embedder.embed((it.title + '. ' + (it.text || '')).slice(0, 1200));
        if (v) { it.vec = toB64(normalize(v)); this.save(); }
      } catch { /* optional feature: keyword search keeps working */ }
    });
    return this._queue;
  }

  // minCover (0 to 1): the share of the question's words a page must contain, so an ordinary question only matches pages that are really about it.
  async search(query, now = Date.now(), limit = 8, { host, from, to, minCover = 0 } = {}) {
    const q = tokens(query);
    const range = timeRange(query, now);
    let pool = this.items.filter((i) => (!range || (i.ts >= range[0] && i.ts <= range[1])) && (!host || hostOf(i.url) === host) && (!from || i.ts >= from) && (!to || i.ts <= to));
    if (!q.length) return pool.sort((a, b) => b.ts - a.ts).slice(0, limit).map((i) => ({ ...strip(i), snippet: snippetFor(i, []) }));

    // BM25 over the pool
    const docs = pool.map((i) => tokens(i.title + ' ' + i.title + ' ' + hostOf(i.url) + ' ' + (i.text || '')));
    const N = docs.length || 1;
    const avg = docs.reduce((s, d) => s + d.length, 0) / N || 1;
    const df = Object.fromEntries(q.map((t) => [t, docs.filter((d) => d.includes(t)).length]));
    const k1 = 1.4; const b = 0.75;
    const bm = docs.map((d) => q.reduce((s, t) => {
      const tf = d.filter((x) => x === t).length;
      if (!tf) return s;
      const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      return s + idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avg)));
    }, 0));
    const maxBm = Math.max(...bm, 0) || 1;
    const uq = [...new Set(q)];

    let qv = null;
    if (this.embedder && pool.some((i) => i.vec)) {
      try { if (await this.embedder.available()) qv = normalize(await this.embedder.embed(query)); } catch { qv = null; }
    }
    const scored = pool.map((i, k) => {
      const cos = qv && i.vec ? Math.max(0, cosine(qv, fromB64(i.vec))) : 0;
      const score = qv ? 0.5 * (bm[k] / maxBm) + 0.5 * cos : bm[k] / maxBm;
      const have = new Set(docs[k]);
      const cover = uq.length ? uq.filter((t) => have.has(t)).length / uq.length : 0;
      return { i, score, keep: (bm[k] > 0 || cos >= 0.55) && (!minCover || cover >= minCover || cos >= 0.75) };
    });
    return scored.filter((x) => x.keep).sort((a, b) => b.score - a.score || b.i.ts - a.i.ts).slice(0, limit)
      .map(({ i }) => ({ ...strip(i), snippet: snippetFor(i, q) }));
  }

  // ---- review and delete (MEM-03)
  list({ host, from, to } = {}) {
    return this.items.filter((i) => (!host || hostOf(i.url) === host) && (!from || i.ts >= from) && (!to || i.ts <= to)).sort((a, b) => b.ts - a.ts);
  }
  hosts() {
    const m = new Map();
    for (const i of this.items) m.set(hostOf(i.url), (m.get(hostOf(i.url)) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([host, count]) => ({ host, count }));
  }
  _drop(pred) { const n = this.items.length; this.items = this.items.filter((i) => !pred(i)); if (this.items.length !== n) this.save(); return n - this.items.length; }
  remove(url) { return this._drop((i) => i.url === url); }
  removeHost(host) { return this._drop((i) => hostOf(i.url) === host); }
  removeSince(range, now = Date.now()) { return range === 'all' ? this._drop(() => true) : this._drop((i) => i.ts >= now - (RANGES[range] || 0)); }
  clear() { this.items = []; this.flush(); }
  export() { return this.items.map(strip).map(({ url, title, ts }) => ({ url, title, visited: new Date(ts).toISOString() })); }

  get size() { return this.items.length; }
  get embeddedCount() { return this.items.filter((i) => i.vec).length; }
}

const strip = ({ vec, text, ...rest }) => rest; // never hand embeddings or full text to the UI

// Encrypted file persistence using Electron safeStorage (OS keychain). Falls back to no persistence.
function fileStore(file, safeStorage) {
  const ok = safeStorage && safeStorage.isEncryptionAvailable();
  return {
    load() {
      if (!ok) return [];
      try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(file))); } catch { return []; }
    },
    save(items) {
      if (!ok) return;
      try { fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(items))); } catch { /* best effort */ }
    }
  };
}

module.exports = { Memory, fileStore, isSensitiveHost, timeRange, tokens, RANGES };
