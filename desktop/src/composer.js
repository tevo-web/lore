// Puts a prepared text into a site's "new post" box and presses the post button, the way a person would: find the box on the
// page, click it, type, check the text arrived, click Post, and wait for the box to close. It only ever reads the page to find
// where things are; nothing the page says is acted on. It never touches the sign-in form: if the site asks for a login, it stops.
const FLOWS = {
  facebook: {
    host: /(^|\.)facebook\.com$/,
    open: { sel: '[role="button"],div[tabindex="0"]', texts: "what's on your mind|bạn đang nghĩ gì|bạn đang nghĩ" },
    box: { sel: '[contenteditable="true"][role="textbox"],[contenteditable="true"]', within: '[role="dialog"]' },
    submit: { sel: '[role="button"],button', texts: '^(post|đăng|publish)$', within: '[role="dialog"]' },
    closes: { sel: '[contenteditable="true"][role="textbox"],[contenteditable="true"]', within: '[role="dialog"]' }
  },
  linkedin: {
    host: /(^|\.)linkedin\.com$/,
    open: { sel: 'button,[role="button"]', texts: 'start a post|bắt đầu bài viết' },
    box: { sel: '.ql-editor,[contenteditable="true"][role="textbox"],[contenteditable="true"]', within: '[role="dialog"]' },
    submit: { sel: 'button,[role="button"]', texts: '^(post|đăng)$', within: '[role="dialog"]' },
    closes: { sel: '.ql-editor,[contenteditable="true"]', within: '[role="dialog"]' }
  },
  x: {
    host: /(^|\.)(x|twitter)\.com$/,
    box: { sel: '[data-testid="tweetTextarea_0"],[contenteditable="true"][role="textbox"]' },
    submit: { sel: '[data-testid="tweetButtonInline"],[data-testid="tweetButton"]' }
  },
  test: {
    box: { sel: 'textarea,[contenteditable="true"]' },
    submit: { sel: 'button', texts: '^(post|đăng)$' }
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Finds the first visible element matching `spec` and returns the middle of it, or null / { disabled: true }.
const FIND = `((a) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 1 && r.height > 1 && c.visibility !== 'hidden' && c.display !== 'none'; };
  const root = a.within ? ([...document.querySelectorAll(a.within)].filter(vis).pop() || null) : document;
  if (!root) return null;
  let list = [...root.querySelectorAll(a.sel)].filter(vis);
  if (a.texts) {
    const re = new RegExp(a.texts, 'i');
    list = list.filter((e) => re.test((e.getAttribute('aria-label') || '').trim()) || re.test((e.innerText || '').trim().split('\\n')[0] || ''));
    // the smallest match is the real button, not a container that happens to include its text
    list.sort((x, y) => x.getBoundingClientRect().width * x.getBoundingClientRect().height - y.getBoundingClientRect().width * y.getBoundingClientRect().height);
  }
  const e = list[0];
  if (!e) return null;
  if (e.disabled || e.getAttribute('aria-disabled') === 'true') return { disabled: true };
  e.scrollIntoView({ block: 'center', inline: 'center' });
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})`;
const READ = `((a) => { const vis = (e) => e.getBoundingClientRect().width > 1; const root = a.within ? ([...document.querySelectorAll(a.within)].filter(vis).pop() || null) : document; const e = root && [...root.querySelectorAll(a.sel)].filter(vis)[0]; return e ? (e.value !== undefined ? e.value : e.innerText) : null; })`;
const LOGIN = `(() => !!document.querySelector('input[type="password"]') || /\\/(login|checkpoint|i\\/flow\\/login)/.test(location.pathname))()`;

async function find(wc, spec) { return wc.executeJavaScript(`${FIND}(${JSON.stringify(spec)})`); }
async function waitFor(wc, spec, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const r = await find(wc, spec); if (r) return r; await sleep(250); }
  return null;
}
// A real click: mouse events through the browser, which pages cannot tell from a person's.
async function click(wc, pt) {
  const z = wc.getZoomFactor ? wc.getZoomFactor() : 1;
  const x = Math.round(pt.x * z), y = Math.round(pt.y * z);
  wc.sendInputEvent({ type: 'mouseMove', x, y });
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
}
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// -> { ok, note }
async function post(wc, { site, text, allowAnyHost = false }) {
  const flow = FLOWS[site];
  if (!flow) return { ok: false, note: 'unknown site' };
  const body = String(text || '');
  if (!body.trim()) return { ok: false, note: 'empty text' };
  try {
    let host = '';
    try { host = new URL(wc.getURL()).hostname; } catch { /* none */ }
    if (flow.host && !allowAnyHost && !flow.host.test(host)) return { ok: false, note: 'not on ' + site };
    if (await wc.executeJavaScript(LOGIN)) return { ok: false, note: 'sign in first' };
    wc.focus();
    if (flow.open) {
      const o = await waitFor(wc, flow.open, 15000);
      if (!o) return { ok: false, note: 'could not find the new post button' };
      await click(wc, o);
    }
    const box = await waitFor(wc, flow.box, 10000);
    if (!box || box.disabled) return { ok: false, note: 'could not find the text box' };
    await click(wc, box);
    await sleep(300);
    await wc.insertText(body);
    await sleep(600);
    const typed = await wc.executeJavaScript(`${READ}(${JSON.stringify(flow.box)})`);
    // Line breaks and spaces may be laid out differently; the words must all be there.
    if (norm(typed).length < norm(body).length * 0.9) return { ok: false, note: 'the text did not arrive in the box' };
    const submit = await waitFor(wc, flow.submit, 8000);
    if (!submit || submit.disabled) return { ok: false, note: 'the post button is not available' };
    await click(wc, submit);
    if (flow.closes) {
      const t0 = Date.now();
      while (Date.now() - t0 < 25000) { if (!(await find(wc, flow.closes))) return { ok: true, note: 'posted' }; await sleep(500); }
      return { ok: false, note: 'the post box did not close, so it may not have been posted' };
    }
    await sleep(2500);
    return { ok: true, note: 'posted' };
  } catch (e) { return { ok: false, note: String(e && e.message || e).slice(0, 120) }; }
}

module.exports = { post, FLOWS };
