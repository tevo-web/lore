const $ = (s) => document.querySelector(s);
const lang = new URLSearchParams(location.search).get('lang') === 'vi' ? 'vi' : 'en';
const T = (k, v) => LORE_I18N.t(lang, k, v);
LORE_I18N.apply(lang);
document.title = T('auto.title');
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const hm = (t) => new Date(t).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : undefined, { hour: '2-digit', minute: '2-digit' });
let items = [];
let testMode = false;

function status(a) {
  if (!a.approved) return ['wait', T('auto.st.wait')];
  if (a.runCount >= a.drafts.length) return ['stop', T('auto.st.done')];
  if (!a.enabled) return ['stop', a.fails >= 3 ? T('auto.st.failed') : T('auto.st.paused')];
  if (a.state && a.state.at) return ['on', T('auto.st.next', { time: hm(a.state.at) })];
  return ['on', T('auto.st.running')];
}

function card(a) {
  const c = h('section', 'card');
  const top = h('div', 'top');
  const [cls, text] = status(a);
  top.append(h('h2', '', a.name), h('span', 'chip', a.site), h('span', 'chip ' + cls, text));
  c.append(top);
  c.append(h('p', '', T('auto.sched', { every: a.schedule.minutes || 0, from: hm(a.startAt), to: hm(a.until || a.startAt), posted: a.runCount, total: a.drafts.length })));
  const m = h('div', 'meter'); const f = h('i'); f.style.width = Math.round((a.runCount / a.drafts.length) * 100) + '%'; m.append(f); c.append(m);

  const list = h('div', 'drafts');
  const areas = [];
  a.drafts.forEach((t, i) => {
    const row = h('div', 'd' + (i < a.runCount ? ' posted' : ''));
    row.append(h('span', 'n', i < a.runCount ? '✓' : String(i + 1)));
    const ta = h('textarea'); ta.value = t; ta.readOnly = i < a.runCount; ta.setAttribute('aria-label', T('auto.draftN', { n: i + 1 }));
    areas.push(ta); row.append(ta); list.append(row);
  });
  c.append(list);

  const acts = h('div', 'acts');
  const btn = (label, cls, fn) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); acts.append(b); return b; };
  const save = btn(T('auto.save'), '', async () => { const r = await autos.edit(a.id, areas.map((x) => x.value)); if (r && r.items) { items = r.items; paint(); } });
  save.hidden = true;
  for (const ta of areas) ta.addEventListener('input', () => { save.hidden = false; });
  if (!a.approved) btn(T('auto.approve'), 'pri', async () => { const r = await autos.approve(a.id); if (r && r.items) { items = r.items; paint(); } });
  else if (a.runCount < a.drafts.length) {
    btn(a.enabled ? T('auto.pause') : T('auto.resume'), '', async () => { const r = await autos.pause(a.id, !a.enabled); if (r && r.items) { items = r.items; paint(); } });
    btn(T('auto.runNow'), '', async () => { const r = await autos.runNow(a.id); if (r && r.items) { items = r.items; paint(); } });
  }
  btn(T('auto.delete'), 'del', async () => { const r = await autos.remove(a.id); if (r && r.items) { items = r.items; paint(); } });
  c.append(acts);
  if (!a.approved) c.append(h('p', 'note', T('auto.needsApproval')));
  else if (a.drafts.length && !a.trusted) c.append(h('p', 'note', T('auto.changed')));

  if (a.runs.length) {
    const runs = h('div', 'runs');
    for (const r of a.runs.slice(-6).reverse()) runs.append(h('div', r.ok ? 'ok' : 'bad', `${hm(r.ts)}  ${r.ok ? T('auto.run.ok', { n: r.n }) : T('auto.run.bad', { why: r.note })}`));
    c.append(runs);
  }
  return c;
}

function paint() {
  const main = $('#main');
  main.replaceChildren();
  const rules = h('div', 'rules'); rules.append(h('b', '', T('auto.rulesH') + ' '), document.createTextNode(T('auto.rules')));
  main.append(rules);
  for (const a of items) main.append(card(a));
  if (!items.some((a) => a.site === 'facebook')) {
    const t = h('section', 'card tpl');
    t.append(h('h2', '', T('auto.tplName')), h('p', '', T('auto.tplDesc')));
    const b = h('button', 'btn pri', T('auto.tplMake')); b.type = 'button';
    b.addEventListener('click', async () => { const r = await autos.template(); if (r && r.items) { items = r.items; paint(); } else if (r && r.error) { b.textContent = T('auto.tplLate'); b.disabled = true; } });
    t.append(b);
    main.append(t);
  }
}

autos.onUpdate((x) => { items = x; paint(); });
autos.list().then((r) => { items = r.items; testMode = r.test; paint(); });
setInterval(async () => { const r = await autos.list(); items = r.items; if (!document.activeElement || document.activeElement.tagName !== 'TEXTAREA') paint(); }, 20000);
window.__autosTest = { create: (spec) => autos.testCreate(spec).then((r) => { if (r) { items = r.items; paint(); } return r; }) };
