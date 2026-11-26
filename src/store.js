// Community members store.
// Uses MySQL when DB_HOST is set (Hostinger). Otherwise falls back to a JSON
// file in ./data so the site runs on a laptop with zero setup.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const useMysql = !!process.env.DB_HOST;
let pool = null;

const SCHEMA = `CREATE TABLE IF NOT EXISTS members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL DEFAULT '',
  city VARCHAR(80) NOT NULL DEFAULT '',
  interests VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('pending','confirmed','unsubscribed') NOT NULL DEFAULT 'pending',
  token CHAR(48) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME NULL,
  INDEX (status), INDEX (token)
) CHARACTER SET utf8mb4`;

const FILE = path.join(__dirname, "..", "data", "members.json");
function readFile() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}
function writeFile(rows) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
}
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const newToken = () => crypto.randomBytes(24).toString("hex");

async function init() {
  if (!useMysql) return;
  const mysql = require("mysql2/promise");
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5,
    charset: "utf8mb4"
  });
  await pool.query(SCHEMA);
}

// Create or refresh a signup. Returns { member, isNew, alreadyConfirmed }.
async function upsert({ email, firstName, city, interests }) {
  email = email.toLowerCase();
  const keep = (next, prev) => (next ? next : (prev || ""));
  if (useMysql) {
    const [rows] = await pool.query("SELECT * FROM members WHERE email=?", [email]);
    if (rows[0]) {
      const m = rows[0];
      const status = m.status === "confirmed" ? "confirmed" : "pending";
      firstName = keep(firstName, m.first_name); city = keep(city, m.city); interests = keep(interests, m.interests);
      await pool.query("UPDATE members SET first_name=?, city=?, interests=?, status=? WHERE id=?",
        [firstName, city, interests, status, m.id]);
      return { member: { ...m, first_name: firstName, city, interests, status }, isNew: false, alreadyConfirmed: m.status === "confirmed" };
    }
    const token = newToken();
    await pool.query("INSERT INTO members (email, first_name, city, interests, token) VALUES (?,?,?,?,?)",
      [email, firstName, city, interests, token]);
    return { member: { email, first_name: firstName, city, interests, token, status: "pending" }, isNew: true, alreadyConfirmed: false };
  }
  const rows = readFile();
  let m = rows.find(r => r.email === email);
  if (m) {
    const alreadyConfirmed = m.status === "confirmed";
    firstName = keep(firstName, m.first_name); city = keep(city, m.city); interests = keep(interests, m.interests);
    Object.assign(m, { first_name: firstName, city, interests, status: alreadyConfirmed ? "confirmed" : "pending" });
    writeFile(rows);
    return { member: m, isNew: false, alreadyConfirmed };
  }
  m = { id: rows.length + 1, email, first_name: firstName, city, interests, status: "pending", token: newToken(), created_at: now(), confirmed_at: null };
  rows.push(m); writeFile(rows);
  return { member: m, isNew: true, alreadyConfirmed: false };
}

async function setStatusByToken(token, status) {
  if (!/^[a-f0-9]{48}$/.test(token || "")) return null;
  if (useMysql) {
    const [rows] = await pool.query("SELECT * FROM members WHERE token=?", [token]);
    if (!rows[0]) return null;
    await pool.query("UPDATE members SET status=?, confirmed_at=IF(?='confirmed', NOW(), confirmed_at) WHERE id=?", [status, status, rows[0].id]);
    return { ...rows[0], status };
  }
  const rows = readFile();
  const m = rows.find(r => r.token === token);
  if (!m) return null;
  m.status = status;
  if (status === "confirmed") m.confirmed_at = now();
  writeFile(rows);
  return m;
}

async function setStatusByEmail(email, status) {
  if (useMysql) { await pool.query("UPDATE members SET status=? WHERE email=?", [status, email]); return; }
  const rows = readFile(); const m = rows.find(r => r.email === email); if (m) { m.status = status; writeFile(rows); }
}
async function remove(email) {
  if (useMysql) { await pool.query("DELETE FROM members WHERE email=?", [email]); return; }
  writeFile(readFile().filter(r => r.email !== email));
}
async function byEmail(email) {
  if (useMysql) { const [r] = await pool.query("SELECT * FROM members WHERE email=?", [email]); return r[0] || null; }
  return readFile().find(r => r.email === email) || null;
}

async function list() {
  if (useMysql) {
    const [rows] = await pool.query("SELECT id,email,first_name,city,interests,status,token,created_at,confirmed_at FROM members ORDER BY created_at DESC");
    return rows;
  }
  return readFile().slice().reverse();
}

module.exports = { init, upsert, setStatusByToken, setStatusByEmail, remove, byEmail, list, useMysql, getPool: () => pool };
