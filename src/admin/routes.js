// Admin portal routes. Each section below is one sidebar page.
const express = require("express");
const crypto = require("crypto");
const PAGES = require("./pages");
const L = require("../location");

module.exports = function adminRouter({ store, records, content, mailer, cats, CITIES, SITE, CONTACT, SECRET, ADMIN_PASSWORD }) {
  const r = express.Router();
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---------- auth ----------
  const sign = v => crypto.createHmac("sha256", SECRET).update(v).digest("hex");
  function isAdmin(req) {
    const c = (req.headers.cookie || "").split(/;\s*/).find(x => x.startsWith("kc_admin="));
    if (!c) return false;
    const [exp, sig] = decodeURIComponent(c.slice(9)).split(".");
    const good = sign("admin" + exp);
    return !!sig && sig.length === good.length && Number(exp) > Date.now() && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
  }

  r.use((req, res, next) => {
    res.locals.meta = { title: "Admin — Kyoona Connect", description: "", image: "" };
    res.locals.pages = PAGES;
    res.locals.flash = req.query.ok || "";
    res.locals.flashError = req.query.err || "";
    res.locals.mailOn = mailer.configured;
    res.locals.dbOn = store.useMysql;
    next();
  });

  r.get("/login", (req, res) => res.render("admin/login", { error: ADMIN_PASSWORD ? "" : "Add ADMIN_PASSWORD to your settings to switch the admin on." }));
  r.post("/login", (req, res) => {
    const pw = String(req.body.password || "");
    const ok = ADMIN_PASSWORD && pw.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PASSWORD));
    if (!ok) return res.status(401).render("admin/login", { error: "That's not it." });
    const exp = String(Date.now() + 12 * 3600 * 1000);
    res.setHeader("Set-Cookie", `kc_admin=${encodeURIComponent(exp + "." + sign("admin" + exp))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${SITE.startsWith("https") ? "; Secure" : ""}`);
    res.redirect("/admin");
  });
  r.post("/logout", (req, res) => { res.setHeader("Set-Cookie", "kc_admin=; Path=/; Max-Age=0"); res.redirect("/admin/login"); });
  r.use((req, res, next) => isAdmin(req) ? next() : res.redirect("/admin/login"));
  r.use(wrap(async (req, res, next) => {
    res.locals.badges = { newSubmissions: (await records.list("submission")).filter(x => x.status === "new").length };
    next();
  }));

  const page = (res, view, key, data) => res.render("admin/" + view, { active: key, ...data });
  const go = (res, url, msg) => res.redirect(url + (url.includes("?") ? "&" : "?") + "ok=" + encodeURIComponent(msg));
  const fail = (res, url, msg) => res.redirect(url + (url.includes("?") ? "&" : "?") + "err=" + encodeURIComponent(msg));
  const toArr = v => v == null ? [] : [].concat(v);
  async function keepImages(values, max) {
    const out = [];
    for (const v of toArr(values).slice(0, max)) {
      if (!v) continue;
      if (v.startsWith("data:")) { const url = await records.saveMedia(v); if (url) out.push(url); }
      else if (/^(\/|https:\/\/)/.test(v)) out.push(v);
    }
    return out;
  }
  const weekAgo = () => Date.now() - 7 * 86400000;
  const ts = v => new Date(String(v).replace(" ", "T") + (String(v).includes("Z") || String(v).includes("+") ? "" : "Z")).getTime();

  // ---------- DASHBOARD ----------
  r.get("/", wrap(async (req, res) => {
    const members = await store.list();
    const events = await content.allEvents();
    const orgs = await content.allOrgs();
    const sent = await records.list("announcement");
    const confirmed = members.filter(m => m.status === "confirmed");
    // signups per week, last 8 weeks
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const end = Date.now() - i * 7 * 86400000, start = end - 7 * 86400000;
      const d = new Date(start);
      weeks.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, n: members.filter(m => { const t = ts(m.created_at); return t >= start && t < end; }).length });
    }
    page(res, "dashboard", "dashboard", {
      stats: [
        { label: "Confirmed members", value: confirmed.length, tone: "teal", href: "/admin/members?f=confirmed" },
        { label: "New this week", value: members.filter(m => ts(m.created_at) >= weekAgo()).length, tone: "coral", href: "/admin/members" },
        { label: "Waiting to confirm", value: members.filter(m => m.status === "pending").length, tone: "yellow", href: "/admin/members?f=pending" },
        { label: "Upcoming events", value: events.filter(e => !e.past && e.status === "published").length, tone: "indigo", href: "/admin/events" },
        { label: "Event drafts", value: events.filter(e => e.status === "draft").length, tone: "light", href: "/admin/events?f=draft" },
        { label: "Organizations listed", value: orgs.filter(o => o.status !== "hidden").length, tone: "light", href: "/admin/organizations" },
        { label: "Listings to confirm", value: orgs.filter(o => !o.verified).length, tone: "light", href: "/admin/organizations?f=unconfirmed" },
        { label: "Emails sent", value: sent.reduce((a, s) => a + (s.test ? 0 : s.sent || 0), 0), tone: "light", href: "/admin/announcements" }
      ],
      weeks,
      maxWeek: Math.max(1, ...weeks.map(w => w.n)),
      recent: members.slice(0, 6),
      nextEvents: events.filter(e => !e.past && e.status !== "cancelled").slice(0, 4),
      todo: [
        ...(res.locals.badges.newSubmissions ? [{ text: `${res.locals.badges.newSubmissions} new submission${res.locals.badges.newSubmissions === 1 ? "" : "s"} to review`, href: "/admin/submissions" }] : []),
        ...events.filter(e => !e.past && !e.dateConfirmed && e.status === "published").map(e => ({ text: `"${e.title}" still has no confirmed date`, href: `/admin/events/${e.id}/edit` })),
        ...orgs.filter(o => o.status !== "hidden" && (!o.town || !o.state)).map(o => ({ text: `${o.name} is missing its city or state`, href: `/admin/organizations/${o.id}/edit` })),
        ...orgs.filter(o => !o.verified).slice(0, 4).map(o => ({ text: `Confirm details for ${o.name}`, href: `/admin/organizations/${o.id}/edit` })),
        ...(!mailer.configured ? [{ text: "Connect email (SMTP) so sign-ups get their confirmation", href: "/admin/settings" }] : []),
        ...(!store.useMysql ? [{ text: "Connect the MySQL database so data survives redeploys", href: "/admin/settings" }] : [])
      ]
    });
  }));

  // ---------- SUBMISSIONS (public forms) ----------
  const TYPE_LABEL = { event: "Event", listing: "New listing", update: "Listing update" };
  r.get("/submissions", wrap(async (req, res) => {
    const f = req.query.f || "new", t = req.query.t || "all";
    const all = (await records.list("submission")).sort((a, b) => b.at.localeCompare(a.at));
    const counts = { new: 0, approved: 0, declined: 0, all: all.length };
    all.forEach(x => counts[x.status] = (counts[x.status] || 0) + 1);
    let list = f === "all" ? all : all.filter(x => x.status === f);
    if (t !== "all") list = list.filter(x => x.type === t);
    page(res, "submissions", "submissions", { list, f, t, counts, TYPE_LABEL });
  }));
  r.get("/submissions/:id", wrap(async (req, res, next) => {
    const s = await records.get("submission", req.params.id);
    if (!s) return next();
    const org = s.type === "update" ? await records.get("org", s.data.orgId) : null;
    page(res, "submission", "submissions", { s, org, TYPE_LABEL, interests: cats.list("event") });
  }));
  async function tell(s, heading, message, url, cta) {
    if (!s.submitter || !s.submitter.email) return;
    try { await mailer.sendSubmitterUpdate(s.submitter.email, s.submitter.name, heading, message, url, cta); } catch (e) { console.error("notify submitter", e.message); }
  }
  r.post("/submissions/:id/approve", wrap(async (req, res) => {
    const s = await records.get("submission", req.params.id);
    if (!s || s.status !== "new") return res.redirect("/admin/submissions");
    const d = s.data, notify = req.body.notify === "on";
    if (s.type === "event") {
      let id = records.slugify(`${d.title}-${d.date.slice(0, 4)}`);
      if (await records.get("event", id)) id += "-" + crypto.randomBytes(2).toString("hex");
      await records.put("event", id, {
        slug: id, title: d.title, subtitle: "", kicker: "", category: cats.has("event", d.category) ? d.category : cats.first("event"), status: "draft", featured: false,
        date: d.date, time: d.time, dateConfirmed: true, venue: d.venue, address: d.address, town: d.town || "", state: d.state || "", zip: d.zip || "", locVersion: 1,
        host: d.host || d.name, contactEmail: d.email, contactPhone: d.phone, price: d.price || "See details", ticketUrl: d.ticketUrl,
        art: "purple", image: d.image || "", description: d.description, fromSubmission: s.id
      });
      await records.put("submission", s.id, { ...s, status: "approved", result: `/admin/events/${id}/edit`, decidedAt: new Date().toISOString() });
      if (notify) await tell(s, "Your event is on Kyoona Connect", `thank you for sharing ${d.title}. We've added it and it will be live shortly.`, `${SITE}/events`, "See the events");
      return go(res, `/admin/events/${id}/edit`, "Created as a draft from the submission. Check it, then set it to Published.");
    }
    if (s.type === "listing") {
      let id = records.slugify(d.name);
      if (await records.get("org", id)) id += "-" + crypto.randomBytes(2).toString("hex");
      await records.put("org", id, {
        name: d.name, category: d.category, placeName: d.placeName || "", address: d.address, town: d.town, state: d.state || "", zip: d.zip || "", locVersion: 1, phone: d.phone, website: d.website,
        description: d.description, meets: d.meets, images: d.images || [], photosRepresentative: false, verified: true, status: "published", order: 999, fromSubmission: s.id
      });
      await records.put("submission", s.id, { ...s, status: "approved", result: `/admin/organizations/${id}/edit`, decidedAt: new Date().toISOString() });
      if (notify) await tell(s, "You're listed on Kyoona Connect", `${d.name} is now on Find your people. Newcomers can find you there.`, `${SITE}/find-your-people`, "See your listing");
      return go(res, `/admin/organizations/${id}/edit`, `${d.name} is now listed.`);
    }
    if (s.type === "update") {
      const o = await records.get("org", d.orgId);
      if (!o) return fail(res, `/admin/submissions/${s.id}`, "That listing no longer exists.");
      const next = { ...o, verified: true };
      ["placeName", "address", "town", "state", "zip", "phone", "website", "description", "meets"].forEach(k => { if (d[k]) next[k] = d[k]; });
      next.locVersion = 1;
      if ((d.images || []).length) { next.images = d.images; next.photosRepresentative = false; }
      if (d.closed) next.status = "hidden";
      await records.put("org", o.id, next);
      await records.put("submission", s.id, { ...s, status: "approved", result: `/admin/organizations/${o.id}/edit`, decidedAt: new Date().toISOString() });
      if (notify) await tell(s, "Your listing is updated", `the changes to ${o.name} are now live on Kyoona Connect.`, `${SITE}/find-your-people`, "See the listing");
      return go(res, `/admin/organizations/${o.id}/edit`, `Changes applied to ${o.name}.`);
    }
    res.redirect("/admin/submissions");
  }));
  r.post("/submissions/:id/decline", wrap(async (req, res) => {
    const s = await records.get("submission", req.params.id);
    if (s) await records.put("submission", s.id, { ...s, status: "declined", reason: String(req.body.reason || "").slice(0, 300), decidedAt: new Date().toISOString() });
    go(res, "/admin/submissions", "Declined.");
  }));
  r.post("/submissions/:id/delete", wrap(async (req, res) => {
    await records.del("submission", req.params.id);
    go(res, "/admin/submissions?f=" + (req.body.f || "new"), "Deleted.");
  }));

  // ---------- EVENTS ----------
  r.get("/events", wrap(async (req, res) => {
    const f = req.query.f || "upcoming", q = (req.query.q || "").toLowerCase();
    let list = await content.allEvents();
    const counts = {
      upcoming: list.filter(e => !e.past && e.status !== "draft").length,
      past: list.filter(e => e.past).length,
      draft: list.filter(e => e.status === "draft").length,
      featured: list.filter(e => e.featured).length,
      all: list.length
    };
    list = list.filter(e => f === "all" ? true : f === "past" ? e.past : f === "draft" ? e.status === "draft" : f === "featured" ? e.featured : !e.past && e.status !== "draft");
    if (q) list = list.filter(e => (e.title + " " + e.venue + " " + e.host).toLowerCase().includes(q));
    page(res, "events", "events", { list, f, q: req.query.q || "", counts, interests: cats.list("event") });
  }));
  const blankEvent = () => ({ title: "", subtitle: "", kicker: "", category: cats.first("event"), status: "draft", featured: false, date: "", time: "", dateConfirmed: true, town: "", state: "MA", zip: "", venue: "", address: "", host: "", contactEmail: "", contactPhone: "", price: "", ticketUrl: "", art: "purple", image: "", description: "" });
  r.get("/events/new", (req, res) => page(res, "event-form", "events", { ev: blankEvent(), isNew: true, interests: cats.list("event") }));
  r.get("/events/:id/edit", wrap(async (req, res, next) => {
    const ev = await records.get("event", req.params.id);
    if (!ev) return next();
    page(res, "event-form", "events", { ev: { ...blankEvent(), ...ev, state: ev.state || (ev.city === "boston" ? "MA" : "") }, isNew: false, interests: cats.list("event") });
  }));
  r.post("/events/save", wrap(async (req, res) => {
    const b = req.body;
    const title = String(b.title || "").trim();
    if (!title || !b.date) return fail(res, b.id ? `/admin/events/${b.id}/edit` : "/admin/events/new", "An event needs a title and a date.");
    let id = b.id;
    if (!id) {
      id = records.slugify(`${title}-${String(b.date).slice(0, 4)}`) || crypto.randomBytes(4).toString("hex");
      if (await records.get("event", id)) id += "-" + crypto.randomBytes(2).toString("hex");
    }
    const old = (await records.get("event", id)) || {};
    const { loc, errors: locErrors } = L.fromForm({ ...b, placeName: b.venue });
    if (locErrors.length) return fail(res, b.id ? `/admin/events/${b.id}/edit` : "/admin/events/new", locErrors.join(" "));
    const cover = await keepImages(b.image, 1);
    const ev = {
      ...old, slug: id,
      title, subtitle: (b.subtitle || "").trim(), kicker: (b.kicker || "").trim(),
      category: cats.has("event", b.category) ? b.category : cats.first("event"),
      status: ["draft", "published", "cancelled"].includes(b.status) ? b.status : "draft",
      featured: b.featured === "on", date: b.date, time: (b.time || "").trim(), dateConfirmed: b.dateConfirmed === "on",
      venue: loc.placeName, address: loc.address, town: loc.town, state: loc.state, zip: loc.zip, locVersion: 1,
      host: (b.host || "").trim(), contactEmail: (b.contactEmail || "").trim(), contactPhone: (b.contactPhone || "").trim(),
      price: (b.price || "").trim() || "See details", ticketUrl: /^https?:\/\//.test(b.ticketUrl || "") ? b.ticketUrl.trim() : "",
      art: ["purple", "gold", "magenta", "teal"].includes(b.art) ? b.art : "purple",
      image: cover[0] || "", description: (b.description || "").trim()
    };
    delete ev.city;
    if (ev.featured) for (const other of await records.list("event")) if (other.id !== id && other.featured) await records.put("event", other.id, { ...other, featured: false });
    await records.put("event", id, ev);
    go(res, "/admin/events" + (ev.status === "draft" ? "?f=draft" : ""), `Saved "${title}".`);
  }));
  r.post("/events/:id/feature", wrap(async (req, res) => {
    const ev = await records.get("event", req.params.id);
    if (ev) {
      const on = !ev.featured;
      if (on) for (const other of await records.list("event")) if (other.featured) await records.put("event", other.id, { ...other, featured: false });
      await records.put("event", ev.id, { ...ev, featured: on });
    }
    go(res, "/admin/events?f=" + (req.body.f || "upcoming"), ev && !ev.featured ? "Featured on the home page." : "Removed from the home page.");
  }));
  r.post("/events/:id/status", wrap(async (req, res) => {
    const ev = await records.get("event", req.params.id);
    if (ev && ["draft", "published", "cancelled"].includes(req.body.status)) await records.put("event", ev.id, { ...ev, status: req.body.status });
    go(res, "/admin/events?f=" + (req.body.f || "upcoming"), "Status updated.");
  }));
  r.post("/events/:id/delete", wrap(async (req, res) => {
    await records.del("event", req.params.id);
    go(res, "/admin/events", "Event deleted.");
  }));

  // ---------- ORGANIZATIONS ----------
  const ORG_CATS = () => cats.list("org").map(c => [c.key, c.label]);
  r.get("/organizations", wrap(async (req, res) => {
    const f = req.query.f || "all", q = (req.query.q || "").toLowerCase();
    const all = await content.allOrgs();
    const counts = { all: all.length, unconfirmed: all.filter(o => !o.verified).length, hidden: all.filter(o => o.status === "hidden").length };
    ORG_CATS().forEach(([k]) => counts[k] = all.filter(o => o.category === k).length);
    let list = all.filter(o => f === "all" ? true : f === "unconfirmed" ? !o.verified : f === "hidden" ? o.status === "hidden" : o.category === f);
    if (q) list = list.filter(o => (o.name + " " + o.town + " " + o.description).toLowerCase().includes(q));
    page(res, "organizations", "organizations", { list, f, q: req.query.q || "", counts, cats: ORG_CATS() });
  }));
  const blankOrg = () => ({ name: "", category: cats.first("org"), placeName: "", zip: "", state: "MA", meets: "", town: "", address: "", phone: "", website: "", description: "", images: [], photosRepresentative: false, verified: false, status: "published" });
  r.get("/organizations/new", (req, res) => page(res, "org-form", "organizations", { org: blankOrg(), isNew: true, cats: ORG_CATS() }));
  r.get("/organizations/:id/edit", wrap(async (req, res, next) => {
    const org = await records.get("org", req.params.id);
    if (!org) return next();
    page(res, "org-form", "organizations", { org: { ...blankOrg(), ...org, state: org.state || (org.city === "boston" ? "MA" : "") }, isNew: false, cats: ORG_CATS() });
  }));
  r.post("/organizations/save", wrap(async (req, res) => {
    const b = req.body;
    const name = String(b.name || "").trim();
    if (!name) return fail(res, b.id ? `/admin/organizations/${b.id}/edit` : "/admin/organizations/new", "An organization needs a name.");
    let id = b.id;
    if (!id) { id = records.slugify(name); if (await records.get("org", id)) id += "-" + crypto.randomBytes(2).toString("hex"); }
    const old = (await records.get("org", id)) || {};
    const { loc, errors: locErrors } = L.fromForm(b);
    if (locErrors.length) return fail(res, b.id ? `/admin/organizations/${b.id}/edit` : "/admin/organizations/new", locErrors.join(" "));
    const images = await keepImages(b.images, 4);
    const org = {
      ...old, name,
      category: cats.has("org", b.category) ? b.category : cats.first("org"),
      placeName: loc.placeName, address: loc.address, town: loc.town, state: loc.state, zip: loc.zip, locVersion: 1,
      phone: (b.phone || "").trim(), website: /^https?:\/\//.test(b.website || "") ? b.website.trim() : (b.website ? "https://" + b.website.trim() : ""),
      description: (b.description || "").trim(), meets: (b.meets || "").trim().slice(0, 60), images,
      photosRepresentative: b.photosRepresentative === "on", verified: b.verified === "on",
      status: b.status === "hidden" ? "hidden" : "published", order: old.order ?? 999
    };
    delete org.city;
    await records.put("org", id, org);
    go(res, "/admin/organizations", `Saved ${name}.`);
  }));
  r.post("/organizations/:id/toggle", wrap(async (req, res) => {
    const o = await records.get("org", req.params.id);
    if (o && req.body.what === "verified") await records.put("org", o.id, { ...o, verified: !o.verified });
    if (o && req.body.what === "hidden") await records.put("org", o.id, { ...o, status: o.status === "hidden" ? "published" : "hidden" });
    go(res, "/admin/organizations?f=" + (req.body.f || "all"), "Updated.");
  }));
  r.post("/organizations/:id/delete", wrap(async (req, res) => {
    await records.del("org", req.params.id);
    go(res, "/admin/organizations", "Organization deleted.");
  }));

  // Clean exports for analysis (one column per location part)
  const csvCell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  r.get("/organizations.csv", wrap(async (req, res) => {
    const rows = await content.allOrgs();
    const head = ["id", "name", "category", "place_name", "street", "city", "state", "zip", "phone", "website", "meets", "verified", "status", "photos", "updated"];
    const csv = [head.join(",")].concat(rows.map(o => [o.id, o.name, o.category, o.placeName, o.address, o.town, o.state, o.zip, o.phone, o.website, o.meets, o.verified ? "yes" : "no", o.status || "published", (o.images || []).length, o.updatedAt].map(csvCell).join(","))).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=kyoona-organizations.csv");
    res.send(csv);
  }));
  r.get("/events.csv", wrap(async (req, res) => {
    const rows = await content.allEvents();
    const head = ["id", "title", "category", "status", "date", "time", "date_confirmed", "venue", "street", "city", "state", "zip", "host", "price", "ticket_url", "featured"];
    const csv = [head.join(",")].concat(rows.map(e => [e.id, e.title, e.category, e.status, e.date, e.time, e.dateConfirmed ? "yes" : "no", e.venue, e.address, e.town, e.state, e.zip, e.host, e.price, e.ticketUrl, e.featured ? "yes" : "no"].map(csvCell).join(","))).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=kyoona-events.csv");
    res.send(csv);
  }));

  // ---------- COMMUNITY MEMBERS ----------
  r.get("/members", wrap(async (req, res) => {
    const f = req.query.f || "all", q = (req.query.q || "").toLowerCase();
    const all = await store.list();
    const counts = { all: all.length, confirmed: 0, pending: 0, unsubscribed: 0 };
    all.forEach(m => counts[m.status]++);
    let list = f === "all" ? all : all.filter(m => m.status === f);
    if (q) list = list.filter(m => (m.email + " " + m.first_name + " " + m.city).toLowerCase().includes(q));
    page(res, "members", "members", { list, f, q: req.query.q || "", counts, interests: cats.list("event") });
  }));
  r.post("/members/action", wrap(async (req, res) => {
    const { email, action } = req.body;
    const m = await store.byEmail(String(email || ""));
    if (!m) return fail(res, "/admin/members", "Member not found.");
    if (action === "resend") { await mailer.sendConfirm(m); return go(res, "/admin/members", `Confirmation re-sent to ${m.email}.`); }
    if (action === "confirm") { await store.setStatusByEmail(m.email, "confirmed"); return go(res, "/admin/members", `${m.email} marked confirmed.`); }
    if (action === "unsubscribe") { await store.setStatusByEmail(m.email, "unsubscribed"); return go(res, "/admin/members", `${m.email} unsubscribed.`); }
    if (action === "delete") { await store.remove(m.email); return go(res, "/admin/members", `${m.email} deleted.`); }
    res.redirect("/admin/members");
  }));
  r.get("/members.csv", wrap(async (req, res) => {
    const rows = await store.list();
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["email,first_name,city,interests,status,joined,confirmed"]
      .concat(rows.map(m => [m.email, m.first_name, m.city, m.interests, m.status, m.created_at, m.confirmed_at].map(q).join(","))).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=kyoona-members.csv");
    res.send(csv);
  }));

  // ---------- ANNOUNCEMENTS ----------
  r.get("/announcements", wrap(async (req, res) => {
    const history = (await records.list("announcement")).sort((a, b) => b.at.localeCompare(a.at));
    const members = (await store.list()).filter(m => m.status === "confirmed");
    page(res, "announcements", "announcements", { events: await content.upcoming(), history, confirmedCount: members.length, interests: cats.list("event"), preselect: req.query.event || "" });
  }));
  r.post("/announcements/send", wrap(async (req, res) => {
    const ev = await content.event(String(req.body.slug || ""));
    if (!ev) return fail(res, "/admin/announcements", "Pick a published event.");
    const audience = req.body.audience || "all";
    const test = req.body.test === "yes";
    let members = (await store.list()).filter(m => m.status === "confirmed");
    if (audience === "interest") members = members.filter(m => (m.interests || "").split(",").includes(ev.category));
    if (audience === "boston") members = members.filter(m => m.city === "Greater Boston");
    if (test) members = [{ email: CONTACT, first_name: "Test", token: "0".repeat(48) }];
    let sent = 0;
    for (const m of members) {
      try { await mailer.sendEventAnnouncement(m, ev, `${SITE}/events/${ev.slug}`); sent++; }
      catch (e) { console.error("announce to", m.email, e.message); }
      if (!test) await new Promise(r2 => setTimeout(r2, 400));
    }
    const at = new Date().toISOString();
    await records.put("announcement", at.replace(/[^0-9]/g, ""), { at, event: ev.slug, title: ev.title, audience, test, sent });
    go(res, "/admin/announcements", test ? `Test sent to ${CONTACT}.` : `Sent to ${sent} member${sent === 1 ? "" : "s"}.`);
  }));

  // ---------- CATEGORIES ----------
  // Event categories (also the interests people tick when they join) and organization types.
  const bad = (res, url, msg) => res.redirect(url + "?err=" + encodeURIComponent(msg));
  const TYPE_NAME = { event: "event category", org: "organization type" };
  const cleanCat = (t, b, old = {}) => {
    const c = { ...old, label: String(b.label || "").trim().slice(0, 40) };
    if (t === "event") {
      c.icon = cats.ICONS.includes(b.icon) ? b.icon : "calendar";
      c.join = b.join === "yes";
    } else {
      c.plural = String(b.plural || "").trim().slice(0, 40) || c.label;
      c.hint = String(b.hint || "").trim().slice(0, 80);
      c.color = cats.COLORS[b.color] ? b.color : "purple";
    }
    return c;
  };
  async function usage() {
    const u = { event: {}, org: {}, members: {} };
    const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
    (await records.list("event")).forEach(e => bump(u.event, e.category));
    (await records.list("org")).forEach(o => bump(u.org, o.category));
    (await records.list("submission")).filter(x => x.status === "new").forEach(x => bump(u[x.type === "event" ? "event" : "org"], (x.data || {}).category));
    (await store.list()).forEach(m => (m.interests || "").split(",").filter(Boolean).forEach(k => bump(u.members, k)));
    return u;
  }
  r.get("/categories", wrap(async (req, res) => {
    page(res, "categories", "categories", { evCats: cats.list("event"), orgCats: cats.list("org"), used: await usage(), COLORS: cats.COLORS, ICONS: cats.ICONS, catStyle: cats.style });
  }));
  r.post("/categories/:type/add", wrap(async (req, res) => {
    const t = req.params.type;
    if (!cats.TYPES.includes(t)) return bad(res, "/admin/categories", "Unknown list.");
    const c = cleanCat(t, req.body);
    if (!c.label) return bad(res, "/admin/categories", "Give the new " + TYPE_NAME[t] + " a name.");
    const items = cats.list(t);
    if (items.some(x => x.label.toLowerCase() === c.label.toLowerCase())) return bad(res, "/admin/categories", `"${c.label}" already exists.`);
    let key = records.slugify(c.label).slice(0, 30) || "cat", n = 2;
    while (key === "add" || items.some(x => x.key === key)) key = records.slugify(c.label).slice(0, 27) + "-" + n++;
    await cats.save(t, [...items, { key, ...c }]);
    go(res, "/admin/categories", `Added "${c.label}".`);
  }));
  r.post("/categories/:type/:key", wrap(async (req, res) => {
    const { type: t, key } = req.params;
    if (!cats.TYPES.includes(t) || !cats.has(t, key)) return bad(res, "/admin/categories", "That category no longer exists.");
    const items = cats.list(t).map(c => ({ ...c }));
    const i = items.findIndex(c => c.key === key);
    const action = req.body.action;
    if (action === "up" || action === "down") {
      const j = action === "up" ? i - 1 : i + 1;
      if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]];
      await cats.save(t, items);
      return go(res, "/admin/categories", "Order saved.");
    }
    if (action === "delete") {
      const u = await usage();
      const n = u[t][key] || 0;
      if (n) return bad(res, "/admin/categories", `"${items[i].label}" is still used by ${n} ${t === "event" ? "event" : "listing"}${n === 1 ? "" : "s"} or pending submission${n === 1 ? "" : "s"}. Move them to another ${TYPE_NAME[t]} first.`);
      if (items.length === 1) return bad(res, "/admin/categories", "Keep at least one " + TYPE_NAME[t] + ".");
      const [gone] = items.splice(i, 1);
      await cats.save(t, items);
      return go(res, "/admin/categories", `Deleted "${gone.label}".`);
    }
    const c = cleanCat(t, req.body, items[i]);
    if (!c.label) return bad(res, "/admin/categories", "A category needs a name.");
    if (items.some((x, k) => k !== i && x.label.toLowerCase() === c.label.toLowerCase())) return bad(res, "/admin/categories", `"${c.label}" already exists.`);
    items[i] = c;
    await cats.save(t, items);
    go(res, "/admin/categories", `Saved "${c.label}".`);
  }));

  // ---------- SETTINGS ----------
  r.get("/settings", wrap(async (req, res) => {
    const s = (await records.get("setting", "site")) || {};
    page(res, "settings", "settings", { s, CONTACT, SITE });
  }));
  r.post("/settings", wrap(async (req, res) => {
    const b = req.body;
    const s = {
      supportEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.supportEmail || "") ? b.supportEmail.trim() : "",
      instagram: (b.instagram || "").trim(), facebook: (b.facebook || "").trim(), whatsapp: (b.whatsapp || "").trim(),
      announcement: (b.announcement || "").trim().slice(0, 160)
    };
    await records.put("setting", "site", s);
    req.app.locals.settings = s;
    go(res, "/admin/settings", "Settings saved.");
  }));

  return r;
};
