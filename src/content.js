// Public-facing content, read from the records the admin portal manages.
const fs = require("fs");
const path = require("path");
const records = require("./records");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function decorate(ev) {
  const d = new Date((ev.date || "2099-01-01") + "T12:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return {
    ...ev,
    past: d < today,
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
const sortEvents = list => list.sort((a, b) => (a.past - b.past) || (a.past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));

// All events, including drafts (admin).
async function allEvents() { return sortEvents((await records.list("event")).map(decorate)); }
// Public: published only.
async function events() { return (await allEvents()).filter(e => e.status === "published"); }
async function upcoming() { return (await events()).filter(e => !e.past); }
async function event(slug) { const e = await records.get("event", slug); return e && e.status === "published" ? decorate(e) : null; }

async function allOrgs() { return (await records.list("org")).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name)); }
async function city(slug) {
  if (!/^[a-z-]+$/.test(slug)) return null;
  const p = path.join(__dirname, "..", "content", "cities", slug + ".json");
  if (!fs.existsSync(p)) return null;
  const meta = JSON.parse(fs.readFileSync(p, "utf8"));
  const listings = (await allOrgs()).filter(o => o.city === slug && o.status !== "hidden");
  return { ...meta, listings };
}

module.exports = { decorate, allEvents, events, upcoming, event, allOrgs, city };
