// Kyoona Connect, Node.js site
// Start: npm start   (reads settings from .env if present)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Tiny .env loader (no extra dependency). Hostinger can also set these in hPanel.
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const express = require("express");
const content = require("./src/content");
const store = require("./src/store");
const mailer = require("./src/mailer");
const icon = require("./src/icons");
const L = require("./src/location");
const records = require("./src/records");
const cats = require("./src/categories");
const adminRouter = require("./src/admin/routes");
const submissionsRouter = require("./src/submissions");

const app = express();
const PORT = process.env.PORT || 3000;
const SITE = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const CONTACT = process.env.CONTACT_EMAIL || "hello@kyoonaconnect.com";

const CITIES = ["Greater Boston", "Elsewhere in New England", "DC & Maryland", "Dallas–Fort Worth", "Los Angeles", "Somewhere else"];

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use("/admin", express.urlencoded({ extended: true, limit: "25mb" }));
const smallForms = express.urlencoded({ extended: false, limit: "20kb" });
// /submit forms carry photos, so their body is parsed (with a bigger limit) inside the submissions router
app.use((req, res, next) => req.path.startsWith("/submit") ? next() : smallForms(req, res, next));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "7d" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.locals.site = SITE;
  res.locals.path = req.path;
  const st = req.app.locals.settings || {};
  res.locals.settings = st;
  res.locals.contact = st.supportEmail || CONTACT;
  res.locals.interests = cats.list("event");
  res.locals.joinInterests = cats.list("event").filter(c => c.join);
  res.locals.orgCats = cats.list("org");
  res.locals.catStyle = cats.style;
  res.locals.catLabel = cats.label;
  res.locals.icon = icon;
  res.locals.STATES = L.STATES; res.locals.CANADA = L.CANADA; res.locals.mapUrl = L.mapUrl; res.locals.stateName = L.stateName;
  res.locals.cities = CITIES;
  res.locals.meta = { title: "Kyoona Connect", description: "Where Ugandans in the diaspora find each other. Events, community, and a reason to leave the house.", image: "/media/og-image.jpg" };
  next();
});

// ---------- pages ----------
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get("/m/:file", wrap(async (req, res, next) => {
  const m = await records.readMedia(req.params.file);
  if (!m) return next();
  res.setHeader("Content-Type", m.mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(m.data);
}));

app.get("/", wrap(async (req, res) => {
  const up = await content.upcoming();
  const next = up.find(e => e.featured) || up[0] || null;
  const past = (await content.events()).filter(e => e.past).slice(0, 1);
  res.render("home", { next, upcoming: up.slice(0, 6), past, dir: await content.directory() });
}));

app.get("/events", wrap(async (req, res) => {
  const all = await content.events();
  res.render("events", {
    upcoming: all.filter(e => !e.past),
    past: all.filter(e => e.past),
    meta: { ...res.locals.meta, title: "Events — Kyoona Connect", description: "Ugandan diaspora events: nights out, church gatherings, family days and conventions." }
  });
}));

app.get("/events/:slug", wrap(async (req, res, next) => {
  const ev = await content.event(req.params.slug);
  if (!ev) return next();
  res.render("event", {
    ev,
    more: (await content.upcoming()).filter(e => e.slug !== ev.slug).slice(0, 3),
    meta: { title: `${ev.title} — Kyoona Connect`, description: ev.description, image: ev.image || "/media/og-image.jpg" }
  });
}));

// Find your people: one directory, open to any location
app.get(["/boston", "/cities/:slug"], (req, res) => res.redirect(301, "/find-your-people"));
app.get("/find-your-people", wrap(async (req, res) => {
  const dir = await content.directory();
  res.render("city", {
    dir,
    meta: { title: "Find your people — Kyoona Connect", description: "Ugandan associations, churches, food and community groups, starting in Greater Boston.", image: "/media/og-image.jpg" }
  });
}));

app.get("/about", (req, res) => res.render("about", { meta: { ...res.locals.meta, title: "About — Kyoona Connect" } }));
app.get("/privacy", (req, res) => res.render("privacy", { meta: { ...res.locals.meta, title: "Privacy — Kyoona Connect" } }));
app.get("/join", (req, res) => res.render("join", { form: {}, errors: [], meta: { ...res.locals.meta, title: "Join the community — Kyoona Connect" } }));

// ---------- community signup ----------
const hits = new Map(); // simple per-IP rate limit: 6 signups / 10 min
function limited(ip) {
  const t = Date.now(), win = 10 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter(x => t - x < win);
  arr.push(t); hits.set(ip, arr);
  return arr.length > 6;
}

app.post("/join", async (req, res) => {
  const wantsJson = req.is("application/json") || (req.get("accept") || "").includes("application/json");
  const b = req.body || {};
  const form = {
    firstName: String(b.firstName || "").trim().slice(0, 80),
    email: String(b.email || "").trim().slice(0, 190),
    city: CITIES.includes(b.city) ? b.city : "",
    interests: [].concat(b.interests || []).filter(k => cats.list("event").some(i => i.key === k && i.join)),
    consent: b.consent === "yes" || b.consent === true || b.consent === "on"
  };
  const errors = [];
  if (b.website) return wantsJson ? res.json({ ok: true }) : res.redirect("/join/check-email"); // honeypot
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) errors.push("Please enter a real email address.");
  if (!form.consent) errors.push("Tick the box so we're allowed to email you.");
  if (limited(req.ip)) errors.push("Too many tries from here. Give it a few minutes.");
  if (errors.length) {
    if (wantsJson) return res.status(400).json({ ok: false, errors });
    return res.status(400).render("join", { form, errors, meta: { ...res.locals.meta, title: "Join the community — Kyoona Connect" } });
  }
  try {
    const r = await store.upsert({ email: form.email, firstName: form.firstName, city: form.city, interests: form.interests.join(",") });
    if (!r.alreadyConfirmed) await mailer.sendConfirm(r.member);
    const result = { ok: true, alreadyConfirmed: r.alreadyConfirmed };
    if (wantsJson) return res.json(result);
    return res.redirect(r.alreadyConfirmed ? "/join/updated" : "/join/check-email");
  } catch (e) {
    console.error("join failed:", e);
    const msg = "Something went wrong on our side. Please try again in a minute.";
    if (wantsJson) return res.status(500).json({ ok: false, errors: [msg] });
    return res.status(500).render("join", { form, errors: [msg], meta: res.locals.meta });
  }
});

app.get("/join/check-email", (req, res) => res.render("message", { kind: "check", meta: { ...res.locals.meta, title: "Check your email — Kyoona Connect" } }));
app.get("/join/updated", (req, res) => res.render("message", { kind: "updated", meta: { ...res.locals.meta, title: "Updated — Kyoona Connect" } }));

// Confirm / unsubscribe pages use a button (POST) so email link-scanners can't trigger them.
app.get("/confirm/:token", (req, res) => res.render("message", { kind: "confirm-ask", token: req.params.token, meta: res.locals.meta }));
app.post("/confirm/:token", async (req, res) => {
  const m = await store.setStatusByToken(req.params.token, "confirmed");
  res.render("message", { kind: m ? "confirmed" : "bad-link", member: m, meta: res.locals.meta });
});
app.get("/unsubscribe/:token", (req, res) => res.render("message", { kind: "unsub-ask", token: req.params.token, meta: res.locals.meta }));
app.post("/unsubscribe/:token", async (req, res) => {
  const m = await store.setStatusByToken(req.params.token, "unsubscribed");
  res.render("message", { kind: m ? "unsubscribed" : "bad-link", meta: res.locals.meta });
});

// ---------- public forms ----------
app.use("/submit", submissionsRouter({ records, content, mailer, cats, CONTACT, SITE }));

// ---------- admin portal (see src/admin) ----------
app.use("/admin", adminRouter({ store, records, content, mailer, cats, CITIES, SITE, CONTACT, SECRET, ADMIN_PASSWORD }));

// ---------- 404 & errors ----------
app.use((req, res) => res.status(404).render("message", { kind: "404", meta: { ...res.locals.meta, title: "Not found — Kyoona Connect" } }));
app.use((err, req, res, next) => { console.error(err); res.status(500).render("message", { kind: "500", meta: res.locals.meta }); });

store.init()
  .then(() => records.init(store.getPool))
  .then(() => cats.load())
  .then(async () => { app.locals.settings = (await records.get("setting", "site")) || {}; })
  .then(() => app.listen(PORT, () => console.log(`Kyoona Connect running on ${SITE} (storage: ${store.useMysql ? "MySQL" : "local file"}, email: ${mailer.configured ? "SMTP" : "console"})`)))
  .catch(e => { console.error("Could not start:", e); process.exit(1); });
