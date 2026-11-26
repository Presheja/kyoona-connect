// One place for location rules, so every form, page and export agrees.
// Stored fields (organizations and events):
//   placeName  optional building / venue name   ("St. Mary's Parish")
//   address    street line only                 ("133 School St")
//   town       one city or town                 ("Waltham")
//   state      2-letter code from STATES        ("MA")
//   zip        US 5-digit or ZIP+4, or Canadian ("02451")

const STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "Washington DC"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
  ["AB", "Alberta (Canada)"], ["BC", "British Columbia (Canada)"], ["MB", "Manitoba (Canada)"], ["NS", "Nova Scotia (Canada)"],
  ["ON", "Ontario (Canada)"], ["QC", "Quebec (Canada)"], ["SK", "Saskatchewan (Canada)"]
];
const CODES = new Set(STATES.map(s => s[0]));
const CANADA = new Set(["AB", "BC", "MB", "NS", "ON", "QC", "SK"]);
const BY_NAME = new Map(STATES.map(([c, n]) => [n.replace(/ \(Canada\)$/, "").toLowerCase(), c]));
const ALIASES = { "mass": "MA", "mass.": "MA", "calif": "CA", "d.c.": "DC", "washington, dc": "DC", "washington d.c.": "DC" };
const stateName = code => (STATES.find(s => s[0] === code) || [, code])[1];

const tidy = v => String(v || "").replace(/\s+/g, " ").trim();

// "ma", "Massachusetts", "Mass." -> "MA". Anything unknown -> "".
function normState(v) {
  const s = tidy(v);
  if (!s) return "";
  const up = s.toUpperCase().replace(/\./g, "");
  if (CODES.has(up)) return up;
  const low = s.toLowerCase();
  return BY_NAME.get(low) || ALIASES[low] || "";
}
// "02451", "02451-1234", "k1a 0b1" -> cleaned, else "".
function normZip(v) {
  const s = tidy(v).toUpperCase();
  if (/^\d{5}(-\d{4})?$/.test(s)) return s;
  const ca = s.replace(/\s/g, "");
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(ca)) return ca.slice(0, 3) + " " + ca.slice(3);
  if (/^\d{4}$/.test(s)) return "0" + s; // Excel ate the leading zero (common for MA)
  return "";
}
// "Waltham area" -> "Waltham", "Arlington / Waltham" -> "Arlington"
function normTown(v) {
  return tidy(v).split(/\s*[\/|;]\s*/)[0].replace(/\s+(area|region|metro)$/i, "").replace(/^greater\s+/i, "Greater ");
}

// Read the five fields from a submitted form. Returns { loc, errors }.
function fromForm(b, { prefix = "", requireTownState = false } = {}) {
  const get = k => b[prefix + k];
  const rawState = tidy(get("state")), rawZip = tidy(get("zip"));
  const loc = {
    placeName: tidy(get("placeName")).slice(0, 120),
    address: tidy(get("address")).slice(0, 160),
    town: normTown(get("town")).slice(0, 80),
    state: normState(rawState),
    zip: normZip(rawZip)
  };
  const errors = [];
  if (rawState && !loc.state) errors.push("Pick the state from the list.");
  if (rawZip && !loc.zip) errors.push("ZIP code should be 5 digits, like 02451.");
  if (requireTownState && !loc.town) errors.push("Which city or town is it in?");
  if (requireTownState && !loc.state) errors.push("Which state is it in?");
  return { loc, errors };
}

const cityLine = o => [o.town, [o.state, o.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
const shortLocation = o => [o.town, o.state].filter(Boolean).join(", ");
const fullAddress = o => [o.placeName, o.address, cityLine(o)].filter(Boolean).join(", ");
// Maps works best with street + town + state + zip; fall back to the name when there's no street.
function mapUrl(o, name) {
  const q = o.address ? [o.address, cityLine(o)].filter(Boolean).join(", ") : [o.placeName || name, cityLine(o)].filter(Boolean).join(", ");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

// Split an old one-box address ("St. Mary's Parish, 133 School St, Waltham, MA 02451")
// into the five fields, using the record's existing town/state as hints.
function parseLegacy(rec) {
  const out = { placeName: tidy(rec.placeName), address: "", town: normTown(rec.town), state: normState(rec.state) || (rec.city === "boston" ? "MA" : ""), zip: normZip(rec.zip) };
  const parts = tidy(rec.address).split(",").map(tidy).filter(Boolean);
  const last = () => parts[parts.length - 1];
  if (parts.length) {
    let m = /^(.*?)[\s,]*(\d{5}(?:-\d{4})?)$/.exec(last());
    if (m) { out.zip = out.zip || m[2]; if (m[1]) parts[parts.length - 1] = m[1]; else parts.pop(); }
  }
  if (parts.length && normState(last())) { out.state = out.state || normState(last()); parts.pop(); }
  if (parts.length && !/\d/.test(last())) {
    const t = normTown(last());
    if (out.town && t.toLowerCase() === out.town.toLowerCase()) parts.pop();          // repeats the town
    else if (!out.town || parts.length > 1) { out.town = out.town || t; parts.pop(); } // town only lived in the address
  }
  if (parts.length && !/^\d/.test(parts[0])) out.placeName = out.placeName || parts.shift();
  out.address = parts.join(", ");
  return out;
}

module.exports = { STATES, CANADA, stateName, normState, normZip, normTown, fromForm, cityLine, shortLocation, fullAddress, mapUrl, parseLegacy };
