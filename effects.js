// ============ effects.js — boot sequence, scramble/decode, uptime, console egg ============

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Site went online with the first commit
const LAUNCH_DATE = new Date("2025-11-07T10:41:19Z");

// ---------- theme ----------
const THEMES = ["blue", "green", "amber"];

function applyTheme(name) {
  if (!THEMES.includes(name)) {
    return false;
  }
  if (name === "blue") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", name);
  }
  try {
    localStorage.setItem("theme", name);
  } catch (e) {
    // private mode etc.
  }
  return true;
}

try {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) {
    applyTheme(savedTheme);
  }
} catch (e) {
  // ignore
}

window.applyTheme = applyTheme;
window.THEMES = THEMES;

// ---------- clock + uptime ----------
const tsEl = document.getElementById("ts");
const slUptimeEl = document.getElementById("slUptime");
const nfUptimeEl = document.getElementById("nfUptime");
const pad2 = (n) => String(n).padStart(2, "0");

function uptimeParts() {
  let s = Math.max(0, Math.floor((Date.now() - LAUNCH_DATE.getTime()) / 1000));
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const mins = Math.floor(s / 60);
  const secs = s - mins * 60;
  return { days, hours, mins, secs };
}

function uptimeString() {
  const u = uptimeParts();
  return `${u.days}d ${pad2(u.hours)}:${pad2(u.mins)}:${pad2(u.secs)}`;
}

window.uptimeString = uptimeString;
window.uptimeParts = uptimeParts;

function tick() {
  const d = new Date();
  if (tsEl) {
    tsEl.textContent = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(
      d.getHours()
    )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  if (slUptimeEl) {
    slUptimeEl.textContent = `up ${uptimeString()}`;
  }
  if (nfUptimeEl) {
    nfUptimeEl.textContent = uptimeString();
  }
}

tick();
setInterval(tick, 1000);

// ---------- text scramble / decode ----------
const SCRAMBLE_CHARS = "!<>-_\\/[]{}=+*^?#@$%&01";

function scramble(el, duration = 650) {
  if (REDUCED_MOTION) {
    return;
  }
  const original = el.dataset.scrambleText || el.textContent;
  el.dataset.scrambleText = original;
  const len = original.length;
  const start = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const resolved = Math.floor(t * len);
    let out = original.slice(0, resolved);
    for (let i = resolved; i < len; i++) {
      const ch = original[i];
      out += ch === " " ? " " : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }
    el.textContent = out;
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = original;
    }
  }

  requestAnimationFrame(frame);
}

window.scramble = scramble;

// ---------- command typing + output reveal on scroll ----------
function typeCommand(cmdLine, done) {
  const textEl = cmdLine.querySelector(".cmd-text");
  const full = textEl.dataset.cmd;
  let i = 0;
  cmdLine.classList.add("typing");

  function step() {
    i += 1 + Math.floor(Math.random() * 2);
    textEl.textContent = full.slice(0, i);
    if (i < full.length) {
      setTimeout(step, 18 + Math.random() * 40);
    } else {
      textEl.textContent = full;
      cmdLine.classList.remove("typing");
      done();
    }
  }

  step();
}

function revealBlock(block) {
  const output = block.querySelector(".cmd-output");
  const finish = () => {
    if (output) {
      output.classList.add("on");
      output.querySelectorAll(".scramble").forEach((el) => scramble(el));
    }
  };
  const cmdLine = block.querySelector(".cmd-line");
  if (cmdLine && cmdLine.querySelector(".cmd-text")?.dataset.cmd) {
    typeCommand(cmdLine, finish);
  } else {
    finish();
  }
}

function initReveal() {
  const blocks = document.querySelectorAll(".cmd-block");
  if (REDUCED_MOTION || !("IntersectionObserver" in window)) {
    return;
  }

  document.documentElement.classList.add("fx");

  // stash command text and blank it so it can type itself in
  blocks.forEach((block) => {
    const textEl = block.querySelector(".cmd-text");
    if (textEl) {
      textEl.dataset.cmd = textEl.textContent.replace(/\s+/g, " ").trim();
      textEl.textContent = "";
    }
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          revealBlock(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
  );

  blocks.forEach((block) => observer.observe(block));

  // MOTD subtitle decodes on load
  const motdSub = document.querySelector(".motd-sub");
  if (motdSub) {
    scramble(motdSub, 900);
  }
}

// ---------- boot sequence ----------
// step types: line (one entry), gap, countup (animated number), progress
// (filling bar), burst (rapid dmesg spray), type (typed character by character)
const BOOT_SCRIPT = [
  { t: "line", html: '<span class="dim">SHIMAKAZE BIOS v2.7 — POST</span>', pause: 380 },
  { t: "countup", label: "Memory test: ", to: 640, unit: "K",
    tail: ' OK <span class="dim">(should be enough for anyone)</span>', dur: 850 },
  { t: "line", html: '<span class="ok">[  OK  ]</span> cpu0: 1 core @ hand-scheduled', pause: 120 },
  { t: "line", html: '<span class="ok">[  OK  ]</span> keyboard: detected <span class="dim">(loud)</span>', pause: 150 },
  { t: "line", html: '<span class="ok">[  OK  ]</span> display: CRT emulation, scanlines nominal', pause: 300 },
  { t: "gap" },
  { t: "line", html: '<span class="dim">GRUB 2.06: loading kernel 6.1.0-shimakaze ...</span>', pause: 150 },
  { t: "progress", width: 26, dur: 750 },
  { t: "gap" },
  { t: "burst", lines: [
    "[    0.000000] Linux version 6.1.0-shimakaze (john@shimakaze) (gcc 13.2, ld 2.41)",
    "[    0.000042] Command line: BOOT_IMAGE=/boot/portfolio root=/dev/john rw vibes=on",
    "[    0.004096] mem: custom allocator online — malloc politely declined",
    "[    0.010101] ecs: 3 component pools registered, 0 leaked (this time)",
    "[    0.013370] gpu0: OpenGL pipeline attached (v1 engine)",
    "[    0.024680] vfs: mounted /home/john (rw, overrides in localStorage)",
    "[    0.031337] ac_cheat: module loaded. anti-cheat looked the other way",
    "[    0.048151] rng: entropy pool seeded with keyboard rage",
    "[    0.061803] watchdog: nothing to watch. everything is fine",
  ], pause: 250 },
  { t: "gap" },
  { t: "line", html: '<span class="ok">[  OK  ]</span> Mounted /home/john', pause: 110 },
  { t: "line", html: '<span class="ok">[  OK  ]</span> Started twin_instance daemon (pid 1337)', pause: 110 },
  { t: "line", html: '<span class="ok">[  OK  ]</span> Started uptime counter', pause: 110 },
  { t: "line", html: '<span class="ok">[  OK  ]</span> Reached target portfolio.target', pause: 420 },
  { t: "gap" },
  { t: "type", text: "login: john", cls: "dim", pause: 260 },
  { t: "type", text: "password: ********", cls: "dim", pause: 380 },
  { t: "gap" },
  { t: "line", html: "Welcome.", pause: 420 },
];

function runBoot(done) {
  const screen = document.getElementById("bootScreen");
  const logEl = document.getElementById("bootLog");
  if (!screen || !logEl) {
    done();
    return;
  }

  screen.hidden = false;
  document.body.style.overflow = "hidden";
  let finished = false;

  function finish() {
    if (finished) {
      return;
    }
    finished = true;
    window.removeEventListener("keydown", finish);
    screen.removeEventListener("click", finish);
    screen.hidden = true;
    document.body.style.overflow = "";
    done();
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function addLine(html) {
    const line = document.createElement("div");
    line.innerHTML = html;
    logEl.appendChild(line);
    screen.scrollTop = screen.scrollHeight;
    return line;
  }

  async function runStep(step) {
    switch (step.t) {
      case "line":
        addLine(step.html);
        await sleep(step.pause || 90);
        break;

      case "gap":
        addLine("&nbsp;");
        await sleep(60);
        break;

      case "countup": {
        const line = addLine("");
        const ticks = 10;
        for (let i = 0; i <= ticks && !finished; i++) {
          const val = Math.round((step.to * i) / ticks);
          line.innerHTML = `${step.label}${val}${step.unit}${i === ticks ? step.tail : ""}`;
          await sleep(step.dur / ticks);
        }
        break;
      }

      case "progress": {
        const line = addLine("");
        for (let i = 0; i <= step.width && !finished; i++) {
          const bar = "#".repeat(i) + "-".repeat(step.width - i);
          line.innerHTML = `<span class="dim">[</span><span class="ok">${bar.slice(0, i)}</span><span class="dim">${bar.slice(i)}]</span>`;
          await sleep(step.dur / step.width);
        }
        break;
      }

      case "burst":
        for (const text of step.lines) {
          if (finished) {
            break;
          }
          addLine(`<span class="dim">${text}</span>`);
          await sleep(22 + Math.random() * 45);
        }
        await sleep(step.pause || 120);
        break;

      case "type": {
        const line = addLine("");
        let out = "";
        for (const ch of step.text) {
          if (finished) {
            break;
          }
          out += ch;
          line.innerHTML = `<span class="${step.cls || ""}">${out}<span class="boot-caret">█</span></span>`;
          await sleep(38 + Math.random() * 45);
        }
        line.innerHTML = `<span class="${step.cls || ""}">${step.text}</span>`;
        await sleep(step.pause || 150);
        break;
      }
    }
  }

  async function play() {
    for (const step of BOOT_SCRIPT) {
      if (finished) {
        return;
      }
      await runStep(step);
    }
    if (!finished) {
      await sleep(400);
      finish();
    }
  }

  window.addEventListener("keydown", finish);
  screen.addEventListener("click", finish);
  play();
}

function initBoot() {
  let shouldBoot = false;
  let replay = false;
  try {
    replay = sessionStorage.getItem("replayBoot") === "1";
    shouldBoot = replay || !sessionStorage.getItem("booted");
    sessionStorage.setItem("booted", "1");
    sessionStorage.removeItem("replayBoot");
  } catch (e) {
    shouldBoot = false;
  }

  if (shouldBoot && !REDUCED_MOTION) {
    runBoot(initReveal);
  } else {
    initReveal();
  }
}

initBoot();

// ---------- devtools easter egg ----------
console.log(
  "%c\n" +
    "     _  ___  _   _ _   _\n" +
    "    | |/ _ \\| | | | \\ | |\n" +
    " _  | | | | | |_| |  \\| |\n" +
    "| |_| | |_| |  _  | |\\  |\n" +
    " \\___/ \\___/|_| |_|_| \\_|\n",
  "color:#00c8ff; font-family:monospace;"
);
console.log(
  "%cyou found the debug port.\n" +
    "%cthis page has a live shell at the bottom — but since you're here,\n" +
    "you clearly like poking at internals. so do I.\n\n" +
    "psst: try  sudo rm -rf /   or  noclip   or  vim\n\n" +
    "mail: yangtianzhuo970425@gmail.com",
  "color:#00ff9d; font-weight:bold; font-family:monospace;",
  "color:#5a7a90; font-family:monospace;"
);
