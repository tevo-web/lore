// "check vnexpress for today's news": when the question names a news site, Lore reads that site's own latest headlines
// (its public feed, else its front page) and answers from them, with a link for every headline. Nothing about the
// person is sent: it is the same request any visitor makes. Headlines are untrusted text, like any page.
const { norm } = require('./router');
const shield = require('./shield');

// name as typed (no accents) -> site. `rss` is tried first, then the front page.
const SITES = [
  { re: /\bvn ?express\b/, name: 'VnExpress', home: 'https://vnexpress.net/', rss: 'https://vnexpress.net/rss/tin-moi-nhat.rss' },
  { re: /\btuoi ?tre\b/, name: 'Tuổi Trẻ', home: 'https://tuoitre.vn/', rss: 'https://tuoitre.vn/rss/tin-moi-nhat.rss' },
  { re: /\bthanh ?nien\b/, name: 'Thanh Niên', home: 'https://thanhnien.vn/', rss: 'https://thanhnien.vn/rss/home.rss' },
  { re: /\bdan ?tri\b/, name: 'Dân Trí', home: 'https://dantri.com.vn/', rss: 'https://dantri.com.vn/rss/home.rss' },
  { re: /\bvietnam ?net\b/, name: 'VietnamNet', home: 'https://vietnamnet.vn/', rss: 'https://vietnamnet.vn/rss/tin-moi-nhat.rss' },
  { re: /\b(zing ?news|znews)\b/, name: 'Znews', home: 'https://znews.vn/' },
  { re: /\bcafef\b/, name: 'CafeF', home: 'https://cafef.vn/' },
  { re: /\bvietnam ?plus\b/, name: 'VietnamPlus', home: 'https://www.vietnamplus.vn/' },
  { re: /\bbbc\b/, name: 'BBC News', home: 'https://www.bbc.com/news', rss: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { re: /\bhacker ?news\b/, name: 'Hacker News', home: 'https://news.ycombinator.com/', rss: 'https://news.ycombinator.com/rss' }
];
const DOMAIN = /\b((?:[a-z0-9-]+\.)+(?:com|net|org|vn|io|co|info|news|tv|me|dev|app))\b/;
// Only a question about what is new on that site counts; "who founded vnexpress" is an ordinary question.
const NEWSY = /\b(tin|tin tuc|moi|moi nhat|news|latest|headline|headlines|hom nay|today|check|kiem tra|xem|co gi|what'?s new|new on)\b/;

// -> { name, home, rss? } or null
function siteIn(query) {
  const n = norm(String(query));
  if (!NEWSY.test(n)) return null;
  for (const s of SITES) if (s.re.test(n)) return s;
  const d = DOMAIN.exec(n);
  return d ? { name: d[1], home: 'https://' + d[1] + '/' } : null;
}

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (s, max) => shield.stripInvisible(decode(s)).text.slice(0, max);

function parseRss(xml, base) {
  const out = [];
  for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const pick = (tag) => { const r = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(m[0]); return r ? r[1] : ''; };
    const title = clean(pick('title'), 160);
    let url = decode(pick('link'));
    try { url = new URL(url, base).toString(); } catch { continue; }
    if (title.length > 8 && /^https?:/.test(url)) out.push({ title, url, desc: clean(pick('description'), 220), when: Date.parse(decode(pick('pubDate'))) || 0 });
    if (out.length >= 12) break;
  }
  return out;
}

// A front page has no feed to read: take the links that read like headlines (a sentence long, on the same site).
function parseHome(html, base) {
  const host = new URL(base).hostname.replace(/^www\./, '');
  const seen = new Set();
  const out = [];
  for (const m of String(html).matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = clean(/title=["']([^"']{20,})["']/i.exec(m[0]) ? /title=["']([^"']{20,})["']/i.exec(m[0])[1] : m[2], 160);
    if (title.length < 25 || title.split(' ').length < 5 || seen.has(title)) continue;
    let url;
    try { url = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.hostname.replace(/^www\./, '') !== host || url.pathname.length < 8) continue;
    seen.add(title);
    out.push({ title, url: url.toString(), desc: '', when: 0 });
    if (out.length >= 12) break;
  }
  return out;
}

async function headlines(site, fetchImpl = fetch) {
  const get = async (u) => { const r = await fetchImpl(u, { headers: { 'User-Agent': 'Lore/0.2 (Tevo)', Accept: 'text/html,application/xml,application/rss+xml' }, signal: AbortSignal.timeout(7000) }); return r.ok ? r.text() : ''; };
  if (site.rss) { try { const items = parseRss(await get(site.rss), site.rss); if (items.length) return items; } catch { /* use the front page */ } }
  try { return parseHome(await get(site.home), site.home); } catch { return []; }
}

// -> { site, items } or null when the question does not name a site or nothing could be read.
async function lookup(query, fetchImpl) {
  const site = siteIn(query);
  if (!site) return null;
  const items = await headlines(site, fetchImpl);
  return items.length ? { site, items } : null;
}

module.exports = { siteIn, parseRss, parseHome, headlines, lookup };
