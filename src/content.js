// Public-facing content, read from the records the admin portal manages.
const records = require("./records");
const L = require("./location");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function decorate(ev) {
  ev = { ...ev, state: ev.state || (ev.city === "boston" ? "MA" : "") };
  ev.location = L.shortLocation(ev);
  ev.fullAddress = L.fullAddress({ ...ev, placeName: ev.venue });
  ev.mapLink = L.mapUrl({ ...ev, placeName: ev.venue }, ev.title);
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

// Location is open: any town and state. Older records that only had the Boston area get "MA".
const HOME_STATE = "MA";
function withLocation(o) {
  const state = o.state || (o.city === "boston" ? HOME_STATE : "");
  const r = { ...o, state };
  return { ...r, location: L.shortLocation(r), streetLine: [r.address, L.cityLine(r)].filter(Boolean).join(", "), fullAddress: L.fullAddress(r), mapLink: L.mapUrl(r, r.name) };
}
async function allOrgs() {
  return (await records.list("org")).map(withLocation)
    .sort((a, b) => (a.state === HOME_STATE ? 0 : 1) - (b.state === HOME_STATE ? 0 : 1) || (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
}
// Everything shown on Find your people, home state first.
async function directory() {
  const listings = (await allOrgs()).filter(o => o.status !== "hidden");
  const states = [...new Set(listings.map(o => o.state).filter(Boolean))].sort((a, b) => (a === HOME_STATE ? -1 : b === HOME_STATE ? 1 : a.localeCompare(b)));
  return { listings, states };
}

module.exports = { decorate, allEvents, events, upcoming, event, allOrgs, directory };
