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
const BOOT_LINES = [
  ["dim", "SHIMAKAZE BIOS v2.7 — cold boot"],
  ["ok", "memory check: 640K <span class='dim'>(should be enough for anyone)</span>"],
  ["ok", "cpu: 1 core, hand-scheduled"],
  ["ok", "mounting /home/john"],
  ["ok", "loading ecs modules"],
  ["ok", "linking custom allocator <span class='dim'>(malloc? never met her)</span>"],
  ["ok", "starting twin_instance daemon"],
  ["ok", "syncing uptime counter"],
  ["dim", ""],
  ["dim", "login: john"],
  ["dim", "password: ********"],
  ["dim", ""],
  ["plain", "Welcome."],
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
  let idx = 0;
  let finished = false;
  let timer = null;

  function finish() {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timer);
    window.removeEventListener("keydown", finish);
    screen.removeEventListener("click", finish);
    screen.hidden = true;
    document.body.style.overflow = "";
    done();
  }

  function next() {
    if (idx >= BOOT_LINES.length) {
      timer = setTimeout(finish, 350);
      return;
    }
    const [kind, html] = BOOT_LINES[idx];
    const line = document.createElement("div");
    if (kind === "ok") {
      line.innerHTML = `<span class="ok">[  OK  ]</span> ${html}`;
    } else if (kind === "dim") {
      line.innerHTML = `<span class="dim">${html}</span>`;
    } else {
      line.innerHTML = html;
    }
    logEl.appendChild(line);
    idx += 1;
    timer = setTimeout(next, 40 + Math.random() * 110);
  }

  window.addEventListener("keydown", finish);
  screen.addEventListener("click", finish);
  next();
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
