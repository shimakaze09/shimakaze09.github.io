// ============ desktop.js — hacker wallpaper (digital rain + glitches) + window management ============

const bgCanvas = document.getElementById("desktopBg");
const bgCtx = bgCanvas.getContext("2d");
const BG_REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>[]{}#$%&*+=?/\\|;:~";
const CELL = 16;

let bgW = 0;
let bgH = 0;
let rainCols = [];
let glitchFrames = 0;
let nextGlitchAt = 3;

const themeColors = { accent: "#00c8ff", green: "#00ff9d", bg: "#050c14" };

function readThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  themeColors.accent = cs.getPropertyValue("--accent").trim() || themeColors.accent;
  themeColors.green = cs.getPropertyValue("--green").trim() || themeColors.green;
  themeColors.bg = cs.getPropertyValue("--bg").trim() || themeColors.bg;
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function buildRain() {
  const count = Math.ceil(bgW / CELL) + 1;
  rainCols = Array.from({ length: count }, () => ({
    y: Math.random() * (bgH / CELL),
    speed: 0.12 + Math.random() * 0.38,
    bright: Math.random() < 0.22,          // some columns get a hot white-green head
    dim: Math.random() < 0.45,             // some sit further "back"
  }));
}

function resizeBg() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  bgW = window.innerWidth;
  bgH = window.innerHeight;
  bgCanvas.width = Math.round(bgW * dpr);
  bgCanvas.height = Math.round(bgH * dpr);
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgCtx.fillStyle = themeColors.bg;
  bgCtx.fillRect(0, 0, bgW, bgH);
  buildRain();
}

function drawStaticWallpaper() {
  // reduced motion: one quiet frame of scattered glyphs, no animation
  bgCtx.fillStyle = themeColors.bg;
  bgCtx.fillRect(0, 0, bgW, bgH);
  bgCtx.font = `${CELL - 2}px 'JetBrains Mono', monospace`;
  for (let i = 0; i < 260; i++) {
    bgCtx.fillStyle = withAlpha(themeColors.accent, 0.04 + Math.random() * 0.08);
    bgCtx.fillText(randomGlyph(), Math.random() * bgW, Math.random() * bgH);
  }
}

function glitchBurst() {
  // tear a few horizontal slices of the current frame sideways
  const slices = 3 + Math.floor(Math.random() * 5);
  for (let i = 0; i < slices; i++) {
    const y = Math.random() * bgH;
    const h = 2 + Math.random() * 14;
    const shift = (Math.random() - 0.5) * 60;
    bgCtx.drawImage(bgCanvas, 0, y * (bgCanvas.height / bgH), bgCanvas.width, h * (bgCanvas.height / bgH), shift, y, bgW, h);
    if (Math.random() < 0.4) {
      bgCtx.fillStyle = withAlpha(themeColors.accent, 0.06);
      bgCtx.fillRect(0, y, bgW, 1.5);
    }
  }
}

let lastT = 0;

function bgFrame(tms) {
  const t = tms / 1000;
  const dt = Math.min(0.1, t - lastT || 0.016);
  lastT = t;

  // fade previous frame toward bg — this is what makes the trails
  bgCtx.fillStyle = withAlpha(themeColors.bg, 0.16);
  bgCtx.fillRect(0, 0, bgW, bgH);

  bgCtx.font = `${CELL - 2}px 'JetBrains Mono', monospace`;

  for (let i = 0; i < rainCols.length; i++) {
    const col = rainCols[i];
    col.y += col.speed * dt * 60;
    const x = i * CELL;
    const y = Math.floor(col.y) * CELL;

    if (y > bgH + CELL * 4) {
      col.y = -Math.random() * 30;
      col.speed = 0.12 + Math.random() * 0.38;
      col.bright = Math.random() < 0.22;
      col.dim = Math.random() < 0.45;
      continue;
    }
    if (y < -CELL) {
      continue;
    }

    // head glyph; the fading pass turns previous heads into the trail
    const alpha = col.dim ? 0.20 : 0.45;
    bgCtx.fillStyle = col.bright
      ? withAlpha(themeColors.green, alpha + 0.25)
      : withAlpha(themeColors.accent, alpha);
    bgCtx.fillText(randomGlyph(), x, y);
  }

  // occasional glitch tear
  if (glitchFrames > 0) {
    glitchBurst();
    glitchFrames -= 1;
  } else if (t > nextGlitchAt) {
    glitchFrames = 2 + Math.floor(Math.random() * 3);
    nextGlitchAt = t + 3 + Math.random() * 5;
  }

  requestAnimationFrame(bgFrame);
}

readThemeColors();
resizeBg();

if (BG_REDUCED) {
  drawStaticWallpaper();
} else {
  requestAnimationFrame(bgFrame);
}

window.addEventListener("resize", () => {
  resizeBg();
  if (BG_REDUCED) {
    drawStaticWallpaper();
  }
});

// repaint base + colors when the theme command changes the palette
new MutationObserver(() => {
  readThemeColors();
  bgCtx.fillStyle = themeColors.bg;
  bgCtx.fillRect(0, 0, bgW, bgH);
  if (BG_REDUCED) {
    drawStaticWallpaper();
  }
}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// ============ window management: drag, resize, titlebar buttons ============

const termWin = document.getElementById("terminal");
const termTitlebar = document.getElementById("termTitlebar");
const termResize = document.getElementById("termResize");
const tbClose = document.getElementById("tbClose");
const tbMin = document.getElementById("tbMin");
const tbMax = document.getElementById("tbMax");

let dragX = 0;
let dragY = 0;

const canManageWindow = () => window.innerWidth > 700;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function setDrag(x, y) {
  dragX = x;
  dragY = y;
  termWin.style.setProperty("--drag-x", `${x}px`);
  termWin.style.setProperty("--drag-y", `${y}px`);
}

termTitlebar.addEventListener("pointerdown", (e) => {
  if (!canManageWindow() || termWin.classList.contains("maximized") || e.target.closest(".tb")) {
    return;
  }
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const baseX = dragX;
  const baseY = dragY;
  const rect = termWin.getBoundingClientRect();
  termTitlebar.classList.add("dragging");
  termTitlebar.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    let nx = baseX + (ev.clientX - startX);
    let ny = baseY + (ev.clientY - startY);
    // keep enough of the titlebar on screen to grab it again
    const left = rect.left + (nx - baseX);
    const top = rect.top + (ny - baseY);
    nx += clamp(left, 70 - rect.width, window.innerWidth - 70) - left;
    ny += clamp(top, 0, window.innerHeight - 40) - top;
    setDrag(nx, ny);
  };

  const onUp = () => {
    termTitlebar.classList.remove("dragging");
    termTitlebar.removeEventListener("pointermove", onMove);
    termTitlebar.removeEventListener("pointerup", onUp);
    termTitlebar.removeEventListener("pointercancel", onUp);
  };

  termTitlebar.addEventListener("pointermove", onMove);
  termTitlebar.addEventListener("pointerup", onUp);
  termTitlebar.addEventListener("pointercancel", onUp);
});

termResize.addEventListener("pointerdown", (e) => {
  if (!canManageWindow() || termWin.classList.contains("maximized")) {
    return;
  }
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const rect = termWin.getBoundingClientRect();
  let prevW = rect.width;
  let prevH = rect.height;
  termResize.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    const w = clamp(rect.width + (ev.clientX - startX), 420, window.innerWidth);
    const h = clamp(rect.height + (ev.clientY - startY), 300, window.innerHeight);
    termWin.style.setProperty("--win-w", `${w}px`);
    termWin.style.setProperty("--win-h", `${h}px`);
    // window is center-anchored by the flex layout: nudge the drag offset so
    // the top-left corner stays put and only the grabbed corner moves
    setDrag(dragX + (w - prevW) / 2, dragY + (h - prevH) / 2);
    prevW = w;
    prevH = h;
  };

  const onUp = () => {
    termResize.removeEventListener("pointermove", onMove);
    termResize.removeEventListener("pointerup", onUp);
    termResize.removeEventListener("pointercancel", onUp);
  };

  termResize.addEventListener("pointermove", onMove);
  termResize.addEventListener("pointerup", onUp);
  termResize.addEventListener("pointercancel", onUp);
});

tbMax.addEventListener("click", () => {
  const maximizing = !termWin.classList.contains("maximized");
  termWin.classList.toggle("maximized", maximizing);
  termWin.classList.remove("minimized");
  // inline custom props beat the .maximized class rule, so park the transform
  termWin.style.transform = maximizing ? "none" : "";
});

tbMin.addEventListener("click", () => {
  termWin.classList.toggle("minimized");
});

let closing = false;
tbClose.addEventListener("click", () => {
  if (closing) {
    return;
  }
  closing = true;
  document.body.classList.add("crt-off");
  setTimeout(() => {
    document.body.classList.remove("crt-off");
    document.body.classList.add("crt-on");
    setTimeout(() => {
      document.body.classList.remove("crt-on");
      closing = false;
    }, 450);
  }, 1300);
});

// phone rotation / viewport shrink: hand sizing back to CSS
window.addEventListener("resize", () => {
  if (!canManageWindow()) {
    termWin.style.removeProperty("--win-w");
    termWin.style.removeProperty("--win-h");
    setDrag(0, 0);
  }
});
