// PRV-03 cookie banners, PRV-10 fingerprint protection, AI-04 translation page scripts.
const { app, BrowserWindow, ipcMain } = require('electron');
ipcMain.on('ads:scripts', (e) => { e.returnValue = []; }); // the tab preload asks for these synchronously
app.setPath('userData', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'lore-e2e-')));
const assert = require('node:assert');
const path = require('path');
const { cookieBannerScript } = require('../src/cookiebanner');
const pageassist = require('../src/pageassist');

const fx = (n) => path.join(__dirname, 'fixtures', n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  let code = 0;
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    const run = (s) => win.webContents.executeJavaScriptInIsolatedWorld(1002, [{ code: s }]);
    const main = (s) => win.webContents.executeJavaScript(s);

    // --- a banner with a reject button: rejected, never accepted, scroll restored, unrelated fixed widgets untouched
    await win.loadFile(fx('banner-generic.html'));
    await run(cookieBannerScript);
    await wait(900);
    assert.strictEqual(await main('window.rejected === true'), true, 'reject was clicked');
    assert.strictEqual(await main('window.accepted === true'), false, 'accept was never clicked');
    assert.strictEqual(await main('!!document.getElementById("chat")'), true, 'chat widget left alone');
    assert.strictEqual(await main('getComputedStyle(document.documentElement).overflow'), 'auto', 'scroll lock removed');

    // --- a banner without a reject button is hidden, not accepted (also works in Vietnamese)
    await win.loadFile(fx('banner-noreject.html'));
    await run(cookieBannerScript);
    await wait(900);
    assert.strictEqual(await main('window.accepted === true'), false);
    assert.strictEqual(await main('getComputedStyle(document.getElementById("banner")).display'), 'none');

    // --- a known consent platform
    await win.loadFile(fx('banner-onetrust.html'));
    await run(cookieBannerScript);
    await wait(900);
    assert.strictEqual(await main('window.rejected === true && window.accepted !== true'), true);

    // --- translation scripts: collect, apply with textContent only, switch views
    await win.loadFile(path.join(__dirname, 'fixtures', 'article.html'));
    const { blocks } = await win.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code: pageassist.COLLECT_SCRIPT }]);
    assert.ok(blocks.length >= 2 && !blocks.some((b) => /Trang chủ/.test(b.text)), 'collected body paragraphs, not the nav');
    const map = { [blocks[0].i]: '<img src=x onerror=alert(1)>Xin chào', [blocks[1].i]: 'Tạm biệt' };
    await win.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code: pageassist.applyScript(map) }]);
    assert.strictEqual(await main('document.querySelectorAll("[data-lore-tr]").length'), 2);
    assert.strictEqual(await main('document.querySelector("[data-lore-tr] img")'), null, 'translation is text, never markup');
    await win.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code: pageassist.viewScript('translation') }]);
    assert.strictEqual(await main('getComputedStyle(document.querySelector("[data-lore-i=\\"1\\"]")).display'), 'none');
    await win.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code: pageassist.viewScript('original') }]);
    assert.strictEqual(await main('getComputedStyle(document.querySelector("[data-lore-tr]")).display'), 'none');
    assert.strictEqual(await main('getComputedStyle(document.querySelector("[data-lore-i=\\"1\\"]")).display'), 'block');

    // --- fingerprint protection from the real preload
    const fp = (on) => new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true, preload: path.join(__dirname, '..', 'src', 'tab-preload.js'), additionalArguments: on ? ['--lore-fp=1'] : [] } });
    const probe = `(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 20; const x = c.getContext('2d'); x.fillStyle = '#4726B8'; x.fillRect(0, 0, 60, 20); x.fillStyle = '#fff'; x.fillText('Lore', 4, 14);
      return { cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory, langs: navigator.languages.length, png: c.toDataURL().slice(0, 22), hash: c.toDataURL().length + ':' + c.toDataURL().slice(-40) } })()`;
    const off = fp(false); await off.loadFile(fx('banner-noreject.html')); const base = await off.webContents.executeJavaScript(probe);
    const on1 = fp(true); await on1.loadFile(fx('banner-noreject.html')); const a = await on1.webContents.executeJavaScript(probe);
    const on2 = fp(true); await on2.loadFile(fx('banner-noreject.html')); const b = await on2.webContents.executeJavaScript(probe);
    await on1.loadFile(fx('early.html'));
    assert.strictEqual(await on1.webContents.executeJavaScript('window.early'), 4, 'override is in place before page scripts run');
    assert.strictEqual(a.cores, 4); assert.strictEqual(a.mem, 8); assert.strictEqual(a.langs, 1);
    assert.strictEqual(a.png, 'data:image/png;base64,', 'canvas still exports');
    assert.notStrictEqual(a.hash, b.hash, 'canvas output differs between page loads');
    assert.strictEqual(typeof base.cores, 'number');

    console.log('features ok');
  } catch (e) { console.error('features FAILED', e); code = 1; }
  app.exit(code);
});
