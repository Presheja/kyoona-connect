# Kyoona Connect 2.0 (Node.js)

One site built from both old ones: the tickets site's look (Anton, Caveat and Poppins type, the video hero, poster event cards) and the community app's heart (the connection orbit, the "Let's Connect Together" message, the footer). Plus a new **Join the community** email list with event announcements.

No PHP. No Replit bill. Runs as a Node.js app on Hostinger.

## What's where

| Status | Path | What it is |
|---|---|---|
| NEW | `server.js` | The app: pages, sign-up, confirm/unsubscribe, admin |
| NEW | `content/events.json` | **Events, the file you'll edit most.** Add an event = add a block |
| NEW | `content/cities/boston.json` | Greater Boston directory listings |
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

## Everyday jobs

- **Add an event:** copy a block in `content/events.json`, change it, commit. `art` can be `purple`, `gold`, `magenta` or `teal`, or set `image` to a poster in `public/media/`. Set `featured: true` to put it in the hero.
- **Tell the community:** `/admin` → pick the event → send to all members, only members interested in that event's category, or only Greater Boston members. "Send a test to me only" is ticked by default.
- **Export members:** `/admin` → Download CSV.
- **Add a listing:** edit `content/cities/boston.json`, and set `"verified": true` once you've confirmed it.

## How sign-up works

1. A visitor fills in the form (name, email, city, what they're into, and a consent tick box).
2. They get a branded "You're almost in" email and confirm with one tap (double opt-in, so the list stays clean and inboxes trust you).
3. Every announcement email has a one-click unsubscribe link.

The confirm and unsubscribe pages each need a button press, so email security scanners can't trigger them by accident. A hidden spam trap and a rate limit block bots.

WhatsApp is the next channel. The member list already records interests and city, so it can plug into the same announcements later.
