const $ = (s) => document.querySelector(s);
let lang = 'en';
let last = null; // last thing rendered, so a language change can redraw it
const T = (k, v) => LORE_I18N.t(lang, k, v);
const setTitle = (t, sub = '') => { $('#title').textContent = t; $('#sub').textContent = sub; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

function render(s) {
  setTitle(s.title);
  const ol = $('#steps');
  ol.replaceChildren();
  for (const st of s.steps) {
    const li = el('li', 'st ' + st.status);
    li.append(el('span', 'mark', st.status === 'done' ? '✓' : ''), el('span', '', st.text));
    ol.append(li);
  }
  const box = $('#box');
  box.replaceChildren();
  if (s.state === 'awaiting' && s.confirm) {
    const c = s.confirm;
    const card = el('div', 'conf');
    card.append(el('p', 'k', T('panel.confirm')), el('div', '', c.item), el('div', 'amount', c.amount), el('small', '', c.meta));
    const btns = el('div', 'btns');
    const ok = el('button', 'btn acc', c.cta);
    const no = el('button', 'btn', T('panel.cancel'));
    ok.addEventListener('click', () => agent.decide(true));
    no.addEventListener('click', () => agent.decide(false));
    btns.append(ok, no);
    card.append(btns);
    box.append(card);
    ok.focus();
  } else if (s.state === 'running') {
    box.append(el('div', 'conf hold', T('panel.hold')));
  } else {
    const label = { done: T('panel.result'), cancelled: T('panel.cancelled'), failed: T('panel.failed') }[s.state];
    const card = el('div', 'conf');
    card.append(el('p', 'k', label), el('div', '', s.result || (s.state === 'cancelled' ? T('panel.nothingSent') : '')));
    box.append(card);
  }
}

function size(n) { return n ? (n / 1048576 >= 1 ? Math.round(n / 1048576) + ' MB' : Math.round(n / 1024) + ' KB') : ''; }

function renderDl(s) {
  setTitle(T('dl.title'));
  $('#steps').replaceChildren();
  const box = $('#box');
  box.replaceChildren();
  const card = el('div', 'conf');
  if (s.state === 'loading') card.append(el('p', 'k', T('dl.reading')));
  else if (s.state === 'choose') {
    card.append(el('p', 'k', s.title));
    s.options.forEach((o, i) => {
      const b = el('button', 'opt');
      b.append(el('span', '', o.label), el('span', 'sz', size(o.size)));
      b.addEventListener('click', () => agent.dlStart(i));
      card.append(b);
    });
  } else if (s.state === 'running') {
    card.append(el('p', 'k', T('dl.downloading')), el('div', '', s.title));
    const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = Math.round(s.pct * 100) + '%'; bar.append(fill);
    card.append(bar, el('small', '', Math.round(s.pct * 100) + '%'));
  } else if (s.state === 'done') {
    card.append(el('p', 'k', T('dl.saved')), el('div', '', T('dl.savedTo')));
    const b = el('button', 'btn', T(agent.platform === 'darwin' ? 'dl.show' : 'dl.showWin'));
    b.addEventListener('click', () => agent.dlReveal());
    const w = el('div', 'btns'); w.append(b); card.append(w);
  } else card.append(el('p', 'k', T('dl.failed')), el('div', '', s.error));
  box.append(card);
  box.append(el('p', 'note', T('dl.legal')));
}

// ---- Page assistant: a conversation about the current page -----------------------------------------------------

const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  summarize: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  translate: '<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M12 5c0 4-3 7-6 8M13 21l4-10 4 10M14.5 18h5"/>',
  facts: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  decide: '<path d="M12 4v16M6 20h12M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z"/>',
  'share-email': '<path d="M4 6h16v12H4zM4 7l8 6 8-6"/>',
  'page-post': '<path d="M4 5h16v11H9l-5 4z"/>',
  explain: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  'event-page': '<path d="M5 6h14v14H5zM5 10h14M9 3v4M15 3v4"/>',
  tasks: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  ask: '<path d="M4 5h16v11H9l-5 4z"/>'
};
const ACTIONS = [
  { id: 'summarize', label: () => T('pg.summarize'), run: () => agent.pageDo('summarize') },
  { id: 'translate', label: () => T('pg.translate'), run: () => agent.pageDo('translate') },
  { id: 'facts', label: () => T('task.facts.name'), run: () => agent.pageDo('task', 'facts') },
  { id: 'explain', label: () => T('task.explain.name'), run: () => agent.pageDo('task', 'explain') },
  { id: 'decide', label: () => T('task.decide.name'), run: () => agent.pageDo('task', 'decide') },
  { id: 'event-page', label: () => T('task.event-page.name'), run: () => agent.pageDo('task', 'event-page') },
  { id: 'share-email', label: () => T('task.share-email.name'), run: () => agent.pageDo('task', 'share-email') }
];
const MORE = { id: 'tasks', label: () => T('pg.alltasks'), run: () => agent.pageDo('tasks') };

const msgs = new Map(); // seq -> { root, card, body }
let lastSeq = 0;

const DESC = {
  summarize: () => T('pg.summarize.d'), translate: () => T('pg.translate.d'),
  facts: () => T('task.facts.d'), explain: () => T('task.explain.d'), decide: () => T('task.decide.d'),
  'event-page': () => T('task.event-page.d'), 'share-email': () => T('task.share-email.d')
};

function fillActions() {
  const grid = $('#grid');
  const rail = $('#rail');
  grid.replaceChildren();
  rail.replaceChildren();
  // Summarize is the one most people want first, so it gets the big button.
  const lead = $('#leadact');
  const first = ACTIONS[0];
  lead.replaceChildren();
  lead.innerHTML = P(ICONS[first.id]); // fixed strings above
  const lt = el('span', 'lt'); lt.append(el('b', '', first.label()));
  const go = el('span', 'go'); go.innerHTML = P('<path d="M5 12h14M13 6l6 6-6 6"/>');
  lead.append(lt, go);
  lead.onclick = first.run;
  // Prompt first: a few suggestions as small chips, not a menu of tools. Typing in the box below does the same and more.
  const sugs = $('#sugs');
  sugs.replaceChildren();
  for (const a of ACTIONS.slice(0, 4)) {
    const b = el('button', 'sug');
    b.type = 'button';
    b.innerHTML = P(ICONS[a.id]); // fixed strings above
    b.append(el('span', '', a.label()));
    b.addEventListener('click', a.run);
    sugs.append(b);
  }
  const more = el('button', 'sug more', MORE.label());
  more.type = 'button';
  more.addEventListener('click', MORE.run);
  sugs.append(more);
  for (const a of ACTIONS) {
    const c = el('button', 'chip', a.label());
    c.type = 'button';
    c.addEventListener('click', a.run);
    rail.append(c);
  }
  for (const k of ['shorter', 'simpler', 'detail']) {
    const f = el('button', 'chip fu', T('chat.fu.' + k));
    f.type = 'button';
    f.addEventListener('click', () => agent.pageDo('ask', T('chat.fu.' + k + '.q')));
    rail.append(f);
  }
  const c = el('button', 'chip', MORE.label());
  c.type = 'button';
  c.addEventListener('click', MORE.run);
  rail.append(c);
}

// The opening state: which page this is, and what stays private.
// The model chip under the prompt box, as in other AI apps: what answers, where it runs, and a menu to change it.
function setModel(m) {
  const b = $('#modelbtn');
  b.dataset.kind = !m.ready ? 'none' : m.remote ? 'remote' : 'local';
  $('#mname').textContent = !m.ready ? T('pg.hero.none') : (m.model || T('pg.hero.local')) + (m.remote ? ' · ' + m.remote : '');
  b.dataset.tip = !m.ready ? T('pg.hero.none') : m.remote ? T('pg.hero.remote', { host: m.remote }) : T('pg.hero.local', { model: m.model });
  b.title = b.dataset.tip;
}
$('#modelbtn').addEventListener('click', () => { const r = $('#modelbtn').getBoundingClientRect(); agent.modelMenu(r.left, r.top); });
agent.onModel(setModel);

function fillHero(s) {
  const p = s.page || {};
  const host = p.host || '';
  $('#pf').textContent = (host || '?').charAt(0).toUpperCase();
  $('#pt').textContent = p.title || host;
  $('#ph').textContent = host;
  $('#pagechip').hidden = true;
  $('#herotitle').textContent = T('pg.hero.h');
  setTimeout(() => { const q = $('#askq'); if (q && !$('#composer').hidden) q.focus(); }, 60);
  setModel({ ready: !!s.modelReady, model: s.model, remote: s.remote });
  const trust = $('#trust');
  trust.className = 'trust ' + (!s.modelReady ? 'none' : s.remote ? 'remote' : 'local');
  trust.textContent = !s.modelReady ? T('pg.hero.none') : s.remote ? T('pg.hero.remote', { host: s.remote }) : T('pg.hero.local', { model: s.model });
}

function setMode(page) {
  $('#home').hidden = !page || msgs.size > 0;
  $('#thread').hidden = !page;
  $('#composer').hidden = !page;
  $('#rail').hidden = msgs.size === 0;
  for (const id of ['steps', 'box']) $('#' + id).hidden = page;
  if (page) { $('.note').style.display = 'none'; $('.sim').style.display = 'none'; }
}

function reset() {
  msgs.clear();
  $('#thread').replaceChildren();
  lastSeq = 0;
}

function bottom() { const f = $('#feed'); f.scrollTop = f.scrollHeight; }

// One message per action: a card that is filled in as the work progresses.
function msgFor(s) {
  let m = msgs.get(s.seq);
  if (m) return m;
  const root = el('article', 'msg');
  if (s.mode === 'ask' && s.question) root.append(el('div', 'me', s.question));
  const card = el('div', 'card');
  root.append(card);
  $('#thread').append(root);
  m = { root, card };
  msgs.set(s.seq, m);
  return m;
}

const TITLE = { act: () => T('act.title'), summarize: () => T('pg.summary'), translate: () => T('pg.translate'), ask: () => T('pg.answer'), sel: () => T('ai.result') };

function head(s, copyText) {
  const h = el('div', 'ch');
  h.innerHTML = P(ICONS[s.mode === 'sel' ? 'ask' : s.mode] || ICONS.ask); // fixed strings above
  h.append(document.createTextNode((TITLE[s.mode] || TITLE.sel)()));
  h.append(el('span', 'sp'));
  if (copyText) {
    const c = el('button', 'cp', T('act.copy'));
    c.type = 'button';
    c.addEventListener('click', () => { agent.copy(copyText); c.textContent = T('act.copied'); setTimeout(() => { c.textContent = T('act.copy'); }, 1600); });
    h.append(c);
  }
  return h;
}

// AI-10: shown above the result when the page tried to give the assistant orders.
function safetyNote(r) {
  const flagged = (r.flagged && r.flagged.length) || r.hiddenFlagged;
  if (!flagged) return null;
  const w = el('div', 'warnbox');
  w.setAttribute('role', 'alert');
  w.append(el('b', '', T('safe.title')), el('p', '', T('safe.body')));
  const quote = (r.flagged && r.flagged[0] && r.flagged[0].excerpt) || r.hiddenExcerpt;
  if (quote) w.append(el('blockquote', '', quote));
  if (r.hiddenFlagged) w.append(el('p', '', T('safe.hidden')));
  return w;
}

function body(s) {
  const b = el('div', 'cb');
  const extra = [];
  if (s.state === 'working' && s.mode === 'act') {
    const ol = el('ol', 'actsteps');
    for (const x of s.steps || []) ol.append(el('li', '', x.text));
    if (ol.children.length) b.append(ol);
    const w = el('div', 'wait'); const d = el('span', 'dots'); d.append(el('i'), el('i'), el('i')); w.append(d, el('span', '', T('act.working')));
    const stop = el('button', 'small', T('act.stop')); stop.type = 'button'; stop.addEventListener('click', () => agent.actStop()); w.append(stop);
    b.append(w);
    return { b, copy: '' };
  }
  if (s.state === 'working') {
    if (s.mode === 'translate' && s.total) {
      b.append(el('p', '', T('pg.translating', { done: s.done, total: s.total })));
      const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = Math.round((s.done / s.total) * 100) + '%'; bar.append(fill); b.append(bar);
    } else {
      const w = el('div', 'wait');
      const d = el('span', 'dots'); d.append(el('i'), el('i'), el('i'));
      w.append(d, el('span', '', T('pg.working')));
      b.append(w);
    }
    return { b, copy: '' };
  }
  if (s.state === 'error' && s.mode === 'act') {
    const ol = el('ol', 'actsteps');
    for (const x of s.steps || []) ol.append(el('li', x.result === 'declined' || x.result === 'blocked' ? 'no' : '', x.text));
    if (ol.children.length) b.append(ol);
    b.append(el('p', 'err', T(s.error) + (s.detail ? ' (' + s.detail + ')' : '')));
    return { b, copy: '' };
  }
  if (s.state === 'error') { b.append(el('p', 'err', T(s.error, { lang: s.target || '' }))); return { b, copy: '' }; }
  let copy = '';
  if (s.mode === 'act') {
    // Operating the page: the steps so far, then the answer. Every press is listed, so nothing happens out of sight.
    const ol = el('ol', 'actsteps');
    for (const x of s.steps || []) { const li = el('li', x.result === 'blocked' || x.result === 'declined' ? 'no' : ''); li.append(el('span', '', x.text)); if (x.result && !['clicked', 'typed', 'selected', 'scrolled', 'pressed'].includes(x.result)) li.append(el('small', '', ' · ' + x.result)); ol.append(li); }
    if (ol.children.length) b.append(ol);
    if (s.answer) { b.append(el('p', 'actans', s.answer)); copy = s.answer; if (s.evidence) b.append(el('blockquote', '', s.evidence)); }
    if (s.tokens) extra.push(T('pg.tokens', { i: s.tokens.in.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US'), o: s.tokens.out.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') }));
    if (s.remote) extra.push(T('pg.sentTo', { host: s.remote }));
    if (extra.length) { const m = el('div', 'metas'); for (const t of extra) m.append(el('span', 'fine', t)); b.append(m); }
    return { b, copy };
  }
  if (s.mode === 'sel') { b.append(el('p', '', s.answer)); b.firstChild.style.whiteSpace = 'pre-wrap'; copy = s.answer; }
  else if (s.mode === 'summarize') {
    const ul = el('ul', 'pts');
    for (const x of s.bullets) ul.append(el('li', '', x));
    b.append(ul);
    copy = s.bullets.map((x) => '- ' + x).join('\n');
    extra.push(s.ai ? T('pg.byModel', { m: s.model }) : T('pg.extractive'));
  } else if (s.mode === 'ask' && s.srcs) {
    // Answer drawn from several pages: numbers in the text lead to the page each claim came from.
    if (!s.found) b.append(el('p', '', T('pg.nofind')));
    else {
      if (s.answer) {
        const p = el('p', 'cited');
        for (const part of s.answer.split(/(\[\d{1,2}\])/)) {
          const m = /^\[(\d{1,2})\]$/.exec(part);
          const src = m && s.srcs[Number(m[1]) - 1];
          if (src) { const a = el('button', 'cite', m[1]); a.type = 'button'; a.title = src.title; a.addEventListener('click', () => agent.chats.goto(src.url)); p.append(a); } else p.append(document.createTextNode(part));
        }
        b.append(p);
        copy = s.answer.replace(/\[\d{1,2}\]/g, '');
      }
      const list = el('ol', 'srcs');
      for (const x of s.srcs) {
        const li = el('li', (s.cites || []).includes(x.n) ? 'used' : '');
        const a = el('button', 'sl2');
        a.type = 'button';
        a.append(el('b', '', x.title), el('small', '', x.host));
        a.addEventListener('click', () => agent.chats.goto(x.url));
        li.append(a);
        if (!s.answer && x.passage) li.append(el('p', 'pass', x.passage.slice(0, 200)));
        list.append(li);
      }
      b.append(el('p', 'fine ln', T('pg.sources')), list);
      if (s.ai) extra.push(T('pg.byModel', { m: s.model }));
    }
  } else if (s.mode === 'ask') {
    if (!s.found) b.append(el('p', '', T('pg.nofind')));
    else {
      if (s.answer) { b.append(el('p', '', s.answer)); copy = s.answer; }
      const q = el('blockquote', s.passages[0].length > 280 ? 'fold' : '', s.passages[0]);
      b.append(el('p', 'fine', T('pg.fromPage')), q);
      if (q.classList.contains('fold')) {
        const more = el('button', 'more', T('pg.foldMore'));
        more.type = 'button';
        more.addEventListener('click', () => { const f = q.classList.toggle('fold'); more.textContent = T(f ? 'pg.foldMore' : 'pg.less'); });
        b.append(more);
      }
      const show = el('button', 'small', T('pg.showInPage'));
      show.type = 'button';
      show.addEventListener('click', () => agent.pageShow(s.passages[0].slice(0, 80)));
      b.append(show);
      if (s.ai) extra.push(T('pg.byModel', { m: s.model }));
    }
  } else if (s.mode === 'translate') {
    b.append(el('p', '', T('pg.translated', { n: s.translated, lang: s.target })));
    const seg = el('div', 'seg');
    for (const v of ['both', 'translation', 'original']) {
      const x = el('button', '', T('pg.view.' + v));
      x.type = 'button';
      x.setAttribute('aria-pressed', String(v === 'both'));
      x.addEventListener('click', () => { agent.pageView(v); seg.querySelectorAll('button').forEach((y) => y.setAttribute('aria-pressed', String(y === x))); });
      seg.append(x);
    }
    b.append(seg);
  }
  if (s.remote && (s.ai || s.mode === 'translate')) extra.push(T('pg.sentTo', { host: s.remote }));
  if (s.tokens) extra.push(s.tokens.cached ? T('pg.cached') : T('pg.tokens', { i: s.tokens.in.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US'), o: s.tokens.out.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') }));
  if (s.safety) {
    const w = safetyNote(s.safety);
    if (w) b.prepend(w);
    const n = s.safety.invisible || 0;
    if (n) extra.push(T('safe.cleaned', { n }));
  }
  // The model ran out of room: say so and offer to carry on, instead of leaving a cut answer looking finished.
  if (s.cut) {
    const n = el('div', 'cutnote');
    n.append(el('span', '', T('pg.cut')));
    const go = el('button', 'small', T('pg.cutGo'));
    go.type = 'button';
    go.addEventListener('click', () => agent.pageDo('ask', T('pg.cutGo.q')));
    n.append(go);
    b.append(n);
  }
  if (extra.length) { const m = el('div', 'metas'); for (const t of extra) m.append(el('span', 'fine', t)); b.append(m); }
  return { b, copy };
}

function renderPage(s) {
  if (s.reset) reset();
  setTitle(T('pg.title'), s.page ? s.page.host : '');
  if (s.state === 'idle') fillHero(s);
  if (s.state !== 'idle') {
    const m = msgFor(s);
    const { b, copy } = body(s);
    m.card.replaceChildren(head(s, copy), b);
    lastSeq = s.seq;
  }
  setMode(true);
  if (s.state !== 'idle') { bottom(); } else $('#feed').scrollTop = 0;
  if (!$('#composer').hidden && s.state === 'idle') $('#askq').focus();
}

// A page's whole conversation arrives at once: when the tab or page in front changes, or the panel is opened.
// The pages this conversation reads: one chip each. The tab in front is offered as a dashed chip until something is asked about it.
function paintSources(list) {
  const row = $('#srcrow');
  row.replaceChildren();
  row.hidden = !list || list.length === 0 || (list.length === 1 && list[0].ghost);
  for (const c of list || []) {
    const chip = el('span', 'src' + (c.current ? ' cur' : '') + (c.ghost ? ' ghost' : '') + (c.open ? '' : ' shut'));
    const b = el('button', 'sb');
    b.type = 'button';
    b.append(el('i', 'sl', (c.host || '?').charAt(0).toUpperCase()), el('span', 'st', c.title || c.host));
    b.title = c.ghost ? T('src.add', { host: c.host }) : c.open ? c.title : T('src.reopen', { host: c.host });
    b.addEventListener('click', () => (c.ghost ? agent.chats.addHere() : agent.chats.goto(c.key)));
    chip.append(b);
    if (!c.ghost) { const x = el('button', 'sx', '×'); x.type = 'button'; x.setAttribute('aria-label', T('src.drop')); x.addEventListener('click', () => agent.chats.drop(c.key)); chip.append(x); }
    row.append(chip);
  }
  row.hidden = row.children.length === 0 || (list.length === 1 && list[0].ghost);
}
agent.onCtx((c) => { setTitle(T('pg.title'), c.page ? c.page.host : ''); paintSources(c.sources); });

agent.onThread((t) => {
  lang = t.lang || lang; LORE_I18N.apply(lang);
  paintSources(t.sources);
  showHistory(false);
  reset();
  const base = { page: t.page, model: t.model, remote: t.remote };
  last = { fn: renderPage, s: { state: 'idle', ...base, modelReady: t.modelReady } };
  if (!t.states.length) return renderPage({ state: 'idle', seq: 0, ...base, modelReady: t.modelReady });
  setModel({ ready: t.modelReady, model: t.model, remote: t.remote });
  for (const s of t.states) renderPage({ ...s, reset: false });
  setTitle(T('pg.title'), t.page ? t.page.host : '');
  setMode(true);
  $('#feed').scrollTop = $('#feed').scrollHeight;
});
agent.onPage((s) => { lang = s.lang || lang; LORE_I18N.apply(lang); last = { fn: renderPage, s }; renderPage(s); });
// "Operate": the next prompt is carried out on the page (press, choose, scroll) instead of answered from its text.
let actOn = false;
function setAct(on) { actOn = on; $('#actbtn').setAttribute('aria-pressed', String(on)); $('#askq').placeholder = T(on ? 'act.ph' : 'pg.askph'); }
$('#actbtn').addEventListener('click', () => { setAct(!actOn); $('#askq').focus(); });
$('#askform').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#askq').value.trim(); if (!q) return; $('#askq').value = ''; agent.pageDo(actOn ? 'act' : 'ask', q); if (actOn) setAct(false); });

agent.onState((s) => { setMode(false); last = { fn: render, s }; $('.note').style.display = ''; $('.sim').style.display = ''; render(s); });
agent.onDl((s) => { setMode(false); last = { fn: renderDl, s }; $('.note').style.display = 'none'; $('.sim').style.display = 'none'; renderDl(s); });
agent.onLang((l) => { lang = l; LORE_I18N.apply(lang); fillActions(); });
$('#close').addEventListener('click', () => agent.close());
LORE_I18N.apply(lang);
fillActions();

// History: every saved conversation, newest first. Opening one goes to its page.
function showHistory(on) {
  $('#hist').hidden = !on;
  $('#histbtn').setAttribute('aria-pressed', String(on));
  if (on) { $('#home').hidden = true; $('#thread').hidden = true; } else { $('#thread').hidden = false; $('#home').hidden = msgs.size > 0; }
}
async function paintHistory() {
  const list = await agent.chats.list();
  const ul = $('#histlist');
  ul.replaceChildren();
  $('#hist-empty').hidden = list.length > 0;
  for (const c of list) {
    const li = el('li', 'hrow');
    const open = el('button', 'hopen');
    open.type = 'button';
    open.append(el('b', '', c.title), el('small', '', [c.host, new Date(c.ts).toLocaleDateString(lang === 'vi' ? 'vi-VN' : undefined, { day: 'numeric', month: 'short' }), T('chat.count', { n: c.count })].join(' · ')));
    if (c.preview) open.append(el('span', 'pv', c.preview));
    open.addEventListener('click', () => { agent.chats.open(c.key); showHistory(false); });
    const del = el('button', 'hdel', '×');
    del.type = 'button';
    del.setAttribute('aria-label', T('chat.delete'));
    del.addEventListener('click', () => { agent.chats.remove(c.key); li.remove(); $('#hist-empty').hidden = ul.children.length > 0; });
    li.append(open, del);
    ul.append(li);
  }
}
$('#histbtn').addEventListener('click', () => { const on = $('#hist').hidden; showHistory(on); if (on) paintHistory(); });
$('#newchat').addEventListener('click', () => agent.chats.fresh());
