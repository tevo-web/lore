// "mở tab Tevo Product", "find the tab about flights": picks an open tab by what its title and address say.
const { norm } = require('./router');

// "tab" (or "thẻ") in the phrase makes it certain; "trang/page/site" only counts when some open tab really matches.
const SURE = /^(?:(?:hay |vui long |lore )?(?:mo|open|go to|switch to|chuyen sang|chuyen den|chuyen toi|tim|find|show|hien|di den|quay lai|back to|focus))\s+(?:(?:giup|cho|help) (?:toi|minh|me)\s+|giup\s+|me\s+)?(?:lai\s+)?(?:the )?(?:tab|the|cua so|tabs?)\s+(?:nao )?(?:ve |about |co |named |ten |ten la |called )?(.+)$/;
const SOFT = /^(?:(?:hay )?(?:mo|open|go to|switch to|chuyen sang|quay lai|back to))\s+(?:lai\s+)?(?:trang|page|site|web)\s+(?:ve |about |ten |named )?(.+)$/;
const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'for', 'cho', 'toi', 'minh', 'giup', 'di', 'nhe', 'nha', 'with', 'tab', 'the', 'trang', 'page']);

const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));

// -> { name, sure } or null
function tabIntent(text) {
  const n = norm(String(text).trim()).replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  // The words as the person typed them (with accents), for showing back.
  const shown = (name) => String(text).trim().replace(/[?!.]+$/, '').split(/\s+/).slice(-name.split(' ').length).join(' ');
  let m = SURE.exec(n);
  if (m) return tokens(m[1]).length ? { name: m[1].trim(), shown: shown(m[1].trim()), sure: true } : null;
  m = SOFT.exec(n);
  return m && tokens(m[1]).length ? { name: m[1].trim(), shown: shown(m[1].trim()), sure: false } : null;
}

// tabs: [{ id, title, url, private }]. Best tab whose title or host covers at least 60% of the words, or null.
function findTab(tabs, name) {
  const want = [...new Set(tokens(name))];
  if (!want.length) return null;
  let best = null;
  for (const t of tabs) {
    if (t.private) continue;
    let host = '';
    try { host = new URL(t.url).hostname; } catch { /* home or blank */ }
    const have = new Set(tokens((t.title || '') + ' ' + host));
    const cover = want.filter((w) => have.has(w) || [...have].some((h) => h.length > 3 && w.length > 3 && (h.startsWith(w) || w.startsWith(h)))).length / want.length;
    if (cover >= 0.6 && (!best || cover > best.cover)) best = { tab: t, cover };
  }
  return best && best.tab;
}

module.exports = { tabIntent, findTab };
