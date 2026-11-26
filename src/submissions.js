// Public forms: List your event, Add a listing, Update listing details.
// Everything lands in the admin Submissions inbox (records kind "submission").
const express = require("express");
const crypto = require("crypto");
const L = require("./location");

const LIMITS = { short: 120, long: 2000 };
const clean = (v, n = LIMITS.short) => String(v || "").trim().slice(0, n);
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || "");
const urlish = v => { v = clean(v, 300); if (!v) return ""; return /^https?:\/\//i.test(v) ? v : "https://" + v; };

module.exports = function submissionsRouter({ records, content, mailer, INTERESTS, CONTACT, SITE }) {
  const r = express.Router();
  r.use(express.urlencoded({ extended: true, limit: "12mb" }));
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  const hits = new Map();
  const limited = ip => {
    const t = Date.now(), arr = (hits.get(ip) || []).filter(x => t - x < 15 * 60 * 1000);
    arr.push(t); hits.set(ip, arr); return arr.length > 5;
  };
  const ORG_CATS = [["community", "Association or community group"], ["faith", "Church, mosque or fellowship"], ["food", "Restaurant, food or Ugandan business"], ["groups", "WhatsApp or Facebook group"]];
  const meta = t => ({ title: t + " — Kyoona Connect", description: "Share it with the Ugandan community on Kyoona Connect.", image: "/media/og-image.jpg" });
  async function photos(values, max) {
    const out = [];
    for (const v of [].concat(values || []).slice(0, max)) if (String(v).startsWith("data:")) { const u = await records.saveMedia(v); if (u) out.push(u); }
    return out;
  }
  async function save(type, data, submitter) {
    const at = new Date().toISOString();
    const id = at.replace(/[^0-9]/g, "") + crypto.randomBytes(2).toString("hex");
    await records.put("submission", id, { type, status: "new", at, data, submitter });
    const label = { event: "event", listing: "new listing", update: "listing update" }[type];
    mailer.sendAdminNotice && mailer.sendAdminNotice(CONTACT, `New ${label}: ${data.title || data.name || data.orgName}`, `${SITE}/admin/submissions/${id}`).catch(() => {});
    return id;
  }
  async function orgOptions() { return (await content.allOrgs()).filter(o => o.status !== "hidden").map(o => ({ id: o.id, name: o.name, town: o.location })); }

  // ---------- List your event ----------
  r.get("/event", (req, res) => res.render("submit-event", { f: {}, errors: [], meta: meta("List your event") }));
  r.post("/event", wrap(async (req, res) => {
    const b = req.body;
    const f = {
      title: clean(b.title), date: clean(b.date, 10), time: clean(b.time, 40), category: INTERESTS.some(i => i.key === b.category) ? b.category : "",
      price: clean(b.price, 60), ticketUrl: urlish(b.ticketUrl), description: clean(b.description, LIMITS.long),
      host: clean(b.host), name: clean(b.name), email: clean(b.email), phone: clean(b.phone, 40), notes: clean(b.notes, 600)
    };
    const { loc, errors } = L.fromForm({ ...b, placeName: b.venue });
    Object.assign(f, { venue: loc.placeName, address: loc.address, town: loc.town, state: loc.state, zip: loc.zip });
    if (b.website) return res.redirect("/submit/thanks?t=event");
    if (!f.title) errors.push("Give the event a name.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.push("Pick the event date.");
    if (!f.name) errors.push("Tell us your name.");
    if (!emailOk(f.email)) errors.push("Add an email we can reach you on.");
    if (b.agree !== "yes") errors.push("Tick the box to confirm you're allowed to share this event.");
    if (!errors.length && limited(req.ip)) errors.push("Too many submissions from here. Try again in a few minutes.");
    if (errors.length) return res.status(400).render("submit-event", { f, errors, meta: meta("List your event") });
    const poster = await photos(b.poster, 1);
    await save("event", { ...f, image: poster[0] || "" }, { name: f.name, email: f.email, phone: f.phone });
    res.redirect("/submit/thanks?t=event");
  }));

  // ---------- Add a listing ----------
  r.get("/listing", (req, res) => res.render("submit-listing", { f: {}, errors: [], cats: ORG_CATS, meta: meta("Add a listing") }));
  r.post("/listing", wrap(async (req, res) => {
    const b = req.body;
    const f = {
      name: clean(b.name), category: ORG_CATS.some(([k]) => k === b.category) ? b.category : "community", 
      phone: clean(b.phone, 40), website: urlish(b.website), description: clean(b.description, LIMITS.long), meets: clean(b.meets, 60),
      contactName: clean(b.contactName), contactEmail: clean(b.contactEmail), role: clean(b.role), notes: clean(b.notes, 600)
    };
    const { loc, errors: locErrors } = L.fromForm(b, { requireTownState: true });
    Object.assign(f, loc);
    const errors = [];
    if (b.website2) return res.redirect("/submit/thanks?t=listing");
    if (!f.name) errors.push("Add the name of the organization.");
    errors.push(...locErrors);
    if (!f.description) errors.push("Add a short description so newcomers know what it is.");
    if (!f.contactName) errors.push("Tell us your name.");
    if (!emailOk(f.contactEmail)) errors.push("Add an email we can reach you on.");
    if (!errors.length && limited(req.ip)) errors.push("Too many submissions from here. Try again in a few minutes.");
    if (errors.length) return res.status(400).render("submit-listing", { f, errors, cats: ORG_CATS, meta: meta("Add a listing") });
    const images = await photos(b.photos, 4);
    await save("listing", { ...f, images }, { name: f.contactName, email: f.contactEmail, role: f.role });
    res.redirect("/submit/thanks?t=listing");
  }));

  // ---------- Update listing details ----------
  r.get("/update", wrap(async (req, res) => {
    const orgs = await orgOptions();
    res.render("submit-update", { f: { org: req.query.org || "" }, errors: [], orgs, meta: meta("Update listing details") });
  }));
  r.post("/update", wrap(async (req, res) => {
    const b = req.body;
    const orgs = await orgOptions();
    const org = orgs.find(o => o.id === b.org);
    const f = {
      org: b.org || "", changes: [].concat(b.changes || []),
      phone: clean(b.phone, 40), website: b.website ? urlish(b.website) : "", description: clean(b.description, LIMITS.long),
      meets: clean(b.meets, 60), closed: b.closed === "yes", notes: clean(b.notes, 600),
      contactName: clean(b.contactName), contactEmail: clean(b.contactEmail), role: clean(b.role)
    };
    const { loc, errors: locErrors } = L.fromForm(b);
    Object.assign(f, loc);
    const errors = [...locErrors];
    if (b.website2) return res.redirect("/submit/thanks?t=update");
    if (!org) errors.push("Pick the listing you want to update.");
    const anything = f.placeName || f.address || f.town || f.state || f.zip || f.phone || f.website || f.description || f.meets || f.closed || f.notes || [].concat(b.photos || []).length;
    if (!anything) errors.push("Tell us what should change.");
    if (!f.contactName) errors.push("Tell us your name.");
    if (!emailOk(f.contactEmail)) errors.push("Add an email we can reach you on.");
    if (!f.role) errors.push("Tell us how you're connected to this organization.");
    if (!errors.length && limited(req.ip)) errors.push("Too many submissions from here. Try again in a few minutes.");
    if (errors.length) return res.status(400).render("submit-update", { f, errors, orgs, meta: meta("Update listing details") });
    const images = await photos(b.photos, 4);
    await save("update", { ...f, orgId: org.id, orgName: org.name, images }, { name: f.contactName, email: f.contactEmail, role: f.role });
    res.redirect("/submit/thanks?t=update");
  }));

  r.get("/thanks", (req, res) => res.render("message", { kind: "submitted", subtype: req.query.t, meta: meta("Thank you") }));
  return r;
};
