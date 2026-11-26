// Loads events and city directories from /content. Edit the JSON files to
// change what the site shows; no database needed for content.
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "content");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { console.error("content:", p, e.message); return fallback; }
}

function decorate(ev) {
  const d = new Date(ev.date + "T12:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const past = d < today;
  return {
    ...ev,
    past,
    month: MONTHS[d.getMonth()],
    day: ev.dateConfirmed ? String(d.getDate()) : "TBC",
    year: d.getFullYear(),
    weekday: DAYS[d.getDay()],
    dateLabel: ev.dateConfirmed
      ? `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
      : `${MONTHS[d.getMonth()]} ${d.getFullYear()} (date TBC)`,
    daysAway: Math.round((d - today) / 86400000)
  };
}

// Re-read on every request so editing the JSON shows up without a restart.
function events() {
  return readJson(path.join(DIR, "events.json"), []).map(decorate)
    .sort((a, b) => (a.past - b.past) || (a.past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
}
function upcoming() { return events().filter(e => !e.past); }
function event(slug) { return events().find(e => e.slug === slug); }
function city(slug) {
  if (!/^[a-z-]+$/.test(slug)) return null;
  const p = path.join(DIR, "cities", slug + ".json");
  return fs.existsSync(p) ? readJson(p, null) : null;
}

module.exports = { events, upcoming, event, city };
