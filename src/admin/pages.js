// The admin sidebar. To add a page for a new stage:
//   1. add an entry here (key, label, icon from src/icons.js, href)
//   2. add its routes in src/admin/routes.js (copy any section as a template)
//   3. add its view in views/admin/<key>.ejs (start from views/admin/_template.ejs)
// Set `soon: true` to show it greyed out in the sidebar until it's built.
module.exports = [
  { key: "dashboard", label: "Dashboard", icon: "grid", href: "/admin" },
  { key: "events", label: "Events", icon: "calendar", href: "/admin/events" },
  { key: "organizations", label: "Organizations", icon: "building", href: "/admin/organizations" },
  { key: "members", label: "Community members", icon: "users", href: "/admin/members" },
  { key: "announcements", label: "Announcements", icon: "send", href: "/admin/announcements" },
  { key: "settings", label: "Settings", icon: "settings", href: "/admin/settings" },

  // Later stages, from the original Kyoona Connect admin plan. Build when the stage arrives.
  { key: "tickets", label: "Tickets & orders", icon: "mail", href: "#", soon: true },
  { key: "users", label: "Member accounts", icon: "users", href: "#", soon: true },
  { key: "communities", label: "Communities", icon: "grid", href: "#", soon: true },
  { key: "reports", label: "Reports & safety", icon: "eye", href: "#", soon: true }
];
