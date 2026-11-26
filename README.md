# Kyoona Connect 2.0 (Node.js)

One site built from both old ones: the tickets site's look (Anton, Caveat and Poppins type, the video hero, poster event cards) and the community app's heart (the connection orbit, the "Let's Connect Together" message, the footer). Plus a new **Join the community** email list with event announcements.

No PHP. No Replit bill. Runs as a Node.js app on Hostinger.

## What's where

| Status | Path | What it is |
|---|---|---|
| NEW | `server.js` | The app: pages, sign-up, confirm/unsubscribe, admin |
| NEW | `content/events.json` | Starter events, imported on first run. After that, use /admin |
| NEW | `content/cities/boston.json` | Starter listings, imported on first run |
| NEW | `src/admin/` | The admin portal: `pages.js` (sidebar) and `routes.js` (pages) |
| NEW | `src/records.js` | Stores events, organizations, photos, announcements and settings |
| NEW | `src/store.js` | Saves community members (MySQL on Hostinger, a local file on your laptop) |
| NEW | `src/mailer.js` | Confirmation and event emails (Hostinger SMTP) |
| NEW | `src/content.js` | Reads the content files |
| NEW | `views/*.ejs` | Page templates (home, events, event, city, join, about, privacy, admin) |
| NEW | `public/css/site.css` | All styling |
| NEW | `public/js/site.js` | Menu, filters, no-reload sign-up |
| NEW | `public/fonts/` | Anton, Caveat, Poppins, hosted on your own site |
| NEW | `public/media/` | Hero video and images (from the tickets site), link-preview image |
| NEW | `.env.example` | Settings template: copy it to `.env` and fill it in |

## Run it on your laptop

```
npm install
npm start
```
Open http://localhost:3000. With no settings, members are saved to `data/members.json` and emails are printed in the terminal, so you can test everything.

## Put it on Hostinger

1. Push this folder to a new GitHub repo. The `.gitignore` already keeps `.env`, `node_modules` and `data` out.
2. hPanel → **Websites → Add website → Node.js app**, connect the GitHub repo, and set the start file to `server.js` (or the start command to `npm start`).
3. hPanel → **Databases**: create a MySQL database and user.
4. hPanel → **Emails**: create `hello@kyoonaconnect.com`.
5. In the Node.js app's **Environment variables**, add everything from `.env.example`, using the database and email details from steps 3 and 4. The `members` table creates itself the first time the app starts.
6. Deploy, open `/admin`, log in, and send yourself a test event email.

## The admin portal (/admin)

Log in with `ADMIN_PASSWORD`. The sidebar follows the original Kyoona Connect admin plan:

| Page | What you do there |
|---|---|
| Dashboard | Member counts, sign-ups per week, what needs attention, next events |
| Submissions | Everything sent through the site forms. Approve an event (opens as a draft), approve a new listing, or apply a listing update after comparing old and new. Decline with a reason. Optionally emails the person when it's approved |
| Events | Create, edit, publish/draft, feature on the home page, delete. Upload a cover image |
| Organizations | Add and edit Find your people listings with up to 4 photos, mark confirmed, hide |
| Community members | Search and filter, resend confirmation, confirm, unsubscribe, delete, CSV export |
| Announcements | Email an event to all members, by interest, or Greater Boston only, with a test first. Keeps a history |
| Settings | Contact email, a notice bar across the site, social links, connection status |

Tickets & orders, Member accounts, Communities and Reports & safety are shown greyed out as "Later".

**Adding a page for a new stage:** add one line to `src/admin/pages.js`, add its routes to `src/admin/routes.js` (each existing page is a self-contained section to copy), and create `views/admin/<page>.ejs` from `views/admin/_template.ejs`.

**Where content lives:** events, organizations, photos, announcements and settings are stored in the MySQL database (tables `records` and `media`, created automatically). Uploaded photos are resized in the browser and stored in the database too, so redeploying never wipes them. `content/events.json` and `content/cities/boston.json` are only the starter content imported on the very first run. After that, edit everything in the admin.

## Public forms

- `/submit/event`: List your event (with poster upload)
- `/submit/listing`: Add a listing (up to 4 photos), with a link to the update form
- `/submit/update`: Update listing details. The "Is this yours?" link in each organization popup opens it with that listing already picked.

All three have spam protection (a hidden trap field and a limit per visitor) and land in Admin → Submissions. If email is connected, you also get an alert for each new submission.

## How sign-up works

1. A visitor fills in the form (name, email, city, what they're into, and a consent tick box).
2. They get a branded "You're almost in" email and confirm with one tap (double opt-in, so the list stays clean and inboxes trust you).
3. Every announcement email has a one-click unsubscribe link.

The confirm and unsubscribe pages each need a button press, so email security scanners can't trigger them by accident. A hidden spam trap and a rate limit block bots.

WhatsApp is the next channel. The member list already records interests and city, so it can plug into the same announcements later.
