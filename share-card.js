// Social share card: story-sized PNG with transparent / Training Pal / custom background.
(function () {
  const W = 1080;
  const H = 1920;
  const BRAND_ICON = "/assets/app-icon.png";

  let draft = null;
  let customObjectUrl = null;
  let iconImg = null;

  function tt(key, vars) {
    return typeof window.tt === "function" ? window.tt(key, vars) : key;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatClock(totalSec) {
    if (typeof window.formatClock === "function") return window.formatClock(totalSec);
    const s = Math.max(0, Math.round(Number(totalSec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function parseDurationSec(time) {
    const parts = String(time || "").split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }

  function sportLabel(cat) {
    if (typeof window.YEAR_SPORT_LABEL === "function") return window.YEAR_SPORT_LABEL(cat) || cat;
    if (typeof window.KIND_LABEL === "function") return window.KIND_LABEL(cat) || cat;
    return cat || "Session";
  }

  function distanceLabel(cat, dist) {
    const n = Number(dist) || 0;
    if (!(n > 0)) return "";
    if (cat === "swim") return `${Math.round(n)} m`;
    if (typeof window.fmtDistWithUnit === "function") return window.fmtDistWithUnit(n);
    return `${n.toFixed(n >= 10 ? 1 : 2)} km`;
  }

  function paceLabel(cat, pace, movingSec, distKm) {
    if (pace) {
      if (cat === "run" && typeof window.fmtRunPace === "function") return window.fmtRunPace(pace);
      if (cat === "swim") return `${pace}/100m`;
      if ((cat === "bike" || cat === "ebike") && typeof window.fmtBikeSpeed === "function") {
        return window.fmtBikeSpeed(pace);
      }
      return String(pace);
    }
    if (cat === "run" && movingSec > 0 && distKm > 0.05) {
      const secPerKm = movingSec / distKm;
      const m = Math.floor(secPerKm / 60);
      const s = Math.round(secPerKm % 60);
      return `${m}:${String(s).padStart(2, "0")}/km`;
    }
    return "";
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function ensureIcon() {
    if (iconImg) return iconImg;
    try {
      iconImg = await loadImage(BRAND_ICON);
    } catch {
      iconImg = null;
    }
    return iconImg;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawCoverImage(ctx, img, w, h) {
    const ir = img.width / img.height;
    const cr = w / h;
    let dw; let dh; let dx; let dy;
    if (ir > cr) {
      dh = h;
      dw = h * ir;
      dx = (w - dw) / 2;
      dy = 0;
    } else {
      dw = w;
      dh = w / ir;
      dx = 0;
      dy = (h - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function normalizeTrack(points) {
    if (!Array.isArray(points)) return [];
    return points
      .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .slice(0, 600);
  }

  function trackFromActivity(a) {
    return normalizeTrack(a?.raw?.track || a?.track);
  }

  /** Bare course silhouette — no panel/background, fit shape into box. */
  function drawCourse(ctx, points, box, {
    line,
    start,
    end,
    lineWidth = 10,
    dot = 12,
    inset = 16,
  }) {
    if (!points || points.length < 2) return;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    points.forEach((p) => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    });
    const padLat = Math.max((maxLat - minLat) * 0.08, 0.0002);
    const padLng = Math.max((maxLng - minLng) * 0.08, 0.0002);
    minLat -= padLat;
    maxLat += padLat;
    minLng -= padLng;
    maxLng += padLng;
    const spanLat = maxLat - minLat || 0.001;
    const spanLng = maxLng - minLng || 0.001;
    // Keep geographic aspect (approx) so the shape isn’t stretched.
    const midLat = (minLat + maxLat) / 2;
    const latScale = Math.cos((midLat * Math.PI) / 180);
    const geoW = spanLng * Math.max(latScale, 0.2);
    const geoH = spanLat;
    const innerW = Math.max(8, box.w - inset * 2);
    const innerH = Math.max(8, box.h - inset * 2);
    const scale = Math.min(innerW / geoW, innerH / geoH);
    const drawW = geoW * scale;
    const drawH = geoH * scale;
    const ox = box.x + (box.w - drawW) / 2;
    const oy = box.y + (box.h - drawH) / 2;
    const xy = (p) => {
      const x = ox + ((p.lng - minLng) / spanLng) * drawW;
      const y = oy + (1 - (p.lat - minLat) / spanLat) * drawH;
      return [x, y];
    };

    ctx.beginPath();
    points.forEach((p, i) => {
      const [x, y] = xy(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = line;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    if (dot > 0) {
      const [sx, sy] = xy(points[0]);
      const [ex, ey] = xy(points[points.length - 1]);
      ctx.fillStyle = start || line;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, dot * 0.75), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = end || line;
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(2, dot), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function paintBrandBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1a1512");
    g.addColorStop(0.45, "#241c18");
    g.addColorStop(1, "#0e0c0b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const orb = ctx.createRadialGradient(W * 0.15, H * 0.18, 40, W * 0.15, H * 0.18, W * 0.7);
    orb.addColorStop(0, "rgba(228, 87, 46, 0.38)");
    orb.addColorStop(1, "rgba(228, 87, 46, 0)");
    ctx.fillStyle = orb;
    ctx.fillRect(0, 0, W, H);

    const orb2 = ctx.createRadialGradient(W * 0.85, H * 0.72, 20, W * 0.85, H * 0.72, W * 0.55);
    orb2.addColorStop(0, "rgba(79, 157, 105, 0.22)");
    orb2.addColorStop(1, "rgba(79, 157, 105, 0)");
    ctx.fillStyle = orb2;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = 280 + i * 220;
      ctx.beginPath();
      ctx.moveTo(80, y);
      ctx.lineTo(W - 80, y + (i % 2 ? 40 : -24));
      ctx.stroke();
    }
  }

  async function paintCard(canvas, d) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    const lightText = d.bg !== "transparent";
    if (d.bg === "brand") {
      paintBrandBackground(ctx);
    } else if (d.bg === "custom" && d.customImg) {
      drawCoverImage(ctx, d.customImg, W, H);
      ctx.fillStyle = "rgba(10, 8, 7, 0.45)";
      ctx.fillRect(0, 0, W, H);
    }

    const ink = lightText ? "#f7f3ee" : "#1d1d1f";
    const muted = lightText ? "rgba(247,243,238,0.72)" : "rgba(29,29,31,0.62)";
    const accent = "#e4572e";

    const icon = await ensureIcon();
    const brandY = 160;
    if (icon) {
      const s = 72;
      roundRect(ctx, 96, brandY, s, s, 18);
      ctx.save();
      ctx.clip();
      ctx.drawImage(icon, 96, brandY, s, s);
      ctx.restore();
    }
    ctx.fillStyle = ink;
    ctx.font = "700 42px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(tt("brand.name"), icon ? 188 : 96, brandY + 36);

    ctx.fillStyle = accent;
    ctx.font = "700 28px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(String(d.sportLabel || "").toUpperCase(), 96, 320);

    ctx.fillStyle = ink;
    ctx.font = "750 92px system-ui, -apple-system, Segoe UI, sans-serif";
    const title = String(d.title || tt("share.session"));
    wrapText(ctx, title, 96, 420, W - 192, 102, 3);

    const hasTrack = !!(d.track && d.track.length >= 2);
    const showCourse = !!(d.showCourse && hasTrack);

    // Same clean stats layout either way; course only adds a silhouette bottom-right.
    const stats = [];
    if (d.distanceLabel) stats.push({ label: tt("share.distance"), value: d.distanceLabel });
    if (d.timeLabel) stats.push({ label: tt("share.time"), value: d.timeLabel });
    if (d.paceLabel) stats.push({ label: tt("share.pace"), value: d.paceLabel });

    const statsTop = 780;
    stats.forEach((st, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 96 + col * 460;
      const y = statsTop + row * 220;
      ctx.fillStyle = muted;
      ctx.font = "650 26px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(st.label.toUpperCase(), x, y);
      ctx.fillStyle = ink;
      ctx.font = "750 78px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(st.value, x, y + 86);
    });

    if (showCourse) {
      drawCourse(ctx, d.track, { x: W - 560, y: H - 720, w: 440, h: 420 }, {
        line: accent,
        start: accent,
        end: accent,
        lineWidth: 12,
        dot: 11,
        inset: 6,
      });
    }

    if (d.dateLabel) {
      ctx.fillStyle = muted;
      ctx.font = "600 30px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(d.dateLabel, 96, H - 220);
    }

    ctx.fillStyle = muted;
    ctx.font = "600 28px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(tt("share.via"), 96, H - 150);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    let line = "";
    let lines = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = words[i];
        if (lines >= maxLines - 1) {
          let rest = words.slice(i).join(" ");
          while (ctx.measureText(`${rest}…`).width > maxWidth && rest.length > 1) {
            rest = rest.slice(0, -1);
          }
          ctx.fillText(`${rest}…`, x, y + lines * lineHeight);
          return;
        }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y + lines * lineHeight);
  }

  function overlayHtml() {
    return `
      <div class="share-card" id="share-card" role="dialog" aria-modal="true" aria-label="${esc(tt("share.title"))}">
        <div class="share-card-inner">
          <header class="share-card-head">
            <div>
              <div class="eyebrow">${esc(tt("share.eyebrow"))}</div>
              <h2>${esc(tt("share.title"))}</h2>
            </div>
            <button class="icon-button" type="button" data-action="share-close" aria-label="${esc(tt("common.close") || "Close")}">✕</button>
          </header>
          <div class="share-preview" data-share-preview data-bg="brand">
            <canvas class="share-canvas" data-share-canvas width="${W}" height="${H}"></canvas>
          </div>
          <div class="share-bg-picks" role="group" aria-label="${esc(tt("share.background"))}">
            <button class="choice-btn active" type="button" data-action="share-bg" data-bg="brand" aria-pressed="true">${esc(tt("share.bgBrand"))}</button>
            <button class="choice-btn" type="button" data-action="share-bg" data-bg="transparent" aria-pressed="false">${esc(tt("share.bgTransparent"))}</button>
            <button class="choice-btn" type="button" data-action="share-bg" data-bg="custom" aria-pressed="false">${esc(tt("share.bgCustom"))}</button>
          </div>
          <label class="share-custom-pick" data-share-custom-wrap hidden>
            <span class="button ghost small">${esc(tt("share.choosePhoto"))}</span>
            <input type="file" accept="image/*" data-share-file hidden />
          </label>
          <div class="share-course-picks" data-share-course-wrap hidden role="group" aria-label="${esc(tt("share.course"))}">
            <button class="choice-btn active" type="button" data-action="share-course" data-course="1" aria-pressed="true">${esc(tt("share.courseOn"))}</button>
            <button class="choice-btn" type="button" data-action="share-course" data-course="0" aria-pressed="false">${esc(tt("share.courseOff"))}</button>
          </div>
          <p class="muted small-text">${esc(tt("share.hint"))}</p>
          <div class="share-actions">
            <button class="button ghost" type="button" data-action="share-download">${esc(tt("share.saveImage"))}</button>
            <button class="button" type="button" data-action="share-native">${esc(tt("share.share"))}</button>
          </div>
        </div>
      </div>`;
  }

  async function refreshPreview() {
    const root = document.getElementById("share-card");
    if (!root || !draft) return;
    const canvas = root.querySelector("[data-share-canvas]");
    const preview = root.querySelector("[data-share-preview]");
    if (preview) preview.dataset.bg = draft.bg;
    root.querySelectorAll("[data-action=share-bg]").forEach((btn) => {
      const on = btn.dataset.bg === draft.bg;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const customWrap = root.querySelector("[data-share-custom-wrap]");
    if (customWrap) customWrap.hidden = draft.bg !== "custom";
    const hasCourse = !!(draft.track && draft.track.length >= 2);
    const courseWrap = root.querySelector("[data-share-course-wrap]");
    if (courseWrap) courseWrap.hidden = !hasCourse;
    root.querySelectorAll("[data-action=share-course]").forEach((btn) => {
      const on = (btn.dataset.course === "1") === !!draft.showCourse;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (canvas) await paintCard(canvas, draft);
  }

  function canvasToBlob(canvas, type) {
    return new Promise((resolve) => canvas.toBlob(resolve, type || "image/png"));
  }

  async function exportPng() {
    const canvas = document.querySelector("#share-card [data-share-canvas]");
    if (!canvas || !draft) return null;
    await paintCard(canvas, draft);
    return canvasToBlob(canvas, "image/png");
  }

  async function downloadImage() {
    const blob = await exportPng();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-pal-${draft.dateKey || "session"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (typeof window.toast === "function") toast(tt("share.saved"));
  }

  async function nativeShare() {
    const blob = await exportPng();
    if (!blob) return;
    const file = new File([blob], `training-pal-${draft.dateKey || "session"}.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: tt("brand.name"),
          text: draft.title || tt("share.session"),
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({
          title: tt("brand.name"),
          text: [draft.title, draft.distanceLabel, draft.timeLabel].filter(Boolean).join(" · "),
        });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    await downloadImage();
  }

  function closeShareCard() {
    document.getElementById("share-card")?.remove();
    document.body.classList.remove("share-card-open");
    if (customObjectUrl) {
      URL.revokeObjectURL(customObjectUrl);
      customObjectUrl = null;
    }
    draft = null;
  }

  function normalizePayload(payload = {}) {
    const cat = payload.sport || payload.cat || "run";
    const movingSec = Number(payload.movingSec) > 0
      ? Number(payload.movingSec)
      : parseDurationSec(payload.duration || payload.time);
    const dist = payload.distanceKm != null ? Number(payload.distanceKm) : Number(payload.dist) || 0;
    let dateLabel = payload.dateLabel || "";
    const dateKey = String(payload.date || "").slice(0, 10);
    if (!dateLabel && dateKey && typeof window.fmt === "function" && typeof window.parseDate === "function") {
      try {
        dateLabel = window.fmt(window.parseDate(dateKey), { weekday: "long", day: "numeric", month: "long" });
      } catch { /* ignore */ }
    }
    const track = normalizeTrack(payload.track);
    const hasCourse = track.length >= 2;
    return {
      bg: "brand",
      customImg: null,
      title: payload.title || sportLabel(cat),
      sportLabel: sportLabel(cat),
      distanceLabel: payload.distanceLabel || distanceLabel(
        cat,
        cat === "swim" && payload.dist != null ? Number(payload.dist) : dist,
      ),
      timeLabel: payload.timeLabel || (movingSec > 0 ? formatClock(movingSec) : ""),
      paceLabel: payload.paceLabel || paceLabel(cat, payload.pace, movingSec, dist),
      dateLabel,
      dateKey,
      track,
      showCourse: hasCourse && payload.showCourse !== false,
    };
  }

  function openShareCard(payload) {
    closeShareCard();
    draft = normalizePayload(payload);
    document.body.insertAdjacentHTML("beforeend", overlayHtml());
    document.body.classList.add("share-card-open");
    refreshPreview();
  }

  function openShareCardFromActivity(a) {
    if (!a) return;
    openShareCard({
      title: a.title || sportLabel(a.cat),
      sport: a.cat,
      dist: a.dist,
      distanceKm: a.cat === "swim" ? undefined : a.dist,
      duration: a.time,
      pace: a.pace,
      date: a.date,
      track: trackFromActivity(a),
    });
  }

  function onClick(e) {
    const btn = e.target.closest?.("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "share-close") {
      e.preventDefault();
      closeShareCard();
      return;
    }
    if (action === "share-bg") {
      e.preventDefault();
      if (!draft) return;
      draft.bg = btn.dataset.bg || "brand";
      if (draft.bg === "custom" && !draft.customImg) {
        document.querySelector("#share-card [data-share-file]")?.click();
      }
      refreshPreview();
      return;
    }
    if (action === "share-course") {
      e.preventDefault();
      if (!draft) return;
      draft.showCourse = btn.dataset.course !== "0";
      refreshPreview();
      return;
    }
    if (action === "share-download") {
      e.preventDefault();
      downloadImage();
      return;
    }
    if (action === "share-native") {
      e.preventDefault();
      nativeShare();
      return;
    }
    if (action === "share-activity") {
      e.preventDefault();
      e.stopPropagation();
      openShareFromButton(btn);
    }
  }

  function activityList() {
    // Classic scripts share lexical globals; `let ACTS` is not on `window`.
    try {
      if (typeof ACTS !== "undefined" && Array.isArray(ACTS)) return ACTS;
    } catch { /* ignore */ }
    if (Array.isArray(window.ACTS)) return window.ACTS;
    return [];
  }

  function openShareFromButton(btn) {
    if (!btn) return;
    const datetime = btn.dataset.datetime || "";
    const act = datetime
      ? activityList().find((x) => String(x.datetime) === String(datetime))
      : null;
    if (act) {
      openShareCardFromActivity(act);
      return;
    }
    // Fallback: payload embedded on the button (no ACTS lookup needed).
    if (!btn.dataset.date && !btn.dataset.title) return;
    openShareCard({
      title: btn.dataset.title || "",
      sport: btn.dataset.cat || "run",
      dist: btn.dataset.dist !== "" ? Number(btn.dataset.dist) : undefined,
      distanceKm: btn.dataset.cat === "swim"
        ? undefined
        : (btn.dataset.dist !== "" ? Number(btn.dataset.dist) : undefined),
      duration: btn.dataset.time || "",
      pace: btn.dataset.pace || "",
      date: btn.dataset.date || "",
    });
  }

  function onChange(e) {
    const input = e.target.closest?.("[data-share-file]");
    if (!input || !draft) return;
    const file = input.files?.[0];
    if (!file) return;
    if (customObjectUrl) URL.revokeObjectURL(customObjectUrl);
    customObjectUrl = URL.createObjectURL(file);
    loadImage(customObjectUrl).then((img) => {
      draft.customImg = img;
      draft.bg = "custom";
      refreshPreview();
    }).catch(() => {
      if (typeof window.toast === "function") toast(tt("share.photoFail"), true);
    });
  }

  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("share-card")) closeShareCard();
  });

  window.openShareCard = openShareCard;
  window.openShareCardFromActivity = openShareCardFromActivity;
  window.closeShareCard = closeShareCard;
})();
