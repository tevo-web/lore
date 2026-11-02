const { app, BrowserWindow, WebContentsView, ipcMain, net, session, Menu, nativeTheme, safeStorage, shell, dialog, clipboard, systemPreferences, Notification } = require('electron');
// In the CI smoke test an error at start-up must end the run with its stack, not leave an error dialog nobody can see.
// A known bug in the HTTP client that ships with Node (an assertion from inside undici when a server closes a connection) must
// never take the browser down. Other start-up errors in the CI smoke test end the run with their stack; elsewhere they are shown.
const isUndici = (e) => !!e && /undici/.test(String(e.stack)) && /paused/.test(String(e.message));
process.on('uncaughtException', (e) => {
  if (global.__smokeDone || harmless(e)) { if (global.__smokeDone) process.exit(0); return; }
  if (isUndici(e)) { console.error('[net] ignored an undici assertion'); return; }
  if (process.env.LORE_SMOKE) { console.error('LORE_SMOKE_FAIL uncaught: ' + (e && e.stack || e) + ' | stage=' + global.__smokeStage); process.exit(1); }
  console.error(e);
  try { require('electron').dialog.showErrorBox('Lore', String(e && e.message || e)); } catch { /* not ready */ }
});
if (process.env.LORE_SMOKE) {
  process.on('unhandledRejection', (e) => { if (isUndici(e)) return; console.error('LORE_SMOKE_FAIL rejected: ' + (e && e.stack || e) + ' | stage=' + global.__smokeStage); process.exit(1); });
  global.__smokeStage = 'loaded';
  setTimeout(() => { console.error('LORE_SMOKE_FAIL no window after 45 s | stage=' + global.__smokeStage); process.exit(1); }, 45000).unref();
}
// While the window is closing, the page can still send a message (a tooltip hiding, a click) to a handler that looks at the
// window. That "Object has been destroyed" is harmless, so it must not be reported as an error.
const harmless = (e) => /Object has been destroyed/.test(String(e && e.message));
{
  const on = ipcMain.on.bind(ipcMain);
  ipcMain.on = (ch, fn) => on(ch, (...a) => { try { return fn(...a); } catch (e) { if (harmless(e)) return undefined; throw e; } });
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (ch, fn) => handle(ch, async (...a) => { try { return await fn(...a); } catch (e) { if (harmless(e)) return undefined; throw e; } });
}
const stage = (n) => { global.__smokeStage = n; };
const path = require('path');
const fs = require('fs');
const os = require('os');
const { classify, norm, setSearchEngine, searchUrl } = require('./router');
const { createBlocker } = require('./adblock');
const { isAllowedNavigation, isGoogleSignIn, isGoogleSignInRejected } = require('./privacy');
const { hardenSession: harden } = require('./harden');
const { checkUrl, createScamList } = require('./scam');
const { extractionScript } = require('./reader');
const { cookieBannerScript } = require('./cookiebanner');
const pageai = require('./pageai');
const pageassist = require('./pageassist');
const shield = require('./shield');
const { Memory, fileStore, RANGES, isSensitiveHost } = require('./memory');
const { Favicons, toDataUrl } = require('./favicons');
const { createEmbedder } = require('./embedder');
const { answerQuery, answer: wikiAnswer } = require('./answer');
const { createLlm, listLocalModels, pullLocalModel, isLocalHost } = require('./llm');
const { Settings } = require('./settings');
const writing = require('./writing');
const tabstate = require('./tabstate');
const { Bookmarks } = require('./bookmarks');
const { ProfileList, dirFor, partitionFor } = require('./profiles');
const importer = require('./importer');
const updates = require('./update');
const secure = require('./security');
const organize = require('./organize');
const aibookmark = require('./aibookmark');
const recall = require('./recall');
const tabFind = require('./tabfind');
const siteNews = require('./sitenews');
const comparer = require('./compare');
const topics = require('./topics');
const modelplan = require('./modelplan');
const pdftext = require('./pdftext');
const dlname = require('./dlname');
const { PrivacyStats } = require('./pstats');
const aliasLib = require('./alias');
const { SitePerms } = require('./perms');
const pwLib = require('./passwords');
const pagenote = require('./pagenote');
const chats = require('./chats');
const startLib = require('./start');
const autoLib = require('./automations');
const composer = require('./composer');
const visionLib = require('./visionagent');
const observe = require('./observe');
const { featurePosts } = require('./featureposts');
const { budgetFor } = require('./condense');
const nodeCrypto = require('crypto');
const breachLib = require('./breach');
const { DownloadList } = require('./downloads');
const taskLib = require('./tasks');
const { t: tr, resolve } = require('./ui/i18n');
// Node's own fetch (undici) can throw an assertion from deep inside when a TLS server closes the connection in a certain way, and
// that kills the process (seen on Windows). Anything that goes to an https address uses Chromium's network stack instead.
const smartFetch = (u, o) => (String(u).startsWith('https:') ? net.fetch(u, o) : fetch(u, o));
const makeLlm = (cfg) => createLlm(cfg, { fetchImpl: smartFetch });
let settings;
let llm = null;
let settingsWin = null;
let memoryWin = null;
let tasksWin = null;
let taskStore;
let favicons;
const L = () => resolve(settings.get().language, app.getLocale());
const T = (k, v) => tr(L(), k, v);
// Every page we ship learns its language from the query string; this is the only place that loads them.
const loadUi = (wc, file, query = {}) => {
  const tab = tabs.find((x) => x.view.webContents === wc);
  return wc.loadFile(file, { query: { lang: L(), blocked: String(S.blocked), ...(tab && tab.private ? { private: '1' } : {}), ...query } });
};
// The New tab page is built from what is on this computer each time, so it is useful and not the same every time.
function startData(priv) {
  const now = Date.now();
  if (priv) return { private: true };
  const web = (u) => /^https?:/.test(u);
  const seen = new Set();
  const recent = [];
  for (const i of memory && memory.size ? memory.list({ from: now - 3 * 86400000 }) : []) {
    const h = hostOfUrl(i.url).replace(/^www\./, '');
    if (!h || seen.has(h) || !web(i.url)) continue;
    seen.add(h); recent.push({ url: i.url, title: i.title || h, host: h, ts: i.ts });
    if (recent.length === 4) break;
  }
  const icon = (host) => { const f = favicons ? favicons.get(host) : ''; return f && f.length < 3500 ? f : ''; };
  const sites = (memory && memory.size ? startLib.topSites(memory.list({ from: now - 30 * 86400000 })) : []).map((x) => ({ host: x.host, url: x.url, icon: icon(x.host) }));
  const folder = T('rl.folder');
  const reading = bookmarks ? bookmarks.items.filter((b) => b.folder === folder).sort((a, b) => b.ts - a.ts) : [];
  const dlDone = downloads ? downloads.items.find((r) => r.state === 'done' && !r.private && now - r.started < 86400000) : null;
  return {
    recent, sites, chats: chatStore ? chatStore.list().slice(0, 3) : [], closed: closedTabs.items.filter((x) => !x.private).slice(-3).reverse(),
    reading: reading.slice(0, 2), readingCount: reading.length, download: dlDone ? dlDone.name : '', tabs: tabs.filter((t) => !t.isHome && !t.private).length,
    modelReady: !!lastModel.ready || !!(llm && settings.get().provider !== 'off'), week: pstats ? pstats.week().total : null
  };
}
const loadHome = (wc, query = {}) => {
  const q = { ...query };
  if (!q.kind) {
    const tab = tabs.find((x) => x.view.webContents === wc);
    try { q.start = JSON.stringify(startLib.build(startData(!!(tab && tab.private)))); } catch { /* the page falls back to its plain form */ }
  }
  return loadUi(wc, HOME, q);
};
const isOurHome = (url) => url.startsWith('file:') && decodeURI(url).includes('/ui/home.html');
const { AgentRun, WORKFLOWS, match: matchWorkflow } = require('./agent');
const { PageDriver } = require('./driver');
const realWorkflows = require('./workflows').real;
const { classifyResponse, isDeniedSite } = require('./media');
const downloader = require('./downloader');

// The window is a frame (tab list at the left, address bar on top) with the page and the AI panel as cards inside it.
const CHROME_BASE = 52;
const SIDE_FULL = 252, SIDE_RAIL = 72, INSET = 8, RADIUS = 10;
const sideWidth = () => (settings && settings.get().sidebar === 'rail' ? SIDE_RAIL : SIDE_FULL);
const BAR_H = 34; // the bookmarks bar, when it is shown
const chromeHeight = () => CHROME_BASE + (bookmarks && bookmarks.bar ? BAR_H : 0);
const HOME = path.join(__dirname, 'ui', 'home.html');
const TAB_PRELOAD = path.join(__dirname, 'tab-preload.js');

let win;
let nextId = 1;
const tabs = [];
const closedTabs = new tabstate.ClosedTabs();
let sessionStore = null;   // encrypted record of open tabs, for "continue where I left off"
let sessionReady = false;  // false until the saved tabs were reopened, so an empty strip never overwrites them
let sessionTimer = null;
let lastSession = '';
let downloads = null;      // every file saved by the browser (BRW-04)
let downloadsWin = null;
const groups = new Map();  // tab groups: id -> { id, name, color, collapsed }
let nextGroup = 1;
const GROUP_COLORS = ['blue', 'green', 'amber', 'red', 'purple', 'grey'];
let organizeWin = null;
let compareWin = null;
let compareDefault = [];
let split = null;         // { a, b, ratio }: two tabs shown side by side while either one is in front
let splitHandle = null;   // the draggable divider
const SPLIT_GAP = 8;
let welcomeWin = null;
let freshInstall = false;  // nothing of Lore's was on this computer before this run
const pendingUrls = [];      // links from other apps that arrived before the window was ready
let windowReady = false;
let profiles = null;      // the people-sized worlds: work, personal, ...
let pendingEdit = 0;       // the group whose name the strip should start editing
let lastOrganize = null;   // what to put back if the person presses Undo
let bookmarks = null;      // saved pages (BRW-02)
let bookmarksWin = null;
let historyWin = null;
const allowedCert = new Set(); // hosts whose certificate error the user chose to ignore, for this run only
let findView = null;       // the find-in-page bar (BRW-01)
let activeId = null;
const S = { blocked: 0, adsOn: true };
let pstats = null;          // daily privacy counters (PRV-04)
const allowedInsecure = new Set(); // hosts the user chose to open over plain http, for this run only
const upgraded = new Map();        // host -> { orig, ts }: pages Lore sent to https, to explain it if https does not work
const aiOffFor = (url) => settings.get().privacy.aiOff.includes(hostOfUrl(url || '').replace(/^www\./, ''));
// PRV-12: encrypted DNS. 'automatic' uses the DNS provider's secure option when there is one and falls back to normal DNS.
const DOH_SERVERS = { cloudflare: 'https://cloudflare-dns.com/dns-query', quad9: 'https://dns.quad9.net/dns-query' };
function applySearch() { const s = settings.get(); setSearchEngine(s.search, s.searchCustom); }
function applyDoh() {
  const m = settings.get().privacy.doh;
  try {
    app.configureHostResolver(m === 'off' ? { secureDnsMode: 'off' } : DOH_SERVERS[m] ? { secureDnsMode: 'secure', secureDnsServers: [DOH_SERVERS[m]] } : { secureDnsMode: 'automatic' });
  } catch { /* not supported on this system */ }
}
function loadStats() { pstats = new PrivacyStats({ file: statsFile }); S.blocked = pstats.today().blocked; }
function saveStats() { if (pstats) pstats.save(); }
let statsFile = null;
let autoStore;
let chatStore;
let vault;
let perms;
let memory;
let blocker;
let scamList;
const allowedScam = new Set(); // hosts the user chose to open despite a warning, for this run only
const WARNING = path.join(__dirname, 'ui', 'warning.html');
const SIGNIN = path.join(__dirname, 'ui', 'signin.html');
const CERTERR = path.join(__dirname, 'ui', 'certerror.html');
const NETERR = path.join(__dirname, 'ui', 'neterror.html');
// Pages that sit between the user and a destination and may send them onward (warning and sign-in explainer).
const isOurWarning = (url) => url.startsWith('file:') && /\/ui\/(warning|signin|certerror|neterror)\.html/.test(decodeURI(url));
const tabForWc = (id) => tabs.find((t) => t.view.webContents.id === id);
let agentLog;
let panel;          // trusted side panel (own preload); web pages never get this bridge
let run = null;
const PANEL_W = 380;
let dl = null;      // current download session: { tab, state, options, pct, path, error, ctl }
let paSeq = Math.floor(Date.now() / 1000); // unique across runs, so saved messages never collide with new ones
let pa = null;      // page assistant session: { tab, view }
const agentOpen = () => !!run || !!dl || !!pa;

const active = () => tabs.find((t) => t.id === activeId);

// Where the page card sits: right of the tab list, under the address bar, with the AI panel (when open) beside it.
function pageRect(w, h) {
  const pw = agentOpen() ? PANEL_W + SPLIT_GAP : 0;
  const x = sideWidth(), y = chromeHeight();
  return { x, y, width: Math.max(200, w - INSET - pw - x), height: Math.max(200, h - y - INSET) };
}

// ---- Sheets: Settings, Memory, History and the other tools open inside this window, over the page, not in a window of their own ----
// A Sheet looks like a BrowserWindow to the code that opens it (webContents, loadFile, focus, close, 'closed') but is a view drawn
// over the page area. One at a time; choosing a tab, pressing Esc or the × closes it.
const CLOSE_MARK = '[[lore-close]]';
let sheet = null;
const SHEET_CSS = 'body{background:var(--win)!important}main,.shell main{border:0!important;border-radius:0!important;margin:0!important}';
class Sheet {
  constructor({ webPreferences, title = '', name = '' }) {
    this.title = title; this.name = name; this.dead = false; this.closedFns = [];
    if (sheet) sheet.close();
    this.view = new WebContentsView({ webPreferences });
    this.webContents = this.view.webContents;
    this.view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF');
    const wc = this.webContents;
    wc.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'Escape') { e.preventDefault(); this.close(); } });
    wc.on('page-title-updated', (e, t) => { if (t === CLOSE_MARK) { e.preventDefault(); this.close(); } });
    wc.on('did-finish-load', () => {
      wc.insertCSS(SHEET_CSS).catch(() => {});
      wc.executeJavaScript(`(() => { window.close = () => { document.title = ${JSON.stringify(CLOSE_MARK)}; }; })()`).catch(() => {});
    });
    sheet = this;
    win.contentView.addChildView(this.view);
    layout();
    pushState();
  }
  loadFile(f, opts) { return this.webContents.loadFile(f, opts); }
  setTitle() {}
  setMenuBarVisibility() {}
  on(ev, fn) { if (ev === 'closed') this.closedFns.push(fn); }
  isDestroyed() { return this.dead || this.webContents.isDestroyed(); }
  focus() {
    if (this.dead) return;
    if (sheet && sheet !== this) sheet.close();
    sheet = this;
    win.contentView.addChildView(this.view);
    layout();
    this.webContents.focus();
  }
  show() { this.focus(); }
  close() {
    if (this.dead) return;
    this.dead = true;
    if (sheet === this) sheet = null;
    try { if (win && !win.isDestroyed()) pushState(); } catch { /* closing */ }
    try { win.contentView.removeChildView(this.view); } catch { /* not attached */ }
    try { this.webContents.close(); } catch { /* gone */ }
    for (const fn of this.closedFns) { try { fn(); } catch { /* ignore */ } }
    const t = active();
    if (t && win && !win.isDestroyed()) t.view.webContents.focus();
  }
}
const closeSheet = () => { if (sheet) sheet.close(); };

function toggleSidebar() {
  settings.update({ sidebar: settings.get().sidebar === 'rail' ? 'full' : 'rail' });
  layout();
  pushState();
}

function layout() {
  const t = active();
  if (!win || win.isDestroyed() || !t) return;
  const [w, h] = win.getContentSize();
  const pw = agentOpen() ? PANEL_W : 0;
  for (const x of tabs) x.view.setBorderRadius(t.fs ? 0 : RADIUS);
  if (t.fs) { t.view.setBounds({ x: 0, y: 0, width: w, height: h }); return; }
  const r = pageRect(w, h);
  if (splitOn()) {
    const left = Math.round((r.width - SPLIT_GAP) * split.ratio);
    tabById(split.a).view.setBounds({ x: r.x, y: r.y, width: left, height: r.height });
    tabById(split.b).view.setBounds({ x: r.x + left + SPLIT_GAP, y: r.y, width: r.width - SPLIT_GAP - left, height: r.height });
    if (splitHandle) splitHandle.setBounds({ x: r.x + left, y: r.y, width: SPLIT_GAP, height: r.height });
  } else t.view.setBounds(r);
  if (sheet && !sheet.dead) { const q = pageRect(w, h); sheet.view.setBorderRadius(RADIUS); sheet.view.setBounds(q); }
  if (panel && pw) { panel.setBorderRadius(RADIUS); panel.setBounds({ x: w - INSET - pw, y: r.y, width: pw, height: r.height }); }
  layoutFind();
  layoutPriv();
}

function isLoading(tab) {
  const wc = tab.view.webContents;
  return tab.busy || (wc.isLoading() && !wc.getURL().startsWith('file:'));
}

function paintTitleBar(priv) {
  if (process.platform === 'darwin' || !win.setTitleBarOverlay) return;
  const dark = priv || nativeTheme.shouldUseDarkColors;
  win.setTitleBarOverlay({ color: priv ? '#0E0A1C' : dark ? '#090D14' : '#E9ECF0', symbolColor: priv ? '#F1ECFF' : dark ? '#E9EDF3' : '#12161C', height: 40 });
}

// Whatever is typed in the panel: a verb Lore knows runs that action, a writing request opens the writing task, anything else is a question about the page.
// The model chip's menu: local models, the cloud providers that have a key, or off.
async function modelMenu(x, y) {
  const c = settings.get();
  let names = [];
  try { names = await listLocalModels(c.local.url); } catch { /* Ollama not running */ }
  const pick = (patch) => () => {
    try { settings.update(patch); } catch { return openSettings('ai'); }
    llm = makeLlm(settings.get());
    refreshEmbedder();
    pushState();
    modelInfo().then((m) => { if (panel && !panel.webContents.isDestroyed()) panel.webContents.send('model:info', m); });
  };
  const items = names.map((n) => ({ label: n, type: 'radio', checked: c.provider === 'local' && c.local.model === n, click: pick({ provider: 'local', local: { model: n } }) }));
  if (!names.length) items.push({ label: T('mm.noLocal'), enabled: false });
  const cloud = [];
  if (c.openai.key) cloud.push({ label: 'OpenAI · ' + c.openai.model, type: 'radio', checked: c.provider === 'openai', click: pick({ provider: 'openai' }) });
  if (c.mistral.key) cloud.push({ label: 'Mistral · ' + c.mistral.model, type: 'radio', checked: c.provider === 'mistral', click: pick({ provider: 'mistral' }) });
  if (c.gemini.key) cloud.push({ label: 'Gemini · ' + c.gemini.model, type: 'radio', checked: c.provider === 'gemini', click: pick({ provider: 'gemini' }) });
  if (c.anthropic.key) cloud.push({ label: 'Anthropic · ' + c.anthropic.model, type: 'radio', checked: c.provider === 'anthropic', click: pick({ provider: 'anthropic' }) });
  if (cloud.length) items.push({ type: 'separator' }, ...cloud);
  items.push({ type: 'separator' }, { label: T('mm.off'), type: 'radio', checked: c.provider === 'off', click: pick({ provider: 'off' }) }, { type: 'separator' }, { label: T('mm.more'), click: () => openSettings('ai') });
  const b = panel.getBounds();
  Menu.buildFromTemplate(items).popup({ window: win, x: b.x + x, y: b.y + y });
}

function panelPrompt(q) {
  const n = norm(q);
  if (/^(tom tat|summari[sz]e|tl;?dr)\b/.test(n)) return pageAssistant('summarize');
  if (/^(dich|translate)\b/.test(n)) return pageAssistant('translate');
  if (classify(q).kind === 'write') return submit(q);
  return pageAssistant('ask', q);
}

const hostOfUrl = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };

// What the lock area next to the address says: https, http, https with an ignored certificate error, or nothing.
function securityOf(t) {
  if (!t || t.pending || t.isHome) return '';
  const c = secure.connectionOf(t.lazyUrl || t.url);
  return c === 'https' && allowedCert.has(hostOfUrl(t.url)) ? 'cert' : c;
}

function pushState() {
  scheduleSessionSave();
  const t = active();
  if (t) paintTitleBar(!!t.private);
  const wc = t && t.view.webContents;
  win.webContents.send('state', {
    lang: L(),
    side: settings.get().sidebar,
    sheet: sheet && !sheet.dead ? sheet.name : '',
    panel: agentOpen(),
    tabs: tabs.map((x) => ({
      // A page without an icon of its own (or one still loading) uses the one this site had before.
      id: x.id, title: x.title || T(x.private ? 'tab.newPrivate' : 'tab.new'), active: x.id === activeId, favicon: x.favicon || (!x.private && favicons && !x.isHome ? favicons.get(hostOfUrl(x.lazyUrl || x.url)) : ''), home: x.isHome,
      loading: isLoading(x) || !!x.pending, private: x.private, pinned: !!x.pinned, group: x.group || 0, split: split && x.id === split.a ? 'a' : split && x.id === split.b ? 'b' : ''
    })),
    profile: profiles ? { id: profiles.active, name: profiles.current.name, color: profiles.current.color } : null,
    profiles: profiles && profiles.items.length > 1 ? profiles.items.map((p) => ({ id: p.id, name: p.name, color: p.color })) : [],
    editGroup: (() => { const e = pendingEdit; pendingEdit = 0; return e; })(),
    groups: [...groups.values()].filter((g) => tabs.some((x) => x.group === g.id)).map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed })),
    security: securityOf(t),
    starred: !!(t && bookmarks && !t.isHome && bookmarks.find(t.url)),
    bar: bookmarks && bookmarks.bar ? { on: true, items: bookmarks.barItems().map((b) => (b.type === 'link' ? { ...b, icon: favicons ? favicons.get(hostOfUrl(b.url)) : '' } : b)) } : { on: false, items: [] },
    downloads: downloads ? { count: downloads.items.length, active: downloads.active } : { count: 0, active: 0 },
    // While a page is loading, keep showing what the user asked for instead of the old (or empty) address.
    url: t ? t.pending || (!t.isHome ? t.url : (t.errorUrl || '')) : '',
    canBack: !!wc && wc.navigationHistory.canGoBack(),
    canForward: !!wc && wc.navigationHistory.canGoForward(),
    blocked: S.blocked,
    adsOn: S.adsOn,
    media: !!t && !isDeniedSite(t.url) ? t.media.length : 0,
    web: !!t && !t.isHome && /^https?:/.test(t.url)
  });
}

// ---- Session: reopen the tabs of the last run (BRW-05) ---------------------------------------------------------------
function writeSession() {
  if (!sessionStore || !sessionReady) return;
  const snap = tabstate.snapshot(tabs.map((t) => ({ id: t.id, url: t.lazyUrl || t.url, title: t.title, pinned: t.pinned, private: t.private, group: t.group })), activeId, [...groups.values()]);
  const json = JSON.stringify(snap);
  if (json === lastSession) return;
  lastSession = json;
  sessionStore.save(snap);
}
function scheduleSessionSave() {
  if (!sessionReady || sessionTimer) return;
  sessionTimer = setTimeout(() => { sessionTimer = null; writeSession(); }, 1500);
}
function startTabs() {
  const saved = settings.get().startup === 'restore' && sessionStore ? tabstate.restore(sessionStore.load()) : { tabs: [], active: 0 };
  if (saved.tabs.length) {
    groups.clear();
    for (const g of saved.groups || []) { groups.set(g.id, { ...g, color: GROUP_COLORS.includes(g.color) ? g.color : GROUP_COLORS[0] }); nextGroup = Math.max(nextGroup, g.id + 1); }
    const made = saved.tabs.map((s) => openTab({ url: s.url }, { lazy: true, pinned: s.pinned, title: s.title, group: s.group }));
    selectTab(made[saved.active].id);
  } else openTab();
  sessionReady = true;
  if (!windowReady) {
    windowReady = true;
    for (const u of pendingUrls.splice(0)) openLink(u);
    if (freshInstall) { freshInstall = false; setTimeout(() => openWelcome('first'), 400); }
    scheduleUpdateChecks();
    if (process.env.LORE_SMOKE) runSmoke();
  }
}

// CI starts the packaged app with LORE_SMOKE=1: it must open a window, draw the tab strip, load the bundled ad-block engine and
// show the New tab page, within half a minute. A build that cannot do that never reaches a release.
function runSmoke() {
  const fail = (why) => { console.error('LORE_SMOKE_FAIL ' + why); app.exit(1); };
  setTimeout(() => fail('timeout'), 40000).unref();
  const check = async () => {
    try {
      const t = active();
      const strip = await win.webContents.executeJavaScript("document.querySelectorAll('.tab').length");
      const page = t ? t.view.webContents.getURL() : '';
      if (!t || strip < 1 || !/home\.html/.test(page) || t.view.webContents.isLoading()) return setTimeout(check, 500);
      if (!blocker || !blocker.ready) return fail('the ad-block engine did not load');
      global.__smokeDone = true;
      console.log('LORE_SMOKE_OK tabs=' + strip + ' packaged=' + app.isPackaged);
      app.exit(0);
    } catch (e) { setTimeout(check, 500); }
  };
  check();
}

// ---- Profiles (PRV-14) -----------------------------------------------------------------------------------------------
// Each profile has its own logins and site data (a session partition), tabs, memory, bookmarks and favicons.
function openStores(id) {
  const dir = dirFor(app.getPath('userData'), id);
  fs.mkdirSync(dir, { recursive: true });
  const f = (n) => fileStore(path.join(dir, n), safeStorage);
  const bm = f('bookmarks.bin');
  const pm = f('perms.bin');
  const pv = f('passwords.bin');
  const ch = f('chats.bin');
  const au = f('automations.bin');
  return { autos: new autoLib.AutomationStore({ load: () => au.load(), save: (d) => au.save(d) }), chats: new chats.ChatStore({ load: () => ch.load(), save: (d) => ch.save(d) }), vault: new pwLib.Vault({ load: () => pv.load(), save: (d) => pv.save(d) }), perms: new SitePerms({ load: () => pm.load(), save: (d) => pm.save(d) }), memory: new Memory(f('memory.bin')), favicons: new Favicons(f('favicons.bin')), bookmarks: new Bookmarks({ load: () => bm.load(), save: (d) => bm.save(d) }), sessionStore: f('session.bin') };
}
function useStores(st) {
  autoStore = st.autos; chatStore = st.chats; mainConv = newConv(); vault = st.vault; perms = st.perms; memory = st.memory; favicons = st.favicons; bookmarks = st.bookmarks; sessionStore = st.sessionStore;
  refreshEmbedder();
}
// Closes every tab without remembering it or opening a new one: the next profile's tabs take their place.
function discardAllTabs() {
  closeFind();
  if (run) { run.cancel(); run = null; }
  if (dl && dl.ctl) dl.ctl.abort();
  dl = null; pa = null;
  if (panel && win) { try { win.contentView.removeChildView(panel); } catch { /* not attached */ } }
  for (const t of tabs.splice(0)) {
    try { win.contentView.removeChildView(t.view); } catch { /* not attached */ }
    const ses = t.view.webContents.session;
    t.view.webContents.close();
    if (t.private) { ses.clearStorageData().catch(() => {}); ses.clearCache().catch(() => {}); }
  }
  activeId = null; groups.clear(); closedTabs.items.length = 0; split = null;
  if (splitHandle) { try { win.contentView.removeChildView(splitHandle); } catch { /* not attached */ } }
}
function switchProfile(id) {
  if (!profiles.get(id) || id === profiles.active) return;
  writeSession();
  sessionReady = false;
  if (memory) memory.flush();
  discardAllTabs();
  profiles.setActive(id);
  useStores(openStores(id));
  lastSession = '';
  startTabs();
  buildMenu();
  toast({ text: T('prof.switched', { name: profiles.current.name }) });
}
async function removeProfile(id, parent) {
  const p = profiles.get(id);
  if (!p || profiles.items.length <= 1) return false;
  const ok = (await dialog.showMessageBox(parent, { type: 'warning', buttons: [T('prof.delete'), T('set.priv.cancel')], defaultId: 1, cancelId: 1, message: T('prof.deleteAsk', { name: p.name }), detail: T('prof.deleteDetail') })).response === 0;
  if (!ok) return false;
  if (profiles.active === id) switchProfile(profiles.items.find((x) => x.id !== id).id);
  try { await session.fromPartition(partitionFor(id) || 'persist:none').clearStorageData(); } catch { /* nothing stored */ }
  fs.rmSync(dirFor(app.getPath('userData'), id), { recursive: true, force: true });
  profiles.remove(id);
  buildMenu(); pushState();
  return true;
}
function showProfileMenu(x, y) {
  Menu.buildFromTemplate([
    ...profiles.items.map((p) => ({ label: p.name, type: 'radio', checked: p.id === profiles.active, click: () => switchProfile(p.id) })),
    { type: 'separator' },
    { label: T('prof.new'), click: () => openSettings('profiles') },
    { label: T('prof.manage'), click: () => openSettings('profiles') }
  ]).popup({ window: win, x: Math.round(Number(x) || 0), y: Math.round(Number(y) || 0) });
}

// ---- Pop-up windows for sign-in (WEB-01) -------------------------------------------------------------------------------
function popupHandler(tab, priv) {
  return ({ url, disposition, features }) => {
    if (!isAllowedNavigation(url)) return { action: 'deny' };
    const popup = disposition === 'new-window' && /(?:width|height)\s*=/i.test(features || '');
    if (!popup) { openTab({ url }, { private: priv }); return { action: 'deny' }; }
    const num = (k, d) => { const m = new RegExp(k + '\\s*=\\s*(\\d+)', 'i').exec(features || ''); return m ? Math.min(Math.max(Number(m[1]), 320), 1200) : d; };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: win, width: num('width', 520), height: num('height', 680), minimizable: false, maximizable: false, autoHideMenuBar: true,
        title: 'Lore', backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: TAB_PRELOAD }
      }
    };
  };
}
function trackPopup(tab, child, priv) {
  child.setMenuBarVisibility(false);
  const wc = child.webContents;
  (tab.popups || (tab.popups = new Set())).add(child);
  child.on('closed', () => tab.popups && tab.popups.delete(child));
  // The window is only for web pages: it can send the person onward on the web, never to a file or an app address.
  wc.on('will-navigate', (e, url) => { if (!isAllowedNavigation(url)) e.preventDefault(); });
  wc.on('will-redirect', (e, url) => { if (!isAllowedNavigation(url)) e.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => { if (isAllowedNavigation(url)) openTab({ url }, { private: priv }); return { action: 'deny' }; });
}

function openTab(target, { private: priv = false, lazy = false, pinned = false, title = '', group = 0 } = {}) {
  const id = nextId++;
  // A partition without the "persist:" prefix lives in memory only, so a private tab leaves nothing on disk.
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true, contextIsolation: true, preload: TAB_PRELOAD, minimumFontSize: settings.get().minFont || 0,
      additionalArguments: settings.get().privacy.reduceFingerprint ? ['--lore-fp=1'] : [],
      ...(priv ? { partition: 'private-' + id } : partitionFor(profiles.active) ? { partition: partitionFor(profiles.active) } : {})
    }
  });
  const tab = { id, view, title: '', url: '', isHome: true, media: [], favicon: '', busy: false, private: priv, pinned, lazyUrl: '', group: pinned ? 0 : group };
  tabs.push(tab);
  if (pinned) tabs.splice(0, tabs.length, ...tabstate.setPinned(tabs, id, true));
  const wc = view.webContents;
  hardenSession(wc.session, priv);
  wc.setWebRTCIPHandlingPolicy('default_public_interface_only'); // do not leak the local network address
  wc.on('context-menu', (_e, params) => showContextMenu(tab, params));
  // Clicking into the other half of a split makes it the tab in front.
  wc.on('focus', () => { if (split && (tab.id === split.a || tab.id === split.b) && activeId !== tab.id && splitOn()) { activeId = tab.id; pushState(); } });
  wireFind(wc);
  // A link that opens "a new tab" becomes a tab. A script that opens a small window (sign in with Google, Apple, GitHub, a
  // payment page) gets a real child window, because it talks back to the page that opened it and a tab cannot do that (WEB-01).
  wc.setWindowOpenHandler(popupHandler(tab, priv));
  wc.on('did-create-window', (child) => trackPopup(tab, child, priv));
  // Web pages may only send the tab to web addresses (never file:, javascript:, data: or app schemes).
  const guard = (e, url) => { if (!isAllowedNavigation(url)) e.preventDefault(); };
  wc.on('will-redirect', guard);
  // LORE_DEBUG=1 prints every top-level navigation, so a redirect loop shows up as a repeating list of addresses.
  if (process.env.LORE_DEBUG) {
    const safe = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return String(u).slice(0, 80); } };
    wc.on('did-start-navigation', (_e, url, inPlace, isMain) => { if (isMain) console.log('[nav]', inPlace ? 'in-page' : 'load', safe(url)); });
    wc.on('will-redirect', (_e, url) => console.log('[nav] redirect ->', safe(url)));
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain) console.log('[nav] FAILED', code, desc, safe(url)); });
    wc.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') console.log('[page]', String(e.message).slice(0, 160)); });
  }
  wc.on('page-title-updated', (_e, title) => { tab.title = title; if (!tab.isHome && !priv) memory.setTitle(tab.url, title); pushState(); });
  // Cards on the New tab page navigate to lore-run:?q=..., which runs that text through the intent bar.
  // The blocked request fails with ERR_BLOCKED_BY_CLIENT; once it has, show the warning page in its place.
  wc.on('did-fail-load', (_e, code, _desc, failedUrl, isMainFrame) => {
    if (isMainFrame) { tab.pending = ''; pushState(); }
    const why = isMainFrame && secure.certReason(code);
    if (why) return wc.loadFile(CERTERR, { query: { lang: L(), url: failedUrl, reason: why } });
    if (!isMainFrame) return;
    // Anything else that stops a page from loading gets a page that says so (and a game when there is no connection).
    // A page Lore sent to https that cannot be reached that way: say so, and let the person open it over http on purpose.
    const up = upgraded.get(hostOfUrl(failedUrl || ''));
    if (up && Date.now() - up.ts < 30000 && ![-3, -20, -105, -106].includes(code) && !tab.pendingScam) {
      upgraded.delete(hostOfUrl(failedUrl));
      return wc.loadFile(WARNING, { query: { lang: L(), url: up.orig, reason: 'insecure' } });
    }
    if (!tab.pendingScam) {
      if (code === -3 || code === -20 || !/^https?:/i.test(failedUrl || '')) return;
      tab.errorUrl = failedUrl;
      return wc.loadFile(NETERR, { query: { lang: L(), url: failedUrl, code: String(code), offline: net.isOnline() ? '0' : '1', search: searchUrl('%q').replace('%25q', '%s') } });
    }
    const { url, v } = tab.pendingScam;
    tab.pendingScam = null;
    wc.loadFile(WARNING, { query: { lang: L(), url, reason: v.reason, brand: v.brand || '' } });
  });
  wc.on('will-navigate', (e, url) => {
    if ((url.startsWith('lore-back:') || url.startsWith('lore-proceed:') || url.startsWith('lore-external:')) && isOurWarning(wc.getURL())) {
      e.preventDefault();
      if (url.startsWith('lore-back:')) { wc.navigationHistory.canGoBack() ? wc.navigationHistory.goBack() : loadHome(wc); return; }
      const target = new URL(url).searchParams.get('u');
      // Only the sign-in page may hand an address to the system browser, and only a Google sign-in address.
      if (url.startsWith('lore-external:')) { if (target && isGoogleSignIn(target)) shell.openExternal(target); return; }
      if (target && isAllowedNavigation(target)) { ({ cert: allowedCert, ins: allowedInsecure }[new URL(url).searchParams.get('why')] || allowedScam).add(new URL(target).hostname.toLowerCase()); wc.loadURL(target); }
      return;
    }
    if (url.startsWith('lore-retry:') && isOurWarning(wc.getURL())) {
      e.preventDefault();
      const target = new URL(url).searchParams.get('u');
      if (target && isAllowedNavigation(target)) { tab.pending = target; pushState(); wc.loadURL(target); }
      return;
    }
    if (url.startsWith('lore-do:')) {
      e.preventDefault();
      const sp = new URL(url).searchParams;
      const a = sp.get('a');
      if (isOurHome(wc.getURL()) && tab.id === activeId) ({ private: () => openPrivate(), memory: openMemoryLocked, settings: openSettings, tasks: () => openTasks(), ai: () => openSettings('ai'), organize: () => openOrganize('tabs'), bookmarks: openBookmarks, downloads: openDownloads, chat: () => openChat(sp.get('k') || '') }[a] || (() => {}))();
      return;
    }
    if (url.startsWith('lore-follow:')) {
      e.preventDefault();
      const fq = new URL(url).searchParams.get('q');
      if (fq && isOurHome(wc.getURL()) && tab.id === activeId) followThread(tab, fq.slice(0, 400));
      return;
    }
    if (!url.startsWith('lore-run:')) return guard(e, url);
    e.preventDefault();
    const q = new URL(url).searchParams.get('q');
    if (q && isOurHome(wc.getURL()) && tab.id === activeId) win.webContents.send('type-run', q);
  });
  wc.on('page-favicon-updated', (_e, icons) => { tab.favicon = icons[0] || ''; pushState(); if (!priv && !tab.isHome) saveFavicon(wc, tab.url, icons); });
  wc.on('did-start-navigation', (_e, _u, inPlace, isMain) => { if (isMain && !inPlace && tab.id === activeId) closeFind(); });
  wc.on('did-navigate', () => applyZoom(tab));
  wc.on('zoom-changed', (_e, dir) => { if (tab.id === activeId) zoomActive(dir === 'in' ? 0.5 : -0.5); });
  // A page that goes full screen (a video, a presentation) covers the whole window until it leaves.
  wc.on('enter-html-full-screen', () => { tab.fs = true; tab.fsWindow = !win.isFullScreen(); if (tab.fsWindow) win.setFullScreen(true); layout(); });
  wc.on('leave-html-full-screen', () => { tab.fs = false; if (tab.fsWindow) win.setFullScreen(false); tab.fsWindow = false; layout(); });
  // A page that crashed shows a page that says so, instead of a white tab.
  wc.on('render-process-gone', (_e, d) => { if (!tabs.includes(tab) || !win || win.isDestroyed() || wc.isDestroyed() || d.reason === 'clean-exit' || d.reason === 'killed' && tab.closing) return; tab.fs = false; tab.crashedUrl = tab.url; tab.isHome = true; wc.loadFile(NETERR, { query: { lang: L(), url: tab.crashedUrl, code: 'crash', search: searchUrl('%q').replace('%25q', '%s') } }); layout(); });
  wc.on('did-navigate', (_e, url) => { if (!/\/ui\/neterror\.html/.test(decodeURI(url))) tab.errorUrl = ''; tab.pending = ''; googleRejected(url); tab.media = []; tab.favicon = ''; tab.url = url; tab.isHome = url.startsWith('file:'); if (!tab.isHome && !priv && settings.get().privacy.memory) memory.add({ url, title: tab.title }); if (tab.id === activeId) followTab(tab); pushState(); });
  // Cookie banners and element hiding, once the page has a DOM.
  wc.on('dom-ready', async () => {
    const url = wc.getURL();
    if (!/^https?:/.test(url)) return;
    if (settings.get().privacy.cookieBanners) wc.executeJavaScriptInIsolatedWorld(1002, [{ code: cookieBannerScript }]).catch(() => {});
    if (!S.adsOn) return;
    try {
      const dom = await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: `(() => ({
        classes: [...new Set([...document.querySelectorAll('[class]')].flatMap((e) => [...e.classList]))].slice(0, 3000),
        ids: [...new Set([...document.querySelectorAll('[id]')].map((e) => e.id))].slice(0, 3000),
        hrefs: [...new Set([...document.querySelectorAll('a[href]')].map((e) => e.getAttribute('href')))].slice(0, 1500)
      }))()` }]);
      const css = blocker.cosmetics(url, dom);
      if (css) wc.insertCSS(css).catch(() => {});
    } catch { /* page navigated away */ }
  });
  wc.on('did-finish-load', () => {
    if (tab.isHome || priv || !/^https?:/.test(tab.url) || !settings.get().privacy.memory || aiOffFor(tab.url)) return;
    const url = tab.url;
    // Give single-page apps a moment, then keep a short text excerpt so Memory can answer by content.
    setTimeout(async () => {
      if (tab.url !== url || wc.isDestroyed()) return;
      try {
        const r = await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: `(() => {
          if (document.querySelector('input[type=password]')) return null;
          const el = document.querySelector('article') || document.querySelector('main') || document.body;
          return el ? el.innerText : '';
        })()` }]);
        if (r) memory.setText(url, r);
      } catch { /* page went away */ }
    }, 1500);
  });
  // Google answers an unsupported browser with a "rejected" page (usually without a full page load).
  const googleRejected = (url) => { if (isGoogleSignInRejected(url)) setImmediate(() => wc.loadFile(SIGNIN, { query: { lang: L(), url: 'https://accounts.google.com/' } })); };
  wc.on('did-navigate-in-page', (_e, url) => { tab.url = url; googleRejected(url); pushState(); });
  wc.on('did-start-loading', pushState);
  wc.on('did-stop-loading', () => { tab.pending = ''; pushState(); });
  // Startup benchmark (docs/engine-spike.md): LORE_BENCH=1 prints time-to-first-tab and memory, then quits.
  if (process.env.LORE_BENCH && tab.id === 1) {
    wc.once('did-finish-load', () => setTimeout(() => {
      const m = app.getAppMetrics();
      console.log('BENCH ' + JSON.stringify({ startMs: Math.round(process.uptime() * 1000), memMB: Math.round(m.reduce((n, x) => n + x.memory.workingSetSize, 0) / 1024), procs: m.length }));
      app.exit(0);
    }, 800));
  }
  if (lazy && target && target.url) {
    // A restored tab does not load until it is shown: starting with thirty tabs must not mean thirty page loads.
    tab.lazyUrl = target.url; tab.url = target.url; tab.title = title; tab.isHome = false;
    return tab;
  }
  selectTab(tab.id);
  if (target && target.url) wc.loadURL(target.url);
  else {
    loadHome(wc, target || {});
    // The page loads after the box is shown, and loading takes the focus: take it back once it is ready.
    wc.once('did-finish-load', () => { if (tab.id === activeId && tab.isHome) focusIntent(); });
  }
  return tab;
}

// BRW-16: the zoom level is remembered for each site (not for private tabs) and applied when a page from it opens.
let zoomFile = null;
let zooms = {};
const zoomHost = (t) => (t && /^https?:/.test(t.url) ? hostOfUrl(t.url).replace(/^www\./, '') : '');
function loadZooms() { try { zooms = JSON.parse(fs.readFileSync(zoomFile, 'utf8')) || {}; } catch { zooms = {}; } }
function saveZooms() { try { fs.writeFileSync(zoomFile, JSON.stringify(zooms)); } catch { /* best effort */ } }
function applyZoom(t) {
  const h = zoomHost(t);
  const lvl = h && !t.private && Number.isFinite(zooms[h]) ? zooms[h] : 0;
  if (t.view.webContents.getZoomLevel() !== lvl) t.view.webContents.setZoomLevel(lvl);
}
function zoomActive(step) {
  const t = active();
  if (!t) return;
  const wc = t.view.webContents;
  const lvl = step === null ? 0 : Math.max(-3, Math.min(5, wc.getZoomLevel() + step));
  wc.setZoomLevel(lvl);
  const h = zoomHost(t);
  if (h && !t.private) { if (lvl === 0) delete zooms[h]; else zooms[h] = lvl; saveZooms(); }
  toast({ text: T('zoom.pct', { n: Math.round(100 * Math.pow(1.2, lvl)), host: h || '' }) });
}

// ---- Split view (BRW-25) -----------------------------------------------------------------------------------------------
const tabById = (id) => tabs.find((t) => t.id === id);
const splitOn = () => !!split && !!tabById(split.a) && !!tabById(split.b) && (activeId === split.a || activeId === split.b);
// Shows the pages that belong on screen: the two in a split, or just the tab in front.
function syncViews() {
  const t = active();
  if (!t) return;
  const want = new Set(splitOn() ? [tabById(split.a), tabById(split.b)] : [t]);
  for (const x of tabs) if (!want.has(x)) { try { win.contentView.removeChildView(x.view); } catch { /* not attached */ } }
  for (const x of want) {
    win.contentView.addChildView(x.view);
    if (x.lazyUrl) { const u = x.lazyUrl; x.lazyUrl = ''; x.view.webContents.loadURL(u); }
  }
  if (splitOn()) {
    if (!splitHandle) {
      splitHandle = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'split-preload.js'), contextIsolation: true, sandbox: true } });
      splitHandle.webContents.loadFile(path.join(__dirname, 'ui', 'split.html'));
    }
    win.contentView.addChildView(splitHandle);
  } else if (splitHandle) { try { win.contentView.removeChildView(splitHandle); } catch { /* not attached */ } }
}
function exitSplit() { split = null; syncViews(); layout(); pushState(); }
// Opens a split next to the tab in front: with a tab already open, or with a new one to type in.
function openSplit(withId) {
  if (splitOn()) return exitSplit();
  const first = active();
  if (!first) return;
  let other = withId ? tabById(withId) : null;
  if (other && other.id === first.id) other = null;
  if (!other) {
    other = openTab();
    const rest = tabs.filter((x) => x !== other);
    const at = rest.indexOf(first) + 1;
    const pins = rest.filter((x) => x.pinned).length;
    other.group = first.group || 0; // inside a group, the new tab joins it, so the group stays in one piece
    rest.splice(Math.max(at, pins), 0, other);
    tabs.splice(0, tabs.length, ...tabstate.arrange(rest));
  }
  split = { a: first.id, b: other.id, ratio: 0.5 };
  selectTab(other.id);
}

function selectTab(id) {
  closeSheet();
  if (actRun && actRun.tab.id !== id) actRun.ctl.abort(); // the page being operated must stay in front
  activeId = id;
  const t = active();
  syncViews();
  closeFind();
  if (t.isHome && !t.lazyUrl) focusIntent();
  if (t.group && groups.has(t.group)) groups.get(t.group).collapsed = false;
  followTab(t);
  layout();
  pushState();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  for (const c of t.popups || []) { try { c.close(); } catch { /* gone */ } }
  clearTimeout(t.ephemeral); clearTimeout(t.ephemeralWarn);
  closedTabs.push({ url: t.lazyUrl || t.url, title: t.title, pinned: t.pinned, private: t.private });
  // Closing one half of a split leaves the other one on its own.
  const partner = split && (split.a === id || split.b === id) ? (split.a === id ? split.b : split.a) : null;
  if (partner) split = null;
  try { win.contentView.removeChildView(t.view); } catch { /* not attached */ }
  const ses = t.view.webContents.session;
  t.view.webContents.close();
  if (t.private) { ses.clearStorageData().catch(() => {}); ses.clearCache().catch(() => {}); }
  if (!tabs.length) return openTab();
  if (partner && tabById(partner) && (t.id === activeId || activeId === partner)) selectTab(partner);
  else if (t.id === activeId) selectTab(tabs[Math.min(i, tabs.length - 1)].id);
  else { syncViews(); layout(); pushState(); }
}

// ---- Tab operations (BRW-06) ---------------------------------------------------------------------------------------
const setOrder = (next) => { tabs.splice(0, tabs.length, ...next); pushState(); };
function reopenClosed() {
  const c = closedTabs.pop();
  if (!c) return toast({ text: T('tab.noClosed') });
  const t = openTab({ url: c.url }, { pinned: c.pinned });
  return t;
}
function duplicateTab(id) {
  const src = tabs.find((t) => t.id === id);
  const url = src && (src.lazyUrl || src.url);
  if (!src || !/^https?:/.test(url)) return openTab(undefined, { private: !!(src && src.private) });
  const t = openTab({ url }, { private: src.private });
  t.group = src.group || 0;
  const rest = tabs.filter((x) => x !== t);
  const at = rest.indexOf(src) + 1;
  const pins = rest.filter((x) => x.pinned).length;
  rest.splice(Math.max(at, pins), 0, t);
  setOrder(rest);
  return t;
}
function closeOthers(id) { for (const t of tabs.slice()) if (t.id !== id && !t.pinned) closeTab(t.id); }
function closeToRight(id) { const i = tabs.findIndex((t) => t.id === id); for (const t of tabs.slice(i + 1)) if (!t.pinned) closeTab(t.id); }
function pinTab(id) { const t = tabs.find((x) => x.id === id); if (t) setOrder(tabstate.setPinned(tabs, id, !t.pinned)); }
function switchTab(next) { if (next) selectTab(next.id); }

// ---- Tab groups ---------------------------------------------------------------------------------------------------------
function newGroup(name, ids, { edit = false } = {}) {
  const id = nextGroup++;
  if (edit) pendingEdit = id;
  groups.set(id, { id, name: String(name || T('group.default', { n: id })).slice(0, 30), color: GROUP_COLORS[(id - 1) % GROUP_COLORS.length], collapsed: false });
  if (ids && ids.length) setOrder(tabstate.assign(tabs, [{ groupId: id, ids }])); else pushState();
  return id;
}
function addToGroup(tabId, groupId) { setOrder(tabstate.assign(tabs, [{ groupId, ids: [tabId] }])); }
function removeFromGroup(tabId) { const t = tabs.find((x) => x.id === tabId); if (t) { t.group = 0; setOrder(tabstate.arrange(tabs)); } }
function ungroup(groupId) { for (const t of tabs) if (t.group === groupId) t.group = 0; groups.delete(groupId); pushState(); }
function closeGroup(groupId) { for (const t of tabs.slice()) if (t.group === groupId) closeTab(t.id); groups.delete(groupId); pushState(); }
function groupBookmarks(groupId) {
  const g = groups.get(groupId);
  const members = tabs.filter((t) => t.group === groupId && !t.private && /^https?:/.test(t.lazyUrl || t.url));
  if (!g || !bookmarks || !members.length) return 0;
  let n = 0;
  for (const t of members) if (bookmarks.add({ url: t.lazyUrl || t.url, title: t.title, folder: g.name })) n++;
  notifyBookmarks();
  pushState();
  return n;
}
function openFolderAsGroup(folder) {
  const items = bookmarks.list({ folder }).sort((a, b) => a.ts - b.ts);
  if (!items.length) return;
  const made = items.map((b) => openTab({ url: b.url }, { lazy: true, title: b.title }));
  const gid = newGroup(folder, made.map((t) => t.id));
  selectTab(made[0].id);
  return gid;
}
function showGroupMenu(groupId) {
  const g = groups.get(groupId);
  if (!g) return;
  Menu.buildFromTemplate([
    { label: g.collapsed ? T('group.expand') : T('group.collapse'), click: () => { g.collapsed = !g.collapsed; pushState(); } },
    { label: T('group.color'), submenu: GROUP_COLORS.map((c) => ({ label: T('group.c.' + c), type: 'radio', checked: g.color === c, click: () => { g.color = c; pushState(); } })) },
    { type: 'separator' },
    { label: T('cmp.group'), enabled: tabs.filter((t) => t.group === groupId).length > 1, click: () => openCompare(tabs.filter((t) => t.group === groupId).map((t) => t.id)) },
    { label: T('group.saveBookmarks'), click: () => { const n = groupBookmarks(groupId); toast({ text: T('group.saved', { n, name: g.name }), action: 'bookmarks', actionLabel: T('bm.edit') }); } },
    { label: T('group.saveClose'), click: () => { const n = groupBookmarks(groupId); if (n) { toast({ text: T('group.savedClosed', { n, name: g.name }), action: 'bookmarks', actionLabel: T('bm.edit') }); closeGroup(groupId); } } },
    { type: 'separator' },
    { label: T('group.ungroup'), click: () => ungroup(groupId) },
    { label: T('group.close'), click: () => closeGroup(groupId) }
  ]).popup({ window: win });
}

function showTabMenu(id) {
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  const web = /^https?:/.test(t.lazyUrl || t.url);
  const i = tabs.indexOf(t);
  Menu.buildFromTemplate([
    { label: T('nav.reload'), enabled: web, click: () => { if (t.lazyUrl) selectTab(t.id); else t.view.webContents.reload(); } },
    { label: T('tab.duplicate'), click: () => duplicateTab(id) },
    { label: splitOn() ? T('split.close') : T('split.with'), enabled: splitOn() || t.id !== activeId, click: () => (splitOn() ? exitSplit() : openSplit(id)) },
    { label: t.pinned ? T('tab.unpin') : T('tab.pin'), click: () => pinTab(id) },
    ...(t.pinned ? [] : [{ label: T('group.add'), submenu: [
      { label: T('group.new'), click: () => newGroup('', [id], { edit: true }) },
      ...[...groups.values()].filter((g) => g.id !== t.group).map((g) => ({ label: g.name || T('group.default', { n: g.id }), click: () => addToGroup(id, g.id) })),
      ...(t.group ? [{ type: 'separator' }, { label: T('group.remove'), click: () => removeFromGroup(id) }] : [])
    ] }]),
    { type: 'separator' },
    { label: T('tab.closeTab'), click: () => closeTab(id) },
    { label: T('tab.closeOthers'), enabled: tabs.some((x) => x !== t && !x.pinned), click: () => closeOthers(id) },
    { label: T('tab.closeRight'), enabled: tabs.slice(i + 1).some((x) => !x.pinned), click: () => closeToRight(id) },
    { type: 'separator' },
    { label: T('tab.reopen'), enabled: closedTabs.size > 0, accelerator: 'CmdOrCtrl+Shift+T', click: reopenClosed }
  ]).popup({ window: win });
}

function startAgent(id) {
  if (run) run.cancel();
  pa = null; dl = null; assistOn = false;
  run = new AgentRun(id, {
    log: agentLog,
    driver: new PageDriver(active().view.webContents, T),
    t: T,
    workflows: { ...WORKFLOWS, ...realWorkflows({ demoBase: process.env.LORE_DEMO_PORTAL, t: T }) }
  });
  run.on('change', (snap) => panel.webContents.send('agent:state', snap));
  win.contentView.addChildView(panel);
  layout();
  run.start();
}

function closePanel() {
  if (run) { run.cancel(); run = null; }
  if (dl) { if (dl.ctl) dl.ctl.abort(); dl = null; }
  pa = null; assistOn = false;
  win.contentView.removeChildView(panel);
  layout();
}

function sendDl() {
  if (!dl) return;
  const { state, options, pct, path: file, error, title } = dl;
  panel.webContents.send('dl:state', {
    title, state, pct, path: file, error,
    options: (options || []).map((o) => ({ label: o.label, size: o.size }))
  });
}

async function openDownload() {
  const tab = active();
  if (!tab || !tab.media.length || isDeniedSite(tab.url)) return;
  if (run) { run.cancel(); run = null; }
  pa = null; assistOn = false;
  if (dl && dl.ctl) dl.ctl.abort();
  const title = tab.title || 'video';
  dl = { tab, title, state: 'loading', options: [], pct: 0 };
  win.contentView.addChildView(panel);
  layout();
  sendDl();
  const f = (u, init) => tab.view.webContents.session.fetch(u, init);
  const mine = dl;
  try {
    const lists = await Promise.all(tab.media.map((m) => downloader.options(f, m).catch(() => [])));
    if (dl !== mine) return;
    dl.options = lists.flat();
    dl.state = dl.options.length ? 'choose' : 'error';
    if (!dl.options.length) dl.error = T('dl.err.read');
  } catch {
    if (dl !== mine) return;
    dl.state = 'error';
    dl.error = T('dl.err.read');
  }
  sendDl();
}

async function startDownload(index) {
  const cur = dl;
  const opt = cur && cur.state === 'choose' && cur.options[index];
  if (!opt) return;
  cur.state = 'running';
  cur.pct = 0;
  cur.ctl = new AbortController();
  sendDl();
  const f = (u, init) => cur.tab.view.webContents.session.fetch(u, init);
  try {
    cur.path = await downloader.download(f, opt, {
      dir: app.getPath('downloads'), title: cur.title, signal: cur.ctl.signal,
      onProgress: (p) => { cur.pct = p; if (dl === cur) sendDl(); }
    });
    cur.state = 'done';
  } catch (e) {
    cur.state = 'error';
    cur.error = e.message === 'protected' ? T('dl.err.drm')
      : e.message === 'live' ? T('dl.err.live') : T('dl.err.fail');
  }
  if (dl === cur) sendDl();
}

async function runPageAction(r) {
  return pageAssistant(r.action, r.text);
}

// ---- Page assistant (AI-03 summary and questions, AI-04 translation) -------------------------------------------------
const pageMeta = (tab) => { let host = ''; try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { /* none */ } return { title: tab.title, host }; };
// ---- Conversations ---------------------------------------------------------------------------------------------------
// One conversation follows the person from tab to tab. Every page asked about becomes a source of it; a later question reads all
// the sources that are still open (the newest four), so "compare it with the other one" works. Normal tabs share one conversation
// that is saved (encrypted, on this computer); private tabs have a conversation of their own that never leaves memory.
const MAX_SOURCES_OPEN = 4;
const newConv = () => ({ id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), url: '', title: '', states: [], sources: [] });
let mainConv = newConv();
let privConv = newConv();
let assistOn = false;      // the person opened the assistant and has not closed it
let chatSaveTimer = null;
const convFor = (tab) => (tab && tab.private ? privConv : mainConv);
const normUrl = (u) => { try { const x = new URL(u); x.hash = ''; return x.toString(); } catch { return String(u || ''); } };
// Restores a saved conversation and goes to the page it read last (an open tab, or the page again in a new one).
function rebind(conv) { for (const src of conv.sources) { const t = tabOfSource(conv, src); src.tabId = t ? t.id : 0; } }
function openChat(key) {
  if (!chatStore) return;
  const t = chatStore.get(String(key));
  if (!t || !isAllowedNavigation(t.url)) return;
  mainConv = { id: t.key, url: t.url, title: t.title, states: t.states.map((x) => ({ ...x })), sources: t.sources.map((x) => ({ key: normUrl(x.url), url: x.url, title: x.title, tabId: 0 })) };
  rebind(mainConv);
  assistOn = true;
  const last = mainConv.sources[mainConv.sources.length - 1];
  let tab = last && tabOfSource(mainConv, last);
  if (tab) selectTab(tab.id); else if (last && isAllowedNavigation(last.url)) { tab = openTab({ url: last.url }); tab.url = last.url; last.tabId = tab.id; }
  // Show it at once, without waiting for the page to load.
  if (tab) { pa = null; claimPanel(tab); }
}
// A page joins the conversation when something is asked about it.
function addSource(conv, tab) {
  if (!tab || tab.isHome || !/^https?:/.test(tab.url)) return;
  const key = normUrl(tab.url);
  let src = conv.sources.find((x) => x.tabId === tab.id) || conv.sources.find((x) => x.key === key);
  if (!src) { src = { key }; conv.sources.push(src); if (conv.sources.length > 8) conv.sources.shift(); }
  Object.assign(src, { key, url: tab.url, title: tab.title || hostOfUrl(tab.url), tabId: tab.id });
  if (!conv.url) conv.url = tab.url;
}
// The tab a source belongs to, if it is still open: by tab, then by address.
function tabOfSource(conv, src) {
  const t = tabs.find((x) => x.id === src.tabId && !x.isHome) || tabs.find((x) => !x.isHome && normUrl(x.lazyUrl || x.url) === src.key);
  return t && !!t.private === (conv === privConv) ? t : null;
}
// Tabs the next question will read: the one in front first, then the newest sources, each allowed and still open.
function readableTabs(conv, tab) {
  const out = [];
  const add = (t) => { if (t && !out.includes(t) && !t.lazyUrl && /^https?:/.test(t.url) && !aiOffFor(t.url) && !isSensitiveHost(hostOfUrl(t.url))) out.push(t); };
  if (tab && tab.private === (conv === privConv)) add(tab);
  for (const src of [...conv.sources].reverse()) add(tabOfSource(conv, src));
  return out.slice(0, MAX_SOURCES_OPEN);
}
function sourceChips(conv, tab) {
  const here = tab && !tab.isHome && /^https?:/.test(tab.url) && !!tab.private === (conv === privConv) ? tab : null;
  const chips = conv.sources.map((src) => { const t = tabOfSource(conv, src); return { key: src.key, title: src.title, host: hostOfUrl(src.url).replace(/^www\./, ''), tabId: t ? t.id : 0, open: !!t, current: !!(here && t === here) }; });
  if (here && !chips.some((c) => c.current)) chips.push({ key: normUrl(here.url), title: here.title || hostOfUrl(here.url), host: hostOfUrl(here.url).replace(/^www\./, ''), tabId: here.id, open: true, current: true, ghost: true });
  return chips;
}
function saveConv(conv) {
  if (conv === privConv || !chatStore) return;
  clearTimeout(chatSaveTimer);
  chatSaveTimer = setTimeout(() => {
    const first = conv.states.find((x) => x.question);
    chatStore.put(conv.id, { url: conv.url, title: (first && first.question) || (conv.sources[0] && conv.sources[0].title) || '', states: conv.states, sources: conv.sources });
  }, 800);
}
function recordState(tab, s) {
  if (!Number.isFinite(s.seq) || s.state === 'idle') return;
  const conv = convFor(tab);
  const { reset, lang, ...rest } = s;
  conv.states = conv.states.filter((x) => x.seq !== s.seq);
  if (s.state === 'done' || s.state === 'error') conv.states.push(rest);
  conv.states = conv.states.slice(-chats.MAX_STATES);
  saveConv(conv);
}
// Draws the conversation in the panel: what was said before, or the opening state when nothing was.
function sendThread(tab) {
  const conv = convFor(tab);
  panel.webContents.send('page:thread', {
    lang: L(), page: pageMeta(tab), states: conv.states.filter((x) => x.state === 'done'), sources: sourceChips(conv, tab),
    modelReady: lastModel.ready, remote: lastModel.remote, model: lastModel.model
  });
}
// Only the sources row and the page name change when the tab in front changes.
function sendContext(tab) {
  panel.webContents.send('page:ctx', { page: pageMeta(tab), sources: sourceChips(convFor(tab), tab) });
}
// Opens (or keeps) the assistant for this tab. Moving between normal tabs keeps the conversation; a private tab has its own.
function claimPanel(tab) {
  const swap = !pa || !!pa.tab.private !== !!tab.private;
  pa = { tab, view: 'both', url: tab.url };
  win.contentView.addChildView(panel);
  layout();
  if (swap) sendThread(tab); else sendContext(tab);
  return false;
}
// The tab in front changed (or its address did): follow it with the panel.
function followTab(tab) {
  if (!assistOn || run || dl || !tab) return;
  const web = !tab.isHome && /^https?:/.test(tab.url);
  if (web) { if (!pa || pa.tab !== tab || pa.url !== tab.url) claimPanel(tab); return; }
  // On a new tab page the conversation stays open: it can still be asked about the pages it already read.
  if (!pa || !!pa.tab.private !== !!tab.private) { pa = null; claimPanel(tab); return; }
  pa = { tab, view: 'both', url: tab.url };
  sendContext(tab);
}
const sendPageFor = (tab, s) => {
  recordState(tab, s);
  if (pa && convFor(pa.tab) === convFor(tab)) panel.webContents.send('page:state', { ...s, lang: L() });
};
const sendPage = (s) => { if (pa) sendPageFor(pa.tab, s); };
let lastModel = { ready: false, remote: '', model: '' };
const modelInfo = async () => (lastModel = { ready: !!llm && (await llm.available()), remote: !!llm && llm.remote ? llm.host : '', model: llm ? llm.model : '' });

// Everything a model reads from a page comes through here (AI-10): visible text only, invisible characters stripped,
// and a report of anything that looked like an order to the assistant.
// A PDF tab has no page text to read: the file is fetched with the tab's own session and read with pdf.js (AI-12).
async function pdfRead(tab) {
  const url = tab.url;
  if (!tab.pdf || tab.pdf.url !== url) {
    const r = await tab.view.webContents.session.fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('pdf.http');
    const bytes = Buffer.from(await r.arrayBuffer());
    tab.pdf = { url, text: pdftext.withPages((await pdftext.extract(bytes)).pages) };
  }
  return shield.prepare(tab.pdf.text, {});
}

async function pageRead(tab) {
  const wc = tab.view.webContents;
  if (aiOffFor(tab.url)) return shield.prepare('', {});
  if (pdftext.isPdfUrl(tab.url)) { try { return await pdfRead(tab); } catch { return shield.prepare('', {}); } }
  let raw = '', hidden = {};
  try {
    const a = await wc.executeJavaScriptInIsolatedWorld(1003, [{ code: extractionScript() }]);
    if (a && a.text && a.text.length > 300) { raw = a.text; hidden = a.hidden || {}; }
  } catch { /* fall through */ }
  if (!raw) {
    try {
      const f = await wc.executeJavaScriptInIsolatedWorld(1003, [{ code: shield.fallbackScript() }]);
      if (f) { raw = f.text || ''; hidden = f.hidden || {}; }
    } catch { /* nothing readable */ }
  }
  return shield.prepare(raw, hidden);
}

// Answers already written for the same page text, model and question are shown again without asking the model (token saver).
const answerCache = new Map();
const cacheKey = (parts) => nodeCrypto.createHash('sha1').update(parts.join('\u0001')).digest('hex');
const cacheGet = (k) => { const v = answerCache.get(k); if (v) { answerCache.delete(k); answerCache.set(k, v); } return v; };
const cachePut = (k, v) => { answerCache.set(k, v); if (answerCache.size > 80) answerCache.delete(answerCache.keys().next().value); };
// What a call cost, from the provider's own count; only calls that leave this computer are counted.
function usedTokens(l) {
  const u = l && l.remote && l.usage ? { in: l.usage.in, out: l.usage.out } : null;
  if (u && pstats) { pstats.record('tin', '', u.in); pstats.record('tout', '', u.out); }
  return u;
}

async function pageAssistant(action, question = '') {
  const tab = active();
  if (!tab) return;
  const web = !tab.isHome && /^https?:/.test(tab.url);
  if (action === 'ask' && tab.isHome && tab.thread) return followThread(tab, question);
  const conv = convFor(tab);
  if (web && aiOffFor(tab.url)) { assistOn = true; claimPanel(tab); return sendPageFor(tab, { mode: action, question, remote: '', model: '', seq: ++paSeq, page: pageMeta(tab), state: 'error', error: 'pg.aiOff' }); }
  // A question can also be about the pages the conversation already read, even from a tab that has no page.
  const others = readableTabs(conv, web ? tab : null);
  if (!web && !(action === 'ask' && others.length)) return loadHome(tab.view.webContents, { kind: 'nopage' });
  if (run) { run.cancel(); run = null; }
  if (dl) { if (dl.ctl) dl.ctl.abort(); dl = null; }
  assistOn = true;
  claimPanel(tab);
  if (web) { addSource(conv, tab); sendContext(tab); }
  const mine = pa;
  const sp = (x) => sendPageFor(tab, x);
  const live = () => pa === mine && active() === tab;
  const m = await modelInfo();
  const meta = { mode: action, question, remote: m.remote, model: m.model, seq: ++paSeq, page: pageMeta(tab) };
  sp({ ...meta, state: 'working' });
  try {
    if (action === 'translate') return await translatePage(tab, mine, meta, m, live);
    const l = m.ready ? llm : null;
    const bud = budgetFor(settings.get().aiSaving);
    if (l) l.usage = null;
    // Several pages: read each one the same safe way, then answer with numbered sources.
    if (action === 'ask' && others.length > 1 || (action === 'ask' && others.length === 1 && others[0] !== tab)) {
      const items = [];
      for (const t of others) { const r = await pageRead(t); items.push({ url: t.url, title: t.title || hostOfUrl(t.url), text: r.text, tabId: t.id, report: r.report }); }
      const res = await recall.askSources({ items, question, llm: l, lang: L(), history: chats.context(conv.states) });
      const flagged = items.map((i) => i.report).find((r) => shield.worthWarning(r) || r.invisible || r.hiddenChars) || null;
      return sp({ ...meta, state: 'done', found: res.found, answer: res.answer, cites: res.cites, ai: !!res.answer, cut: !!res.cut, safety: flagged,
        tokens: usedTokens(l),
        srcs: res.sources.map((x) => ({ n: x.n, title: x.title, host: x.host, url: items[x.n - 1].url, tabId: items[x.n - 1].tabId, passage: x.passages[0] || '' })) });
    }
    const { text, report } = await pageRead(tab);
    const safety = shield.worthWarning(report) || report.invisible || report.hiddenChars ? report : null;
    if (text.length < 120) return sp({ ...meta, state: 'error', error: 'pg.noText' });
    if (action === 'summarize') {
      const ck = cacheKey(['sum', m.model, L(), settings.get().aiSaving, text]);
      let s = cacheGet(ck);
      const cached = !!s;
      if (!s) { s = await pageassist.summarize({ text, llm: l, lang: L(), budget: bud.summary }); if (s.ai && !s.cut) cachePut(ck, s); }
      mine.text = text;
      return sp({ ...meta, state: 'done', bullets: s.bullets, ai: s.ai, cut: s.cut, safety, tokens: cached ? { in: 0, out: 0, cached: true } : usedTokens(l) });
    }
    const hist = chats.context(conv.states, 2);
    const ck = hist.length ? '' : cacheKey(['ask', m.model, L(), settings.get().aiSaving, question, text]);
    let a = ck ? cacheGet(ck) : null;
    const cached = !!a;
    if (!a) { a = await pageassist.ask({ text, question, llm: l, lang: L(), history: hist, passages: bud.passages }); if (ck && a.ai && !a.cut) cachePut(ck, a); }
    mine.text = text;
    sp({ ...meta, state: 'done', found: a.found, answer: a.answer, passages: a.passages, ai: a.ai, cut: a.cut, safety, tokens: cached ? { in: 0, out: 0, cached: true } : usedTokens(l) });
  } catch { sp({ ...meta, state: 'error', error: 'pg.error' }); }
}

// ---- Keep talking after an answer ------------------------------------------------------------------------------------------------
// The first answer (from the web, a news site or Memory) is shown on the tab. Asking more moves it into the assistant panel, which
// then answers from the same sources, with numbered citations, like any other conversation. Only Lore writes tab.thread; the page
// can only send the question text.
function rememberThread(tab, q, a, webUrl) {
  const items = a.sources && a.sources.length
    ? a.sources.map((s) => ({ url: s.url, title: s.title, text: s.desc ? s.title + '. ' + s.desc : (a.evidence ? a.evidence.join(' ') : a.summary) }))
    : [{ url: webUrl, title: a.provider || 'Lore', text: a.summary }];
  tab.thread = { q, answer: a.summary, ai: !!a.claims, model: llm && llm.model || '', items: items.slice(0, 8), seeded: false };
}
function rememberMemoryThread(tab, q, res) {
  const items = res.sources.map((s) => ({ url: s.url, title: s.title, text: s.passages.join(' ') }));
  tab.thread = { q, answer: res.answer || '', ai: !!res.answer, model: llm && llm.model || '', items, seeded: false };
}
async function followThread(tab, question) {
  const th = tab.thread;
  if (!th || !th.items.length) return;
  const conv = convFor(tab);
  const srcOf = (items) => items.map((x, i) => ({ n: i + 1, title: x.title, host: hostOfUrl(x.url).replace(/^www\./, ''), url: x.url, tabId: 0, passage: '' }));
  if (!th.seeded) {
    th.seeded = true;
    conv.states.push({ mode: 'ask', question: th.q, state: 'done', seq: ++paSeq, found: true, answer: th.answer, cites: [], srcs: srcOf(th.items), ai: th.ai, model: th.model, page: pageMeta(tab), remote: '' });
    saveConv(conv);
  }
  if (run) { run.cancel(); run = null; }
  assistOn = true;
  pa = null;
  claimPanel(tab);
  const mine = pa;
  const m = await modelInfo();
  const meta = { mode: 'ask', question, remote: m.remote, model: m.model, seq: ++paSeq, page: pageMeta(tab) };
  const sp = (x) => sendPageFor(tab, x);
  sp({ ...meta, state: 'working' });
  try {
    const l = m.ready ? llm : null;
    if (l) l.usage = null;
    const res = await recall.askSources({ items: th.items, question, llm: l, lang: L(), history: chats.context(conv.states) });
    if (pa !== mine) return;
    sp({ ...meta, state: 'done', found: res.found, answer: res.answer, cites: res.cites, ai: !!res.answer, cut: !!res.cut, tokens: usedTokens(l),
      srcs: res.sources.map((x) => ({ n: x.n, title: x.title, host: x.host, url: th.items[x.n - 1].url, tabId: 0, passage: x.passages[0] || '' })) });
  } catch { sp({ ...meta, state: 'error', error: 'pg.error' }); }
}

// ---- Look and operate (AI-17): the assistant clicks, chooses and scrolls on the page to find what only shows that way -------------
// It lists the page's controls with numbers (cheap text), looks at a small screenshot only at the start or when stuck, and does one
// step at a time with real mouse events. It only looks things up: anything that buys, sends, deletes, signs in or submits asks the
// person first, showing what it is about to press.
const actConsent = new Set(); // "host|provider" pairs the person allowed to send page content to, for this run of Lore
let actRun = null;            // { ctl, tab }
async function actOnPage(task) {
  const tab = active();
  if (!tab) return;
  const web = !tab.isHome && /^https?:/.test(tab.url);
  const conv = convFor(tab);
  assistOn = true;
  claimPanel(tab);
  const meta = { mode: 'act', question: task, seq: ++paSeq, page: pageMeta(tab) };
  const fail = (key) => sendPageFor(tab, { ...meta, state: 'error', error: key });
  if (!web || tab.private || isSensitiveHost(hostOfUrl(tab.url))) return fail('act.notHere');
  if (aiOffFor(tab.url)) return fail('pg.aiOff');
  if (actRun) return fail('act.busy');
  const m = await modelInfo();
  if (!m.ready) return fail('pg.needModel');
  addSource(conv, tab); sendContext(tab);
  const host = hostOfUrl(tab.url).replace(/^www\./, '');
  const wantImages = !!llm.vision && settings.get().aiSaving !== 'save';
  if (m.remote && !actConsent.has(host + '|' + m.remote)) {
    const r = await dialog.showMessageBox(win, { type: 'question', buttons: [T('act.allow'), T('set.priv.cancel')], defaultId: 1, cancelId: 1, message: T('act.consentAsk', { host, to: m.remote }), detail: T(wantImages ? 'act.consentImages' : 'act.consentText') });
    if (r.response !== 0) return sendPageFor(tab, { ...meta, state: 'error', error: 'act.declinedSend' });
    actConsent.add(host + '|' + m.remote);
  }
  const ctl = new AbortController();
  actRun = { ctl, tab };
  const live = [];
  const show = (state, extra = {}) => sendPageFor(tab, { ...meta, state, steps: live.map((x) => ({ text: x.text, result: x.result || (x.blocked ? 'blocked' : x.declined ? 'declined' : '') })), remote: m.remote, model: m.model, ...extra });
  show('working');
  llm.usage = null;
  const res = await visionLib.run({
    task, driver: observe.pageDriver(tab.view.webContents), llm, lang: L(), useImages: wantImages, signal: ctl.signal,
    onStep: (s) => { live.push(s); show('working'); },
    confirm: async (info) => {
      const r = await dialog.showMessageBox(win, { type: 'warning', buttons: [T('act.doThis'), T('act.stop')], defaultId: 1, cancelId: 1, message: T('act.confirmAsk', { what: info.what }), detail: T('act.confirmWhy.' + info.why, { host: info.host }) });
      return r.response === 0;
    }
  });
  actRun = null;
  const tokens = m.remote ? { in: res.tokens.in, out: res.tokens.out } : null;
  if (tokens && pstats) { pstats.record('tin', '', tokens.in); pstats.record('tout', '', tokens.out); }
  if (res.ok) show('done', { answer: res.answer, evidence: res.evidence, found: true, ai: true, tokens });
  else show('error', { error: 'act.why.' + res.why, detail: res.detail || '', tokens });
}

// Opens the page tools without running anything, so the options are visible before the user asks for one.
async function openAssist() {
  const tab = active();
  if (!tab || tab.isHome || !/^https?:/.test(tab.url)) return;
  if (run) { run.cancel(); run = null; }
  if (dl) { if (dl.ctl) dl.ctl.abort(); dl = null; }
  assistOn = true;
  pa = null; // always draw the conversation again
  await modelInfo();
  claimPanel(tab);
}

async function translatePage(tab, mine, meta, m, live) {
  if (!m.ready) return sendPage({ ...meta, state: 'error', error: 'pg.needModel' });
  const wc = tab.view.webContents;
  const { lang: pageLang, blocks } = await wc.executeJavaScriptInIsolatedWorld(1004, [{ code: pageassist.COLLECT_SCRIPT }]);
  const target = L();
  if (pageLang && pageLang.toLowerCase().startsWith(target)) return sendPage({ ...meta, state: 'error', error: 'pg.same', target: pageassist.NAME[target] });
  if (!blocks.length) return sendPage({ ...meta, state: 'error', error: 'pg.noText' });
  const chunks = pageassist.chunkBlocks(blocks);
  let done = 0;
  for (const chunk of chunks) {
    if (!live()) return;
    const map = await pageassist.translateBatch({ blocks: chunk, llm, target });
    if (Object.keys(map).length) await wc.executeJavaScriptInIsolatedWorld(1004, [{ code: pageassist.applyScript(map) }]);
    done += chunk.length;
    sendPage({ ...meta, state: 'working', done, total: blocks.length });
  }
  if (live()) sendPage({ ...meta, state: 'done', translated: blocks.length, target: pageassist.NAME[target], view: 'both' });
}

// Only for real questions, only when Memory is on and unlocked without asking the person (no fingerprint prompt for a plain
// question), and only when pages that clearly cover the question exist and a model (or a very strong match) backs them.
async function answerFromMemory(question) {
  try {
    const pv = settings.get().privacy;
    if (!pv.memory || !memory || memory.size === 0 || question.trim().split(/\s+/).length < 3) return false;
    if (pv.lock && lockAvailable() && Date.now() >= unlockedUntil) return false;
    const m = await modelInfo();
    const res = await recall.ask({ question, memory, llm: m.ready ? llm : null, lang: L(), minCover: 0.6 });
    const usable = res.found && (res.answer || (!m.ready && res.sources.length && res.sources[0].passages.length));
    if (!usable) return false;
    const tab = active();
    const wc = tab.view.webContents;
    tab.title = question; tab.isHome = true;
    rememberMemoryThread(tab, question, res);
    loadHome(wc, { kind: 'memory', q: question, results: JSON.stringify(res.sources.map((s) => ({ url: s.url, title: s.title, ts: s.ts, snippet: s.passages[0] || '' }))), total: String(memory.size), recall: JSON.stringify({ answer: res.answer, cites: res.cites, remote: m.ready && m.remote ? m.remote : '' }), web: searchUrl(question) });
    pushState();
    return true;
  } catch { return false; }
}

// "open the tab Tevo Product": switches to the open tab that matches; else a page of that name from Memory; else says so.
async function openByName(text) {
  const want = tabFind.tabIntent(text);
  if (!want) return false;
  const hit = tabFind.findTab(tabs.map((t) => ({ id: t.id, title: t.title, url: t.lazyUrl || t.url, private: t.private })), want.name);
  if (hit) { selectTab(hit.id); return true; }
  try {
    const pv = settings.get().privacy;
    const mem = pv.memory && memory && (!pv.lock || !lockAvailable() || Date.now() < unlockedUntil) ? (await memory.search(want.name, Date.now(), 1, { minCover: 0.6 }))[0] : null;
    if (mem) { openTab({ url: mem.url }); toast({ text: T('tab.fromMemory', { title: String(mem.title || mem.url).slice(0, 60) }) }); return true; }
  } catch { /* fall through */ }
  if (want.sure) { toast({ text: T('tab.none', { name: want.shown }) }); return true; }
  return false; // "open the page about X" with no such tab is an ordinary request
}

async function submit(text) {
  if (!text.trim()) return;
  if (active()) active().thread = null;
  if (await openByName(text)) return;
  // Typing the name of a saved task runs it.
  const saved = taskStore && taskStore.byName(text);
  if (saved) return openTasks({ select: saved.id, auto: true });
  const r = classify(text);
  const wc = active().view.webContents;
  if (r.kind === 'write') {
    openTasks({ quick: { kind: r.task === 'reply' ? 'email' : r.task, request: r.text, reply: r.task === 'reply' } });
  } else if (r.kind === 'page') {
    await runPageAction(r);
  } else if (r.kind === 'download') {
    if (active().media.length) openDownload();
    else loadHome(wc, { kind: 'download', q: r.text, novideo: '1' });
  } else if (r.kind === 'search') {
    // A question about something already read is answered from Memory first; the web is the fallback.
    if (await answerFromMemory(r.text)) return;
    const tab = active();
    tab.title = r.text;
    tab.isHome = true;
    loadHome(wc, { kind: 'loading', q: r.text });
    tab.busy = true;
    tab.pending = r.text;
    pushState();
    let a;
    try { a = await answerQuery(r.text, { llm, lang: L(), wiki: (q) => wikiAnswer(q, smartFetch), site: (q) => siteNews.lookup(q, smartFetch) }); } finally { tab.busy = false; tab.pending = ''; }
    if (!tabs.includes(tab)) return;
    if (a) { rememberThread(tab, r.text, a, r.url); loadHome(wc, { kind: 'answer', q: r.text, web: r.url, answer: JSON.stringify(a) }); }
    else { tab.pending = r.text; pushState(); wc.loadURL(r.url); }
  } else if (r.kind === 'agent' && matchWorkflow(r.text)) {
    startAgent(matchWorkflow(r.text));
  } else if (r.url) {
    active().title = '';
    active().pending = r.kind === 'url' ? r.url : r.text;
    pushState();
    wc.loadURL(r.url);
  } else {
    const query = { kind: r.kind, q: r.text };
    if (r.kind === 'memory') {
      // Search, then (with a model) answer from the best pages with numbered citations (MEM-04).
      if (!(await unlock())) return;
      const tab = active();
      tab.title = r.text; tab.isHome = true; tab.busy = true; tab.pending = r.text;
      loadHome(wc, { kind: 'loading', q: r.text });
      pushState();
      const m = await modelInfo();
      let res;
      try { res = await recall.ask({ question: r.text, memory, llm: m.ready ? llm : null, lang: L() }); } finally { tab.busy = false; tab.pending = ''; }
      if (!tabs.includes(tab)) return;
      rememberMemoryThread(tab, r.text, res);
      query.results = JSON.stringify(res.sources.map((s) => ({ url: s.url, title: s.title, ts: s.ts, snippet: s.passages[0] || '' })));
      query.total = String(memory.size);
      query.recall = JSON.stringify({ answer: res.answer, cites: res.cites, remote: m.ready && m.remote ? m.remote : '' });
    }
    loadHome(wc, query);
  }
}

function createWindow() {
  tabs.length = 0;
  activeId = null;
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 480,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }
      : {
          titleBarStyle: 'hidden', autoHideMenuBar: true,
          titleBarOverlay: {
            color: nativeTheme.shouldUseDarkColors ? '#090D14' : '#E9ECF0',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#E9EDF3' : '#12161C', height: 40
          }
        }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#090D14' : '#E9ECF0',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.on('resize', layout);
  panel = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'panel-preload.js'), contextIsolation: true, sandbox: true } });
  panel.webContents.loadFile(path.join(__dirname, 'ui', 'panel.html'));
  panel.webContents.on('did-finish-load', () => panel.webContents.send('lang', L()));
  win.webContents.once('did-finish-load', startTabs);
  win.webContents.on('did-finish-load', () => pushState()); // if the browser's own window ever reloads, the tab strip comes back
}

function refreshEmbedder() {
  const l = settings.get().local;
  // Page text never leaves the computer: only a local model server may embed it.
  memory.embedder = isLocalHost(l.url) && l.embedModel ? createEmbedder({ url: l.url, model: l.embedModel }) : null;
}

function openMemory() {
  if (memoryWin && !memoryWin.isDestroyed()) return memoryWin.close();
  memoryWin = new Sheet({ name: 'memory',
    width: 860, height: 780, minWidth: 560, minHeight: 480, title: T('mem.title'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'memory-preload.js'), contextIsolation: true, sandbox: true }
  });
  memoryWin.setMenuBarVisibility(false);
  memoryWin.loadFile(path.join(__dirname, 'ui', 'memory.html'), { query: { lang: L() } });
  memoryWin.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) { openTab({ url }); win.focus(); }
    return { action: 'deny' };
  });
  memoryWin.on('closed', () => { memoryWin = null; });
}

function wireMemoryIpc() {
  const trusted = (e) => memoryWin && e.sender === memoryWin.webContents;
  const reject = () => { throw new Error('untrusted sender'); };
  const from = (range) => (RANGES[range] ? Date.now() - RANGES[range] : undefined);
  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  ipcMain.handle('memory:list', async (e, { q = '', range = 'all', host = '' } = {}) => {
    if (!trusted(e)) return reject();
    const opts = { host: host || undefined, from: from(range) };
    const raw = q.trim() ? await memory.search(q, Date.now(), 200, opts) : memory.list(opts).slice(0, 200).map(({ url, title, ts }) => ({ url, title, ts }));
    return {
      items: raw.map((i) => ({ url: i.url, title: i.title, ts: i.ts, host: hostOf(i.url), snippet: i.snippet || '', icon: favicons.get(hostOf(i.url)) })),
      total: memory.size, hosts: memory.hosts().slice(0, 50), embedded: memory.embeddedCount
    };
  });
  ipcMain.handle('memory:topics', (e) => {
    if (!trusted(e)) return reject();
    return topics.clusterTopics(memory.list({ from: Date.now() - 60 * 86400000 }).slice(0, 400));
  });
  ipcMain.handle('memory:digest', async (e) => {
    if (!trusted(e)) return reject();
    const m = await modelInfo();
    const r = await topics.summarize({ items: memory.list({ from: Date.now() - 86400000 }).slice(0, 80), llm: m.ready ? llm : null, lang: L() });
    return { ...r, remote: m.ready && m.remote ? m.remote : '' };
  });
  ipcMain.handle('memory:remove', (e, url) => {
    if (!trusted(e)) return reject();
    const r = memory.remove(String(url));
    const h = hostOf(String(url));
    if (h && !memory.list({ host: h }).length) favicons.remove(h);
    return r;
  });
  const confirm = async (message) => (await dialog.showMessageBox(win, { type: 'warning', buttons: [T('mem.delete'), T('set.priv.cancel')], defaultId: 1, cancelId: 1, message })).response === 0;
  ipcMain.handle('memory:removeHost', async (e, host) => {
    if (!trusted(e)) return reject();
    const n = memory.list({ host: String(host) }).length;
    if (!n || !(await confirm(T('mem.confirmSite', { n, host })))) return 0;
    favicons.remove(String(host));
    return memory.removeHost(String(host));
  });
  ipcMain.handle('memory:removeRange', async (e, range) => {
    if (!trusted(e)) return reject();
    const n = range === 'all' ? memory.size : memory.list({ from: from(range) }).length;
    if (!n || !(await confirm(T('mem.confirmRange', { n })))) return 0;
    const r = memory.removeSince(String(range));
    if (!memory.size) favicons.clear();
    return r;
  });
  ipcMain.handle('memory:export', async (e) => {
    if (!trusted(e)) return reject();
    const r = await dialog.showSaveDialog(win, { defaultPath: 'lore-memory.json', filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    const rows = memory.export();
    const csv = ['url,title,visited', ...rows.map((x) => [x.url, x.title, x.visited].map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(','))].join('\n');
    require('fs').writeFileSync(r.filePath, r.filePath.toLowerCase().endsWith('.csv') ? csv : JSON.stringify(rows, null, 2));
    return { ok: true, count: rows.length };
  });
}

function applyLanguage() {
  buildMenu();
  panel.webContents.send('lang', L());
  if (memoryWin && !memoryWin.isDestroyed()) { memoryWin.setTitle(T('mem.title')); memoryWin.loadFile(path.join(__dirname, 'ui', 'memory.html'), { query: { lang: L() } }); }
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.setTitle(T('set.title'));
  for (const t of tabs) {
    const wc = t.view.webContents;
    if (!isOurHome(wc.getURL())) continue;
    const u = new URL(wc.getURL());
    u.searchParams.set('lang', L());
    wc.loadURL(u.toString());
  }
  pushState();
}

// Keeps one small icon per site on this device, so Memory can show it without contacting the site again.
async function saveFavicon(wc, pageUrl, icons) {
  let host;
  try { host = new URL(pageUrl).hostname; } catch { return; }
  if (!favicons || !host || isSensitiveHost(host) || favicons.has(host) || !/^https?:/.test(pageUrl)) return;
  for (const icon of icons.slice(0, 3)) {
    try {
      if (icon.startsWith('data:')) { if (favicons.set(host, icon)) return; continue; }
      if (!/^https?:/.test(icon)) continue;
      const res = await wc.session.fetch(icon, { signal: AbortSignal.timeout(4000) });
      const data = await toDataUrl(res);
      if (data && favicons.set(host, data)) return;
    } catch { /* try the next one */ }
  }
}

// ---- Writing help: Tasks window, right-click Lore AI menu, toasts ---------------------------------------------------

// Light, dark, or follow the system. Setting the theme source also decides what pages see as their preferred colour scheme.
function applyAppearance() {
  const a = settings.get().appearance;
  nativeTheme.themeSource = ['light', 'dark'].includes(a) ? a : 'system';
  const bg = nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF';
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.setBackgroundColor(bg);
  if (win && !win.isDestroyed()) pushState();
}

// A new tab is for typing: the cursor goes straight into the address and ask box.
const focusIntent = () => { if (win && !win.isDestroyed()) { win.webContents.focus(); win.webContents.send('focus-intent'); } };
const toast = (t) => { if (win && !win.isDestroyed()) win.webContents.send('toast', t); };

function openTasks(req) {
  const query = { lang: L() };
  if (req && req.quick) Object.assign(query, { quick: String(req.quick.request).slice(0, 2000), kind: req.quick.kind, reply: req.quick.reply ? '1' : '0' });
  else if (req && req.select) Object.assign(query, { select: req.select, auto: req.auto ? '1' : '0' });
  if (tasksWin && !tasksWin.isDestroyed()) {
    tasksWin.show();
    tasksWin.focus();
    if (req) tasksWin.webContents.send('tasks:open', req);
    return;
  }
  tasksWin = new Sheet({ name: 'tasks',
    width: 760, height: 700, minWidth: 520, minHeight: 480, title: T('task.title'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'tasks-preload.js'), contextIsolation: true, sandbox: true }
  });
  tasksWin.setMenuBarVisibility(false);
  tasksWin.loadFile(path.join(__dirname, 'ui', 'tasks.html'), { query });
  tasksWin.on('closed', () => { tasksWin = null; });
}

// Opens an address in a new tab of the main window and brings that window to the front.
function openInLore(url) {
  if (!isAllowedNavigation(url)) throw new Error('blocked');
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  openTab({ url });
}

const clip = (v, n = 6000) => String(v == null ? '' : v).slice(0, n);

function wireTasksIpc() {
  const trusted = (e) => tasksWin && e.sender === tasksWin.webContents;
  const none = () => ({ error: 'task.err' });
  ipcMain.handle('tasks:list', async (e) => (trusted(e) ? { tasks: taskStore.list(), prefs: taskStore.prefs, ready: (await modelInfo()).ready } : none()));
  // A request typed in the Tasks box: work out whether it is an email, an event or a post.
  ipcMain.handle('tasks:classify', (e, text) => {
    if (!trusted(e)) return { kind: 'text', reply: false };
    const r = classify(String(text).slice(0, 500));
    return r.kind === 'write' ? { kind: r.task === 'reply' ? 'email' : r.task, reply: r.task === 'reply' } : { kind: 'text', reply: false };
  });
  ipcMain.handle('tasks:save', (e, t) => {
    if (!trusted(e) || !t || typeof t !== 'object') return none();
    try { return { task: taskStore.save({ id: t.id ? String(t.id) : undefined, name: t.name, kind: t.kind, instruction: t.instruction }) }; } catch (err) { return { error: String(err.message).startsWith('task.err') ? err.message : 'task.err' }; }
  });
  ipcMain.handle('tasks:remove', (e, id) => (trusted(e) ? taskStore.remove(String(id)) : false));
  // What is on the page the user came from. Shown in the form before anything is sent anywhere.
  ipcMain.handle('tasks:context', async (e, needPage) => {
    if (!trusted(e)) return {};
    const tab = active();
    if (!tab || tab.isHome || !/^https?:/.test(tab.url)) return {};
    const out = { url: clip(tab.url, 500), title: clip(tab.title, 200) };
    // A slow or busy page must not leave the form waiting: give each read a few seconds, then go on without it.
    const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(''), ms))]);
    try { out.selection = clip(await within(tab.view.webContents.executeJavaScriptInIsolatedWorld(1005, [{ code: 'String(getSelection())' }]), 2500)); } catch { /* page gone */ }
    out.selection = shield.prepare((out.selection || '').trim()).text;
    // "content" is what the user is pointing at: the selected text, or else the whole page.
    let report = shield.prepare(out.selection).report;
    if (needPage && !out.selection) {
      const r = await within(pageRead(tab), 6000);
      if (r && r.text != null) { out.page = pageassist.samplePage(r.text, 12000); report = r.report; }
    }
    out.safety = shield.worthWarning(report) ? report : null;
    out.content = out.selection || out.page || '';
    out.source = out.selection ? 'selection' : out.page ? 'page' : '';
    return out;
  });
  ipcMain.handle('tasks:run', async (e, req) => {
    if (!trusted(e) || !req || typeof req !== 'object') return none();
    let task;
    if (req.id === 'quick') {
      if (!taskLib.KINDS.includes(req.kind)) return none();
      task = { id: 'quick', kind: req.kind, instruction: req.reply ? 'Write a reply to the message below, as I describe: {{request}}\n\nMESSAGE:\n{{content}}' : '{{request}}' };
    } else task = taskStore.get(String(req.id));
    if (!task) return none();
    const m = await modelInfo();
    if (!m.ready) return { error: 'task.noModel' };
    const values = {};
    for (const [k, v] of Object.entries(req.values || {})) if (/^\w{1,40}$/.test(k)) values[k] = clip(v, k === 'content' || k === 'page' ? 14000 : 6000);
    const lang = ['en', 'vi'].includes(req.lang) ? req.lang : 'auto';
    try {
      const raw = await llm.chat(taskLib.buildMessages(task, values, { lang, uiLang: L(), now: Date.now() }), { maxTokens: task.kind === 'text' ? 2500 : 1500, timeoutMs: 120000, temperature: 0.4 });
      const truncated = !!llm.truncated;
      const result = taskLib.parse(task.kind, task.kind === 'text' ? pageassist.cutAtSentence(raw, truncated) : raw);
      const text = result.text || result.body || result.title || '';
      if (!String(text).trim()) return { error: 'task.err.empty' };
      const platform = taskLib.platformOf(task, values);
      if (task.id !== 'quick') taskStore.remember(task.id, values);
      return { ok: true, result, platform, max: taskLib.PLATFORM[platform].max, remote: m.remote, truncated };
    } catch (err) { return { error: err && err.status === 401 ? 'llm.keyRejected' : 'task.err' }; }
  });
  // The only things Lore does with a draft: copy it, or open it in a new Lore tab (webmail, calendar, a social
  // site) or in the user's own mail or calendar app. None of them sends, posts or books anything: the user
  // reviews the draft there and confirms.
  ipcMain.handle('tasks:act', async (e, req) => {
    if (!trusted(e) || !req || typeof req !== 'object') return none();
    try {
      if (req.type === 'copy') { clipboard.writeText(clip(req.text, 20000)); return { ok: true }; }
      if (req.type === 'mail') {
        const provider = taskLib.MAIL.includes(req.provider) ? req.provider : 'gmail';
        const d = { to: clip(req.to, 500), subject: clip(req.subject, 300), body: clip(req.body, 20000) };
        taskStore.setChoice('mail', provider);
        if (provider === 'app') {
          const url = taskLib.buildMailto(d);
          if (url.length > taskLib.MAX_URL) { clipboard.writeText(d.body); return { error: 'act.tooLong' }; }
          await shell.openExternal(url);
          return { ok: true, where: 'app' };
        }
        // A very long message does not fit in an address: open the draft without it and copy the text to paste.
        let url = taskLib.webmailUrl(provider, d);
        const long = url.length > taskLib.MAX_URL;
        if (long) { url = taskLib.webmailUrl(provider, d, { withBody: false }); clipboard.writeText(d.body); }
        openInLore(url);
        return { ok: true, where: 'lore', copied: long };
      }
      if (req.type === 'cal') {
        const provider = taskLib.CAL.includes(req.provider) ? req.provider : 'google';
        const ev = { title: clip(req.event && req.event.title, 200), start: clip(req.event && req.event.start, 16), end: clip(req.event && req.event.end, 16), location: clip(req.event && req.event.location, 300), notes: clip(req.event && req.event.notes, 4000) };
        taskStore.setChoice('cal', provider);
        if (provider === 'google') { openInLore(taskLib.gcalUrl(ev)); return { ok: true, where: 'lore' }; }
        if (provider === 'outlook') { openInLore(taskLib.outlookCalUrl(ev)); return { ok: true, where: 'lore' }; }
        const file = path.join(os.tmpdir(), 'lore-event-' + Date.now().toString(36) + '.ics');
        fs.writeFileSync(file, taskLib.buildIcs(ev));
        setTimeout(() => fs.unlink(file, () => {}), 120000).unref();
        const err = await shell.openPath(file);
        return err ? { error: 'task.err' } : { ok: true, where: 'app' };
      }
      if (req.type === 'compose') {
        const text = clip(req.text, 20000);
        clipboard.writeText(text);
        openInLore(taskLib.composeUrl(String(req.platform), text));
        return { ok: true, where: 'lore', copied: true };
      }
    } catch { /* fall through */ }
    return none();
  });
  ipcMain.on('settings:open-from-tasks', (e) => { if (trusted(e)) openSettings(); });
}

// Right-click: what the page offers (links, images, selected text, text boxes) plus the Lore AI actions (BRW-23).
function showContextMenu(tab, params) {
  if (tab.isHome && !params.isEditable) return;
  const wc = tab.view.webContents;
  const sel = (params.selectionText || '').trim();
  const edit = params.isEditable;
  const link = isAllowedNavigation(params.linkURL || '') && params.linkURL;
  const img = params.mediaType === 'image' && isAllowedNavigation(params.srcURL || '') ? params.srcURL : '';
  const items = [];
  const sep = () => { if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' }); };
  if (link) {
    items.push(
      { label: T('ctx.openTab'), click: () => openTab({ url: link }, { private: tab.private }) },
      { label: T('ctx.openPrivate'), click: () => openPrivate({ url: link }) },
      { label: T('ctx.copyLink'), click: () => clipboard.writeText(link) }
    );
    sep();
  }
  if (params.mediaType === 'video' && !tab.private) {
    items.push({ label: T('ctx.pip'), click: () => wc.executeJavaScriptInIsolatedWorld(1005, [{ code: `(() => { const v = [...document.querySelectorAll('video')].find((x) => !x.paused) || document.querySelector('video'); if (v && document.pictureInPictureEnabled) v.requestPictureInPicture().catch(() => {}); })()` }]).catch(() => {}) });
    sep();
  }
  if (img) {
    items.push(
      { label: T('ctx.openImage'), click: () => openTab({ url: img }, { private: tab.private }) },
      { label: T('ctx.saveImage'), click: () => { tab.saveAs = true; wc.downloadURL(img); } },
      { label: T('ctx.copyImage'), click: () => wc.copyImageAt(params.x, params.y) },
      { label: T('ctx.copyImageUrl'), click: () => clipboard.writeText(img) }
    );
    sep();
  }
  if (edit) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut', enabled: !!sel }, { role: 'copy', enabled: !!sel }, { role: 'paste' }, { role: 'selectAll' });
  else if (sel) items.push({ role: 'copy' });
  if (sel && !edit) {
    const q = sel.replace(/\s+/g, ' ').slice(0, 200);
    items.push({ label: T('ctx.search', { q: q.length > 30 ? q.slice(0, 30) + '…' : q }), click: () => openTab({ url: searchUrl(q) }, { private: tab.private }) });
  }
  if (sel || edit) {
    const A = (action, label, extra) => ({ label, click: () => runWriting(tab, action, params, extra) });
    const other = L() === 'vi' ? 'en' : 'vi';
    const ai = [
      ...(edit ? [A('rewrite', T('ai.rewrite')), A('fix', T('ai.fix')), A('shorten', T('ai.shorten')), A('expand', T('ai.expand')), A('formal', T('ai.formal')), A('friendly', T('ai.friendly')), { type: 'separator' }] : []),
      A('translate', T('ai.translate', { lang: writing.targetName(L()) }), { target: L() }),
      ...(edit ? [A('translate', T('ai.translate', { lang: writing.targetName(other) }), { target: other })] : []),
      A('explain', T('ai.explain')), A('summarize', T('ai.summarize')),
      ...(sel && !edit ? [{ type: 'separator' }, { label: T('ai.reply'), click: () => openTasks({ quick: { kind: 'email', request: '', reply: true } }) }] : [])
    ];
    sep();
    items.push({ label: T('ai.menu'), submenu: ai });
  }
  if (!sel && !edit && !link && !img) {
    const nav = wc.navigationHistory;
    items.push(
      { label: T('nav.back'), enabled: nav.canGoBack(), click: () => nav.goBack() },
      { label: T('nav.forward'), enabled: nav.canGoForward(), click: () => nav.goForward() },
      { label: T('nav.reload'), click: () => wc.reload() },
      { type: 'separator' },
      { label: T('menu.find'), accelerator: 'CmdOrCtrl+F', click: () => openFind() }
    );
  }
  sep();
  items.push({ label: T('ctx.inspect'), click: () => { wc.inspectElement(params.x, params.y); if (wc.isDevToolsOpened()) wc.devToolsWebContents.focus(); } });
  Menu.buildFromTemplate(items).popup({ window: win });
}

async function fieldText(wc) {
  try {
    return await wc.executeJavaScriptInIsolatedWorld(1005, [{ code: '(() => { const e = document.activeElement; if (!e) return ""; if ("value" in e) return String(e.value); return e.isContentEditable ? e.innerText : ""; })()' }]);
  } catch { return ''; }
}

async function runWriting(tab, action, params, { target } = {}) {
  const wc = tab.view.webContents;
  const m = await modelInfo();
  if (!m.ready) return toast({ text: T('ai.noModel'), action: 'settings', actionLabel: T('task.openSettings') });
  const a = writing.ACTIONS[action];
  const selected = (params.selectionText || '').trim();
  const whole = !selected && params.isEditable;
  const prep = shield.prepare(selected || (whole ? String(await fieldText(wc)).trim() : ''));
  const text = prep.text;
  if (!text) return toast({ text: T('ai.nothing') });
  const label = action === 'translate' ? T('ai.translate', { lang: writing.targetName(target || L()) }) : T('ai.' + action);
  toast({ text: T('ai.working', { a: label }), busy: true });
  let out;
  try { out = await writing.run(action, text, { llm, lang: L(), target: target || L() }); } catch { return toast({ text: T('ai.fail') }); }
  const replace = a.mode === 'replace' && params.isEditable;
  if (replace) {
    if (active() !== tab || wc.isDestroyed()) { clipboard.writeText(out); return toast({ text: T('ai.moved') }); }
    if (whole) wc.selectAll();
    wc.insertText(out);
    return toast({ text: T('ai.done', { k: process.platform === 'darwin' ? '⌘' : 'Ctrl+' }) });
  }
  toast(null);
  if (active() !== tab) return;
  const fresh = claimPanel(tab);
  sendPage({ mode: 'sel', state: 'done', question: label, answer: out, ai: true, safety: shield.worthWarning(prep.report) ? prep.report : null, model: m.model, remote: m.remote, seq: ++paSeq, reset: fresh, page: pageMeta(tab) });
}

// ---- Print, save as PDF, view source, reading list (BRW-11, BRW-22, BRW-20) ------------------------------------------------
const webTab = () => { const t = active(); return t && !t.isHome && /^https?:/.test(t.url) ? t : null; };
function printPage() { const t = webTab(); if (t) t.view.webContents.print({ silent: false, printBackground: true }); }
async function savePdf() {
  const t = webTab();
  if (!t) return;
  const name = (t.title || hostOfUrl(t.url) || 'page').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'page';
  const r = await dialog.showSaveDialog(win, { defaultPath: name + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return;
  try { fs.writeFileSync(r.filePath, await t.view.webContents.printToPDF({ printBackground: true })); toast({ text: T('pdf.saved') }); } catch { toast({ text: T('pdf.failed') }); }
}
// The page's own HTML as the server sent it, in a plain window. It is text only: nothing in it can run.
async function viewSource() {
  const t = webTab();
  if (!t) return;
  let text;
  try { const r = await t.view.webContents.session.fetch(t.url, { signal: AbortSignal.timeout(20000) }); text = await r.text(); } catch { return toast({ text: T('src.failed') }); }
  const w = new BrowserWindow({ width: 900, height: 700, title: T('src.title', { host: hostOfUrl(t.url) }), parent: win, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  w.setMenuBarVisibility(false);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>source</title><style>body{margin:0;font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#fff;color:#12161C}@media(prefers-color-scheme:dark){body{background:#10151E;color:#E9EDF3}}pre{margin:0;padding:16px;white-space:pre-wrap;word-break:break-all}</style><pre>${esc(text.slice(0, 2e6))}</pre>`));
}
// Saved for later: a bookmark in a folder of its own, so it shows in the bookmarks window and the bar.
function readLater() {
  const t = webTab();
  if (!t || t.private) return;
  const folder = T('rl.folder');
  if (!bookmarks.items.some((b) => b.url === t.url && b.folder === folder)) bookmarks.add({ url: t.url, title: t.title, folder });
  pushState();
  toast({ text: T('rl.added'), action: 'bookmarks', actionLabel: T('rl.open') });
}

// ---- Passwords (BRW-12) ------------------------------------------------------------------------------------------------
let pwWin = null;
const lastPrompt = new Map(); // host -> time of the last offer, so a page cannot ask again and again
async function offerSave(tab, { user, pass }) {
  const host = hostOfUrl(tab.url).replace(/^www\./, '');
  const kind = vault.classify(host, user, pass);
  if (process.env.LORE_DEBUG) console.log('[pw] offer', host, kind, user ? 'user' : 'no-user');
  if (kind === 'same' || kind === 'never' || Date.now() - (lastPrompt.get(host) || 0) < 60000) return;
  lastPrompt.set(host, Date.now());
  const r = await dialog.showMessageBox(win, {
    type: 'question', buttons: [T(kind === 'update' ? 'pw.update' : 'pw.saveBtn'), T('pw.notNow'), T('pw.never')], defaultId: 0, cancelId: 1,
    message: T(kind === 'update' ? 'pw.updateAsk' : 'pw.saveAsk', { host }), detail: user ? T('pw.askUser', { user }) : ''
  });
  if (r.response === 0) { vault.save({ host, user, pass }); toast({ text: T('pw.saved') }); } else if (r.response === 2) vault.neverFor(host);
}
async function fillPassword() {
  const t = webTab();
  if (!t || t.private) return;
  const host = hostOfUrl(t.url).replace(/^www\./, '');
  const found = vault.forSite(host);
  if (!found.length) return toast({ text: T('pw.none', { host }) });
  if (!(await unlock())) return;
  const put = async (x) => {
    const code = `((u, p) => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      const pw = [...document.querySelectorAll('input[type=password]')].find(vis);
      if (!pw) return false;
      const us = [...(pw.form || document).querySelectorAll('input')].filter((i) => vis(i) && ['text', 'email', 'tel'].includes(i.type || 'text') && (i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (u && us.length) set(us[us.length - 1], u);
      set(pw, p);
      return true;
    })(${JSON.stringify(x.user).replace(/\u2028|\u2029/g, '')}, ${JSON.stringify(x.pass).replace(/\u2028|\u2029/g, '')})`;
    let ok = false;
    try { ok = await t.view.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code }]); } catch { ok = false; }
    toast({ text: ok ? T('pw.filled') : T('pw.nofield') });
  };
  if (found.length === 1) return put(found[0]);
  Menu.buildFromTemplate(found.map((x) => ({ label: x.user || T('pw.noUser'), click: () => put(x) }))).popup({ window: win });
}
function openPasswords() {
  if (pwWin && !pwWin.isDestroyed()) { pwWin.close(); return; }
  pwWin = new Sheet({ name: 'pw',
    width: 760, height: 620, minWidth: 520, minHeight: 420, title: T('pw.h'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'passwords-preload.js'), contextIsolation: true, sandbox: true }
  });
  pwWin.setMenuBarVisibility(false);
  pwWin.loadFile(path.join(__dirname, 'ui', 'passwords.html'), { query: { lang: L() } });
  pwWin.on('closed', () => { pwWin = null; });
}
function wirePasswordsIpc() {
  const ok = (e) => pwWin && e.sender === pwWin.webContents;
  ipcMain.on('pw:submit', (e, d) => {
    const tab = tabForWc(e.sender.id);
    if (!tab || tab.private || !d || typeof d.pass !== 'string' || typeof d.user !== 'string' || !d.pass) return;
    let u; try { u = new URL(tab.url); } catch { return; }
    if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) return;
    offerSave(tab, { user: d.user.slice(0, 200), pass: d.pass.slice(0, 500) });
  });
  ipcMain.handle('pw:list', (e) => (ok(e) ? vault.view() : []));
  ipcMain.handle('pw:add', (e, site, user, pass) => {
    if (!ok(e)) return false;
    const host = String(site).trim().replace(/^https?:\/\//, '').split('/')[0];
    return !!vault.save({ host, user: String(user).trim(), pass: String(pass) });
  });
  ipcMain.handle('pw:remove', (e, id) => { if (ok(e)) vault.remove(Number(id)); return true; });
  ipcMain.handle('pw:copy', async (e, id) => {
    if (!ok(e) || !(await unlock())) return false;
    const x = vault.get(Number(id));
    if (!x) return false;
    clipboard.writeText(x.pass);
    setTimeout(() => { if (clipboard.readText() === x.pass) clipboard.clear(); }, 30000).unref();
    return true;
  });
  ipcMain.handle('pw:check', async (e, id) => {
    if (!ok(e)) return { error: true };
    const x = vault.get(Number(id));
    if (!x) return { error: true };
    try { return { n: await breachLib.timesSeen(x.pass, (u, o) => net.fetch(u, o)) }; } catch { return { error: true }; }
  });
  ipcMain.handle('pw:generate', (e) => (ok(e) ? pwLib.generate(20) : ''));
}

// ---- Automations: posting a prepared text on a schedule (while Lore is open) ---------------------------------------------------
// Only text the person approved, only on the schedule they approved, only while Lore is open. The post is made in a small window
// that uses the profile's own sign-in; if anything fails, the window stays open and the text is on the clipboard.
let autoWin = null;
let autoBusy = false;
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const autoUrl = (a) => (a.site === 'test' ? a.url : autoLib.SITES[a.site].url);
const autoSession = () => (partitionFor(profiles.active) ? session.fromPartition(partitionFor(profiles.active)) : session.defaultSession);
function notifyUser(title, body) { try { if (Notification.isSupported()) new Notification({ title, body, silent: false }).show(); } catch { /* no notifications here */ } toast({ text: title + ' ' + body }); }
function pushAuto() { if (autoWin && !autoWin.isDestroyed()) autoWin.webContents.send('auto:update', autoStore.view()); }

async function runAutomation(a) {
  if (autoBusy || !autoStore.trusted(a)) return;
  if (a.site === 'test' && !process.env.LORE_AUTOTEST) return;
  const text = autoStore.nextText(a);
  if (!text) return;
  autoBusy = true;
  const label = autoLib.SITES[a.site].name;
  const n = a.runCount + 1;
  let w = null;
  let result = { ok: false, note: '' };
  try {
    w = new BrowserWindow({ width: 1000, height: 740, show: false, title: T('auto.posting', { n, total: a.drafts.length, site: label }), webPreferences: { sandbox: true, contextIsolation: true, session: autoSession() } });
    w.setMenuBarVisibility(false);
    w.showInactive();
    await Promise.race([w.loadURL(autoUrl(a)).catch(() => {}), sleepMs(30000)]);
    await sleepMs(3500);
    // The approval is checked again right before acting.
    result = autoStore.trusted(a) ? await composer.post(w.webContents, { site: a.site, text, allowAnyHost: a.site === 'test' }) : { ok: false, note: 'changed after approval' };
  } catch (e) { result = { ok: false, note: String(e && e.message || e).slice(0, 120) }; }
  autoStore.recordRun(a.id, result);
  if (result.ok) {
    notifyUser(T('auto.posted', { n, total: a.drafts.length, site: label }), '');
    setTimeout(() => { try { if (w && !w.isDestroyed()) w.close(); } catch { /* gone */ } }, 4000);
  } else {
    clipboard.writeText(text);
    notifyUser(T('auto.failed', { site: label }), T('auto.failedWhy', { why: result.note || '?' }));
    try { if (w && !w.isDestroyed()) w.show(); } catch { /* gone */ }
  }
  autoBusy = false;
  pushAuto();
}
function automationTick() {
  if (!autoStore || autoBusy) return;
  const now = Date.now();
  for (const a of autoStore.late(now)) autoStore.skip(a.id, now); // too long ago to make up
  const [a] = autoStore.due(now);
  if (a) runAutomation(a);
}

function openAutomations() {
  if (autoWin && !autoWin.isDestroyed()) return autoWin.close();
  autoWin = new Sheet({ name: 'automations',
    title: T('auto.title'),
    webPreferences: { preload: path.join(__dirname, 'automations-preload.js'), contextIsolation: true, sandbox: true }
  });
  autoWin.loadFile(path.join(__dirname, 'ui', 'automations.html'), { query: { lang: L() } });
  autoWin.on('closed', () => { autoWin = null; });
}

function wireAutomationsIpc() {
  const ok = (e) => autoWin && !autoWin.isDestroyed() && e.sender === autoWin.webContents;
  const hm = (t) => new Date(t).toLocaleTimeString(L() === 'vi' ? 'vi-VN' : undefined, { hour: '2-digit', minute: '2-digit' });
  ipcMain.on('auto:open', (e) => { if (e.sender === win.webContents) openAutomations(); });
  ipcMain.handle('auto:list', (e) => (ok(e) ? { items: autoStore.view(), test: !!process.env.LORE_AUTOTEST } : { items: [] }));
  // The ready-made use case: one introduction of a feature of Lore every hour for the rest of today, on Facebook.
  ipcMain.handle('auto:template', (e) => {
    if (!ok(e)) return null;
    const now = new Date();
    const start = new Date(now); start.setMinutes(0, 0, 0); start.setHours(now.getHours() + (now.getMinutes() > 50 ? 2 : 1));
    const end = new Date(now); end.setHours(23, 59, 59, 0);
    const slots = Math.max(1, Math.min(8, Math.floor((end - start) / 3600000) + 1));
    if (start > end) return { error: 'late' };
    autoStore.add({ kind: 'post', site: 'facebook', name: T('auto.tplName'), drafts: featurePosts(L(), slots), schedule: { type: 'every', minutes: 60 }, startAt: start.getTime(), until: end.getTime() });
    return { items: autoStore.view() };
  });
  ipcMain.handle('auto:edit', (e, id, drafts) => {
    if (!ok(e) || !Array.isArray(drafts)) return null;
    try { autoStore.update(String(id), { drafts: drafts.map(String) }); } catch { return { error: 'bad' }; }
    return { items: autoStore.view() };
  });
  ipcMain.handle('auto:approve', async (e, id) => {
    if (!ok(e)) return null;
    const a = autoStore.get(String(id));
    if (!a) return null;
    const label = autoLib.SITES[a.site].name;
    const r = await dialog.showMessageBox(win, {
      type: 'warning', buttons: [T('auto.approveGo'), T('set.priv.cancel')], defaultId: 1, cancelId: 1,
      message: T('auto.approveAsk', { n: a.drafts.length, site: label }),
      detail: T('auto.approveDetail', { site: label, every: a.schedule.minutes || 0, from: hm(a.startAt), to: hm(a.until || a.startAt), first: a.drafts[0].slice(0, 120) })
    });
    if (r.response !== 0) return { items: autoStore.view() };
    autoStore.approve(a.id);
    pushAuto();
    return { items: autoStore.view() };
  });
  ipcMain.handle('auto:pause', (e, id, on) => { if (!ok(e)) return null; autoStore.pause(String(id), !!on); return { items: autoStore.view() }; });
  ipcMain.handle('auto:remove', async (e, id) => {
    if (!ok(e)) return null;
    const r = await dialog.showMessageBox(win, { type: 'question', buttons: [T('auto.delete'), T('set.priv.cancel')], defaultId: 1, cancelId: 1, message: T('auto.deleteAsk') });
    if (r.response === 0) autoStore.remove(String(id));
    return { items: autoStore.view() };
  });
  // Post the next text right now (still only approved text), after asking again.
  ipcMain.handle('auto:runNow', async (e, id) => {
    if (!ok(e)) return null;
    const a = autoStore.get(String(id));
    if (!a || !autoStore.trusted(a) || !autoStore.nextText(a)) return { items: autoStore.view() };
    // (the automated tests have no one to answer a dialog; they only ever use the stand-in page)
    const r = process.env.LORE_AUTOTEST && a.site === 'test' ? { response: 0 } : await dialog.showMessageBox(win, { type: 'warning', buttons: [T('auto.runGo'), T('set.priv.cancel')], defaultId: 1, cancelId: 1, message: T('auto.runAsk', { site: autoLib.SITES[a.site].name }), detail: autoStore.nextText(a).slice(0, 300) });
    if (r.response === 0) runAutomation(a);
    return { items: autoStore.view() };
  });
  // Only for the automated tests: makes an approved automation on the stand-in page.
  if (process.env.LORE_AUTOTEST) ipcMain.handle('auto:testcreate', (e, spec) => { if (!ok(e)) return null; const a = autoStore.add({ ...spec, site: 'test', kind: 'post' }); autoStore.approve(a.id); return { items: autoStore.view() }; });
}

// ---- Lock (PRV-06), self-destructing tabs (PRV-05), email aliases (PRV-07), breach check (PRV-08) ------------------------
// The lock asks for Touch ID on a Mac that has it. Windows and Linux have no equivalent in Electron, so the switch is
// shown as unavailable there rather than pretending to protect anything.
const lockAvailable = () => { try { return process.platform === 'darwin' && systemPreferences.canPromptTouchID(); } catch { return false; } };
let unlockedUntil = 0;
async function unlock() {
  if (!settings.get().privacy.lock || !lockAvailable()) return true;
  if (Date.now() < unlockedUntil) return true;
  try { await systemPreferences.promptTouchID(T('lock.reason')); unlockedUntil = Date.now() + 5 * 60000; return true; } catch { return false; }
}
async function openPrivate(target) { if (await unlock()) return openTab(target, { private: true }); return null; }
async function openMemoryLocked() { if (await unlock()) openMemory(); }

function openEphemeral(minutes) {
  const t = openTab(undefined, { private: true });
  if (!t) return;
  t.ephemeral = setTimeout(() => { if (tabs.includes(t)) { closeTab(t.id); toast({ text: T('eph.closed') }); } }, minutes * 60000);
  if (minutes > 2) t.ephemeralWarn = setTimeout(() => { if (tabs.includes(t)) toast({ text: T('eph.soon') }); }, (minutes - 1) * 60000);
  toast({ text: T('eph.opened', { n: minutes }) });
}

async function createAlias() {
  const a = settings.get().alias;
  if (a.provider === 'off' || !a.key) return toast({ text: T('alias.setup'), action: 'settings', actionLabel: T('menu.settings') });
  const t = active();
  const site = t && /^https?:/.test(t.url) ? hostOfUrl(t.url).replace(/^www\./, '') : '';
  try {
    const email = await aliasLib.create({ provider: a.provider, key: a.key, note: site });
    clipboard.writeText(email);
    toast({ text: T('alias.done', { email }) });
  } catch (err) { toast({ text: T(err.message === 'alias.key' ? 'alias.badKey' : 'alias.fail') }); }
}

let breachWin = null;
function openBreach() {
  if (breachWin && !breachWin.isDestroyed()) { breachWin.close(); return; }
  breachWin = new Sheet({ name: 'breach',
    width: 480, height: 330, resizable: false, minimizable: false, title: T('br.h'), parent: win,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'breach-preload.js'), contextIsolation: true, sandbox: true }
  });
  breachWin.setMenuBarVisibility(false);
  breachWin.loadFile(path.join(__dirname, 'ui', 'breach.html'), { query: { lang: L() } });
  breachWin.on('closed', () => { breachWin = null; });
  ipcMain.removeHandler('breach:check');
  ipcMain.handle('breach:check', async (e, pw) => {
    if (!breachWin || e.sender !== breachWin.webContents) return { error: true };
    try { return { n: await breachLib.timesSeen(String(pw).slice(0, 200), (u, o) => net.fetch(u, o)) }; } catch { return { error: true }; }
  });
}

// ---- Tooltips -------------------------------------------------------------------------------------------------------------
// The browser window's own page sits under the page card, so a tip drawn there can be hidden. This small view is drawn on top.
let tipView = null;
let tipWant = null;
function hideTip() { tipWant = null; if (tipView && win && !win.isDestroyed()) { try { win.contentView.removeChildView(tipView); } catch { /* not shown */ } } }
function wireTipIpc() {
  ipcMain.on('tip:show', (e, d) => {
    if (e.sender !== win.webContents || !d || typeof d.text !== 'string' || ![d.x, d.y, d.w, d.h].every(Number.isFinite)) return;
    tipWant = { x: d.x, y: d.y, w: d.w, h: d.h, place: d.place === 'right' ? 'right' : 'below' };
    if (!tipView) {
      tipView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'tip-preload.js'), contextIsolation: true, sandbox: true } });
      tipView.setBackgroundColor('#00000000');
      tipView.webContents.loadFile(path.join(__dirname, 'ui', 'tip.html')).then(() => tipView && tipView.webContents.send('tip:text', { text: d.text.slice(0, 200), cap: String(d.cap || '').slice(0, 12) }));
    } else tipView.webContents.send('tip:text', { text: d.text.slice(0, 200), cap: String(d.cap || '').slice(0, 12) });
  });
  ipcMain.on('tip:size', (e, w, h) => {
    if (!tipView || e.sender !== tipView.webContents || !tipWant || !Number.isFinite(w) || !Number.isFinite(h)) return;
    const [cw, ch] = win.getContentSize();
    const a = tipWant;
    const x = a.place === 'right' ? a.x + a.w + 2 : a.x + a.w / 2 - w / 2;
    const y = a.place === 'right' ? a.y + a.h / 2 - h / 2 : a.y + a.h - 2;
    tipView.setBounds({ x: Math.round(Math.max(2, Math.min(cw - w - 2, x))), y: Math.round(Math.max(2, Math.min(ch - h - 2, y))), width: w, height: h });
    win.contentView.addChildView(tipView);
  });
  ipcMain.on('tip:hide', (e) => { if (e.sender === win.webContents) hideTip(); });
}

// ---- Privacy at a glance (PRV-15) and the weekly report (PRV-04) -----------------------------------------------------------
let privView = null;
let reportWin = null;
const PRIV_W = 330;
let privH = 424;
function layoutPriv() {
  if (!privView || !win) return;
  const [w] = win.getContentSize();
  const pw = agentOpen() ? PANEL_W : 0;
  privView.setBounds({ x: Math.max(0, w - INSET - (pw ? pw + SPLIT_GAP : 0) - PRIV_W - 12), y: chromeHeight() - 6, width: PRIV_W, height: privH });
}
function closePriv(refocus = true) {
  if (!privView || !win || win.isDestroyed()) return;
  try { win.contentView.removeChildView(privView); } catch { /* not shown */ }
  // Focus goes back to the page only when the panel is simply dismissed; when another window is opening or the person clicked
  // elsewhere, taking focus here would pull the main window in front of it.
  const t = active();
  if (refocus && t && win.isFocused()) t.view.webContents.focus();
}
function openPriv() {
  if (!privView) {
    privView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'priv-preload.js'), contextIsolation: true, sandbox: true } });
    privView.setBackgroundColor('#00000000');
    privView.webContents.loadFile(path.join(__dirname, 'ui', 'priv.html'), { query: { lang: L() } });
    privView.webContents.on('blur', () => setTimeout(() => { if (privView && !privView.webContents.isFocused()) closePriv(false); }, 120));
  }
  closeFind();
  win.contentView.addChildView(privView);
  layoutPriv();
  privView.webContents.send('priv:refresh');
  privView.webContents.focus();
}
function openReport() {
  if (reportWin && !reportWin.isDestroyed()) { reportWin.close(); return; }
  reportWin = new Sheet({ name: 'report',
    width: 600, height: 640, minWidth: 440, minHeight: 420, title: T('rep.h'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'report-preload.js'), contextIsolation: true, sandbox: true }
  });
  reportWin.setMenuBarVisibility(false);
  reportWin.loadFile(path.join(__dirname, 'ui', 'report.html'), { query: { lang: L() } });
  reportWin.on('closed', () => { reportWin = null; });
}
function wirePrivIpc() {
  const ok = (e) => privView && e.sender === privView.webContents;
  const siteOf = () => { const t = active(); return t && !t.isHome && /^https?:/.test(t.url) ? hostOfUrl(t.url).replace(/^www\./, '') : ''; };
  ipcMain.on('priv:open', (e) => { if (e.sender === win.webContents) (privView && privView.webContents && win.contentView.children.includes(privView) ? closePriv : openPriv)(); });
  ipcMain.handle('priv:get', (e) => {
    if (!ok(e)) return null;
    const pv = settings.get().privacy;
    const site = siteOf();
    return {
      host: site, site: !!site, ads: S.adsOn, https: pv.httpsFirst, memory: pv.memory, stripOn: pv.stripTracking,
      clean: pv.stripTracking && !pv.trackingOff.includes(site), ai: !pv.aiOff.includes(site), today: pstats.today()
    };
  });
  ipcMain.handle('priv:set', (e, key, value) => {
    if (!ok(e)) return false;
    const pv = settings.get().privacy;
    const site = siteOf();
    const without = (list) => list.filter((h) => h !== site);
    if (key === 'ads') { S.adsOn = value; pushState(); }
    else if (key === 'https') settings.update({ privacy: { httpsFirst: value } });
    else if (key === 'memory') settings.update({ privacy: { memory: value } });
    else if (key === 'clean' && site) settings.update({ privacy: { trackingOff: value ? without(pv.trackingOff) : [...pv.trackingOff, site] } });
    else if (key === 'ai' && site) settings.update({ privacy: { aiOff: value ? without(pv.aiOff) : [...pv.aiOff, site] } });
    return true;
  });
  ipcMain.on('priv:report', (e) => { if (ok(e)) { closePriv(false); openReport(); } });
  ipcMain.on('priv:settings', (e) => { if (ok(e)) { closePriv(false); openSettings(); } });
  ipcMain.on('priv:size', (e, h) => {
    if (!ok(e) || !Number.isFinite(h)) return;
    const [, ch] = win.getContentSize();
    privH = Math.max(160, Math.min(h, ch - chromeHeight() - 12));
    layoutPriv();
  });
  ipcMain.on('priv:close', (e) => { if (ok(e)) closePriv(); });
  ipcMain.handle('report:get', (e) => (reportWin && e.sender === reportWin.webContents ? pstats.week() : null));
  ipcMain.on('report:copy', (e, text) => { if (reportWin && e.sender === reportWin.webContents) clipboard.writeText(String(text).slice(0, 1000)); });
}

// ---- Find in page (BRW-01) ------------------------------------------------------------------------------------------
const FIND_W = 380;
function layoutFind() {
  if (!findView || !win) return;
  const [w] = win.getContentSize();
  const pw = agentOpen() ? PANEL_W : 0;
  findView.setBounds({ x: Math.max(0, w - INSET - (pw ? pw + SPLIT_GAP : 0) - FIND_W - 12), y: chromeHeight() + 8, width: FIND_W, height: 46 });
}
function openFind() {
  const t = active();
  if (!t || t.isHome || !/^https?:/.test(t.url)) return;
  if (!findView) {
    findView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'find-preload.js'), contextIsolation: true, sandbox: true } });
    findView.setBackgroundColor('#00000000');
    findView.webContents.loadFile(path.join(__dirname, 'ui', 'find.html'), { query: { lang: L() } });
  }
  win.contentView.addChildView(findView);
  layoutFind();
  findView.webContents.focus();
  findView.webContents.send('find:focus');
}
function closeFind() {
  if (!findView) return;
  const t = active();
  for (const x of tabs) { try { x.view.webContents.stopFindInPage('clearSelection'); } catch { /* tab gone */ } }
  if (win && !win.isDestroyed()) win.contentView.removeChildView(findView);
  if (t) t.view.webContents.focus();
}
function wireFind(wc) {
  wc.on('found-in-page', (_e, r) => {
    if (findView && active() && active().view.webContents === wc) findView.webContents.send('find:result', { active: r.activeMatchOrdinal, total: r.matches });
  });
}
function wireFindIpc() {
  const ok = (e) => findView && e.sender === findView.webContents;
  ipcMain.on('find:query', (e, text, forward, next) => {
    if (!ok(e)) return;
    const t = active();
    if (!t) return;
    const q = String(text || '').slice(0, 200);
    if (!q) { t.view.webContents.stopFindInPage('clearSelection'); findView.webContents.send('find:result', { active: 0, total: 0 }); return; }
    t.view.webContents.findInPage(q, { forward: forward !== false, findNext: !!next });
  });
  // AI-15: a question typed into find-in-page goes to the page assistant instead of failing to match.
  ipcMain.on('find:ask', (e, text) => {
    if (!ok(e)) return;
    const q = String(text || '').slice(0, 300).trim();
    closeFind();
    if (q) pageAssistant('ask', q);
  });
  ipcMain.on('find:close', (e) => { if (ok(e)) closeFind(); });
}

// ---- AI organize: tabs and bookmarks (AI-13) --------------------------------------------------------------------------
function openOrganize(source) {
  if (organizeWin && !organizeWin.isDestroyed()) { organizeWin.close(); organizeWin = null; }
  organizeWin = new Sheet({ name: 'organize',
    width: 620, height: 680, minWidth: 460, minHeight: 420, title: T('org.title'), parent: win, modal: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'organize-preload.js'), contextIsolation: true, sandbox: true }
  });
  organizeWin.setMenuBarVisibility(false);
  organizeWin.loadFile(path.join(__dirname, 'ui', 'organize.html'), { query: { lang: L(), source } });
  organizeWin.on('closed', () => { organizeWin = null; });
}
function wireOrganizeIpc() {
  const trusted = (e) => organizeWin && e.sender === organizeWin.webContents;
  const hostOf = (u) => hostOfUrl(u).replace(/^www\./, '');
  const source = (e) => (new URL(e.sender.getURL()).searchParams.get('source') === 'bookmarks' ? 'bookmarks' : 'tabs');

  ipcMain.handle('organize:propose', async (e) => {
    if (!trusted(e)) return null;
    const src = source(e);
    const m = await modelInfo();
    let items;
    if (src === 'tabs') items = tabs.filter((t) => !t.private && !t.isHome && /^https?:/.test(t.lazyUrl || t.url) && !isSensitiveHost(hostOf(t.lazyUrl || t.url))).map((t) => ({ id: t.id, title: t.title, url: t.lazyUrl || t.url }));
    else items = bookmarks.items.filter((b) => !b.folder).map((b) => ({ id: b.id, title: b.title, url: b.url }));
    const existing = src === 'tabs' ? [...groups.values()].map((g) => g.name) : bookmarks.folders();
    const r = await organize.propose({ items, llm: m.ready ? llm : null, lang: L(), existing, noun: src === 'tabs' ? 'tab' : 'bookmark' });
    const byId = new Map(items.map((i) => [i.id, i]));
    const show = (id) => { const i = byId.get(id); return { id, title: i.title || i.url, host: hostOf(i.url) }; };
    return {
      source: src, ai: r.ai, remote: m.ready ? m.remote : '', model: m.model, considered: r.considered, skipped: r.skipped, modelReady: m.ready,
      groups: r.groups.map((g) => ({ name: g.name, items: g.ids.map(show) })),
      ungrouped: r.ungrouped.map(show),
      duplicates: r.duplicates.map((d) => ({ ...show(d.id), of: byId.get(d.of) ? byId.get(d.of).title : '' }))
    };
  });

  ipcMain.handle('organize:apply', (e, plan) => {
    if (!trusted(e) || !plan || typeof plan !== 'object' || !Array.isArray(plan.groups)) return { ok: false };
    const src = source(e);
    const clean = plan.groups.slice(0, 12).map((g) => ({ name: String(g && g.name || '').trim().slice(0, 30), ids: [...new Set((g && g.ids || []).map(Number))].slice(0, 60) })).filter((g) => g.name && g.ids.length);
    if (src === 'bookmarks') {
      const before = bookmarks.items.map((b) => ({ id: b.id, folder: b.folder }));
      let n = 0;
      for (const g of clean) for (const id of g.ids) if (bookmarks.items.some((b) => b.id === id) && bookmarks.update(id, { folder: g.name })) n++;
      lastOrganize = { source: 'bookmarks', before };
      notifyBookmarks(); pushState();
      return { ok: true, moved: n };
    }
    const live = new Set(tabs.map((t) => t.id));
    const before = { order: tabs.map((t) => t.id), group: tabs.map((t) => [t.id, t.group]), groups: [...groups.values()].map((g) => ({ ...g })) };
    const dupes = (Array.isArray(plan.closeDuplicates) ? plan.closeDuplicates : []).map(Number).filter((id) => live.has(id) && id !== activeId);
    let n = 0;
    for (const g of clean) {
      const ids = g.ids.filter((id) => live.has(id) && !dupes.includes(id) && !tabs.find((t) => t.id === id).private);
      if (ids.length < 2) continue;
      const found = [...groups.values()].find((x) => x.name.toLowerCase() === g.name.toLowerCase());
      const gid = found ? found.id : newGroup(g.name, null);
      setOrder(tabstate.assign(tabs, [{ groupId: gid, ids }]));
      n += ids.length;
    }
    for (const id of dupes) closeTab(id);
    lastOrganize = { source: 'tabs', before, closed: dupes.length };
    pushState();
    return { ok: true, moved: n, closed: dupes.length };
  });

  ipcMain.on('settings:open-from-organize', (e) => { if (trusted(e)) openSettings(); });
  ipcMain.handle('organize:undo', (e) => {
    if (!trusted(e) || !lastOrganize) return false;
    const u = lastOrganize;
    lastOrganize = null;
    if (u.source === 'bookmarks') { for (const b of u.before) bookmarks.update(b.id, { folder: b.folder }); notifyBookmarks(); pushState(); return true; }
    const gmap = new Map(u.before.group);
    for (const t of tabs) t.group = gmap.has(t.id) ? gmap.get(t.id) : 0;
    groups.clear();
    for (const g of u.before.groups) groups.set(g.id, g);
    const pos = new Map(u.before.order.map((id, i) => [id, i]));
    setOrder(tabs.slice().sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e6) - (pos.has(b.id) ? pos.get(b.id) : 1e6)));
    return true;
  });
}

// ---- Compare tabs (AI-08) --------------------------------------------------------------------------------------------------
function openCompare(ids) {
  compareDefault = Array.isArray(ids) ? ids : [];
  if (compareWin && !compareWin.isDestroyed()) { compareWin.close(); }
  compareWin = new Sheet({ name: 'compare',
    width: 760, height: 640, minWidth: 520, minHeight: 420, title: T('cmp.h'), parent: win,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'compare-preload.js'), contextIsolation: true, sandbox: true }
  });
  compareWin.setMenuBarVisibility(false);
  compareWin.loadFile(path.join(__dirname, 'ui', 'compare.html'), { query: { lang: L() } });
  compareWin.on('closed', () => { compareWin = null; });
}
function wireCompareIpc() {
  const trusted = (e) => compareWin && e.sender === compareWin.webContents;
  const candidates = () => tabs.filter((t) => !t.private && !t.isHome && /^https?:/.test(t.lazyUrl || t.url) && !isSensitiveHost(hostOfUrl(t.lazyUrl || t.url)));
  ipcMain.handle('compare:tabs', (e) => {
    if (!trusted(e)) return { tabs: [], preselect: [] };
    const list = candidates();
    const pre = compareDefault.length ? compareDefault : [activeId, ...list.filter((t) => t.id !== activeId).slice(0, 1).map((t) => t.id)];
    return { tabs: list.map((t) => ({ id: t.id, title: t.title || t.url, host: hostOfUrl(t.url).replace(/^www\./, ''), loaded: !t.lazyUrl })), preselect: pre };
  });
  ipcMain.handle('compare:run', async (e, ids) => {
    if (!trusted(e) || !Array.isArray(ids)) return { error: 'bad' };
    const m = await modelInfo();
    if (!m.ready) return { error: 'noModel' };
    const picked = ids.map(Number).filter((id) => candidates().some((t) => t.id === id)).slice(0, comparer.MAX_PAGES).map((id) => tabById(id));
    if (picked.length < 2) return { error: 'bad' };
    const items = [];
    for (const [i, t] of picked.entries()) { const r = await pageRead(t); items.push({ n: i + 1, title: t.title || t.url, host: hostOfUrl(t.url).replace(/^www\./, ''), text: r.text }); }
    try {
      const rows = await comparer.compare({ items, llm, lang: L(), perPage: budgetFor(settings.get().aiSaving).compare });
      return { rows, pages: items.map((i) => ({ title: i.title, host: i.host })), remote: m.remote };
    } catch { return { error: 'failed' }; }
  });
  ipcMain.on('settings:open-from-compare', (e) => { if (trusted(e)) openSettings(); });
}

// AI bookmark: after the star is pressed, a model suggests a clean title, a folder and a one-line note.
async function aiBookmark(tab, item) {
  const m = await modelInfo();
  if (!m.ready || !bookmarks || tab.private || isSensitiveHost(hostOfUrl(tab.url))) return;
  const { text } = await pageRead(tab);
  const r = await aibookmark.suggest({ llm, title: tab.title, url: tab.url, text, folders: bookmarks.folders(), lang: L() }).catch(() => null);
  const live = r && bookmarks.items.find((b) => b.id === item.id);
  if (!live) return;
  bookmarks.update(item.id, {
    title: aibookmark.poorTitle(live.title, live.url) && r.title ? r.title : undefined,
    folder: !live.folder && r.folder ? r.folder : undefined,
    note: r.note || undefined
  });
  notifyBookmarks(); pushState();
  toast({ text: r.folder ? T('bm.aiSaved', { folder: r.folder }) : T('bm.aiNoted'), action: 'bookmarks', actionLabel: T('bm.edit') });
}

// ---- Bookmarks (BRW-02), history (BRW-03) and the lock area (BRW-07) ------------------------------------------------
const notifyBookmarks = () => { if (bookmarksWin && !bookmarksWin.isDestroyed()) bookmarksWin.webContents.send('bookmarks:changed'); };
function toggleBookmark() {
  const t = active();
  if (!t || t.isHome || !/^https?:/.test(t.url) || !bookmarks) return;
  const r = bookmarks.toggle(t.url, t.title);
  if (r.added) { toast({ text: T('bm.saved'), action: 'bookmarks', actionLabel: T('bm.edit') }); aiBookmark(t, r.item).catch(() => {}); }
  else toast({ text: T('bm.removed') });
  notifyBookmarks();
  pushState();
}
function openFromBar(url, newTab) {
  const t = active();
  if (!isAllowedNavigation(url)) return;
  if (newTab || !t) return openTab({ url });
  t.pending = url; pushState();
  t.view.webContents.loadURL(url);
}
function openBookmarks() {
  if (bookmarksWin && !bookmarksWin.isDestroyed()) return bookmarksWin.close();
  bookmarksWin = new Sheet({ name: 'bookmarks',
    width: 780, height: 700, minWidth: 520, minHeight: 420, title: T('bm.title'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'bookmarks-preload.js'), contextIsolation: true, sandbox: true }
  });
  bookmarksWin.setMenuBarVisibility(false);
  bookmarksWin.loadFile(path.join(__dirname, 'ui', 'bookmarks.html'), { query: { lang: L() } });
  bookmarksWin.on('closed', () => { bookmarksWin = null; });
}
function openHistory() {
  if (historyWin && !historyWin.isDestroyed()) return historyWin.close();
  historyWin = new Sheet({ name: 'history',
    width: 780, height: 720, minWidth: 520, minHeight: 420, title: T('hist.title'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'history-preload.js'), contextIsolation: true, sandbox: true }
  });
  historyWin.setMenuBarVisibility(false);
  historyWin.loadFile(path.join(__dirname, 'ui', 'history.html'), { query: { lang: L() } });
  historyWin.on('closed', () => { historyWin = null; });
}

function wireBrowserDataIpc() {
  const fromChrome = (e) => e.sender === win.webContents;
  ipcMain.on('bookmark:toggle', (e) => { if (fromChrome(e)) toggleBookmark(); });
  ipcMain.on('bookmark:bar', (e) => { if (!fromChrome(e) || !bookmarks) return; bookmarks.setBar(!bookmarks.bar); layout(); pushState(); });
  ipcMain.on('bookmark:open', (e, id, newTab) => { if (!fromChrome(e) || !bookmarks) return; const b = bookmarks.items.find((x) => x.id === Number(id)); if (b) openFromBar(b.url, !!newTab); });
  ipcMain.on('bookmark:folder', (e, title, x, y) => {
    if (!fromChrome(e) || !bookmarks) return;
    const items = bookmarks.list({ folder: String(title) }).sort((a, b) => a.ts - b.ts).map((b) => ({ label: (b.title || b.url).slice(0, 60), click: () => openFromBar(b.url, false) }));
    if (items.length > 1) items.unshift({ label: T('bm.openAll', { n: items.length }), click: () => openFolderAsGroup(String(title)) }, { type: 'separator' });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win, x: Math.round(Number(x) || 0), y: Math.round(Number(y) || 0) });
  });
  ipcMain.on('bookmarks:open', (e) => { if (fromChrome(e)) openBookmarks(); });
  ipcMain.on('history:open', (e) => { if (fromChrome(e)) openHistory(); });

  // The lock area: what the connection is, and the two things a person can do about it.
  ipcMain.on('security:menu', (e, x, y) => {
    if (!fromChrome(e)) return;
    const t = active();
    if (!t || t.isHome) return;
    const state = securityOf(t);
    const host = hostOfUrl(t.url);
    const label = { https: T('sec.https'), http: T('sec.http'), local: T('sec.local'), cert: T('sec.cert'), '': '' }[state];
    const up = state === 'http' ? secure.httpsVersion(t.url) : null;
    Menu.buildFromTemplate([
      { label, enabled: false },
      { label: host, enabled: false },
      { type: 'separator' },
      ...(up ? [{ label: T('sec.tryHttps'), click: () => openFromBar(up, false) }] : []),
      { label: T('sec.clearSite'), enabled: !!host, click: async () => {
        try { await t.view.webContents.session.clearStorageData({ origin: new URL(t.url).origin }); t.view.webContents.reload(); toast({ text: T('sec.cleared', { host }) }); } catch { /* page gone */ }
      } }
    ]).popup({ window: win, x: Math.round(Number(x) || 0), y: Math.round(Number(y) || 0) });
  });

  // -- bookmarks window
  const bmTrusted = (e) => bookmarksWin && e.sender === bookmarksWin.webContents;
  ipcMain.handle('bookmarks:list', (e, { q = '', folder } = {}) => {
    if (!bmTrusted(e)) return { items: [], folders: [] };
    const items = bookmarks.list({ q: String(q).slice(0, 200), folder: typeof folder === 'string' ? folder : undefined }).slice(0, 1000)
      .map((b) => ({ ...b, host: hostOfUrl(b.url), icon: favicons.get(hostOfUrl(b.url)) }));
    return { items, folders: bookmarks.folders(), total: bookmarks.items.length };
  });
  ipcMain.handle('bookmarks:update', (e, id, patch) => {
    if (!bmTrusted(e) || !patch || typeof patch !== 'object') return false;
    const r = bookmarks.update(Number(id), { title: patch.title, folder: patch.folder });
    pushState();
    return !!r;
  });
  ipcMain.handle('bookmarks:remove', (e, id) => { if (!bmTrusted(e)) return false; const r = bookmarks.remove(Number(id)); pushState(); return r; });
  ipcMain.on('bookmarks:openAll', (e, folder) => { if (bmTrusted(e) && typeof folder === 'string') openFolderAsGroup(folder); });
  ipcMain.on('bookmarks:go', (e, id) => { if (!bmTrusted(e)) return; const b = bookmarks.items.find((x) => x.id === Number(id)); if (b) openTab({ url: b.url }); });
  ipcMain.handle('bookmarks:export', async (e) => {
    if (!bmTrusted(e)) return false;
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), 'lore-bookmarks.html'), filters: [{ name: 'HTML', extensions: ['html'] }] });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, bookmarks.exportHtml());
    return true;
  });

  // -- history window: the same visits Memory keeps, shown by day. Deleting here deletes them from Memory too.
  const hiTrusted = (e) => historyWin && e.sender === historyWin.webContents;
  ipcMain.handle('history:list', (e, { q = '', range = 'all' } = {}) => {
    if (!hiTrusted(e)) return { items: [] };
    const from = RANGES[range] ? Date.now() - RANGES[range] : undefined;
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    const items = memory.list({ from })
      .filter((i) => words.every((w) => ((i.title || '') + ' ' + i.url).toLowerCase().includes(w)))
      .sort((a, b) => b.ts - a.ts).slice(0, 800)
      .map((i) => ({ url: i.url, title: i.title, ts: i.ts, host: hostOfUrl(i.url), icon: favicons.get(hostOfUrl(i.url)) }));
    return { items, total: memory.size };
  });
  // AI-15: a one-line note for a row, only when asked, from the text Memory already kept for that page.
  ipcMain.handle('history:note', async (e, url) => {
    if (!hiTrusted(e)) return '';
    const it = memory.items.find((x) => x.url === String(url));
    const m = await modelInfo();
    if (!it || !m.ready) return '';
    return pagenote.note({ title: it.title, text: it.text, llm, lang: L() });
  });
  ipcMain.handle('history:remove', (e, url) => (hiTrusted(e) ? memory.remove(String(url)) : false));
  ipcMain.handle('history:clear', async (e, range) => {
    if (!hiTrusted(e) || !(range === 'all' || RANGES[range])) return false;
    const ok = (await dialog.showMessageBox(win, { type: 'warning', buttons: [T('hist.clearGo'), T('set.priv.cancel')], defaultId: 1, cancelId: 1, message: T('hist.clearAsk.' + range), detail: T('hist.clearDetail') })).response === 0;
    if (!ok) return false;
    memory.removeSince(range);
    return true;
  });
  ipcMain.on('history:go', (e, url) => { if (hiTrusted(e) && isAllowedNavigation(String(url))) openTab({ url: String(url) }); });
}

// ---- Downloads window (BRW-04) ---------------------------------------------------------------------------------------
function openDownloads() {
  if (downloadsWin && !downloadsWin.isDestroyed()) return downloadsWin.close();
  downloadsWin = new Sheet({ name: 'downloads',
    width: 640, height: 560, minWidth: 460, minHeight: 360, title: T('dl2.title'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'downloads-preload.js'), contextIsolation: true, sandbox: true }
  });
  downloadsWin.setMenuBarVisibility(false);
  downloadsWin.loadFile(path.join(__dirname, 'ui', 'downloads.html'), { query: { lang: L() } });
  downloadsWin.on('closed', () => { downloadsWin = null; });
}
function wireDownloadsIpc() {
  const trusted = (e) => downloadsWin && e.sender === downloadsWin.webContents;
  ipcMain.handle('downloads:list', (e) => (trusted(e) ? downloads.view() : []));
  ipcMain.handle('downloads:act', async (e, id, action) => {
    if (!trusted(e)) return false;
    const r = downloads.get(Number(id));
    if (!r) return false;
    if (action === 'pause') downloads.pause(r.id);
    else if (action === 'resume') downloads.resume(r.id);
    else if (action === 'cancel') downloads.cancel(r.id);
    else if (action === 'remove') downloads.remove(r.id);
    else if (action === 'reveal' && r.path) shell.showItemInFolder(r.path);
    else if (action === 'open' && r.state === 'done' && r.path && fs.existsSync(r.path)) {
      if (r.risky) {
        const ask = await dialog.showMessageBox(win, { type: 'warning', buttons: [T('dl2.openAnyway'), T('set.priv.cancel')], defaultId: 1, cancelId: 1, message: T('dl2.riskyAsk', { name: r.name }), detail: T('dl2.riskyDetail', { host: r.host || '?' }) });
        if (ask.response !== 0) return false;
      }
      shell.openPath(r.path);
    }
    return true;
  });
  // AI-15: a suggested name for a finished file, only when asked. A PDF's first page helps the model; other files go by name and site.
  ipcMain.handle('downloads:suggest', async (e, id) => {
    if (!trusted(e)) return '';
    const r = downloads.get(Number(id));
    if (!r || r.state !== 'done' || r.risky || r.private) return '';
    const m = await modelInfo();
    if (!m.ready) return '';
    let excerpt = '';
    if (/\.pdf$/i.test(r.name) && fs.existsSync(r.path)) { try { excerpt = (await pdftext.extract(fs.readFileSync(r.path))).pages[0] || ''; } catch { /* name and site only */ } }
    return dlname.suggest({ name: r.name, host: r.host, excerpt, llm, lang: L() });
  });
  ipcMain.handle('downloads:rename', (e, id, name) => (trusted(e) && typeof name === 'string' ? downloads.rename(Number(id), name) : false));
  ipcMain.handle('downloads:clear', (e) => { if (trusted(e)) downloads.clearFinished(); return true; });
  ipcMain.on('downloads:open', (e) => { if (e.sender === win.webContents) openDownloads(); });
}

// ---- Updates (REL-03) -------------------------------------------------------------------------------------------------
let updater = null;
let upd = { state: 'idle', version: '', manual: false, asked: false }; // idle | available | downloading | ready | error
const buildSigned = (() => { try { return !!require('./build-info.json').signed; } catch { return false; } })();
const updateMode = () => updates.mode({ platform: process.platform, signed: buildSigned, appImage: !!process.env.APPIMAGE });

function getUpdater() {
  if (updater) return updater;
  try { updater = require('electron-updater').autoUpdater; } catch { return null; }
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.logger = null;
  if (process.env.LORE_UPDATE_URL) { updater.forceDevUpdateConfig = true; updater.setFeedURL({ provider: 'generic', url: process.env.LORE_UPDATE_URL }); }
  updater.on('update-available', (info) => {
    upd = { ...upd, state: 'available', version: info.version };
    toast({ text: T('upd.available', { v: info.version }), action: 'update', actionLabel: T(updateMode() === 'auto' ? 'upd.install' : 'upd.download') });
  });
  updater.on('update-not-available', () => { upd.state = 'idle'; if (upd.asked) toast({ text: T('upd.latest', { v: app.getVersion() }) }); upd.asked = false; });
  updater.on('download-progress', (p) => { upd.state = 'downloading'; toast({ text: T('upd.downloading', { p: Math.round(p.percent || 0) }), busy: true }); });
  updater.on('update-downloaded', () => { upd.state = 'ready'; toast({ text: T('upd.ready', { v: upd.version }), action: 'update', actionLabel: T('upd.restart') }); });
  updater.on('error', () => {
    const was = upd.state;
    upd.state = was === 'downloading' ? 'error' : 'idle';
    if (was === 'downloading') toast({ text: T('upd.failed'), action: 'update', actionLabel: T('upd.download') });
    else if (upd.asked) toast({ text: T('upd.checkFailed') });
    upd.asked = false;
  });
  return updater;
}
// `asked` is true when the person chose "Check for updates", so the answer is always shown.
function checkForUpdates(asked) {
  if (!asked && !settings.get().autoUpdate) return;
  if (!app.isPackaged && !process.env.LORE_UPDATE_URL) { if (asked) toast({ text: T('upd.dev') }); return; }
  const u = getUpdater();
  if (!u) return;
  upd.asked = !!asked;
  if (asked) toast({ text: T('upd.checking'), busy: true });
  u.checkForUpdates().catch(() => { if (asked) toast({ text: T('upd.checkFailed') }); });
}
function handleUpdateAction() {
  if (upd.state === 'ready') return updater.quitAndInstall(false, true);
  if (upd.state === 'available' && updateMode() === 'auto') { upd.state = 'downloading'; toast({ text: T('upd.downloading', { p: 0 }), busy: true }); return updater.downloadUpdate().catch(() => {}); }
  shell.openExternal(updates.RELEASES);
}
function scheduleUpdateChecks() {
  setTimeout(() => checkForUpdates(false), 30000).unref();
  setInterval(() => checkForUpdates(false), 6 * 3600 * 1000).unref();
}

// ---- First run: profile, import, default browser ------------------------------------------------------------------------
const onboardedFile = () => path.join(app.getPath('userData'), 'onboarded.json');
function defaultStatus() {
  return { packaged: app.isPackaged, platform: process.platform, isDefault: app.isPackaged && app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https') };
}
// macOS asks the person to confirm; Windows only lets the person choose in its own Settings page, so open it.
function setDefaultBrowser() {
  if (!app.isPackaged) return defaultStatus(); // a development run would register Electron itself
  app.setAsDefaultProtocolClient('http');
  app.setAsDefaultProtocolClient('https');
  if (process.platform === 'win32') shell.openExternal('ms-settings:defaultapps').catch(() => {});
  return defaultStatus();
}
function openWelcome(mode) {
  if (welcomeWin && !welcomeWin.isDestroyed()) return welcomeWin.focus();
  welcomeWin = new BrowserWindow({
    width: 520, height: mode === 'import' ? 620 : 680, resizable: false, minimizable: false, maximizable: false, title: 'Lore',
    parent: win, modal: mode !== 'import',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'welcome-preload.js'), contextIsolation: true, sandbox: true }
  });
  welcomeWin.setMenuBarVisibility(false);
  welcomeWin.loadFile(path.join(__dirname, 'ui', 'welcome.html'), { query: { lang: L(), mode } });
  welcomeWin.on('closed', () => { welcomeWin = null; try { fs.writeFileSync(onboardedFile(), '{}'); } catch { /* best effort */ } });
}
let welcomeSources = [];
function wireWelcomeIpc() {
  const trusted = (e) => welcomeWin && e.sender === welcomeWin.webContents;
  const reject = () => { throw new Error('untrusted sender'); };
  ipcMain.handle('welcome:init', (e) => {
    if (!trusted(e)) return reject();
    welcomeSources = importer.detect();
    return { profile: { name: profiles.current.name, color: profiles.current.color }, browsers: welcomeSources.map((b) => ({ id: b.id, name: b.name, bookmarks: b.bookmarks, profiles: b.profiles.map((p) => ({ id: p.id, name: p.name })) })), def: defaultStatus() };
  });
  ipcMain.handle('welcome:profile', (e, name, color) => {
    if (!trusted(e)) return reject();
    profiles.update(profiles.active, { name: String(name || '').trim() || profiles.current.name, color: String(color || '') });
    buildMenu(); pushState();
    return true;
  });
  // Brings bookmarks and history into the profile in use. Only ids from the detected list are accepted, never paths.
  const bring = (items) => {
    let b = 0, h = 0;
    for (const x of items.bookmarks || []) if (bookmarks.add({ url: x.url, title: x.title, folder: x.folder })) b++;
    for (const x of items.history || []) { memory.add({ url: x.url, title: x.title, ts: x.ts }); h++; }
    memory.flush();
    notifyBookmarks(); pushState();
    return { bookmarks: b, history: h };
  };
  ipcMain.handle('welcome:import', (e, req) => {
    if (!trusted(e) || !req || typeof req !== 'object') return reject();
    const src = welcomeSources.find((s) => s.id === req.source);
    const prof = src && src.profiles.find((p) => p.id === req.profile);
    if (!prof) return { bookmarks: 0, history: 0, errors: ['unknown source'] };
    const r = importer.read(src, prof, { bookmarks: !!req.bookmarks, history: !!req.history }, { otherLabel: T('wel.imp.other') });
    return { ...bring(r), errors: r.errors };
  });
  ipcMain.handle('welcome:importFile', async (e) => {
    if (!trusted(e)) return reject();
    const r = await dialog.showOpenDialog(welcomeWin, { properties: ['openFile'], filters: [{ name: 'HTML', extensions: ['html', 'htm'] }] });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    try { return bring({ bookmarks: importer.readFile(r.filePaths[0], T('wel.imp.other')) }); } catch { return { error: true }; }
  });
  ipcMain.handle('welcome:default', (e) => (trusted(e) ? setDefaultBrowser() : reject()));
  ipcMain.on('welcome:done', (e) => { if (trusted(e)) welcomeWin.close(); });
}

// Links opened from other apps arrive here when Lore is the default browser.
function openLink(u) {
  if (!/^https?:\/\//i.test(u) || !isAllowedNavigation(u)) return;
  if (!windowReady) { pendingUrls.push(u); return; }
  openTab({ url: u });
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function openSettings(pane) {
  const where = typeof pane === 'string' ? pane : '';
  if (settingsWin && !settingsWin.isDestroyed()) { if (where) { settingsWin.webContents.send('settings:pane', where); return settingsWin.focus(); } return settingsWin.close(); }
  settingsWin = new Sheet({ name: 'settings',
    width: 820, height: 680, minWidth: 620, minHeight: 520, title: T('set.title'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151E' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'settings-preload.js'), contextIsolation: true, sandbox: true }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'ui', 'settings.html'), where ? { query: { pane: where } } : undefined);
  settingsWin.on('closed', () => { settingsWin = null; });
}

function wireSettingsIpc() {
  // Only the settings window may read or change settings; web pages have no bridge to these channels.
  const trusted = (e) => settingsWin && e.sender === settingsWin.webContents;
  const reject = () => { throw new Error('untrusted sender'); };
  const msg = (e) => (e && e.name === 'TimeoutError' ? T('set.err.timeout') : e && /^(llm|set)\./.test(e.message) ? T(e.message, { status: e.status, detail: e.detail ? ': ' + e.detail : '' }) : e && e.message ? e.message : T('set.err.connect'));
  ipcMain.handle('settings:get', (e) => (trusted(e) ? { view: settings.view(), lang: L(), lockOk: lockAvailable(), usage: { in: pstats.today().tin || 0, out: pstats.today().tout || 0 } } : reject()));
  ipcMain.handle('settings:save', (e, patch) => {
    if (!trusted(e)) return reject();
    const before = L();
    try {
      const view = settings.update(patch);
      llm = makeLlm(settings.get());
      refreshEmbedder();
      if (L() !== before) applyLanguage();
      applyAppearance();
      applyDoh();
      applySearch();
      return { view, lang: L() };
    } catch (err) { return { error: msg(err) }; }
  });
  // Profiles: listed, created, changed and removed from the Profiles page.
  const profileView = () => ({ items: profiles.items.map((p) => ({ ...p })), active: profiles.active });
  ipcMain.handle('profiles:list', (e) => (trusted(e) ? profileView() : reject()));
  ipcMain.handle('profiles:create', (e, name, color) => { if (!trusted(e)) return reject(); const p = profiles.create(String(name || ''), String(color || '')); buildMenu(); pushState(); return { created: p, ...profileView() }; });
  ipcMain.handle('profiles:update', (e, id, patch) => { if (!trusted(e) || !patch || typeof patch !== 'object') return reject(); profiles.update(String(id), { name: patch.name, color: patch.color }); buildMenu(); pushState(); return profileView(); });
  ipcMain.handle('profiles:remove', async (e, id) => { if (!trusted(e)) return reject(); await removeProfile(String(id), settingsWin); return profileView(); });
  ipcMain.handle('profiles:switch', (e, id) => { if (!trusted(e)) return reject(); switchProfile(String(id)); return profileView(); });
  ipcMain.handle('settings:test', async (e, patch) => {
    if (!trusted(e)) return reject();
    try {
      const m = makeLlm(settings.preview(patch));
      if (!m) return { ok: false, message: T('set.err.off') };
      if (!(await m.available())) return { ok: false, message: m.remote ? T('set.err.needKey') : T('set.err.notInstalled') };
      const reply = await m.chat([{ role: 'user', content: 'Reply with the single word: ok' }], { timeoutMs: 20000 });
      return reply ? { ok: true } : { ok: false, message: T('set.err.empty') };
    } catch (err) { return { ok: false, message: msg(err) }; }
  });
  ipcMain.handle('settings:clear', async (e, opts = {}) => {
    if (!trusted(e)) return reject();
    const o = { history: !!opts.history, site: !!opts.site, cache: !!opts.cache, range: ['hour', 'day', 'week', 'month', 'all'].includes(opts.range) ? opts.range : 'all' };
    if (!o.history && !o.site && !o.cache) return { ok: false };
    const r = await dialog.showMessageBox(win, {
      type: 'warning', buttons: [T('set.priv.clearBtn'), T('set.priv.cancel')], defaultId: 1, cancelId: 1, message: T('set.priv.confirm')
    });
    if (r.response !== 0) return { ok: false };
    // Cookies and site data cannot be cleared by time range, so they go entirely; the range applies to what Lore remembers.
    if (o.site) await session.defaultSession.clearStorageData();
    if (o.cache) await session.defaultSession.clearCache();
    if (o.history) { memory.removeSince(o.range); if (!memory.size) favicons.clear(); }
    return { ok: true };
  });
  ipcMain.handle('perms:list', (e) => (trusted(e) ? perms.list() : reject()));
  ipcMain.handle('perms:remove', (e, origin, permission) => { if (!trusted(e)) return reject(); if (origin === '*') perms.reset(); else perms.remove(String(origin), String(permission)); return perms.list(); });
  ipcMain.handle('settings:models', async (e, url) => (trusted(e) ? listLocalModels(String(url)) : reject()));
  ipcMain.handle('settings:pull', async (e, url, model) => {
    if (!trusted(e)) return reject();
    try {
      await pullLocalModel(String(url), String(model), (p, status) => e.sender.send('settings:pull-progress', p, status));
      return { ok: true };
    } catch (err) { return { ok: false, message: T('set.err.pull', { e: msg(err) }) }; }
  });
  // AI-11: one button. Needs Ollama running (it cannot be installed silently); then picks a model for this computer's memory,
  // downloads what is missing, checks it answers, and switches the assistant to it.
  let settingUp = false;
  ipcMain.handle('settings:autosetup', async (e) => {
    if (!trusted(e)) return reject();
    if (settingUp) return { ok: false, message: T('set.setup.busy') };
    settingUp = true;
    const step = (n, p = 0) => { if (!e.sender.isDestroyed()) e.sender.send('settings:setup-step', n, p); };
    try {
      const url = settings.get().local.url;
      let names;
      try { names = await listLocalModels(url); } catch { return { ok: false, needOllama: true, message: T('set.setup.needOllama') }; }
      const plan = modelplan.recommend(require('os').totalmem());
      const todo = [plan.chat, plan.embed].filter((m) => !modelplan.installed(names, m));
      for (const [i, m] of todo.entries()) { step(1 + i, 0); await pullLocalModel(url, m, (p) => step(1 + i, p)); }
      step(0, 1);
      const probe = makeLlm({ ...settings.get(), provider: 'local', local: { ...settings.get().local, model: plan.chat } });
      const reply = await probe.chat([{ role: 'user', content: 'Reply with the single word: ok' }], { timeoutMs: 90000 });
      if (!reply) return { ok: false, message: T('set.err.empty') };
      const view = settings.update({ provider: 'local', local: { url, model: plan.chat, embedModel: plan.embed } });
      llm = makeLlm(settings.get());
      refreshEmbedder();
      return { ok: true, model: plan.chat, view };
    } catch (err) { return { ok: false, message: msg(err) }; } finally { settingUp = false; }
  });
  ipcMain.on('settings:ollama-site', (e) => { if (trusted(e)) shell.openExternal('https://ollama.com/download'); });
}

function wireIpc() {
  ipcMain.handle('intent:classify', (e, text) => (e.sender === win.webContents && typeof text === 'string' ? classify(text.slice(0, 300)).kind : ''));
  // For taking the website's screenshots: put the window at a fixed place and in front.
  if (process.env.LORE_SHOTS) ipcMain.on('debug:shots', (e, o) => { if (e.sender !== win.webContents) return; if (o && o.bounds) win.setBounds(o.bounds); win.show(); app.focus({ steal: true }); win.moveTop(); });
  ipcMain.on('tab:new', () => openTab());
  ipcMain.on('model:menu', (e, x, y) => { if (panel && e.sender === panel.webContents && Number.isFinite(x) && Number.isFinite(y)) modelMenu(x, y); });
  ipcMain.on('act:stop', (e) => { if (panel && e.sender === panel.webContents && actRun) actRun.ctl.abort(); });
  ipcMain.on('side:toggle', (e) => { if (e.sender === win.webContents) toggleSidebar(); });
  ipcMain.on('tab:select', (_e, id) => selectTab(id));
  ipcMain.on('tab:close', (_e, id) => closeTab(id));
  ipcMain.on('update:check', (e) => { if (e.sender === win.webContents) checkForUpdates(true); });
  ipcMain.on('update:open', (e) => { if (e.sender === win.webContents) handleUpdateAction(); });
  ipcMain.on('welcome:open', (e) => { if (e.sender === win.webContents) openWelcome('import'); });
  ipcMain.on('split:toggle', (e) => { if (e.sender === win.webContents) openSplit(); });
  ipcMain.on('split:drag', (e, screenX) => {
    if (!splitHandle || e.sender !== splitHandle.webContents || !splitOn() || !Number.isFinite(screenX)) return;
    const [w, h] = win.getContentSize();
    const r = pageRect(w, h);
    split.ratio = Math.min(0.75, Math.max(0.25, (screenX - win.getContentBounds().x - r.x - SPLIT_GAP / 2) / (r.width - SPLIT_GAP)));
    layout();
  });
  ipcMain.on('split:reset', (e) => { if (splitHandle && e.sender === splitHandle.webContents && split) { split.ratio = 0.5; layout(); } });
  ipcMain.on('profile:menu', (e, x, y) => { if (e.sender === win.webContents) showProfileMenu(x, y); });
  ipcMain.on('tab:menu', (e, id) => { if (e.sender === win.webContents) showTabMenu(Number(id)); });
  ipcMain.on('tab:move', (e, id, beforeId) => { if (e.sender === win.webContents) { const next = tabstate.reorder(tabs, Number(id), beforeId == null ? null : Number(beforeId)); tabstate.settle(next, Number(id)); setOrder(tabstate.arrange(next)); } });
  ipcMain.on('tab:groupWith', (e, dragId, targetId) => {
    if (e.sender !== win.webContents) return;
    const a = tabs.find((t) => t.id === Number(dragId)), b = tabs.find((t) => t.id === Number(targetId));
    if (!a || !b || a === b || a.pinned || b.pinned) return;
    if (b.group) addToGroup(a.id, b.group); else newGroup('', [b.id, a.id], { edit: true });
  });
  ipcMain.on('tab:addToGroup', (e, id, gid) => { if (e.sender === win.webContents && groups.has(Number(gid)) && tabs.some((t) => t.id === Number(id) && !t.pinned)) addToGroup(Number(id), Number(gid)); });
  ipcMain.on('group:newTab', (e, gid) => { if (e.sender === win.webContents && groups.has(Number(gid))) { const t = openTab(); setOrder(tabstate.assign(tabs, [{ groupId: Number(gid), ids: [t.id] }])); } });
  ipcMain.on('group:toggle', (e, id) => { if (e.sender === win.webContents && Number(id) === 0) return pushState(); if (e.sender === win.webContents && groups.has(Number(id))) { const g = groups.get(Number(id)); g.collapsed = !g.collapsed; pushState(); } });
  ipcMain.on('group:rename', (e, id, name) => { if (e.sender === win.webContents && groups.has(Number(id)) && typeof name === 'string') { groups.get(Number(id)).name = name.trim().slice(0, 30); pushState(); } });
  ipcMain.on('group:menu', (e, id) => { if (e.sender === win.webContents) showGroupMenu(Number(id)); });
  ipcMain.on('organize:open', (e) => { if (e.sender === win.webContents || (bookmarksWin && e.sender === bookmarksWin.webContents)) openOrganize(e.sender === win.webContents ? 'tabs' : 'bookmarks'); });
  ipcMain.on('nav:submit', (_e, text) => submit(String(text)));
  ipcMain.on('nav:back', () => active().view.webContents.navigationHistory.goBack());
  ipcMain.on('nav:forward', () => active().view.webContents.navigationHistory.goForward());
  ipcMain.on('nav:reload', () => active().view.webContents.reload());
  // Decisions count only when they come from the trusted panel's own webContents.
  ipcMain.on('agent:decide', (e, approved) => { if (run && e.sender === panel.webContents) run.decide(approved); });
  ipcMain.on('agent:close', (e) => { if (e.sender === panel.webContents) closePanel(); });
  ipcMain.on('media:open', () => openDownload());
  // Page assistant: only the trusted panel may drive it.
  ipcMain.on('page:do', (e, action, arg) => {
    if (e.sender !== panel.webContents || !['summarize', 'translate', 'ask', 'act', 'tasks', 'task'].includes(action)) return;
    if (action === 'act') return actOnPage(String(arg || '').slice(0, 400));
    if (action === 'tasks') return openTasks();
    if (action === 'task') return taskLib.BUILTIN.some((t) => t.id === arg && t.group === 'page') ? openTasks({ select: String(arg), auto: true }) : undefined;
    if (action === 'ask') return panelPrompt(String(arg || ''));
    pageAssistant(action, String(arg || ''));
  });
  ipcMain.on('panel:copy', (e, text) => { if (e.sender === panel.webContents && typeof text === 'string') clipboard.writeText(text.slice(0, 20000)); });
  // Past conversations, newest first; opening one restores its messages and goes to the page it read last.
  const fromPanel = (e) => panel && e.sender === panel.webContents;
  ipcMain.handle('chats:list', (e) => (fromPanel(e) && chatStore ? chatStore.list() : []));
  ipcMain.on('chats:open', (e, key) => { if (fromPanel(e)) openChat(key); });
  // A source chip: go to its tab, or open the page again when the tab was closed.
  ipcMain.on('chats:goto', (e, key) => {
    if (!fromPanel(e) || !pa) return;
    const conv = convFor(pa.tab);
    const src = conv.sources.find((x) => x.key === normUrl(key));
    if (!src) return;
    const t = tabOfSource(conv, src);
    if (t) return selectTab(t.id);
    if (!isAllowedNavigation(src.url)) return;
    const nt = openTab({ url: src.url }, { private: conv === privConv });
    nt.url = src.url; src.tabId = nt.id;
    sendContext(nt);
  });
  ipcMain.on('chats:addhere', (e) => { if (fromPanel(e) && pa) { const t = active(); if (t) { addSource(convFor(t), t); sendContext(t); saveConv(convFor(t)); } } });
  ipcMain.on('chats:drop', (e, key) => {
    if (!fromPanel(e) || !pa) return;
    const conv = convFor(pa.tab);
    conv.sources = conv.sources.filter((x) => x.key !== normUrl(key));
    saveConv(conv);
    sendContext(pa.tab);
  });
  ipcMain.on('chats:delete', (e, key) => {
    if (!fromPanel(e) || !chatStore) return;
    chatStore.remove(String(key));
    if (mainConv.id === String(key)) { mainConv = newConv(); if (pa) sendThread(pa.tab); }
  });
  ipcMain.on('chat:new', (e) => {
    if (!fromPanel(e) || !pa) return;
    if (pa.tab.private) privConv = newConv(); else mainConv = newConv();
    sendThread(pa.tab);
  });
  ipcMain.on('page:view', (e, view) => {
    if (e.sender !== panel.webContents || !pa || !['both', 'translation', 'original'].includes(view)) return;
    pa.tab.view.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code: pageassist.viewScript(view) }]).catch(() => {});
  });
  ipcMain.on('page:show', (e, text) => {
    if (e.sender !== panel.webContents || !pa || typeof text !== 'string') return;
    pa.tab.view.webContents.findInPage(text.slice(0, 80));
  });
  ipcMain.on('assist:open', (e) => { if (e.sender === win.webContents) openAssist(); });
  ipcMain.on('menu:more', (e, x, y) => {
    if (e.sender !== win.webContents) return;
    const web = (() => { const t = active(); return !!t && !t.isHome && /^https?:/.test(t.url); })();
    Menu.buildFromTemplate([
      { label: T('menu.newTab'), accelerator: 'CmdOrCtrl+T', click: () => openTab() },
      { label: T('more.private'), accelerator: 'CmdOrCtrl+Shift+N', click: () => openPrivate() },
      { type: 'separator' },
      { label: T('menu.find'), enabled: web, accelerator: 'CmdOrCtrl+F', click: openFind },
      { label: T('pdf.print'), enabled: web, accelerator: 'CmdOrCtrl+P', click: printPage },
      { label: T('pdf.save'), enabled: web, click: savePdf },
      { label: T('rl.add'), enabled: web, accelerator: 'CmdOrCtrl+Shift+L', click: readLater },
      { label: T('src.menu'), enabled: web, accelerator: 'CmdOrCtrl+U', click: viewSource },
      { label: T('menu.openExternal'), enabled: web, accelerator: 'CmdOrCtrl+Shift+O', click: () => { const t = active(); if (t) shell.openExternal(t.url); } },
      { type: 'separator' },
      { label: T('more.ai'), submenu: [
        { label: T('more.assist'), enabled: web, accelerator: 'CmdOrCtrl+Alt+A', click: openAssist },
        { label: T('pg.summarize'), enabled: web, accelerator: 'CmdOrCtrl+Alt+S', click: () => pageAssistant('summarize') },
        { label: T('pg.translate'), enabled: web, accelerator: 'CmdOrCtrl+Alt+T', click: () => pageAssistant('translate') },
        { type: 'separator' },
        { label: T('cmp.menu'), click: () => openCompare() },
        { label: T('org.menu'), accelerator: 'CmdOrCtrl+Alt+O', click: () => openOrganize('tabs') },
        { label: T('menu.tasks'), accelerator: 'CmdOrCtrl+Shift+K', click: () => openTasks() },
        { label: T('auto.menu'), click: openAutomations }
      ] },
      { label: T('more.library'), submenu: [
        { label: T('bm.manage'), accelerator: 'CmdOrCtrl+Alt+B', click: openBookmarks },
        { label: T('menu.history'), accelerator: 'CmdOrCtrl+Y', click: openHistory },
        { label: T('menu.downloads'), accelerator: 'CmdOrCtrl+J', click: openDownloads },
        { label: T('menu.memory'), accelerator: 'CmdOrCtrl+Shift+Y', click: openMemoryLocked },
        { label: T('pw.menu'), accelerator: 'CmdOrCtrl+Alt+P', click: async () => { if (await unlock()) openPasswords(); } }
      ] },
      { label: T('more.privacy'), submenu: [
        { label: T('rep.menu'), click: openReport },
        { label: T('eph.menu'), submenu: [5, 15, 60].map((n) => ({ label: T('eph.min', { n }), click: () => openEphemeral(n) })) },
        { type: 'separator' },
        { label: T('pw.fill'), enabled: web, accelerator: 'CmdOrCtrl+Alt+L', click: fillPassword },
        { label: T('alias.menu'), click: createAlias },
        { label: T('br.menu'), click: openBreach }
      ] },
      { type: 'separator' },
      { label: T('menu.import'), click: () => openWelcome('import') },
      { label: T('menu.update'), click: () => checkForUpdates(true) },
      { label: T('menu.settings'), accelerator: 'CmdOrCtrl+,', click: openSettings }
    ]).popup({ window: win, x: Math.round(Number(x) || 0), y: Math.round(Number(y) || 0) });
  });
  ipcMain.on('memory:open', (e) => { if (e.sender === win.webContents) openMemoryLocked(); });
  ipcMain.on('settings:open', (e) => { if (e.sender === win.webContents) openSettings(); });
  ipcMain.on('dl:start', (e, i) => { if (e.sender === panel.webContents) startDownload(Number(i)); });
  ipcMain.on('dl:reveal', (e) => { if (e.sender === panel.webContents && dl && dl.path) shell.showItemInFolder(dl.path); });
  // The page asks (synchronously, before its own scripts) for the ad-removal scripts that apply to its address.
  ipcMain.on('ads:scripts', (e) => {
    let out = [];
    try { const u = e.senderFrame && e.senderFrame.parent === null ? e.senderFrame.url : ''; if (S.adsOn && /^https?:/.test(u) && blocker) out = blocker.scripts(u); } catch { /* none */ }
    e.returnValue = out;
  });
  ipcMain.on('shield:toggle', () => { S.adsOn = !S.adsOn; pushState(); });
}

const downloadHooked = new WeakSet();
function hookDownloads(ses, isPrivate) {
  if (downloadHooked.has(ses)) return;
  downloadHooked.add(ses);
  ses.on('will-download', (_e, item, wc) => {
    if (!downloads) return;
    const tab = wc ? tabForWc(wc.id) : null;
    const askWhere = !!(tab && tab.saveAs);
    if (tab) tab.saveAs = false;
    const rec = downloads.track(item, { askWhere, private: isPrivate });
    if (!askWhere) toast({ text: T('dl2.started', { name: rec.name }), action: 'downloads', actionLabel: T('dl2.show') });
  });
}

// Applied to every session: the normal one and each private tab's own.
function hardenSession(ses, isPrivate = false) {
  hookDownloads(ses, isPrivate);
  harden(ses, {
    isPrivate, blocker,
    adsOn: () => S.adsOn,
    privacy: () => settings.get().privacy,
    siteOf: (details) => { const t = tabForWc(details.webContentsId); return t && /^https?:/.test(t.url) ? t.url : ''; },
    onBlocked: (url) => { S.blocked++; pstats.record('blocked', hostOfUrl(url || '').replace(/^www\./, '')); if (S.blocked % 5 === 0 || S.blocked < 10) pushState(); if (S.blocked % 25 === 0) saveStats(); },
    onStripped: (n) => pstats.record('params', '', n),
    onUpgrade: (orig) => { pstats.record('https'); upgraded.set(hostOfUrl(orig), { orig, ts: Date.now() }); },
    insecureOk: (host) => allowedInsecure.has(host),
    perms: () => perms,
    onResponse: detectMedia,
    scam: (url) => {
      if (!settings.get().privacy.scamProtection) return null;
      const v = checkUrl(url, { listHas: scamList.has });
      return v && !allowedScam.has(v.host) ? v : null;
    },
    onScam: (details, v) => { const t = tabForWc(details.webContentsId); if (t) t.pendingScam = { url: details.url, v }; },
    ask: async (origin, permission) => {
      const r = await dialog.showMessageBox(win, {
        type: 'question', buttons: [T('perm.allow'), T('perm.block')], defaultId: 1, cancelId: 1,
        message: T('perm.ask', { origin: origin || 'This page', what: T('perm.' + permission) })
      });
      return r.response === 0;
    }
  });
}

// Feeds the toolbar's download button: remembers video responses seen by each tab.
function detectMedia(details) {
  if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') return;
  const tab = tabForWc(details.webContentsId);
  if (!tab || tab.isHome) return;
  const h = (n) => { const k = Object.keys(details.responseHeaders || {}).find((x) => x.toLowerCase() === n); return k ? details.responseHeaders[k][0] : undefined; };
  const m = classifyResponse({ url: details.url, status: details.statusCode, contentType: h('content-type'), contentLength: h('content-length'), contentRange: h('content-range') });
  if (m && !tab.media.some((x) => x.url === m.url)) { tab.media.push(m); pushState(); }
}

function buildMenu() {
  const focus = () => win.webContents.send('focus-intent');
  const settingsItem = { label: T('menu.settings'), accelerator: 'CmdOrCtrl+,', click: openSettings };
  const updateItem = { label: T('menu.update'), click: () => checkForUpdates(true) };
  const first = process.platform === 'darwin'
    ? { label: app.name, submenu: [
        { role: 'about' }, updateItem, { type: 'separator' }, settingsItem,
        { type: 'separator' }, { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }
      ] }
    : { label: app.name, submenu: [settingsItem, updateItem, { type: 'separator' }, { role: 'quit' }] };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    first,
    { label: T('menu.tab'), submenu: [
      { label: T('menu.newTab'), accelerator: 'CmdOrCtrl+T', click: () => openTab() },
      { label: T('pg.summarize'), accelerator: 'CmdOrCtrl+Alt+S', click: () => pageAssistant('summarize') },
      { label: T('pg.translate'), accelerator: 'CmdOrCtrl+Alt+T', click: () => pageAssistant('translate') },
      { label: T('more.assist'), accelerator: 'CmdOrCtrl+Alt+A', click: openAssist },
      { label: T('menu.openExternal'), accelerator: 'CmdOrCtrl+Shift+O', click: () => { const t = active(); if (t && /^https?:/.test(t.url)) shell.openExternal(t.url); } },
      { label: T('menu.tasks'), accelerator: 'CmdOrCtrl+Shift+K', click: () => openTasks() },
      { label: T('menu.memory'), accelerator: 'CmdOrCtrl+Shift+Y', click: openMemoryLocked },
      { label: T('menu.newPrivate'), accelerator: 'CmdOrCtrl+Shift+N', click: () => openPrivate() },
      { label: T('eph.menu'), submenu: [5, 15, 60].map((n) => ({ label: T('eph.min', { n }), click: () => openEphemeral(n) })) },
      { label: T('alias.menu'), click: createAlias },
      { label: T('br.menu'), click: openBreach },
      { label: T('pw.fill'), accelerator: 'CmdOrCtrl+Alt+L', click: fillPassword },
      { label: T('pw.menu'), accelerator: 'CmdOrCtrl+Alt+P', click: async () => { if (await unlock()) openPasswords(); } },
      { label: T('rl.add'), accelerator: 'CmdOrCtrl+Shift+L', click: readLater },
      { label: T('menu.closeTab'), accelerator: 'CmdOrCtrl+W', click: () => active() && closeTab(activeId) },
      { label: T('tab.reopen'), accelerator: 'CmdOrCtrl+Shift+T', click: reopenClosed },
      { label: T('group.newFromTab'), accelerator: 'CmdOrCtrl+Shift+G', click: () => { const t = active(); if (t && !t.pinned) newGroup('', [t.id], { edit: true }); } },
      { label: T('tab.next'), accelerator: 'Ctrl+Tab', click: () => switchTab(tabstate.cycle(tabs, activeId, 1)) },
      { label: T('tab.prev'), accelerator: 'Ctrl+Shift+Tab', click: () => switchTab(tabstate.cycle(tabs, activeId, -1)) },
      { label: T('tab.goTo'), submenu: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ label: n === 9 ? T('tab.last') : T('tab.nth', { n }), accelerator: 'CmdOrCtrl+' + n, click: () => switchTab(tabstate.nth(tabs, n)) })) },
      { type: 'separator' },
      { label: T('split.menu'), accelerator: 'CmdOrCtrl+Alt+D', click: () => openSplit() },
      { label: T('rep.menu'), click: openReport },
      { label: T('cmp.menu'), accelerator: 'CmdOrCtrl+Alt+C', click: () => openCompare() },
      { label: T('auto.menu'), click: openAutomations },
      { label: T('org.menu'), accelerator: 'CmdOrCtrl+Alt+O', click: () => openOrganize('tabs') },
      { label: T('menu.find'), accelerator: 'CmdOrCtrl+F', click: openFind },
      { label: T('menu.downloads'), accelerator: 'CmdOrCtrl+J', click: openDownloads },
      { label: T('menu.focus'), accelerator: 'CmdOrCtrl+L', click: focus }
    ] },
    { label: T('menu.profile'), submenu: [
      ...profiles.items.map((p) => ({ label: p.name, type: 'radio', checked: p.id === profiles.active, click: () => switchProfile(p.id) })),
      { type: 'separator' },
      { label: T('prof.new'), click: () => openSettings('profiles') },
      { label: T('prof.manage'), click: () => openSettings('profiles') }
    ] },
    { label: T('menu.bookmarks'), submenu: [
      { label: T('bm.toggle'), accelerator: 'CmdOrCtrl+D', click: toggleBookmark },
      { label: T('bm.bar'), accelerator: 'CmdOrCtrl+Shift+B', click: () => { if (bookmarks) { bookmarks.setBar(!bookmarks.bar); layout(); pushState(); } } },
      { label: T('bm.manage'), accelerator: 'CmdOrCtrl+Alt+B', click: openBookmarks },
      { type: 'separator' },
      { label: T('menu.history'), accelerator: 'CmdOrCtrl+Y', click: openHistory },
      { type: 'separator' },
      { label: T('menu.import'), click: () => openWelcome('import') }
    ] },
    { role: 'editMenu' },
    // Not the stock viewMenu: its Reload (Cmd/Ctrl+R) reloads the browser's own window, which empties the tab strip.
    { label: T('menu.view'), submenu: [
      { label: T('nav.reload'), accelerator: 'CmdOrCtrl+R', click: () => { const t = active(); if (t) t.view.webContents.reload(); } },
      { label: T('menu.hardReload'), accelerator: 'CmdOrCtrl+Shift+R', click: () => { const t = active(); if (t) t.view.webContents.reloadIgnoringCache(); } },
      { type: 'separator' },
      { label: T('menu.zoomIn'), accelerator: 'CmdOrCtrl+=', click: () => zoomActive(0.5) },
      { label: T('menu.zoomOut'), accelerator: 'CmdOrCtrl+-', click: () => zoomActive(-0.5) },
      { label: T('menu.zoomReset'), accelerator: 'CmdOrCtrl+0', click: () => zoomActive(null) },
      { type: 'separator' },
      { label: T('pdf.print'), accelerator: 'CmdOrCtrl+P', click: printPage },
      { label: T('pdf.save'), click: savePdf },
      { label: T('src.menu'), accelerator: 'CmdOrCtrl+U', click: viewSource },
      { type: 'separator' },
      { label: T('side.toggle'), accelerator: 'CmdOrCtrl+Shift+E', click: toggleSidebar },
      { role: 'togglefullscreen' },
      { label: T('menu.devtools'), accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => { const t = active(); if (t) t.view.webContents.toggleDevTools(); } }
    ] },
    { role: 'windowMenu' }
  ]));
}

// One Lore at a time: a second launch (for example a link clicked in another app) hands its address to the first.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => { for (const a of argv) if (/^https?:\/\//i.test(a)) openLink(a); if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('open-url', (e, url) => { e.preventDefault(); openLink(url); });
for (const a of process.argv.slice(1)) if (/^https?:\/\//i.test(a)) pendingUrls.push(a);

app.whenReady().then(() => {
  // A packaged app already carries its icon; this is only for `npm start`. A missing icon must never stop the window opening.
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) { try { app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png')); } catch { /* keep the default icon */ } }
  stage('ready');
  settings = new Settings({
    ...fileStore(path.join(app.getPath('userData'), 'settings.bin'), safeStorage),
    persistent: safeStorage.isEncryptionAvailable()
  });
  llm = makeLlm(settings.get());
  applyAppearance();
  applyDoh();
  applySearch();
  setInterval(automationTick, 30000).unref();
  setTimeout(automationTick, 15000).unref();
  nativeTheme.on('updated', applyAppearance);
  const profFile = path.join(app.getPath('userData'), 'profiles.json');
  const dataDir = app.getPath('userData');
  freshInstall = !process.env.LORE_NO_WELCOME && !['onboarded.json', 'profiles.json', 'settings.bin', 'memory.bin', 'session.bin'].some((f) => fs.existsSync(path.join(dataDir, f)));
  profiles = new ProfileList({ load: () => { try { return JSON.parse(fs.readFileSync(profFile, 'utf8')); } catch { return null; } }, save: (d) => { try { fs.writeFileSync(profFile, JSON.stringify(d)); } catch { /* best effort */ } } });
  taskStore = new taskLib.TaskStore(fileStore(path.join(app.getPath('userData'), 'tasks.bin'), safeStorage));
  useStores(openStores(profiles.active));
  downloads = new DownloadList({ dir: app.getPath('downloads'), onChange: (rec, isNew) => {
    pushState();
    if (downloadsWin && !downloadsWin.isDestroyed()) downloadsWin.webContents.send('downloads:update', downloads.view());
    if (rec && rec.state === 'done' && !isNew) toast({ text: T('dl2.done', { name: rec.name }), action: 'downloads', actionLabel: T('dl2.show') });
    if (rec && rec.state === 'failed') toast({ text: T('dl2.failed', { name: rec.name }), action: 'downloads', actionLabel: T('dl2.show') });
  } });
  refreshEmbedder();
  const logStore = fileStore(path.join(app.getPath('userData'), 'agent-log.bin'), safeStorage);
  const entries = logStore.load();
  agentLog = { append: (e) => { entries.push(e); logStore.save(entries); } };
  stage('stores');
  wireIpc();
  wireSettingsIpc();
  wireMemoryIpc();
  wireTasksIpc();
  wireFindIpc();
  wireDownloadsIpc();
  wireBrowserDataIpc();
  wireOrganizeIpc();
  wireCompareIpc();
  wirePrivIpc();
  wireTipIpc();
  wirePasswordsIpc();
  wireAutomationsIpc();
  wireWelcomeIpc();
  stage('ipc');
  statsFile = path.join(app.getPath('userData'), 'stats.json');
  zoomFile = path.join(app.getPath('userData'), 'zoom.json');
  loadZooms();
  loadStats();
  blocker = createBlocker({ bundledPath: path.join(__dirname, 'filters', 'engine.bin'), cachePath: path.join(app.getPath('userData'), 'filters.bin'), fetchImpl: smartFetch });
  blocker.load();
  stage('blocker');
  scamList = createScamList({ cachePath: path.join(app.getPath('userData'), 'phishing.txt'), fetchImpl: smartFetch });
  scamList.load();
  scamList.refresh().catch(() => {});
  blocker.refresh().catch(() => {}); // weekly list update in the background
  hardenSession(session.defaultSession);
  stage('menu');
  buildMenu();
  stage('window');
  createWindow();
  stage('tabs');
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
// A certificate Chromium cannot trust is refused, unless the person chose to continue to that host (see the warning page).
app.on('certificate-error', (event, _wc, url, _error, _cert, callback) => {
  if (allowedCert.has(hostOfUrl(url))) { event.preventDefault(); callback(true); } else callback(false);
});
app.on('before-quit', () => { if (memory) memory.flush(); saveStats(); writeSession(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
