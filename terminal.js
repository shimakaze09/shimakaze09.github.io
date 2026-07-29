// ============ terminal.js — the live shell at the bottom of the page ============

const shellOutput = document.getElementById("shellOutput");
const shellInput = document.getElementById("shellInput");
const shellSection = document.getElementById("prompt");
const shellPs1 = document.getElementById("shellPs1");
const BASH_PS1_INNER = shellPs1.innerHTML;

const shellHistory = [];
let historyIndex = -1;
let shellBusy = false;
let noclipOn = false;
let twinMode = false;

// ---------- virtual filesystem ----------
const VFS = {
  "about.txt": {
    type: "file",
    content:
      "John — student, systems & engine dev.\n" +
      "Currently building a 3D game engine in C++20 from scratch:\n" +
      "custom memory allocator, ECS framework, OpenGL pipeline.\n" +
      "Also into operating systems and reverse engineering.\n" +
      "Motto: question the abstraction, then rebuild it.",
  },
  "contact": {
    type: "file",
    content:
      "email:  yangtianzhuo970425@gmail.com\n" +
      "github: github.com/shimakaze09",
  },
  ".secrets": {
    type: "file",
    content:
      "U2FsdGVkX1+qm3kzT9x0aGUgY2FrZSBpcyBhIGxpZQ==\n" +
      "(encrypted. the key is not on this page. some things you have to ask for.)",
  },
  "projects": { type: "dir" },
  "projects/v1-engine": { type: "dir" },
  "projects/v1-engine/README.md": {
    type: "file",
    content:
      "# v1 engine\n" +
      "A custom 3D game engine built in C++20 from scratch.\n" +
      "Features a custom memory allocator, ECS framework,\n" +
      "and a basic OpenGL rendering pipeline.\n" +
      "(screenshot in the session above ^)",
  },
  "projects/ac_cheat": { type: "dir" },
  "projects/ac_cheat/README.md": {
    type: "file",
    content:
      "# AC_CHEAT\n" +
      "An educational cheat for AssaultCube: auto-aim, wallhack,\n" +
      "god mode, infinite ammo, snaplines. Built to learn memory\n" +
      "manipulation and reverse engineering.\n" +
      "(try the `noclip` command for a live demo on this very page)",
  },
};

// user-created files and edits live in the visitor's localStorage
let userFS = {};
try {
  userFS = JSON.parse(localStorage.getItem("vfs") || "{}") || {};
} catch (e) {
  userFS = {};
}

function saveUserFS() {
  try {
    localStorage.setItem("vfs", JSON.stringify(userFS));
    return true;
  } catch (e) {
    return false;
  }
}

function normalizePath(p) {
  return (p || "")
    .replace(/^~\//, "")
    .replace(/^\/home\/john\//, "")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
    .replace(/^~$/, "")
    .replace(/^\/$/, "/");
}

// merged lookup: user files shadow built-ins
function vfsNode(path) {
  if (Object.prototype.hasOwnProperty.call(userFS, path)) {
    return { type: "file", content: userFS[path], user: true };
  }
  return VFS[path] || null;
}

function vfsIsDir(path) {
  if (VFS[path]?.type === "dir") {
    return true;
  }
  const prefix = path + "/";
  return Object.keys(userFS).some((k) => k.startsWith(prefix));
}

function vfsChildren(dir) {
  const prefix = dir ? dir + "/" : "";
  const dirs = new Set();
  const files = new Set();
  Object.keys(VFS).concat(Object.keys(userFS)).forEach((key) => {
    if (!key.startsWith(prefix) || key === dir) {
      return;
    }
    const rest = key.slice(prefix.length);
    if (rest.includes("/")) {
      dirs.add(rest.slice(0, rest.indexOf("/")) + "/");
    } else if (VFS[key]?.type === "dir") {
      dirs.add(rest + "/");
    } else {
      files.add(rest);
    }
  });
  return [...dirs, ...files];
}

// ---------- output helpers ----------
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PS1_HTML =
  '<span class="ps1"><span class="ps1-user">john@shimakaze</span>' +
  '<span class="ps1-path">:~</span><span class="ps1-sym">$</span></span> ';

function echoCommand(raw) {
  const entry = document.createElement("div");
  entry.className = "shell-entry";
  const echo = document.createElement("div");
  echo.className = "shell-echo";
  echo.innerHTML = PS1_HTML + escapeHtml(raw);
  entry.appendChild(echo);
  shellOutput.appendChild(entry);
  return entry;
}

function printTo(entry, html) {
  const res = document.createElement("div");
  res.className = "shell-result";
  res.innerHTML = html;
  entry.appendChild(res);
  keepPromptVisible();
  return res;
}

function keepPromptVisible() {
  const line = document.getElementById("shellInputLine");
  if (line) {
    line.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
}

// ---------- commands ----------
const HELP_TEXT =
  '<span class="hl">available commands</span>\n' +
  "  help          this text\n" +
  "  whoami        who am I\n" +
  "  neofetch      system info\n" +
  "  ls [-a] [dir] list files\n" +
  "  cat &lt;file&gt;    read a file\n" +
  "  nano &lt;file&gt;   edit or create a file (persists in your browser)\n" +
  "  contact       how to reach me\n" +
  "  twin          chat with my digital twin (live AI)\n" +
  "  theme &lt;name&gt;  blue · green · amber\n" +
  "  uptime        how long this site has been up\n" +
  "  date          current time\n" +
  "  echo &lt;text&gt;   say it back\n" +
  "  history       your command history\n" +
  "  clear         clear the terminal (all of it)\n" +
  "  exit          hang up\n" +
  '<span class="dim">...and a few undocumented ones. explore.</span>';

const COMMAND_NAMES = [
  "help", "whoami", "neofetch", "ls", "cat", "cd", "pwd", "contact", "twin",
  "theme", "uptime", "date", "echo", "history", "clear", "exit", "logout", "chat",
  "sudo", "rm", "touch", "edit", "vim", "vi", "nano", "emacs", "man", "ping", "top", "htop",
  "ps", "sl", "coffee", "brew", "make", "hack", "noclip", "github", "email",
  "curl", "wget",
];

function cmdLs(args) {
  const showHidden = args.some((a) => a.startsWith("-") && a.includes("a"));
  const target = normalizePath(args.find((a) => !a.startsWith("-")) || "");
  if (target && !vfsIsDir(target)) {
    if (vfsNode(target)) {
      return escapeHtml(target);
    }
    return `<span class="err">ls: cannot access '${escapeHtml(target)}': no such file or directory</span>`;
  }
  let names = vfsChildren(target);
  if (!showHidden) {
    names = names.filter((n) => !n.startsWith("."));
  }
  return names
    .map((n) => (n.endsWith("/") ? `<span class="hl">${escapeHtml(n)}</span>` : escapeHtml(n)))
    .join("  ");
}

function cmdCat(args) {
  if (!args.length) {
    return '<span class="dim">usage: cat &lt;file&gt; — try: cat about.txt</span>';
  }
  const raw = args[0];
  if (raw === "/dev/urandom") {
    return { special: "urandom" };
  }
  const p = normalizePath(raw);
  const node = vfsNode(p);
  if (!node) {
    return `<span class="err">cat: ${escapeHtml(raw)}: no such file or directory</span>`;
  }
  if (node.type === "dir" || vfsIsDir(p)) {
    return `<span class="err">cat: ${escapeHtml(raw)}: is a directory</span>`;
  }
  return escapeHtml(node.content).replace(
    /(yangtianzhuo970425@gmail\.com)/,
    '<a class="hl" href="mailto:$1">$1</a>'
  ).replace(
    /(github\.com\/shimakaze09)/,
    '<a class="hl" href="https://github.com/shimakaze09" target="_blank" rel="noopener">$1</a>'
  );
}

function fakeProcessList() {
  return (
    '<span class="dim">  PID USER   %CPU %MEM COMMAND</span>\n' +
    "    1 john    0.1  0.4 /sbin/init\n" +
    "  424 john   12.3  8.1 ./v1-engine --debug\n" +
    ' 1337 john    3.2  2.4 <span class="hl">twin_instance</span>\n' +
    "31337 john    0.0  0.0 [definitely_not_a_cheat]"
  );
}

function runCommand(raw) {
  const entry = echoCommand(raw);
  const trimmed = raw.trim();
  if (!trimmed) {
    return;
  }

  shellHistory.push(trimmed);
  historyIndex = shellHistory.length;

  // fork bomb detection before tokenizing
  if (trimmed.replace(/\s/g, "").startsWith(":(){")) {
    printTo(entry, '<span class="err">fork bomb detected.</span> nice try. my allocator has seen worse.');
    return;
  }

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case "help":
      printTo(entry, HELP_TEXT);
      break;

    case "whoami":
      printTo(entry, 'john — systems &amp; engine dev.\n<span class="dim">(longer version: cat about.txt)</span>');
      break;

    case "neofetch":
      printTo(
        entry,
        '<span class="hl">john@shimakaze</span>\n' +
          '<span class="dim">----------------</span>\n' +
          '<span class="ok">Status</span>:    student · active\n' +
          '<span class="ok">Focus</span>:     custom game engine\n' +
          '<span class="ok">Lang</span>:      C / C++20\n' +
          `<span class="ok">Uptime</span>:    ${window.uptimeString()}\n` +
          '<span class="ok">Theme</span>:     ' + (document.documentElement.getAttribute("data-theme") || "blue")
      );
      break;

    case "ls":
      printTo(entry, cmdLs(args));
      break;

    case "cat": {
      const out = cmdCat(args);
      if (out && out.special === "urandom") {
        runUrandom(entry);
      } else {
        printTo(entry, out);
      }
      break;
    }

    case "cd":
      printTo(
        entry,
        '<span class="dim">this shell has exactly one directory, and you are in it.\n' +
          "everything I've made is on this page.</span>"
      );
      break;

    case "pwd":
      printTo(entry, "/home/john");
      break;

    case "contact":
    case "email":
      printTo(entry, cmdCat(["contact"]));
      break;

    case "github":
      printTo(
        entry,
        '<a class="hl" href="https://github.com/shimakaze09" target="_blank" rel="noopener">github.com/shimakaze09</a>'
      );
      break;

    case "twin":
    case "./twin":
    case "chat":
      startTwin(entry);
      break;

    case "theme": {
      const name = (args[0] || "").toLowerCase();
      if (!name) {
        const current = document.documentElement.getAttribute("data-theme") || "blue";
        printTo(entry, `current theme: <span class="hl">${current}</span>\nusage: theme &lt;blue|green|amber&gt;`);
      } else if (window.applyTheme(name)) {
        printTo(entry, `theme set to <span class="hl">${name}</span>. phosphor recalibrated.`);
      } else {
        printTo(entry, `<span class="err">unknown theme: ${escapeHtml(name)}</span> — try blue, green, or amber`);
      }
      break;
    }

    case "uptime": {
      const u = window.uptimeParts();
      printTo(
        entry,
        ` up ${u.days} days, ${u.hours}:${String(u.mins).padStart(2, "0")}, 1 user, ` +
          "load average: 0.00, 0.01, 0.05\n" +
          '<span class="dim">(counting since the first commit: 2025-11-07)</span>'
      );
      break;
    }

    case "date":
      printTo(entry, new Date().toString());
      break;

    case "echo": {
      let text = trimmed.slice(5) || "";
      text = text
        .replace(/\$HOME/g, "/home/john")
        .replace(/\$USER/g, "john")
        .replace(/\$SHELL/g, "/bin/portfolio");
      // redirection: echo something > file (or >> to append)
      const redir = text.match(/^(.*?)\s*(>>?)\s*(\S+)\s*$/);
      if (redir && redir[3]) {
        const p = normalizePath(redir[3]);
        if (!p || vfsIsDir(p)) {
          printTo(entry, `<span class="err">bash: ${escapeHtml(redir[3])}: cannot write</span>`);
          break;
        }
        const prev = redir[2] === ">>" ? (vfsNode(p)?.content ?? "") : "";
        userFS[p] = prev ? prev + "\n" + redir[1] : redir[1];
        if (!saveUserFS()) {
          printTo(entry, '<span class="err">disk full (localStorage quota)</span>');
        }
        break;
      }
      printTo(entry, escapeHtml(text) || "");
      break;
    }

    case "history":
      printTo(
        entry,
        shellHistory.map((h, i) => `  ${String(i + 1).padStart(3)}  ${escapeHtml(h)}`).join("\n")
      );
      break;

    case "clear":
      clearTerminal();
      break;

    case "exit":
    case "logout":
    case "quit":
      runExit(entry);
      break;

    case "sudo":
      if (/^rm\s+-rf\s+\/(\s|$|--no-preserve-root)/.test(args.join(" "))) {
        runSelfDestruct(entry);
      } else if (args.join(" ").includes("make me a sandwich")) {
        printTo(entry, "okay.");
      } else {
        printTo(
          entry,
          'john is not in the sudoers file. <span class="err">This incident will be reported.</span>'
        );
      }
      break;

    case "rm":
      cmdRm(entry, args);
      break;

    case "touch": {
      const p = normalizePath(args[0] || "");
      if (!p) {
        printTo(entry, '<span class="dim">usage: touch &lt;file&gt;</span>');
      } else if (!vfsNode(p) && !vfsIsDir(p)) {
        userFS[p] = "";
        saveUserFS();
      }
      break;
    }

    case "vim":
    case "vi":
      if (args.length) {
        printTo(entry, '<span class="dim">real vim would have trapped you. opening the merciful editor instead.</span>');
        openEditor(entry, args[0]);
      } else {
        openVim(entry);
      }
      break;

    case "nano":
    case "edit":
      if (args.length) {
        openEditor(entry, args[0]);
      } else {
        printTo(entry, '<span class="dim">usage: nano &lt;file&gt; — edits save to your browser\'s localStorage</span>');
      }
      break;

    case "emacs":
      printTo(entry, "this is a vim household. (kidding. but also not.)");
      break;

    case "man":
      printTo(
        entry,
        `no manual entry for ${escapeHtml(args[0] || "man")}.\n<span class="dim">figure it out — that's half the fun.</span>`
      );
      break;

    case "ping":
      runPing(entry, args[0]);
      break;

    case "top":
    case "htop":
    case "ps":
      printTo(entry, fakeProcessList());
      break;

    case "sl":
      printTo(entry, '<span class="dim">you typed sl. the train forgives nothing.</span>');
      runTrain();
      break;

    case "coffee":
    case "brew":
      printTo(entry, '<span class="err">HTTP 418: I\'m a teapot.</span> brewing is not supported on this hardware.');
      break;

    case "make":
      if (args.join(" ").includes("coffee")) {
        printTo(entry, '<span class="err">HTTP 418: I\'m a teapot.</span> brewing is not supported on this hardware.');
      } else if (args.join(" ").includes("sandwich")) {
        printTo(entry, "what? make it yourself.");
      } else {
        printTo(entry, "make: *** no targets specified. this site is hand-rolled HTML — nothing to build.");
      }
      break;

    case "hack":
      runHack(entry);
      break;

    case "noclip":
      toggleNoclip(entry);
      break;

    case "curl":
    case "wget":
      printTo(entry, "no outbound network from this shell. it's a static page, not a botnet.");
      break;

    default:
      printTo(
        entry,
        `bash: ${escapeHtml(cmd)}: command not found\n<span class="dim">type 'help' for the honest list.</span>`
      );
  }
}

// ---------- rm: user files are really deleted; system files resist ----------
function cmdRm(entry, args) {
  const joined = args.join(" ");
  if (/^-rf\s+\//.test(joined)) {
    printTo(entry, '<span class="err">rm: permission denied.</span> <span class="dim">(you know what to do.)</span>');
    return;
  }
  const raw = args.find((a) => !a.startsWith("-"));
  if (!raw) {
    printTo(entry, '<span class="dim">usage: rm &lt;file&gt;</span>');
    return;
  }
  const p = normalizePath(raw);
  if (Object.prototype.hasOwnProperty.call(userFS, p)) {
    delete userFS[p];
    saveUserFS();
    if (VFS[p]) {
      printTo(entry, `<span class="dim">override removed — system file '${escapeHtml(p)}' restored</span>`);
    }
    return;
  }
  if (vfsIsDir(p)) {
    printTo(entry, `<span class="err">rm: cannot remove '${escapeHtml(raw)}': is a directory</span>`);
    return;
  }
  if (VFS[p]) {
    printTo(entry, `<span class="err">rm: cannot remove '${escapeHtml(raw)}': read-only file system</span> <span class="dim">(edit it instead — your copy shadows mine)</span>`);
    return;
  }
  printTo(entry, `<span class="err">rm: cannot remove '${escapeHtml(raw)}': no such file or directory</span>`);
}

// ---------- working editor: nano <file>, saves to localStorage ----------
const edOverlay = document.getElementById("edOverlay");
const edTitle = document.getElementById("edTitle");
const edStatus = document.getElementById("edStatus");
const edText = document.getElementById("edText");
let editorActive = false;
let edPath = "";
let edEntry = null;
let edSavedContent = null;

function openEditor(entry, rawPath) {
  const p = normalizePath(rawPath);
  if (!p || p === "/") {
    printTo(entry, '<span class="err">nano: invalid filename</span>');
    return;
  }
  if (vfsIsDir(p)) {
    printTo(entry, `<span class="err">nano: ${escapeHtml(p)}: is a directory</span>`);
    return;
  }
  const node = vfsNode(p);
  editorActive = true;
  edPath = p;
  edEntry = entry;
  edSavedContent = node ? node.content : null;
  edTitle.textContent = `edit: ~/${p}` + (node ? "" : " (new file)");
  edStatus.textContent = "";
  edText.value = node ? node.content : "";
  edOverlay.hidden = false;
  shellInput.blur();
  edText.focus();
}

function edSave() {
  if (edText.value.length > 64 * 1024) {
    edStatus.textContent = "[file too large — 64K max]";
    return;
  }
  userFS[edPath] = edText.value;
  if (!saveUserFS()) {
    edStatus.textContent = "[write failed — localStorage full or blocked]";
    return;
  }
  edSavedContent = edText.value;
  edStatus.textContent = `[wrote ${edText.value.length} bytes]`;
  edTitle.textContent = `edit: ~/${edPath}`;
}

function edClose() {
  const dirty = edSavedContent !== edText.value;
  editorActive = false;
  edOverlay.hidden = true;
  if (edEntry) {
    const saved = Object.prototype.hasOwnProperty.call(userFS, edPath) && userFS[edPath] === edText.value;
    if (saved) {
      printTo(
        edEntry,
        `<span class="dim">wrote ~/${escapeHtml(edPath)} (${userFS[edPath].length} bytes — persisted in your browser's localStorage)</span>`
      );
    } else if (dirty) {
      printTo(edEntry, `<span class="dim">closed ~/${escapeHtml(edPath)} without saving</span>`);
    }
  }
  shellInput.focus({ preventScroll: true });
  keepPromptVisible();
}

edText.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "o")) {
    e.preventDefault();
    edSave();
  } else if (((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "q")) || e.key === "Escape") {
    e.preventDefault();
    edClose();
  }
});

edText.addEventListener("input", () => {
  if (edSavedContent !== edText.value) {
    edStatus.textContent = "[modified]";
  }
});

// ---------- clear: whoever types it means it — wipe the whole screen ----------
function clearTerminal() {
  document.querySelectorAll(".motd, .cmd-block").forEach((el) => el.remove());
  shellOutput.innerHTML = "";
  shellSection.classList.add("bare");
  const termBody = document.getElementById("termBody");
  if (termBody) {
    termBody.scrollTop = 0;
  }
}

// ---------- twin REPL mode ----------
const TWIN_SUGGESTIONS = [
  "why build your own engine?",
  "how do you learn low-level programming?",
  "what are you working on now?",
];

function twinLine(isYou) {
  const line = document.createElement("div");
  line.className = "twin-line";
  const prefix = document.createElement("span");
  prefix.className = "twin-prefix" + (isYou ? " you" : "");
  prefix.textContent = isYou ? "you>" : "twin>";
  const body = document.createElement("div");
  body.className = "twin-body";
  line.appendChild(prefix);
  line.appendChild(body);
  shellOutput.appendChild(line);
  return body;
}

function startTwin(entry) {
  if (twinMode) {
    return;
  }
  twinMode = true;
  if (!entry) {
    entry = echoCommand("twin");
  }
  printTo(entry, '<span class="dim">[connected to twin_instance — pid 1337]</span>');

  twinLine(false).textContent = "Hey. Ask me anything — or pick a number:";
  const sug = document.createElement("div");
  sug.className = "shell-result";
  sug.innerHTML =
    TWIN_SUGGESTIONS.map((s, i) => `  <span class="hl">${i + 1}.</span> ${escapeHtml(s)}`).join("\n") +
    "\n<span class=\"dim\">(leave with 'exit' or Ctrl+C)</span>";
  shellOutput.appendChild(sug);

  shellPs1.innerHTML = '<span class="twin-prefix you">you&gt;</span>';
  shellInput.placeholder = "ask anything — 'exit' to leave";
  shellInput.focus({ preventScroll: true });
  keepPromptVisible();
}

function exitTwin() {
  twinMode = false;
  const note = document.createElement("div");
  note.className = "shell-result";
  note.innerHTML = '<span class="dim">[twin disconnected — back to bash]</span>';
  shellOutput.appendChild(note);
  shellPs1.innerHTML = BASH_PS1_INNER;
  shellInput.placeholder = "type 'help'";
  keepPromptVisible();
}

function twinHandleInput(raw) {
  const text = raw.trim();
  if (!text) {
    return;
  }
  if (["exit", "quit", "logout", ":q", ":q!"].includes(text.toLowerCase())) {
    exitTwin();
    return;
  }

  shellHistory.push(text);
  historyIndex = shellHistory.length;

  let msg = text;
  if (/^[0-9]$/.test(text) && TWIN_SUGGESTIONS[Number(text) - 1]) {
    msg = TWIN_SUGGESTIONS[Number(text) - 1];
  }

  twinLine(true).textContent = msg;
  const body = twinLine(false);
  body.classList.add("streaming");
  shellBusy = true;
  keepPromptVisible();

  window
    .twinSend(msg, (soFar) => {
      body.textContent = soFar;
      keepPromptVisible();
    })
    .then((final) => {
      body.textContent = final;
    })
    .catch((error) => {
      body.textContent = error.message.startsWith("[")
        ? error.message
        : "[connection error - twin unavailable]";
      console.error(error);
    })
    .finally(() => {
      body.classList.remove("streaming");
      shellBusy = false;
      shellInput.focus({ preventScroll: true });
      keepPromptVisible();
    });
}

const twinLaunch = document.getElementById("twinLaunch");
if (twinLaunch) {
  twinLaunch.addEventListener("click", () => {
    if (!twinMode) {
      startTwin(null);
    }
    // the anchor's #prompt navigation steals focus after the click — take it back
    setTimeout(() => shellInput.focus({ preventScroll: true }), 60);
  });
}

// ---------- easter eggs ----------

function runUrandom(entry) {
  shellBusy = true;
  const res = printTo(entry, "");
  const charset = "▓▒░█@#$%&*!?/\\<>[]{}0123456789abcdef";
  let lines = 0;
  const timer = setInterval(() => {
    let line = "";
    for (let i = 0; i < 48; i++) {
      line += charset[Math.floor(Math.random() * charset.length)];
    }
    res.textContent += line + "\n";
    keepPromptVisible();
    lines += 1;
    if (lines >= 7) {
      clearInterval(timer);
      res.innerHTML += '<span class="dim">^C</span>\n<span class="dim">(that\'s enough entropy for one visit)</span>';
      shellBusy = false;
      keepPromptVisible();
    }
  }, 110);
}

function runPing(entry, host) {
  if (!host) {
    printTo(entry, '<span class="dim">usage: ping &lt;host&gt;</span>');
    return;
  }
  shellBusy = true;
  const safe = escapeHtml(host);
  const res = printTo(entry, `PING ${safe} (127.0.0.1) 56(84) bytes of data.\n`);
  let count = 0;
  const timer = setInterval(() => {
    count += 1;
    const time = (12 + Math.random() * 30).toFixed(1);
    res.innerHTML += `64 bytes from ${safe}: icmp_seq=${count} ttl=64 time=${time} ms\n`;
    keepPromptVisible();
    if (count >= 4) {
      clearInterval(timer);
      res.innerHTML += `<span class="dim">--- ${safe} ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss</span>`;
      shellBusy = false;
      keepPromptVisible();
    }
  }, 320);
}

function runHack(entry) {
  shellBusy = true;
  const res = printTo(entry, "");
  const steps = [
    "scanning target: localhost ...",
    "bypassing firewall .......... [<span class='ok'>OK</span>]",
    "injecting payload ........... [<span class='ok'>OK</span>]",
    "decrypting mainframe ........ [<span class='ok'>OK</span>]",
    "downloading more RAM ........ [<span class='ok'>OK</span>]",
    "<span class='ok'>ACCESS GRANTED.</span> welcome, agent.",
    "<span class='dim'>(nothing was hacked. probably.)</span>",
  ];
  let i = 0;
  const timer = setInterval(() => {
    res.innerHTML += steps[i] + "\n";
    keepPromptVisible();
    i += 1;
    if (i >= steps.length) {
      clearInterval(timer);
      shellBusy = false;
    }
  }, 380);
}

function toggleNoclip(entry) {
  noclipOn = !noclipOn;
  const targets = document.querySelectorAll(".cmd-block, .motd, .shell");
  targets.forEach((el, i) => {
    const addr = (0x7ffe0000 + i * 0x1000).toString(16);
    const dist = (i * 7.3 + 3.1).toFixed(1);
    el.setAttribute("data-esp", `entity 0x${addr} · dist ${dist}m`);
  });
  document.body.classList.toggle("noclip", noclipOn);
  if (noclipOn) {
    printTo(
      entry,
      '<span class="ok">noclip ON.</span> ESP overlay enabled — you can now see through the DOM.\n' +
        '<span class="dim">(AC_CHEAT taught me this. type noclip again to disable.)</span>'
    );
  } else {
    printTo(entry, '<span class="dim">noclip OFF. walls are solid again.</span>');
  }
}

function runExit(entry) {
  printTo(entry, "logout\nConnection to shimakaze09.github.io closed.");
  shellBusy = true;
  setTimeout(() => {
    document.body.classList.add("crt-off");
    setTimeout(() => {
      document.body.classList.remove("crt-off");
      document.body.classList.add("crt-on");
      setTimeout(() => {
        document.body.classList.remove("crt-on");
        const back = echoCommand("");
        printTo(back, '<span class="dim">...reconnected. you can\'t leave — this is a portfolio, not a prison. well.</span>');
        shellBusy = false;
        shellInput.focus();
      }, 450);
    }, 1400);
  }, 500);
}

function runSelfDestruct(entry) {
  shellBusy = true;
  const res = printTo(entry, "");
  const victims = [
    "/usr/lib", "/etc", "/var", "/home/john/projects/v1-engine",
    "/home/john/projects/ac_cheat", "/home/john", "/boot", "/",
  ];
  const blocks = Array.from(document.querySelectorAll(".cmd-block"));
  let i = 0;

  const timer = setInterval(() => {
    if (i < victims.length) {
      res.innerHTML += `removing ${victims[i]} ...\n`;
      keepPromptVisible();
      // visually delete a section top-down as the "filesystem" goes
      const block = blocks[i];
      if (block) {
        block.classList.add("rm-doomed");
        setTimeout(() => {
          block.style.display = "none";
        }, 300);
      }
      i += 1;
    } else {
      clearInterval(timer);
      kernelPanic();
    }
  }, 260);
}

function kernelPanic() {
  const screen = document.getElementById("panicScreen");
  const logEl = document.getElementById("panicLog");
  screen.hidden = false;
  document.body.style.overflow = "hidden";
  logEl.textContent =
    "[ 1337.420690] Kernel panic - not syncing: Attempted to kill init! exitcode=0x00000000\n" +
    "[ 1337.420691] CPU: 0 PID: 1 Comm: portfolio Not tainted 6.1.0-shimakaze\n" +
    "[ 1337.420692] Call Trace:\n" +
    "[ 1337.420693]  <TASK>\n" +
    "[ 1337.420694]  panic+0x134/0x2f0\n" +
    "[ 1337.420695]  do_exit+0x8d1/0x8f0\n" +
    "[ 1337.420696]  rm_rf_slash+0x666/0x1000\n" +
    "[ 1337.420697]  </TASK>\n" +
    "[ 1337.420698] ---[ end Kernel panic - you did this ]---\n\n";

  let count = 3;
  const timer = setInterval(() => {
    if (count > 0) {
      logEl.textContent += `rebooting in ${count}...\n`;
      count -= 1;
    } else {
      clearInterval(timer);
      try {
        sessionStorage.setItem("replayBoot", "1");
      } catch (e) {
        // ignore
      }
      location.reload();
    }
  }, 800);
}

// ---------- fake vim ----------
const vimOverlay = document.getElementById("vimOverlay");
const vimBuffer = document.getElementById("vimBuffer");
const vimStatusLeft = document.getElementById("vimStatusLeft");
const vimCmdline = document.getElementById("vimCmdline");
let vimActive = false;
let vimMode = "normal";
let vimCmd = "";
let vimInsertText = "";
let vimEntry = null;

function renderVim() {
  const intro = [
    "you opened vim.",
    "everyone makes this mistake once.",
    "",
    vimInsertText ? '<span class="vim-text">' + escapeHtml(vimInsertText) + "</span>" : "",
    "",
    '<span class="vim-text">(hint: :q! — you know this. everyone knows this. and yet.)</span>',
  ];
  const tildes = [];
  for (let i = intro.length; i < 18; i++) {
    tildes.push("~");
  }
  vimBuffer.innerHTML = intro.join("\n") + "\n" + tildes.join("\n");
  vimStatusLeft.textContent = vimMode === "insert" ? "-- INSERT --" : '"trapped.txt" [readonly]';
  vimCmdline.textContent = vimCmd;
}

function openVim(entry) {
  vimActive = true;
  vimMode = "normal";
  vimCmd = "";
  vimInsertText = "";
  vimEntry = entry;
  vimOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  shellInput.blur();
  renderVim();
}

function closeVim(message) {
  vimActive = false;
  vimOverlay.hidden = true;
  document.body.style.overflow = "";
  if (vimEntry) {
    printTo(vimEntry, message);
  }
  shellInput.focus();
}

function vimKeydown(e) {
  e.preventDefault();
  const k = e.key;

  if (vimMode === "cmd") {
    if (k === "Enter") {
      const c = vimCmd.slice(1).trim();
      if (["q", "q!", "wq", "wq!", "x", "exit"].includes(c)) {
        closeVim('vim exited. you\'re free — <span class="dim">that\'s more than most can say.</span>');
      } else {
        vimCmd = "";
        vimMode = "normal";
        vimStatusLeft.textContent = `E492: Not an editor command: ${c}`;
        vimCmdline.textContent = "";
        return;
      }
    } else if (k === "Escape") {
      vimMode = "normal";
      vimCmd = "";
      renderVim();
    } else if (k === "Backspace") {
      vimCmd = vimCmd.slice(0, -1);
      if (!vimCmd) {
        vimMode = "normal";
      }
      renderVim();
    } else if (k.length === 1) {
      vimCmd += k;
      vimCmdline.textContent = vimCmd;
    }
    return;
  }

  if (vimMode === "insert") {
    if (k === "Escape") {
      vimMode = "normal";
      renderVim();
    } else if (k === "Backspace") {
      vimInsertText = vimInsertText.slice(0, -1);
      renderVim();
    } else if (k === "Enter") {
      vimInsertText += " ";
      renderVim();
    } else if (k.length === 1) {
      vimInsertText += k;
      renderVim();
    }
    return;
  }

  // normal mode
  if (k === ":") {
    vimMode = "cmd";
    vimCmd = ":";
    vimCmdline.textContent = vimCmd;
  } else if (k === "i" || k === "a" || k === "o") {
    vimMode = "insert";
    renderVim();
  } else if (k === "c" && (e.ctrlKey || e.metaKey)) {
    vimStatusLeft.textContent = "Type :q! and press <Enter> to abandon all hope-- er, changes";
  }
}

// ---------- input handling ----------
function tabComplete() {
  const value = shellInput.value;
  const parts = value.split(/\s+/);
  const last = parts[parts.length - 1];
  if (!last) {
    return;
  }

  let pool;
  if (parts.length === 1) {
    pool = COMMAND_NAMES;
  } else {
    const keys = new Set(Object.keys(VFS).concat(Object.keys(userFS)));
    pool = [...keys].map((k) => (VFS[k]?.type === "dir" || vfsIsDir(k) ? k + "/" : k));
  }

  const matches = pool.filter((c) => c.startsWith(normalizePath(last) || last));
  if (matches.length === 1) {
    parts[parts.length - 1] = matches[0];
    shellInput.value = parts.join(" ");
  } else if (matches.length > 1) {
    const entry = echoCommand(value);
    printTo(entry, '<span class="dim">' + matches.map(escapeHtml).join("  ") + "</span>");
  }
}

shellInput.addEventListener("keydown", (e) => {
  if (shellBusy) {
    e.preventDefault();
    return;
  }

  if (e.key === "Enter") {
    const value = shellInput.value;
    shellInput.value = "";
    if (twinMode) {
      twinHandleInput(value);
    } else {
      runCommand(value);
    }
    keepPromptVisible();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex -= 1;
      shellInput.value = shellHistory[historyIndex] || "";
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (historyIndex < shellHistory.length) {
      historyIndex += 1;
      shellInput.value = shellHistory[historyIndex] || "";
    }
  } else if (e.key === "Tab") {
    e.preventDefault();
    if (!twinMode) {
      tabComplete();
    }
  } else if (e.key === "l" && e.ctrlKey) {
    e.preventDefault();
    clearTerminal();
  } else if (e.key === "c" && e.ctrlKey && !twinMode && !window.getSelection()?.toString()) {
    e.preventDefault();
    echoCommand(shellInput.value + "^C");
    shellInput.value = "";
    keepPromptVisible();
  }
});

// click anywhere in the shell area focuses the prompt
shellSection.addEventListener("click", (e) => {
  if (window.getSelection()?.toString()) {
    return;
  }
  if (e.target.closest("a, button, input")) {
    if (e.target !== shellInput) {
      return;
    }
  }
  shellInput.focus({ preventScroll: true });
});

// global keys: vim trap + konami code
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konamiPos = 0;

document.addEventListener("keydown", (e) => {
  if (vimActive) {
    vimKeydown(e);
    return;
  }
  if (editorActive) {
    return;
  }

  // Ctrl+C / Ctrl+D leave twin mode from anywhere on the page
  if ((e.key === "c" || e.key === "d") && e.ctrlKey && twinMode && !window.getSelection()?.toString()) {
    e.preventDefault();
    const line = document.createElement("div");
    line.className = "shell-result";
    line.innerHTML = '<span class="dim">^C</span>';
    shellOutput.appendChild(line);
    shellInput.value = "";
    exitTwin();
    return;
  }

  // konami code (ignore while typing — arrows mean history there; use `noclip` instead)
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
    return;
  }
  const expect = KONAMI[konamiPos];
  if (e.key === expect || e.key.toLowerCase() === expect) {
    konamiPos += 1;
    if (konamiPos === KONAMI.length) {
      konamiPos = 0;
      const entry = echoCommand("↑↑↓↓←→←→BA");
      toggleNoclip(entry);
      keepPromptVisible();
    }
  } else {
    konamiPos = e.key === KONAMI[0] ? 1 : 0;
  }
});

// ---------- sl train ----------
function runTrain() {
  const train = document.createElement("pre");
  train.className = "sl-train";
  train.textContent =
    "      ====        ________\n" +
    "  _D _|  |_______/        \\__I_I_____===__|______\n" +
    "   |(_)---  |   H\\________/ |   |        =|___ __|\n" +
    "   /     |  |   H  |  |     |   |         ||_| |_|\n" +
    "  |      |  |   H  |__------------------| [___] |\n" +
    "  | ________|___H__/__|_____/[][]~\\_____|       |\n" +
    "  |/ |   |-----------I_____I [][] []  D |=======|\n" +
    "__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y_________|\n" +
    " |/-=|___|=    ||    ||    ||    |_____/~\\___/\n" +
    "  \\_/      \\_O=====O=====O=====O_/      \\_/";
  document.body.appendChild(train);

  const width = 620;
  const from = window.innerWidth;
  const to = -width - 100;
  const duration = 3800;
  const start = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    train.style.transform = `translateX(${(to - from) * t}px)`;
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      train.remove();
    }
  }

  requestAnimationFrame(frame);
}
