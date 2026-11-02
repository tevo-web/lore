const p = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const lang = p.get('lang') === 'vi' ? 'vi' : 'en';
const T = (k, v) => LORE_I18N.t(lang, k, v);
LORE_I18N.apply(lang);

const kind = p.get('kind');
const q0 = p.get('q') || '';
const cut = (t) => (t.length > 40 ? t.slice(0, 39) + '…' : t);

document.title = { loading: cut(q0), answer: cut(q0), memory: T('title.memory', { q: cut(q0) }), agent: T('title.agent'), nopage: T('title.page'), download: T('title.download') }[kind] || T(p.get('private') === '1' ? 'tab.newPrivate' : 'tab.new');

// Cards run their example through the intent bar: the main process handles lore-run: links.
const run = (q) => 'lore-run:?q=' + encodeURIComponent(q);
$('c-ask').href = run(T('card.ask.q'));
$('c-do').href = run(T('card.do.q'));
$('c-mem').href = run(T('card.mem.q'));
$('c-dl').href = run(T('card.dl.q'));
for (const [id, a] of [['t-tasks', 'tasks'], ['t-private', 'private'], ['t-memory', 'memory'], ['t-settings', 'settings']]) $(id).href = 'lore-do:?a=' + a;
if (kind) $('tools').style.display = 'none';

if (!kind) {
  let items = [];
  try { items = JSON.parse(p.get('resume') || '[]'); } catch { items = []; }
  items = items.filter((i) => i && /^https?:\/\//.test(i.url)).slice(0, 3);
  if (items.length) {
    $('resume').hidden = false;
    $('resume-k').textContent = T('resume.k');
    for (const i of items) {
      const a = document.createElement('a');
      a.href = i.url;
      a.className = 'res';
      const b = document.createElement('b'); b.textContent = i.title;
      const s = document.createElement('small'); s.textContent = i.host;
      a.append(b, s);
      $('resume-l').append(a);
    }
  }
}

function ago(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  return d <= 0 ? T('ago.today') : d === 1 ? T('ago.yesterday') : T('ago.days', { n: d });
}

function noteWith(title, text) {
  $('note').style.display = 'block';
  $('msg').textContent = title;
  $('soon').textContent = text;
}

if (kind === 'memory') {
  noteWith(T('kind.memory') + ': "' + q0 + '"', T('note.memoryPrivate'));
  const results = JSON.parse(p.get('results') || '[]');
  const box = $('hits');
  if (!results.length) box.textContent = T('mem.none', { n: p.get('total') || 0 });
  // An answer written from these pages, with numbered citations that link to them.
  let rec = null;
  try { rec = JSON.parse(p.get('recall') || 'null'); } catch { rec = null; }
  if (rec && rec.answer) {
    $('rec').hidden = false;
    $('rec-k').textContent = T('mem.rec');
    const t = $('rec-t');
    for (const part of rec.answer.split(/(\[\d{1,2}\])/)) {
      const m = /^\[(\d{1,2})\]$/.exec(part);
      const src = m && results[Number(m[1]) - 1];
      if (src) { const a = document.createElement('a'); a.href = src.url; a.className = 'cite'; a.textContent = m[1]; a.title = src.title; t.append(a); } else t.append(document.createTextNode(part));
    }
    $('rec-m').textContent = rec.remote ? T('mem.recRemote', { host: rec.remote }) : T('mem.recLocal');
  }
  let n = 0;
  for (const r of results) {
    n++;
    const a = document.createElement('a');
    a.href = r.url;
    const b = document.createElement('b');
    b.textContent = (rec && rec.answer ? '[' + n + '] ' : '') + r.title;
    const s = document.createElement('small');
    s.textContent = T('mem.meta', { host: new URL(r.url).hostname, when: ago(r.ts) });
    a.append(b, s);
    if (r.snippet) { const sn = document.createElement('small'); sn.textContent = r.snippet; sn.style.marginTop = '4px'; a.append(sn); }
    box.append(a);
  }
  // Asked as a plain question: Memory answered first, the web is one click away.
  if (p.get('web')) { const w = document.createElement('a'); w.href = p.get('web'); w.className = 'btn'; w.style.marginTop = '14px'; w.textContent = T('ans.web'); box.append(w); }
} else if (kind === 'agent') {
  noteWith(T('kind.agent') + ': "' + q0 + '"', T('note.agentNo'));
} else if (kind === 'nopage') {
  noteWith(T('title.page'), T('note.noPage'));
} else if (kind === 'download') {
  noteWith(T('kind.download') + ': "' + q0 + '"', T('note.noVideo'));
}

if (kind === 'loading' || kind === 'answer') {
  $('cards').style.display = 'none';
  $('h1').textContent = kind === 'loading' ? T('ans.thinking') : T('ans.title');
  $('sub').style.display = 'none';
  $('ans').hidden = false;
  $('ask').textContent = T('ans.asked', { q: q0 });
  $('web').style.display = 'none';
}

if (kind === 'answer') {
  const a = JSON.parse(p.get('answer'));
  if (a.claims) {
    // AI-02: every sentence links to the line of the source it came from.
    a.claims.forEach((c, k) => {
      if (k) $('lead').append(' ');
      $('lead').append(document.createTextNode(c.text));
      const sup = document.createElement('sup');
      c.cites.forEach((n) => {
        const l = document.createElement('a');
        l.href = a.sources[0].url;
        l.textContent = '[' + n + ']';
        l.title = a.evidence[n - 1] || '';
        sup.append(l);
      });
      $('lead').append(sup);
    });
  } else $('lead').textContent = a.summary;
  for (const s of a.sources) {
    const el = document.createElement('a');
    el.href = s.url;
    const t = document.createElement('span');
    t.textContent = s.title;
    const h = document.createElement('small');
    h.textContent = new URL(s.url).hostname;
    el.append(t, h);
    $('srcs').append(el);
  }
  $('meta').textContent = a.meta;
  $('web').href = p.get('web');
  $('web').style.display = 'inline-block';
}

if (!kind) $('stats').textContent = T('home.stats', { n: Number(p.get('blocked') || 0).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') });
else $('stats').hidden = true;

if (kind) $('cards').style.display = kind === 'loading' || kind === 'answer' ? 'none' : '';

// A pressed card stays highlighted while the bar types its example.
for (const c of document.querySelectorAll('.card')) c.addEventListener('click', () => c.classList.add('go'));


// ---- The start page: built from this computer's own data every time a tab opens -------------------------------------------
(function startPage() {
  if (kind) return;
  let st = null;
  try { st = JSON.parse(p.get('start') || 'null'); } catch { st = null; }
  if (!st) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  $('start').hidden = false;
  for (const id of ['h1', 'sub', 'cards', 'tools', 'resume']) { const n = $(id); if (n) n.style.display = 'none'; }
  const d = new Date();
  $('when').textContent = d.toLocaleDateString(lang === 'vi' ? 'vi-VN' : undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  $('hi').textContent = T('start.hi.' + st.period);
  const input = $('askin');
  input.placeholder = st.placeholder ? T('start.ph.about', { t: st.placeholder.replace(/^about:/, '') }) : T('start.ph');
  $('askbox').addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); if (q) location.href = 'lore-run:?q=' + encodeURIComponent(q); });
  input.focus();

  if (st.private) {
    $('privnote').hidden = false;
    $('privnote').textContent = T('start.private');
    $('hi').textContent = T('start.private.h');
    return;
  }
  const link = (c) => (c.kind === 'chat' ? 'lore-do:?a=chat&k=' + encodeURIComponent(c.key) : c.url);
  const sub = (c) => ({
    chat: () => T('start.chat', { n: c.count, when: ago(c.ts) }),
    page: () => c.host + ' · ' + ago(c.ts),
    read: () => T('start.read', { host: c.host }),
    closed: () => T('start.closed', { host: c.host })
  }[c.kind]());
  if (st.cards.length) {
    $('cont').hidden = false;
    $('cont-k').textContent = T('start.continue');
    for (const c of st.cards) {
      const a = el('a', 'cont ' + c.kind);
      a.href = link(c);
      const ic = el('span', 'ci');
      ic.innerHTML = { chat: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>', page: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>', read: '<svg viewBox="0 0 24 24"><path d="M6 4h12v16l-6-4-6 4z"/></svg>', closed: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/></svg>' }[c.kind]; // fixed strings above
      const body = el('span', 'cb');
      body.append(el('b', '', c.title || c.host), el('small', '', sub(c)));
      a.append(ic, body);
      $('conts').append(a);
    }
  }
  if (st.tiles.length) {
    $('sites').hidden = false;
    $('sites-k').textContent = T('start.sites');
    for (const s of st.tiles) {
      const a = el('a', 'tile');
      a.href = s.url;
      const f = el('span', 'tf');
      if (s.icon) { const i = el('img'); i.alt = ''; i.src = s.icon; f.append(i); } else f.textContent = s.host.charAt(0).toUpperCase();
      a.append(f, el('span', 'tn', s.host.replace(/\.(com|org|net|vn|io)$/, '')));
      a.title = s.host;
      $('tiles').append(a);
    }
  }
  if (st.tips.length) {
    $('tips').hidden = false;
    $('tips-k').textContent = st.empty ? T('start.try') : T('start.for');
    for (const t of st.tips) {
      const a = el('a', 'tip');
      const href = { setup: 'lore-do:?a=ai', organize: 'lore-do:?a=organize', reading: 'lore-do:?a=bookmarks', download: 'lore-do:?a=downloads', week: 'lore-do:?a=settings' }[t.kind];
      if (t.kind === 'idea') { a.href = 'lore-run:?q=' + encodeURIComponent(T('start.idea.' + t.idea + '.q')); a.append(el('b', '', T('start.idea.' + t.idea)), el('small', '', T('start.idea.' + t.idea + '.q'))); }
      else { a.href = href; a.append(el('b', '', T('start.tip.' + t.kind, { n: t.n, name: t.name })), el('small', '', T('start.tip.' + t.kind + '.d'))); }
      $('tipl').append(a);
    }
  }
  if (!st.cards.length && !st.tiles.length && !st.tips.length) $('tips').hidden = true;
})();
