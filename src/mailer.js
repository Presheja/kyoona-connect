// Sends email through Hostinger SMTP (or any SMTP).
// If SMTP isn't configured, emails are printed to the console instead,
// so you can test the whole flow locally.
const nodemailer = require("nodemailer");

const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
const transport = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    })
  : null;

const FROM = process.env.MAIL_FROM || "Kyoona Connect <hello@kyoonaconnect.com>";
const SITE = (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// One branded email shell, kept table-based so it survives Gmail/Outlook.
function shell({ preheader, heading, bodyHtml, ctaText, ctaUrl, footerHtml }) {
  return `<!doctype html><html><body style="margin:0;background:#fffdf9;font-family:Poppins,Arial,sans-serif;color:#17131d">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf9"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #eee8e3">
<tr><td style="background:#25105a;padding:26px 30px">
  <div style="font-weight:800;font-size:22px;letter-spacing:2px;color:#ffffff">KYO<span style="color:#ffbf1f">✺</span>NA</div>
  <div style="font-weight:800;font-size:11px;letter-spacing:6px;color:#ff5f76;margin-top:4px">CONNECT</div>
</td></tr>
<tr><td style="padding:30px">
  <h1 style="margin:0 0 14px;font-family:Impact,'Anton',Arial Black,sans-serif;font-weight:400;font-size:34px;line-height:1.05;color:#25105a;text-transform:uppercase">${esc(heading)}</h1>
  <div style="font-size:16px;line-height:1.65;color:#3c3742">${bodyHtml}</div>
  ${ctaUrl ? `<p style="margin:26px 0 6px"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#ff5f76;color:#ffffff;text-decoration:none;font-weight:800;text-transform:uppercase;font-size:14px;letter-spacing:1px;padding:15px 26px;border-radius:999px">${esc(ctaText)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 30px 26px;border-top:1px solid #eee8e3;font-size:12px;line-height:1.6;color:#8a8290">${footerHtml || ""}
  <div>Kyoona Connect · Boston, MA · Connecting Ugandans worldwide</div></td></tr>
</table></td></tr></table></body></html>`;
}

async function send({ to, subject, html, text }) {
  if (!transport) {
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n[mail:dev] ${text}\n`);
    return { dev: true };
  }
  return transport.sendMail({ from: FROM, to, subject, html, text });
}

function unsubscribeFooter(token) {
  const u = `${SITE}/unsubscribe/${token}`;
  return { html: `You're getting this because you joined the Kyoona Connect community. <a href="${u}" style="color:#8a8290">Unsubscribe</a>.<br>`, url: u };
}

async function sendConfirm(member) {
  const url = `${SITE}/confirm/${member.token}`;
  const name = member.first_name ? `${member.first_name}, ` : "";
  return send({
    to: member.email,
    subject: "One tap and you're in, Kyoona Connect",
    text: `${name}confirm you want Kyoona Connect event updates: ${url}\n\nDidn't sign up? Ignore this email and nothing happens.`,
    html: shell({
      preheader: "Confirm your email to get event updates.",
      heading: "You're almost in.",
      bodyHtml: `<p style="margin:0 0 12px">${esc(name)}tap the button so we know it's really you. Then we'll let you know when something worth leaving the house for comes up: nights out, church gatherings, family days, conventions.</p><p style="margin:0">No spam. No forwarding your email to an auntie's MLM. Promise.</p>`,
      ctaText: "Yes, keep me posted",
      ctaUrl: url,
      footerHtml: "Didn't sign up? Ignore this email and nothing happens.<br>"
    })
  });
}

async function sendEventAnnouncement(member, ev, eventUrl) {
  const unsub = unsubscribeFooter(member.token);
  const name = member.first_name ? `${member.first_name}, ` : "";
  const when = [ev.dateLabel, ev.time].filter(Boolean).join(" · ");
  return send({
    to: member.email,
    subject: `${ev.title}: ${ev.dateLabel}`,
    text: `${name}${ev.title}${ev.subtitle ? " – " + ev.subtitle : ""}\n${when}\n${ev.venue}\n\n${ev.description}\n\nDetails: ${eventUrl}\n\nUnsubscribe: ${unsub.url}`,
    html: shell({
      preheader: `${ev.title} · ${when}`,
      heading: ev.title + (ev.subtitle ? ` – ${ev.subtitle}` : ""),
      bodyHtml: `<p style="margin:0 0 12px">${esc(name)}this one's coming up.</p>
        <p style="margin:0 0 4px;font-weight:700;color:#25105a">${esc(when)}</p>
        <p style="margin:0 0 14px;color:#5f5964">${esc(ev.venue)}${ev.address ? " · " + esc(ev.address) : ""}</p>
        <p style="margin:0">${esc(ev.description)}</p>`,
      ctaText: ev.ticketUrl ? "Get tickets" : "See the details",
      ctaUrl: eventUrl,
      footerHtml: unsub.html
    })
  });
}

module.exports = { sendConfirm, sendEventAnnouncement, configured };
