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

const app = express();
const PORT = process.env.PORT || 3000;
const SITE = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const CONTACT = process.env.CONTACT_EMAIL || "hello@kyoonaconnect.com";

const INTERESTS = [
  { key: "nightlife", label: "Nights out", emoji: "🪩" },
  { key: "faith", label: "Church & faith", emoji: "🙏🏾" },
  { key: "family", label: "Family & kids", emoji: "🧒🏾" },
  { key: "food", label: "Food & culture", emoji: "🍌" },
  { key: "convention", label: "Conventions & travel", emoji: "✈️" },
  { key: "business", label: "Business & networking", emoji: "🤝🏾" }
];
const CITIES = ["Greater Boston", "Elsewhere in New England", "DC & Maryland", "Dallas–Fort Worth", "Los Angeles", "Somewhere else"];

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "7d" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.locals.site = SITE;
  res.locals.path = req.path;
  res.locals.contact = CONTACT;
  res.locals.interests = INTERESTS;
  res.locals.cities = CITIES;
  res.locals.meta = { title: "Kyoona Connect", description: "Where Ugandans in the diaspora find each other. Events, community, and a reason to leave the house.", image: "/media/og-image.jpg" };
  next();
});

// ---------- pages ----------
app.get("/", (req, res) => {
  const up = content.upcoming();
  const next = up.find(e => e.featured) || up[0] || null;
  const past = content.events().filter(e => e.past).slice(0, 1);
  res.render("home", { next, upcoming: up.slice(0, 6), past, boston: content.city("boston") });
});

app.get("/events", (req, res) => {
  const all = content.events();
  res.render("events", {
    upcoming: all.filter(e => !e.past),
    past: all.filter(e => e.past),
    meta: { ...res.locals.meta, title: "Events — Kyoona Connect", description: "Ugandan diaspora events: nights out, church gatherings, family days and conventions." }
  });
});

app.get("/events/:slug", (req, res, next) => {
  const ev = content.event(req.params.slug);
  if (!ev) return next();
  res.render("event", {
    ev,
    more: content.upcoming().filter(e => e.slug !== ev.slug).slice(0, 3),
    meta: { title: `${ev.title} — Kyoona Connect`, description: ev.description, image: ev.image || "/media/og-image.jpg" }
  });
});

app.get("/boston", (req, res) => res.redirect(301, "/cities/boston"));
app.get("/cities/:slug", (req, res, next) => {
  const city = content.city(req.params.slug);
  if (!city) return next();
  res.render("city", {
    city,
    events: content.upcoming().filter(e => e.city === req.params.slug),
    meta: { title: `Ugandans in ${city.name} — Kyoona Connect`, description: `Ugandan associations, churches, food and events in ${city.name}.`, image: "/media/og-image.jpg" }
  });
});

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
    interests: [].concat(b.interests || []).filter(k => INTERESTS.some(i => i.key === k)),
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

// ---------- admin ----------
function sign(v) { return crypto.createHmac("sha256", SECRET).update(v).digest("hex"); }
function isAdmin(req) {
  const c = (req.headers.cookie || "").split(/;\s*/).find(x => x.startsWith("kc_admin="));
  if (!c) return false;
  const [exp, sig] = decodeURIComponent(c.slice(9)).split(".");
  const good = sign("admin" + exp);
  return !!sig && sig.length === good.length && Number(exp) > Date.now() && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function requireAdmin(req, res, next) { return isAdmin(req) ? next() : res.redirect("/admin/login"); }
const adminMeta = { title: "Admin — Kyoona Connect", description: "", image: "" };

app.get("/admin/login", (req, res) => res.render("admin/login", { error: ADMIN_PASSWORD ? "" : "Set ADMIN_PASSWORD in your settings to turn on the admin.", meta: adminMeta }));
app.post("/admin/login", (req, res) => {
  const pw = String(req.body.password || "");
  const ok = ADMIN_PASSWORD && pw.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PASSWORD));
  if (!ok) return res.status(401).render("admin/login", { error: "That's not it.", meta: adminMeta });
  const exp = String(Date.now() + 12 * 3600 * 1000);
  res.setHeader("Set-Cookie", `kc_admin=${encodeURIComponent(exp + "." + sign("admin" + exp))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${SITE.startsWith("https") ? "; Secure" : ""}`);
  res.redirect("/admin");
});
app.post("/admin/logout", (req, res) => { res.setHeader("Set-Cookie", "kc_admin=; Path=/; Max-Age=0"); res.redirect("/"); });

app.get("/admin", requireAdmin, async (req, res) => {
  const members = await store.list();
  const counts = { confirmed: 0, pending: 0, unsubscribed: 0 };
  members.forEach(m => counts[m.status]++);
  res.render("admin/index", { members, counts, events: content.upcoming(), sent: req.query.sent, mailOn: mailer.configured, meta: adminMeta });
});

app.get("/admin/members.csv", requireAdmin, async (req, res) => {
  const rows = await store.list();
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["email,first_name,city,interests,status,joined,confirmed"]
    .concat(rows.map(m => [m.email, m.first_name, m.city, m.interests, m.status, m.created_at, m.confirmed_at].map(q).join(",")))
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=kyoona-members.csv");
  res.send(csv);
});

app.post("/admin/announce", requireAdmin, async (req, res) => {
  const ev = content.event(String(req.body.slug || ""));
  if (!ev) return res.redirect("/admin");
  const audience = req.body.audience || "all";
  let members = (await store.list()).filter(m => m.status === "confirmed");
  if (audience === "interest") members = members.filter(m => (m.interests || "").split(",").includes(ev.category));
  if (audience === "boston") members = members.filter(m => m.city === "Greater Boston");
  if (req.body.test === "yes") members = [{ email: CONTACT, first_name: "Test", token: "0".repeat(48) }];
  let sent = 0;
  for (const m of members) {
    try { await mailer.sendEventAnnouncement(m, ev, `${SITE}/events/${ev.slug}`); sent++; }
    catch (e) { console.error("announce to", m.email, e.message); }
    await new Promise(r => setTimeout(r, 400)); // stay friendly with Hostinger's sending limits
  }
  res.redirect(`/admin?sent=${sent}`);
});

// ---------- 404 & errors ----------
app.use((req, res) => res.status(404).render("message", { kind: "404", meta: { ...res.locals.meta, title: "Not found — Kyoona Connect" } }));
app.use((err, req, res, next) => { console.error(err); res.status(500).render("message", { kind: "500", meta: res.locals.meta }); });

store.init()
  .then(() => app.listen(PORT, () => console.log(`Kyoona Connect running on ${SITE} (storage: ${store.useMysql ? "MySQL" : "local file"}, email: ${mailer.configured ? "SMTP" : "console"})`)))
  .catch(e => { console.error("Could not start:", e); process.exit(1); });
