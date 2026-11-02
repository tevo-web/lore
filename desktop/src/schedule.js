// When an automation is due. A schedule is one of
//   { type: 'every', minutes }            every N minutes from `startAt`
//   { type: 'daily', at: 'HH:MM' }        every day at that local time
//   { type: 'weekly', day: 0-6, at }      one day a week (0 = Sunday)
// plus the limits `startAt`, `until` (timestamps) and `maxRuns`. Lore only runs automations while it is open, so a run that was
// missed (the app was closed) is made up once when it opens again, if it is not too old.
const MIN = 60000;
const CATCH_UP = 30 * MIN;
const MIN_EVERY = 15; // minutes: nothing posts or fetches more often than this

const atToday = (now, at) => { const [h, m] = at.split(':').map(Number); const d = new Date(now); d.setHours(h, m, 0, 0); return d.getTime(); };
const valid = (s) => !!s && ((s.type === 'every' && Number.isFinite(s.minutes) && s.minutes >= MIN_EVERY) || ((s.type === 'daily' || s.type === 'weekly') && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.at || '') && (s.type === 'daily' || (Number.isInteger(s.day) && s.day >= 0 && s.day <= 6))));

// The next time it should run, after `last` (the time of the previous run, or 0 for never). Returns 0 when it is finished.
function nextRun(a, now = Date.now()) {
  const s = a.schedule;
  if (!valid(s)) return 0;
  const last = a.lastRun || 0;
  const start = a.startAt || 0;
  let t;
  if (s.type === 'every') {
    t = last ? last + s.minutes * MIN : Math.max(start, now);
    if (start && t < start) t = start;
  } else {
    // The first slot after the later of `last` and `start`.
    let base = Math.max(last, start - 1);
    let d = new Date(base || now);
    for (let i = 0; i < 9; i++) {
      const cand = atToday(d.getTime(), s.at) + i * 86400000;
      const day = new Date(cand).getDay();
      if (cand > (last || 0) && cand >= (start || 0) - 0 && (s.type === 'daily' || day === s.day) && cand > base) { t = cand; break; }
    }
    if (!t) return 0;
  }
  if (a.until && t > a.until) return 0;
  if (a.maxRuns && (a.runCount || 0) >= a.maxRuns) return 0;
  return t;
}

// 'due' when the time has come; a slot that is already more than CATCH_UP late is skipped, not made up.
function status(a, now = Date.now()) {
  if (!a.enabled || !a.approved) return { state: 'off' };
  const t = nextRun(a, now);
  if (!t) return { state: 'done' };
  if (t > now) return { state: 'waiting', at: t };
  if (now - t > CATCH_UP && a.schedule.type === 'every') return { state: 'late', at: t };
  return { state: 'due', at: t };
}

module.exports = { nextRun, status, valid, MIN_EVERY, CATCH_UP };
