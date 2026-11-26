// Categories for events and organizations, managed in Admin → Categories.
// Stored as two records ("categories"/"event" and "categories"/"org").
// Until the admin saves a change, the defaults below are used.
// A category's key never changes once created, so renaming is always safe.
const records = require("./records");

// Colours an organization type can use (cards, filter tiles). text is a darker shade when the colour is too light to read.
const COLORS = {
  teal: { hex: "#51a3a3", name: "Teal", bg: "var(--teal)", text: "var(--teal)" },
  purple: { hex: "#6f34e8", name: "Purple", bg: "var(--purple)", text: "var(--purple)" },
  coral: { hex: "#ff5f76", name: "Coral", bg: "var(--coral)", text: "var(--coral)" },
  magenta: { hex: "#e0218a", name: "Magenta", bg: "var(--magenta)", text: "var(--magenta)" },
  yellow: { hex: "#ffbf1f", name: "Yellow", bg: "var(--yellow)", text: "#946200" },
  ink: { hex: "#25105a", name: "Deep purple", bg: "var(--ink)", text: "var(--ink)" }
};

// Icons an event category can use (from src/icons.js).
const ICONS = ["nightlife", "faith", "family", "food", "convention", "business", "heart", "sport", "school", "star", "users", "calendar", "globe", "chat", "tag"];

const DEFAULTS = {
  event: [
    { key: "nightlife", label: "Nights out", icon: "nightlife", join: true },
    { key: "faith", label: "Church & faith", icon: "faith", join: true },
    { key: "family", label: "Family & kids", icon: "family", join: true },
    { key: "food", label: "Food & culture", icon: "food", join: true },
    { key: "convention", label: "Conventions & travel", icon: "convention", join: true },
    { key: "business", label: "Business & networking", icon: "business", join: true }
  ],
  org: [
    { key: "community", label: "Association", plural: "Associations", hint: "Association or community group", color: "teal" },
    { key: "faith", label: "Church & fellowship", plural: "Churches", hint: "Church, mosque or fellowship", color: "purple" },
    { key: "food", label: "Food & business", plural: "Places to eat", hint: "Restaurant, food or Ugandan business", color: "coral" },
    { key: "groups", label: "Group", plural: "Groups", hint: "WhatsApp or Facebook group", color: "yellow" }
  ]
};
const TYPES = Object.keys(DEFAULTS);
const cache = {};

async function load() {
  for (const t of TYPES) {
    const r = await records.get("categories", t);
    cache[t] = r && Array.isArray(r.items) && r.items.length ? r.items : DEFAULTS[t].map(c => ({ ...c }));
  }
}
const list = t => cache[t] || DEFAULTS[t];
const find = (t, key) => list(t).find(c => c.key === key);
const label = (t, key) => (find(t, key) || {}).label || key || "";
const has = (t, key) => !!find(t, key);
const first = t => list(t)[0].key;
async function save(t, items) {
  cache[t] = items;
  await records.put("categories", t, { items });
}
// Inline CSS variables for an organization card or tile: style="<%= catStyle(key) %>"
function style(key) {
  const c = COLORS[(find("org", key) || {}).color] || COLORS.purple;
  return `--cat:${c.bg};--cat-text:${c.text}`;
}

module.exports = { TYPES, COLORS, ICONS, load, list, find, label, has, first, save, style };
