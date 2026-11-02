// How the agent sees and touches a page. It does not guess pixels: the page's own controls are listed with numbers, the model
// picks a number, and Lore clicks the middle of that control with real mouse events. Nothing the page contains is ever run.
const ELEMENTS_SCRIPT = `(() => {
  const SEL = 'a[href],button,input,select,textarea,summary,label[for],[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[role=treeitem],[role=gridcell],[onclick],[tabindex]:not([tabindex="-1"])';
  const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 3 && r.height > 3 && c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const label = (e) => clean(e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].innerText) || e.innerText || e.placeholder || e.title || e.alt || e.value || '');
  const seen = new Set();
  window.__loreEls = [null];
  const els = [];
  for (const e of document.querySelectorAll(SEL)) {
    if (els.length >= 80) break;
    if (!vis(e)) continue;
    const text = label(e);
    const r = e.getBoundingClientRect();
    const key = e.tagName + '|' + text + '|' + Math.round(r.left / 8) + '|' + Math.round(r.top / 8);
    if (seen.has(key)) continue;
    seen.add(key);
    const id = els.length + 1;
    window.__loreEls[id] = e;
    const tag = e.tagName.toLowerCase();
    els.push({
      id, tag, role: e.getAttribute('role') || '', type: (e.type || '').toLowerCase(), text,
      value: tag === 'select' ? clean(e.options[e.selectedIndex] && e.options[e.selectedIndex].text) : (e.type === 'password' ? '' : clean(e.value)),
      options: tag === 'select' ? [...e.options].slice(0, 40).map((o) => clean(o.text)) : undefined,
      checked: e.checked === true ? true : undefined,
      disabled: !!(e.disabled || e.getAttribute('aria-disabled') === 'true'),
      expanded: e.getAttribute('aria-expanded') || (tag === 'summary' ? String(!!(e.parentElement && e.parentElement.open)) : ''),
      form: !!e.closest('form'),
      href: tag === 'a' ? (() => { try { return new URL(e.href).hostname; } catch { return ''; } })() : '',
      cc: /^(cc-|credit)/.test(e.autocomplete || '')
    });
  }
  return { url: location.href, title: document.title, scrollY: Math.round(scrollY), maxY: Math.max(0, Math.round(document.documentElement.scrollHeight - innerHeight)), els };
})()`;

const MEASURE = (id) => `(() => { const e = window.__loreEls && window.__loreEls[${Number(id)}]; if (!e || !e.isConnected) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`;
const FOCUS = (id) => `(() => { const e = window.__loreEls && window.__loreEls[${Number(id)}]; if (!e || !e.isConnected) return false; e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) e.select(); return true; })()`;
const SELECT = (id, value) => `(() => { const e = window.__loreEls && window.__loreEls[${Number(id)}]; if (!e || e.tagName !== 'SELECT') return 'not a list'; const want = ${JSON.stringify(String(value))}.trim().toLowerCase(); const o = [...e.options].find((x) => x.text.trim().toLowerCase() === want) || [...e.options].find((x) => x.text.toLowerCase().includes(want)); if (!o) return 'no such option'; e.value = o.value; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`;
const READ_VISIBLE = `(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (!t) continue; const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue; const r = p.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue; const c = getComputedStyle(p); if (c.visibility === 'hidden' || c.display === 'none') continue; out.push(t); } return out.join(' ').slice(0, 2500); })()`;

// Resolves once the page has stopped changing for a moment (or after two seconds), so a read right after a press sees its result.
const QUIET = `new Promise((done) => { let t = setTimeout(fin, 300); const stop = setTimeout(fin, 2000); const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, 300); }); mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); function fin() { mo.disconnect(); clearTimeout(t); clearTimeout(stop); done(true); } })`;
const WORLD = 1006;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (wc, code) => wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]);

// What a driver for one page does; the agent loop only knows this interface.
function pageDriver(wc) {
  const zoom = () => (wc.getZoomFactor ? wc.getZoomFactor() : 1);
  // A short pause between move, press and release lets the page hit-test under the pointer first; without it a click straight after a load can be lost.
  const mouse = async (pt) => {
    const x = Math.round(pt.x * zoom()), y = Math.round(pt.y * zoom());
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    await sleep(60);
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  };
  const settle = async () => {
    await sleep(700);
    const t0 = Date.now();
    while (wc.isLoading() && Date.now() - t0 < 8000) await sleep(200);
    try { await run(wc, QUIET); } catch { await sleep(300); }
  };
  return {
    observe: () => run(wc, ELEMENTS_SCRIPT),
    read: () => run(wc, READ_VISIBLE),
    async shot() {
      try {
        let img = await wc.capturePage();
        const s = img.getSize();
        if (s.width > 1024) img = img.resize({ width: 1024 });
        return img.toJPEG(70).toString('base64');
      } catch { return null; }
    },
    // -> a short sentence about what happened
    async act(a) {
      wc.focus();
      if (a.action === 'click') {
        const pt = await run(wc, MEASURE(a.id));
        if (!pt) return 'that control is gone';
        await mouse(pt); await settle(); return 'clicked';
      }
      if (a.action === 'type') {
        if (!(await run(wc, FOCUS(a.id)))) return 'that control is gone';
        await wc.insertText(String(a.text)); await settle(); return 'typed';
      }
      if (a.action === 'select') { const r = await run(wc, SELECT(a.id, a.value)); await settle(); return r === 'ok' ? 'selected' : r; }
      if (a.action === 'scroll') { await run(wc, `window.scrollBy(0, ${a.direction === 'up' ? -1 : 1} * Math.round(innerHeight * 0.8))`); await sleep(500); return 'scrolled'; }
      if (a.action === 'key') {
        const key = { Enter: 'Enter', Escape: 'Escape', Tab: 'Tab' }[a.key];
        if (!key) return 'key not allowed';
        wc.sendInputEvent({ type: 'keyDown', keyCode: key }); wc.sendInputEvent({ type: 'keyUp', keyCode: key });
        await settle(); return 'pressed';
      }
      return 'nothing to do';
    }
  };
}

module.exports = { pageDriver, ELEMENTS_SCRIPT, READ_VISIBLE, WORLD };
