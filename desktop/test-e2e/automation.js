// The posting driver against a stand-in page that works like a social site's composer: a "What's on your mind?" button opens a
// dialog with a rich-text box and a Post button that stays off until there is text. Nothing leaves this computer.
const { app, BrowserWindow } = require('electron');
app.setPath('userData', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'lore-e2e-')));
const assert = require('node:assert');
const http = require('http');
const composer = require('../src/composer');

const PAGE = `<!doctype html><meta charset="utf-8"><title>Feed</title><body style="font:16px sans-serif;margin:30px">
<div role="button" tabindex="0" id="photo" style="display:inline-block;padding:10px;border:1px solid #ccc">Photo/video</div>
<div role="button" tabindex="0" id="open" style="margin:20px 0;padding:14px;border:1px solid #ccc;width:420px">What's on your mind, Linh?</div>
<script>
document.getElementById('open').addEventListener('click', () => {
  if (document.querySelector('[role=dialog]')) return;
  const d = document.createElement('div'); d.setAttribute('role', 'dialog');
  d.style.cssText = 'position:fixed;left:200px;top:120px;width:480px;height:300px;background:#fff;border:1px solid #888;padding:16px';
  d.innerHTML = '<div contenteditable="true" role="textbox" aria-label="What\\'s on your mind?" style="min-height:120px;border:1px solid #eee"></div><div role="button" aria-label="Post" aria-disabled="true" tabindex="0" id="post" style="margin-top:20px;padding:8px 16px;background:#ddd;display:inline-block">Post</div>';
  document.body.append(d);
  const box = d.querySelector('[contenteditable]'), post = d.querySelector('#post');
  box.addEventListener('input', () => { post.setAttribute('aria-disabled', box.innerText.trim() ? 'false' : 'true'); });
  post.addEventListener('click', () => { if (post.getAttribute('aria-disabled') === 'true') return; fetch('/posted', { method: 'POST', body: box.innerText }).then(() => d.remove()); });
});
</script>`;

app.whenReady().then(async () => {
  const got = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/posted') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push(b); res.end('ok'); }); return; }
    res.setHeader('content-type', 'text/html'); res.end(PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  let code = 0;
  try {
    const win = new BrowserWindow({ show: true, width: 900, height: 700, webPreferences: { backgroundThrottling: false } });
    await win.loadURL(base);
    const text = 'Lore: trình duyệt nhớ bạn, và chỉ mình bạn.\nMiễn phí, mã nguồn mở.\n\nhttps://tevo-web.github.io/lore/ #Lore';
    // the real flow, on a page that is not the real site: only the host check is switched off
    const r = await composer.post(win.webContents, { site: 'facebook', text, allowAnyHost: true });
    assert.deepStrictEqual(r, { ok: true, note: 'posted' }, JSON.stringify(r));
    assert.strictEqual(got.length, 1);
    assert.strictEqual(got[0].replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());

    // a second post on a fresh page
    await win.loadURL(base);
    const r2 = await composer.post(win.webContents, { site: 'facebook', text: 'Second post', allowAnyHost: true });
    assert.strictEqual(r2.ok, true, JSON.stringify(r2));
    assert.strictEqual(got.length, 2);

    // refuses to act on a page that is not the site, with no host override
    await win.loadURL(base);
    const wrong = await composer.post(win.webContents, { site: 'facebook', text: 'x' });
    assert.strictEqual(wrong.ok, false);
    assert.match(wrong.note, /not on facebook/);
    assert.strictEqual(got.length, 2, 'nothing was posted');

    // stops at a sign-in page instead of typing anywhere
    await win.loadURL('data:text/html,<input type="password">');
    const login = await composer.post(win.webContents, { site: 'facebook', text: 'x', allowAnyHost: true });
    assert.deepStrictEqual([login.ok, login.note], [false, 'sign in first']);

    // a page without a composer fails cleanly and posts nothing
    await win.loadURL('data:text/html,<p>nothing here</p>');
    const none = await composer.post(win.webContents, { site: 'facebook', text: 'x', allowAnyHost: true });
    assert.strictEqual(none.ok, false);
    assert.strictEqual(got.length, 2);
    console.log('automation ok');
  } catch (e) { console.log('automation FAILED', e); code = 1; }
  server.close();
  app.exit(code);
});
