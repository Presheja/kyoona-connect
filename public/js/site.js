// Kyoona Connect — small progressive enhancements. Everything works without JS.
document.addEventListener("DOMContentLoaded", () => {
  // Mobile menu
  const dots = document.querySelector(".menu-dots");
  const nav = document.getElementById("nav");
  if (dots && nav) dots.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    dots.setAttribute("aria-expanded", open);
  });

  // Join forms: submit without leaving the page
  document.querySelectorAll("form[data-join]").forEach(form => {
    const done = form.nextElementSibling;
    const errBox = form.querySelector(".form-errors");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const data = new URLSearchParams(new FormData(form));
      btn.disabled = true; btn.style.opacity = .7;
      try {
        const r = await fetch("/join", { method: "POST", headers: { Accept: "application/json" }, body: data });
        const j = await r.json();
        if (!j.ok) throw new Error((j.errors || ["Something went wrong."]).join(" "));
        if (done) {
          if (j.alreadyConfirmed) {
            done.querySelector("h3").textContent = "You're already in.";
            done.querySelector("p").textContent = "We've updated what you're into. Carry on.";
          }
          form.hidden = true; done.hidden = false;
        }
      } catch (err) {
        errBox.textContent = err.message; errBox.hidden = false;
      } finally { btn.disabled = false; btn.style.opacity = 1; }
    });
  });

  // Events page filter
  const fb = document.querySelector("[data-filter]");
  const ft = document.querySelector("[data-filter-target]");
  if (fb && ft) fb.addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    fb.querySelectorAll(".chip").forEach(c => c.classList.toggle("is-on", c === b));
    ft.querySelectorAll("[data-cat]").forEach(card => {
      card.hidden = b.dataset.cat !== "all" && card.dataset.cat !== b.dataset.cat;
    });
  });

  // Find your people: search, pills and profile popup
  const grid = document.querySelector("[data-org-grid]");
  if (grid) {
    const search = document.querySelector("[data-org-search]");
    const pills = document.querySelector("[data-org-pills]");
    const empty = document.querySelector("[data-org-empty]");
    let cat = "all";
    const apply = () => {
      const q = (search.value || "").trim().toLowerCase();
      let shown = 0;
      grid.querySelectorAll(".org-card").forEach(c => {
        const ok = (cat === "all" || c.dataset.cat === cat) && (!q || c.dataset.text.includes(q));
        c.hidden = !ok; if (ok) shown++;
      });
      empty.hidden = shown > 0;
    };
    const pick = key => { cat = key; pills.querySelectorAll(".org-pill").forEach(b => b.classList.toggle("is-on", b.dataset.cat === key)); apply(); };
    pills.addEventListener("click", e => { const b = e.target.closest(".org-pill"); if (b) pick(b.dataset.cat); });
    search.addEventListener("input", apply);
    const h = location.hash.slice(1);
    if (pills.querySelector(`[data-cat="${h}"]`)) pick(h);

    const data = JSON.parse(document.getElementById("org-data").textContent);
    const modal = document.querySelector("[data-org-modal]");
    const $ = s => modal.querySelector(s);
    const show = (row, on) => { $(row).hidden = !on; };
    const open = i => {
      const o = data[i];
      $("[data-om-cat]").textContent = o.cat;
      $("[data-om-name]").textContent = o.name;
      $("[data-om-desc]").textContent = o.description;
      $("[data-om-addr]").textContent = o.address || o.town;
      $("[data-om-map]").href = o.map;
      show("[data-om-phone-row]", !!o.phone);
      if (o.phone) { $("[data-om-phone]").textContent = o.phone; $("[data-om-phone]").href = "tel:" + o.phone.replace(/[^\d+]/g, ""); }
      show("[data-om-web-row]", !!o.website);
      if (o.website) { $("[data-om-web]").textContent = o.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); $("[data-om-web]").href = o.website; }
      $("[data-om-update]").href = o.update;
      $("[data-om-note]").hidden = !o.representative || !o.images.length;
      const main = $("[data-om-main]"), thumbs = $("[data-om-thumbs]");
      const setMain = k => { main.src = o.images[k] || ""; main.hidden = !o.images[k]; thumbs.querySelectorAll("button").forEach((b, j) => b.classList.toggle("is-on", j === k)); };
      thumbs.innerHTML = o.images.length > 1 ? o.images.map((src, k) => `<button type="button" aria-label="Photo ${k + 1}"><img src="${src}" alt="" loading="lazy"></button>`).join("") : "";
      thumbs.querySelectorAll("button").forEach((b, k) => b.addEventListener("click", () => setMain(k)));
      setMain(0);
      modal.showModal();
    };
    document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => open(+b.dataset.open)));
    $("[data-close]").addEventListener("click", () => modal.close());
    modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });
  }

  // Copy link buttons
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied ✓"; }
    catch { prompt("Copy this link:", b.dataset.copy); }
  }));
});
