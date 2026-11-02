// The tab preload asks for ad-removal scripts and runs them in the page before the page's own code.
const { app, BrowserWindow, ipcMain } = require('electron');
app.setPath('userData', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'lore-e2e-')));
const assert = require('node:assert');
const http = require('http');
const path = require('path');

const PAGE = '<!doctype html><title>t</title><script>window.__seenFirst = window.__loreAd === 1;</script>';
app.whenReady().then(async () => {
  const srv = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  let asked = '';
  ipcMain.on('ads:scripts', (e) => { asked = e.senderFrame.url; e.returnValue = ['window.__loreAd = 1;']; });
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, '..', 'src', 'tab-preload.js') } });
  try {
    await win.loadURL(base);
    assert.strictEqual(asked, base, 'the preload asked for the scripts of this page');
    assert.strictEqual(await win.webContents.executeJavaScript('window.__seenFirst'), true, 'the script ran before the page code');
    console.log('adscripts ok');
    app.exit(0);
  } catch (e) { console.log('adscripts FAILED', e); app.exit(1); }
});
