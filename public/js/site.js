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

  // City directory filter + search
  const df = document.querySelector("[data-dir-filter]");
  const grid = document.querySelector("[data-dir-grid]");
  if (df && grid) {
    const search = document.querySelector("[data-dir-search]");
    const empty = document.querySelector("[data-dir-empty]");
    let cat = "all";
    const apply = () => {
      const q = (search.value || "").trim().toLowerCase();
      let shown = 0;
      grid.querySelectorAll(".dir-card").forEach(c => {
        const ok = (cat === "all" || c.dataset.cat === cat) && (!q || c.dataset.text.includes(q));
        c.hidden = !ok; if (ok) shown++;
      });
      empty.hidden = shown > 0;
    };
    const pick = key => {
      cat = key;
      df.querySelectorAll(".chip").forEach(c => c.classList.toggle("is-on", c.dataset.cat === key));
      apply();
    };
    df.addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) pick(b.dataset.cat); });
    search.addEventListener("input", apply);
    const hash = location.hash.slice(1);
    if (["community", "faith", "food", "groups"].includes(hash)) pick(hash);
  }

  // Copy link buttons
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied ✓"; }
    catch { prompt("Copy this link:", b.dataset.copy); }
  }));
});
