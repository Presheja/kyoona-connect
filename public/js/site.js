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
      show("[data-om-meets-row]", !!o.meets); $("[data-om-meets]").textContent = o.meets || "";
      show("[data-om-phone-row]", !!o.phone);
      if (o.phone) { $("[data-om-phone]").textContent = o.phone; $("[data-om-phone-link]").href = "tel:" + o.phone.replace(/[^\d+]/g, ""); }
      show("[data-om-web-row]", !!o.website);
      if (o.website) { $("[data-om-web]").textContent = o.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); $("[data-om-web-link]").href = o.website; }
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


  // Photo uploads on the public forms: shrink in the browser, then send with the form
  const shrink = file => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
  document.querySelectorAll("[data-uploader]").forEach(up => {
    const max = +up.dataset.max, name = up.dataset.name;
    const thumbs = up.querySelector("[data-thumbs]"), input = up.querySelector("[data-file]"), drop = up.querySelector(".pu-drop");
    const refresh = () => drop.classList.toggle("full", thumbs.children.length >= max);
    const add = async files => {
      if (max === 1) thumbs.innerHTML = "";
      const list = [...files].filter(f => f.type.startsWith("image/")).slice(0, max - thumbs.children.length);
      up.classList.add("busy");
      for (const f of list) {
        try {
          const data = await shrink(f);
          const d = document.createElement("div");
          d.className = "pu-thumb";
          d.innerHTML = `<img alt=""><input type="hidden" name="${name}"><button type="button" aria-label="Remove">×</button>`;
          d.querySelector("img").src = data; d.querySelector("input").value = data;
          d.querySelector("button").addEventListener("click", () => { d.remove(); refresh(); });
          thumbs.appendChild(d);
        } catch { alert("Couldn't read " + f.name); }
      }
      up.classList.remove("busy"); refresh();
    };
    input.addEventListener("change", () => { add(input.files); input.value = ""; });
    ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", e => add(e.dataTransfer.files));
  });
  document.querySelectorAll("form[data-pub-form]").forEach(f => f.addEventListener("submit", () => {
    const b = f.querySelector("button[type=submit]"); b.disabled = true; b.firstChild.textContent = "Sending... ";
  }));

  // Copy link buttons
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.lastChild.textContent = "Copied"; }
    catch { prompt("Copy this link:", b.dataset.copy); }
  }));
});
