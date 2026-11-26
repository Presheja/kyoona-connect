// Kyoona Connect admin — menu, confirmations, photo uploads, live poster preview.
document.addEventListener("DOMContentLoaded", () => {
  const side = document.getElementById("adm-side");
  document.querySelector("[data-menu]")?.addEventListener("click", e => { e.stopPropagation(); side.classList.toggle("open"); });
  document.addEventListener("click", e => { if (side?.classList.contains("open") && !side.contains(e.target)) side.classList.remove("open"); });

  // "Are you sure?" on destructive forms/buttons
  document.querySelectorAll("form[data-confirm]").forEach(f => f.addEventListener("submit", e => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
  document.querySelectorAll("[data-confirm-btn]").forEach(b => b.addEventListener("click", e => { if (!confirm(b.dataset.confirmBtn)) e.preventDefault(); }));
  document.querySelectorAll("form[data-confirm-unless-test]").forEach(f => f.addEventListener("submit", e => {
    if (!f.test.checked && !confirm("Send this email to the members you picked?")) e.preventDefault();
  }));

  // Warn before leaving a form with unsaved changes
  document.querySelectorAll("form[data-dirty]").forEach(f => {
    let dirty = false;
    f.addEventListener("input", () => dirty = true);
    f.addEventListener("submit", () => dirty = false);
    window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  });

  // Photo uploader: shrink in the browser (max 1600px JPEG) so uploads are fast and small
  const shrink = file => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
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
    const thumbs = up.querySelector("[data-thumbs]");
    const input = up.querySelector("[data-file]");
    const drop = up.querySelector(".drop");
    const refresh = () => {
      drop.classList.toggle("full", thumbs.children.length >= max);
      document.dispatchEvent(new CustomEvent("kc:images"));
    };
    const tile = src => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.innerHTML = `<img alt=""><input type="hidden" name="${name}"><button type="button" class="x" data-remove aria-label="Remove">×</button>${max > 1 ? '<button type="button" class="first" data-first>Make cover</button>' : ""}`;
      d.querySelector("img").src = src; d.querySelector("input").value = src;
      return d;
    };
    const add = async files => {
      const room = max - thumbs.children.length;
      const list = [...files].filter(f => f.type.startsWith("image/")).slice(0, max === 1 ? 1 : room);
      if (max === 1) thumbs.innerHTML = "";
      up.classList.add("uploading");
      for (const f of list) { try { thumbs.appendChild(tile(await shrink(f))); } catch { alert("Couldn't read " + f.name); } }
      up.classList.remove("uploading");
      up.closest("form")?.dispatchEvent(new Event("input"));
      refresh();
    };
    input.addEventListener("change", () => { add(input.files); input.value = ""; });
    thumbs.addEventListener("click", e => {
      const t = e.target.closest(".thumb"); if (!t) return;
      if (e.target.closest("[data-remove]")) { t.remove(); refresh(); up.closest("form")?.dispatchEvent(new Event("input")); }
      if (e.target.closest("[data-first]")) { thumbs.prepend(t); refresh(); }
    });
    ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", e => add(e.dataTransfer.files));
    refresh();
  });

  // Live poster preview on the event form
  const pv = document.querySelector("[data-preview]");
  if (pv) {
    const form = pv.closest("form");
    const text = pv.querySelector(".pv-text");
    const sync = () => {
      ["title", "subtitle", "kicker"].forEach(k => { pv.querySelector(`[data-pv="${k}"]`).textContent = form[k].value || (k === "title" ? "Event title" : ""); });
      const art = form.querySelector('[name="art"]:checked');
      pv.className = "preview art-" + (art ? art.value : "purple");
      const img = form.querySelector('[name="image"]');
      pv.style.backgroundImage = img && img.value ? `url("${img.value}")` : "";
      text.hidden = !!(img && img.value);
    };
    form.addEventListener("input", sync); form.addEventListener("change", sync);
    document.addEventListener("kc:images", sync);
  }
});
