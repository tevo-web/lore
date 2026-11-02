// Automations: things Lore does on a schedule while it is open. For now one kind, "post": publish a prepared text on a site where
// the person is signed in. Nothing is made up at posting time. The texts are written in advance, shown to the person, and posting
// only starts after they approve that exact list (approval is tied to a fingerprint of the texts, the site and the schedule, so
// changing any of them takes the approval away).
const crypto = require('crypto');
const { valid, status } = require('./schedule');

const SITES = {
  facebook: { name: 'Facebook', url: 'https://www.facebook.com/' },
  linkedin: { name: 'LinkedIn', url: 'https://www.linkedin.com/feed/' },
  x: { name: 'X', url: 'https://x.com/home' },
  test: { name: 'Test page', url: '' }
};
const MAX_DRAFTS = 24;
const MAX_DRAFT_CHARS = 2000;
const MAX_RUNS_KEPT = 60;
const MAX_FAILS = 3;

// Control characters and invisible characters are dropped, so what is shown is exactly what is posted.
const hidden = (c) => c < 9 || c === 11 || c === 12 || (c >= 14 && c <= 31) || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || c === 0xfeff;
const clean = (s) => [...String(s || '')].filter((ch) => !hidden(ch.codePointAt(0))).join('').trim().slice(0, MAX_DRAFT_CHARS);
const fingerprint = (a) => crypto.createHash('sha256').update(JSON.stringify({ k: a.kind, s: a.site, u: a.url || '', d: a.drafts, sc: a.schedule, st: a.startAt || 0, un: a.until || 0 })).digest('hex');

class AutomationStore {
  constructor({ load, save } = {}) {
    this._save = save || (() => {});
    const d = load ? load() : null;
    const raw = d && !Array.isArray(d) && Array.isArray(d.items) ? d.items : [];
    this.items = [];
    for (const x of raw) { try { this.items.push(this._normalize(x, true)); } catch { /* damaged entry */ } }
    // An approval is only trusted if it still matches what was approved.
    for (const a of this.items) if (a.approved && a.draftsHash !== fingerprint(a)) { a.approved = false; a.enabled = false; }
  }
  _persist() { this._save({ v: 1, items: this.items }); }

  _normalize(x, loading = false) {
    if (!x || x.kind !== 'post' || !SITES[x.site]) throw new Error('bad kind or site');
    const drafts = (Array.isArray(x.drafts) ? x.drafts : []).map(clean).filter(Boolean).slice(0, MAX_DRAFTS);
    if (!drafts.length) throw new Error('no texts');
    if (!valid(x.schedule)) throw new Error('bad schedule');
    const a = {
      id: typeof x.id === 'string' && /^a_[a-z0-9]+$/.test(x.id) ? x.id : 'a_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
      name: String(x.name || SITES[x.site].name).slice(0, 80), kind: 'post', site: x.site, url: x.site === 'test' ? String(x.url || '') : '',
      drafts, schedule: x.schedule, startAt: Number(x.startAt) || 0, until: Number(x.until) || 0, maxRuns: drafts.length,
      enabled: !!x.enabled, approved: !!x.approved, approvedAt: Number(x.approvedAt) || 0, draftsHash: String(x.draftsHash || ''),
      runCount: loading ? Math.min(Number(x.runCount) || 0, drafts.length) : 0, lastRun: loading ? Number(x.lastRun) || 0 : 0, fails: loading ? Number(x.fails) || 0 : 0,
      runs: loading && Array.isArray(x.runs) ? x.runs.slice(-MAX_RUNS_KEPT).map((r) => ({ ts: Number(r.ts) || 0, ok: !!r.ok, n: Number(r.n) || 0, note: String(r.note || '').slice(0, 200) })) : [],
      created: Number(x.created) || Date.now()
    };
    return a;
  }

  get(id) { return this.items.find((a) => a.id === id) || null; }
  add(spec) { const a = this._normalize({ ...spec, approved: false, enabled: false }); this.items.push(a); this._persist(); return a; }
  // Changing what will be posted, where, or when removes the approval.
  update(id, patch) {
    const a = this.get(id);
    if (!a) return null;
    const next = this._normalize({ ...a, ...patch, id: a.id, runCount: a.runCount, approved: a.approved, approvedAt: a.approvedAt, draftsHash: a.draftsHash, enabled: a.enabled }, false);
    Object.assign(a, next, { runCount: a.runCount, lastRun: a.lastRun, fails: a.fails, runs: a.runs, created: a.created });
    if (a.approved && a.draftsHash !== fingerprint(a)) { a.approved = false; a.enabled = false; }
    this._persist();
    return a;
  }
  // The person looked at the list and said yes: from now on exactly this list may be posted on this schedule.
  approve(id, now = Date.now()) {
    const a = this.get(id);
    if (!a) return null;
    a.approved = true; a.approvedAt = now; a.draftsHash = fingerprint(a); a.enabled = true; a.fails = 0;
    this._persist();
    return a;
  }
  pause(id, on) { const a = this.get(id); if (a) { a.enabled = !!on && a.approved; this._persist(); } return a; }
  remove(id) { const n = this.items.length; this.items = this.items.filter((a) => a.id !== id); if (n !== this.items.length) this._persist(); }
  trusted(a) { return a.approved && a.draftsHash === fingerprint(a); }
  // Only an approved, enabled automation whose time has come, and only the next text in its list.
  due(now = Date.now()) {
    return this.items.filter((a) => this.trusted(a) && a.runCount < a.drafts.length && status(a, now).state === 'due');
  }
  late(now = Date.now()) { return this.items.filter((a) => this.trusted(a) && status(a, now).state === 'late'); }
  nextText(a) { return a.runCount < a.drafts.length ? a.drafts[a.runCount] : ''; }
  recordRun(id, { ok, note = '' }, now = Date.now()) {
    const a = this.get(id);
    if (!a) return;
    a.lastRun = now;
    if (ok) { a.runCount++; a.fails = 0; } else { a.fails++; if (a.fails >= MAX_FAILS) a.enabled = false; }
    a.runs.push({ ts: now, ok: !!ok, n: ok ? a.runCount : a.runCount + 1, note: String(note).slice(0, 200) });
    a.runs = a.runs.slice(-MAX_RUNS_KEPT);
    this._persist();
  }
  skip(id, now = Date.now()) { const a = this.get(id); if (a) { a.lastRun = now; this._persist(); } }
  view() { return this.items.map((a) => ({ ...a, state: status(a, Date.now()), trusted: this.trusted(a) })); }
}

module.exports = { AutomationStore, SITES, fingerprint, MAX_FAILS };
