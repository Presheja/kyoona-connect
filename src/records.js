// Editable content: events, organizations, announcements, settings, and uploaded photos.
// MySQL when DB_HOST is set (Hostinger), otherwise JSON files in ./data for local use.
// Everything the admin portal edits lives here, so redeploying never wipes it.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const useMysql = !!process.env.DB_HOST;
const DATA = path.join(__dirname, "..", "data");
const FILE = path.join(DATA, "records.json");
const MEDIA_DIR = path.join(DATA, "media");
let pool = null;

const now = () => new Date().toISOString();

function readAll() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } }
function writeAll(all) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(all, null, 2)); }

async function init(getPool) {
  if (useMysql) {
    pool = getPool();
    await pool.query(`CREATE TABLE IF NOT EXISTS records (
      kind VARCHAR(24) NOT NULL, id VARCHAR(120) NOT NULL, data LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (kind, id)) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS media (
      id CHAR(24) NOT NULL PRIMARY KEY, mime VARCHAR(40) NOT NULL, data MEDIUMBLOB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  }
  await seed();
}

async function list(kind) {
  if (useMysql) {
    const [rows] = await pool.query("SELECT data FROM records WHERE kind=?", [kind]);
    return rows.map(r => JSON.parse(r.data));
  }
  return Object.values(readAll()[kind] || {});
}
async function get(kind, id) {
  if (useMysql) {
    const [rows] = await pool.query("SELECT data FROM records WHERE kind=? AND id=?", [kind, id]);
    return rows[0] ? JSON.parse(rows[0].data) : null;
  }
  return (readAll()[kind] || {})[id] || null;
}
async function put(kind, id, obj) {
  obj = { ...obj, id, updatedAt: now() };
  if (useMysql) {
    await pool.query("INSERT INTO records (kind,id,data) VALUES (?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)", [kind, id, JSON.stringify(obj)]);
  } else {
    const all = readAll(); (all[kind] = all[kind] || {})[id] = obj; writeAll(all);
  }
  return obj;
}
async function del(kind, id) {
  if (useMysql) return pool.query("DELETE FROM records WHERE kind=? AND id=?", [kind, id]);
  const all = readAll(); if (all[kind]) delete all[kind][id]; writeAll(all);
}

// ---- photos: admin uploads arrive as compressed data URLs ----
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
async function saveMedia(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 6 * 1024 * 1024) return null;
  const id = crypto.randomBytes(12).toString("hex");
  if (useMysql) await pool.query("INSERT INTO media (id,mime,data) VALUES (?,?,?)", [id, m[1], buf]);
  else { fs.mkdirSync(MEDIA_DIR, { recursive: true }); fs.writeFileSync(path.join(MEDIA_DIR, `${id}.${EXT[m[1]]}`), buf); }
  return `/m/${id}.${EXT[m[1]]}`;
}
async function readMedia(file) {
  const m = /^([a-f0-9]{24})\.(jpg|png|webp|gif)$/.exec(file || "");
  if (!m) return null;
  if (useMysql) {
    const [rows] = await pool.query("SELECT mime,data FROM media WHERE id=?", [m[1]]);
    return rows[0] ? { mime: rows[0].mime, data: rows[0].data } : null;
  }
  const p = path.join(MEDIA_DIR, file);
  if (!fs.existsSync(p)) return null;
  const mime = Object.keys(EXT).find(k => EXT[k] === m[2]);
  return { mime, data: fs.readFileSync(p) };
}

// ---- first run: import the starter content files ----
const slugify = s => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80);
async function seed() {
  const dir = path.join(__dirname, "..", "content");
  if (!(await list("event")).length) {
    let evs = []; try { evs = JSON.parse(fs.readFileSync(path.join(dir, "events.json"), "utf8")); } catch {}
    for (const e of evs) await put("event", e.slug, { status: "published", ...e });
  }
  if (!(await list("org")).length) {
    const cdir = path.join(dir, "cities");
    for (const f of fs.existsSync(cdir) ? fs.readdirSync(cdir) : []) {
      if (!f.endsWith(".json")) continue;
      const city = JSON.parse(fs.readFileSync(path.join(cdir, f), "utf8"));
      let i = 0;
      for (const l of city.listings || []) await put("org", slugify(l.name), { status: "published", city: city.slug, order: i++, ...l });
    }
  }
}

module.exports = { init, list, get, put, del, saveMedia, readMedia, slugify, useMysql };
