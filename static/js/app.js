/* global io, t, applyI18n, setLang, currentLang */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let socket = null;
let isRunning = false;

// ── Theme ──────────────────────────────────────────────────────────────────
function setTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem("mhr_theme", name);
  $$("[data-theme-btn]").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-theme-btn") === name);
  });
}

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, type = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

// ── Logs ───────────────────────────────────────────────────────────────────
const logView = $("#logView");

function appendLogLine(line) {
  const span = document.createElement("span");
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("fail") || lower.includes("traceback")) {
    span.className = "err";
  } else if (lower.includes("warn")) {
    span.className = "warn";
  } else if (lower.includes("[ok]") || lower.includes("started") || lower.includes("listening")) {
    span.className = "ok";
  }
  span.textContent = line + "\n";
  logView.appendChild(span);
  logView.scrollTop = logView.scrollHeight;
}

function clearLogs() {
  logView.innerHTML = "";
}

// ── Dependencies ───────────────────────────────────────────────────────────
function renderDeps(deps) {
  const list = $("#depList");
  list.innerHTML = "";
  Object.entries(deps || {}).forEach(([name, ok]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="${ok ? "ok" : "missing"}">${ok ? "✓" : "✗"}</span> ${name}`;
    list.appendChild(li);
  });
}

async function refreshStatus() {
  try {
    const r = await fetch("/api/status");
    const data = await r.json();
    isRunning = !!data.running;
    $("#statusDot").className = "dot " + (isRunning ? "running" : "stopped");
    $("#statusText").textContent = isRunning ? t("status.running") : t("status.stopped");
    $("#reqCount").textContent = data.requests ?? 0;
    $("#pidVal").textContent = data.pid ?? "—";
    $("#btnStart").disabled = isRunning;
    $("#btnStop").disabled = !isRunning;
    renderDeps(data.deps);
  } catch (e) {
    console.error(e);
  }
}

// ── Config ─────────────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const r = await fetch("/api/config");
    const cfg = await r.json();
    const sid = cfg.script_ids
      ? (Array.isArray(cfg.script_ids) ? cfg.script_ids.join(", ") : cfg.script_ids)
      : cfg.script_id || "";
    $("#auth_key").value = cfg.auth_key || "";
    $("#script_id").value = sid;
    $("#listen_host").value = cfg.listen_host || "127.0.0.1";
    $("#listen_port").value = cfg.listen_port ?? 8085;
    $("#socks5_enabled").checked = cfg.socks5_enabled !== false;
    $("#socks5_port").value = cfg.socks5_port ?? 1080;
    $("#lan_sharing").checked = !!cfg.lan_sharing;
    $("#front_domain").value = cfg.front_domain || "www.google.com";
    $("#log_level").value = cfg.log_level || "INFO";
  } catch (e) {
    console.error(e);
  }
}

async function saveConfig(e) {
  e.preventDefault();
  const payload = {
    auth_key: $("#auth_key").value.trim(),
    script_id: $("#script_id").value.trim(),
    listen_host: $("#listen_host").value.trim() || "127.0.0.1",
    listen_port: parseInt($("#listen_port").value, 10) || 8085,
    socks5_enabled: $("#socks5_enabled").checked,
    socks5_port: parseInt($("#socks5_port").value, 10) || 1080,
    lan_sharing: $("#lan_sharing").checked,
    front_domain: $("#front_domain").value.trim() || "www.google.com",
    log_level: $("#log_level").value || "INFO",
    mode: "apps_script",
  };
  try {
    const r = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data.ok) {
      toast(t("toast.saved"), "success");
    } else {
      toast(data.error || t("toast.error"), "error");
    }
  } catch (err) {
    toast(String(err), "error");
  }
}

// ── Proxy control ──────────────────────────────────────────────────────────
async function startProxy() {
  try {
    // Auto-save first
    await saveConfig({ preventDefault() {} });
    const r = await fetch("/api/start", { method: "POST" });
    const data = await r.json();
    if (data.ok) {
      toast(t("toast.started"), "success");
      refreshStatus();
    } else {
      toast(data.error || t("toast.error"), "error");
    }
  } catch (err) {
    toast(String(err), "error");
  }
}

async function stopProxy() {
  try {
    const r = await fetch("/api/stop", { method: "POST" });
    const data = await r.json();
    if (data.ok) {
      toast(t("toast.stopped"), "success");
      refreshStatus();
    } else {
      toast(data.error || t("toast.error"), "error");
    }
  } catch (err) {
    toast(String(err), "error");
  }
}

async function installDeps() {
  toast(t("toast.install"), "success");
  try {
    await fetch("/api/install-deps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ use_mirror: $("#useMirror").checked }),
    });
  } catch (err) {
    toast(String(err), "error");
  }
}

async function runScan() {
  try {
    await fetch("/api/scan", { method: "POST" });
  } catch (err) {
    toast(String(err), "error");
  }
}

// ── Socket ─────────────────────────────────────────────────────────────────
function connectSocket() {
  socket = io({ transports: ["websocket", "polling"] });
  socket.on("connect", () => {
    appendLogLine("[webui] Connected to live log stream");
  });
  socket.on("log", (data) => {
    if (data && data.line) appendLogLine(data.line);
  });
  socket.on("log_history", (data) => {
    if (data && data.lines) {
      clearLogs();
      data.lines.forEach(appendLogLine);
    }
  });
  socket.on("stats", (data) => {
    if (data) {
      $("#reqCount").textContent = data.requests ?? 0;
    }
  });
  socket.on("deps_done", (data) => {
    if (data && data.deps) renderDeps(data.deps);
    toast("Deps updated", "success");
    refreshStatus();
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Theme
  const savedTheme = localStorage.getItem("mhr_theme") || "dark";
  setTheme(savedTheme);
  $$("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.getAttribute("data-theme-btn")));
  });

  // Language
  applyI18n();
  $$("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.getAttribute("data-lang")));
  });

  // Forms & buttons
  $("#configForm").addEventListener("submit", saveConfig);
  $("#btnStart").addEventListener("click", startProxy);
  $("#btnStop").addEventListener("click", stopProxy);
  $("#btnInstall").addEventListener("click", installDeps);
  $("#btnRefreshDeps").addEventListener("click", refreshStatus);
  $("#btnScan").addEventListener("click", runScan);
  $("#btnClearLogs").addEventListener("click", clearLogs);
  $("#btnCopyLogs").addEventListener("click", () => {
    navigator.clipboard.writeText(logView.innerText).then(() => {
      toast(t("toast.copied"), "success");
    });
  });

  loadConfig();
  refreshStatus();
  connectSocket();
  setInterval(refreshStatus, 4000);
});
