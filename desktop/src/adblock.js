// Network-level ad and tracker blocking from real filter lists (EasyList, EasyPrivacy, ABPVN).
// A compiled engine ships in the app (src/filters/engine.bin, built by scripts/build-filters.js) so blocking works
// on first launch and offline; a newer one is downloaded into the user data folder at most once a week.
// This is the desktop stand-in for the shared Rust core (adblock-rust) that Android and iOS will use.
const fs = require('fs');
const { FiltersEngine, Request } = require('@ghostery/adblocker');
const { isBlocked: hostListBlocked } = require('./blocklist');

const LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://abpvn.com/android/abpvn.txt', // Vietnam-specific; downloaded at runtime only, not bundled
  // uBlock Origin's own lists carry the rules that strip ads out of YouTube's player data. Runtime only, not bundled (GPLv3).
  'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  'https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt'
];
// The small scripts those rules run in the page (json-prune and friends), kept up to date by the Ghostery project.
const RESOURCES = 'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/resources.json';
const BUNDLED_LISTS = LISTS.slice(0, 2); // redistributable under their own licences; see docs/third-party.md
const WEEK = 7 * 86400000;
const LIST_VERSION = '2'; // bump when LISTS change, so an older cache is replaced at the next start instead of after a week

const TYPE = {
  mainFrame: 'main_frame', subFrame: 'sub_frame', stylesheet: 'stylesheet', script: 'script', image: 'image', font: 'font',
  object: 'object', xhr: 'xmlhttprequest', ping: 'ping', cspReport: 'csp_report', media: 'media', webSocket: 'websocket', other: 'other'
};

async function buildEngine(urls, fetchImpl = fetch) {
  const texts = await Promise.all(urls.map(async (u) => {
    try { const r = await fetchImpl(u, { signal: AbortSignal.timeout(30000) }); return r.ok ? r.text() : ''; } catch { return ''; }
  }));
  const text = texts.filter(Boolean).join('\n');
  if (!text) throw new Error('no filter lists could be downloaded');
  const engine = FiltersEngine.parse(text);
  try {
    const r = await fetchImpl(RESOURCES, { signal: AbortSignal.timeout(30000) });
    const body = r.ok ? await r.text() : '';
    if (body) engine.updateResources(body, String(body.length));
  } catch { /* without them the lists still block requests and hide elements */ }
  return engine;
}

function createBlocker({ bundledPath, cachePath, fetchImpl = fetch } = {}) {
  let engine = null;
  const cacheVersion = () => { try { return fs.readFileSync(cachePath + '.v', 'utf8'); } catch { return ''; } };
  const read = (p) => { try { return FiltersEngine.deserialize(fs.readFileSync(p)); } catch { return null; } };

  return {
    // Fast and synchronous: deserializes a prebuilt engine.
    load() { engine = (cachePath && read(cachePath)) || (bundledPath && read(bundledPath)) || null; return !!engine; },
    get ready() { return !!engine; },
    use(e) { engine = e; },

    match(url, sourceUrl, resourceType) {
      if (!engine) return hostListBlocked(url); // before the engine loads, fall back to the small built-in host list
      const req = Request.fromRawDetails({ url, sourceUrl: sourceUrl || undefined, type: TYPE[resourceType] || 'other' });
      const r = engine.match(req);
      return !!r.match && !r.exception;
    },

    // Element-hiding rules for a page ("##.ad-banner"): returns a stylesheet, or '' if none apply.
    cosmetics(url, { classes = [], ids = [], hrefs = [] } = {}) {
      if (!engine) return '';
      try {
        const u = new URL(url);
        const r = engine.getCosmeticsFilters({ url, hostname: u.hostname, domain: u.hostname.split('.').slice(-2).join('.'), classes, ids, hrefs, getBaseRules: true, getInjectionRules: false, getExtendedRules: false, getRulesFromDOM: true, getRulesFromHostname: true });
        return (r && r.styles) || '';
      } catch { return ''; }
    },

    // Scripts a site's rules want run in the page before its own code (YouTube's ad removal lives here). [] if none.
    scripts(url) {
      if (!engine) return [];
      try {
        const u = new URL(url);
        const r = engine.getCosmeticsFilters({ url, hostname: u.hostname, domain: u.hostname.split('.').slice(-2).join('.'), classes: [], ids: [], hrefs: [], getBaseRules: false, getInjectionRules: true, getExtendedRules: false, getRulesFromDOM: false, getRulesFromHostname: true });
        return (r && r.scripts) || [];
      } catch { return []; }
    },

    // Downloads fresh lists if the cache is missing or older than a week. Safe to call on every start.
    async refresh({ force = false } = {}) {
      if (!cachePath) return false;
      try { if (!force && Date.now() - fs.statSync(cachePath).mtimeMs < WEEK && cacheVersion() === LIST_VERSION) return false; } catch { /* no cache yet */ }
      const fresh = await buildEngine(LISTS, fetchImpl);
      fs.writeFileSync(cachePath, fresh.serialize());
      try { fs.writeFileSync(cachePath + '.v', LIST_VERSION); } catch { /* only costs one extra download */ }
      engine = fresh;
      return true;
    }
  };
}

module.exports = { createBlocker, buildEngine, LISTS, BUNDLED_LISTS };
