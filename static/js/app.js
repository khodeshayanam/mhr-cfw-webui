/* global io, t, applyI18n, setLang, currentLang */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let socket = null;
let isRunning = false;
let configReady = false;
let lastProxyInfo = null;

function setTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem("mhr_theme", name);
  $$("[data-theme-btn]").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-theme-btn") === name);
  });
}

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

function setCollapsed(toggleSel, bodySel, collapsed) {
  const toggle = $(toggleSel);
  const body = $(bodySel);
  if (!toggle || !body) return;
  body.hidden = collapsed;
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  const chevron = toggle.querySelector(".chevron");
  if (chevron) chevron.textContent = collapsed ? "▼" : "▲";
}

function wireCollapsible(toggleSel, bodySel) {
  const toggle = $(toggleSel);
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    setCollapsed(toggleSel, bodySel, open);
  });
}

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

function renderDeps(deps) {
  const list = $("#depList");
  if (!list) return;
  list.innerHTML = "";
  Object.entries(deps || {}).forEach(([name, ok]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="${ok ? "ok" : "missing"}">${ok ? "✓" : "✗"}</span> ${name}`;
    list.appendChild(li);
  });
}

function updateHeroHint() {
  const hint = $("#heroHint");
  if (!hint) return;
  hint.textContent = configReady ? t("hero.hint_ready") : t("hero.hint_setup");
}

// ── Proxy config cards ─────────────────────────────────────────────────────
function renderProxyConfigs(info) {
  lastProxyInfo = info;
  if (!info) return;
  const host = info.host || "127.0.0.1";
  const httpPort = info.http_port || 8085;
  const socksPort = info.socks5_port || 1080;
  const name = info.name || "mhr-cfw";

  const socksText = [
    "Name: " + name,
    "Type: SOCKS5",
    "Address: " + host,
    "Port: " + socksPort,
    "",
    "URL: socks5://" + host + ":" + socksPort,
  ].join("\n");

  const httpText = [
    "Name: " + name,
    "Type: HTTP",
    "Address: " + host,
    "Port: " + httpPort,
    "",
    "URL: http://" + host + ":" + httpPort,
  ].join("\n");

  const tgText = [
    "Telegram → Settings → Data and Storage → Proxy",
    "Type: SOCKS5",
    "Server: " + host,
    "Port: " + socksPort,
    "Username: (empty)",
    "Password: (empty)",
    "",
    "socks5://" + host + ":" + socksPort,
  ].join("\n");

  const elSocks = document.getElementById("cfgSocks");
  const elHttp = document.getElementById("cfgHttp");
  const elTg = document.getElementById("cfgTelegram");
  if (elSocks) elSocks.textContent = socksText;
  if (elHttp) elHttp.textContent = httpText;
  if (elTg) elTg.textContent = tgText;

  const lanNote = document.getElementById("lanNote");
  if (lanNote) {
    if (info.lan_sharing && info.lan_ips && info.lan_ips.length) {
      lanNote.hidden = false;
      lanNote.textContent = t("configs.lan_note") + " IP: " + info.lan_ips.join(", ");
    } else {
      lanNote.hidden = true;
    }
  }
}

async function refreshProxyConfigs() {
  try {
    const r = await fetch("/api/proxy-info");
    const data = await r.json();
    renderProxyConfigs(data);
  } catch (e) {
    console.error(e);
  }
}

function copyConfig(kind) {
  if (!lastProxyInfo) return;
  const host = lastProxyInfo.host || "127.0.0.1";
  const httpPort = lastProxyInfo.http_port || 8085;
  const socksPort = lastProxyInfo.socks5_port || 1080;
  let text = "";
  if (kind === "socks") {
    text = "socks5://" + host + ":" + socksPort;
  } else if (kind === "http") {
    text = "http://" + host + ":" + httpPort;
  } else if (kind === "telegram") {
    text = "socks5://" + host + ":" + socksPort;
  }
  navigator.clipboard.writeText(text).then(() => {
    toast(t("toast.copied_cfg"), "success");
  }).catch(() => {});
}

async function refreshStatus() {
  try {
    const r = await fetch("/api/status");
    const data = await r.json();
    isRunning = !!data.running;
    configReady = !!data.config_ready;
    const dot = $("#statusDot");
    if (dot) dot.className = "dot big " + (isRunning ? "running" : "stopped");
    const st = $("#statusText");
    if (st) st.textContent = isRunning ? t("status.running") : t("status.stopped");
    const rc = $("#reqCount");
    if (rc) rc.textContent = data.requests ?? 0;
    const pid = $("#pidVal");
    if (pid) pid.textContent = data.pid ?? "—";
    const bs = $("#btnStart");
    const bt = $("#btnStop");
    if (bs) bs.disabled = isRunning;
    if (bt) bt.disabled = !isRunning;
    renderDeps(data.deps);
    updateHeroHint();
  } catch (e) {
    console.error(e);
  }
}

async function loadConfig() {
  try {
    const r = await fetch("/api/config");
    const cfg = await r.json();
    const sid = cfg.script_ids
      ? (Array.isArray(cfg.script_ids) ? cfg.script_ids.join(", ") : cfg.script_ids)
      : cfg.script_id || "";
    if ($("#auth_key")) $("#auth_key").value = cfg.auth_key || "";
    if ($("#script_id")) $("#script_id").value = sid;
    if ($("#listen_host")) $("#listen_host").value = cfg.listen_host || "127.0.0.1";
    if ($("#listen_port")) $("#listen_port").value = cfg.listen_port ?? 8085;
    if ($("#socks5_enabled")) $("#socks5_enabled").checked = cfg.socks5_enabled !== false;
    if ($("#socks5_port")) $("#socks5_port").value = cfg.socks5_port ?? 1080;
    // Default LAN sharing ON when key missing
    if ($("#lan_sharing")) {
      $("#lan_sharing").checked =
        cfg.lan_sharing === undefined ? true : !!cfg.lan_sharing;
    }
    if ($("#front_domain")) $("#front_domain").value = cfg.front_domain || "www.google.com";
    if ($("#log_level")) $("#log_level").value = cfg.log_level || "INFO";
  } catch (e) {
    console.error(e);
  }
}

async function saveConfig(e) {
  if (e && e.preventDefault) e.preventDefault();
  const payload = {
    auth_key: ($("#auth_key") && $("#auth_key").value.trim()) || "",
    script_id: ($("#script_id") && $("#script_id").value.trim()) || "",
    listen_host: ($("#listen_host") && $("#listen_host").value.trim()) || "127.0.0.1",
    listen_port: parseInt($("#listen_port") && $("#listen_port").value, 10) || 8085,
    socks5_enabled: $("#socks5_enabled") ? $("#socks5_enabled").checked : true,
    socks5_port: parseInt($("#socks5_port") && $("#socks5_port").value, 10) || 1080,
    lan_sharing: $("#lan_sharing") ? $("#lan_sharing").checked : true,
    front_domain: ($("#front_domain") && $("#front_domain").value.trim()) || "www.google.com",
    log_level: ($("#log_level") && $("#log_level").value) || "INFO",
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
      configReady = !!data.config_ready;
      toast(t("toast.saved"), "success");
      updateHeroHint();
      await refreshProxyConfigs();
      if (configReady) {
        setCollapsed("#settingsToggle", "#settingsBody", true);
      }
    } else {
      toast(data.error || t("toast.error"), "error");
    }
  } catch (err) {
    toast(String(err), "error");
  }
}

async function startProxy() {
  try {
    if ($("#auth_key") && $("#auth_key").value.trim() && $("#script_id") && $("#script_id").value.trim()) {
      await saveConfig({ preventDefault() {} });
    }
    const r = await fetch("/api/start", { method: "POST" });
    const data = await r.json();
    if (data.ok) {
      toast(t("toast.started"), "success");
      refreshStatus();
    } else {
      toast(data.error || t("toast.error"), "error");
      if (!configReady) {
        setCollapsed("#settingsToggle", "#settingsBody", false);
      }
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
      body: JSON.stringify({ use_mirror: $("#useMirror") && $("#useMirror").checked }),
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
      const rc = $("#reqCount");
      if (rc) rc.textContent = data.requests ?? 0;
    }
  });
  socket.on("deps_done", (data) => {
    if (data && data.deps) renderDeps(data.deps);
    toast("Deps updated", "success");
    refreshStatus();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const savedTheme = localStorage.getItem("mhr_theme") || "dark";
  setTheme(savedTheme);
  $$("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.getAttribute("data-theme-btn")));
  });

  applyI18n();
  $$("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.getAttribute("data-lang"));
      updateHeroHint();
    });
  });

  wireCollapsible("#settingsToggle", "#settingsBody");
  wireCollapsible("#depsToggle", "#depsBody");

  const form = $("#configForm");
  if (form) form.addEventListener("submit", saveConfig);
  if ($("#btnStart")) $("#btnStart").addEventListener("click", startProxy);
  if ($("#btnStop")) $("#btnStop").addEventListener("click", stopProxy);
  if ($("#btnInstall")) $("#btnInstall").addEventListener("click", installDeps);
  if ($("#btnRefreshDeps")) $("#btnRefreshDeps").addEventListener("click", refreshStatus);
  if ($("#btnScan")) $("#btnScan").addEventListener("click", runScan);
  if ($("#btnClearLogs")) $("#btnClearLogs").addEventListener("click", clearLogs);
  if ($("#btnCopyLogs")) {
    $("#btnCopyLogs").addEventListener("click", () => {
      navigator.clipboard.writeText(logView.innerText).then(() => {
        toast(t("toast.copied"), "success");
      });
    });
  }
  if ($("#btnRefreshConfigs")) {
    $("#btnRefreshConfigs").addEventListener("click", refreshProxyConfigs);
  }
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyConfig(btn.getAttribute("data-copy")));
  });

  await loadConfig();
  await refreshStatus();
  await refreshProxyConfigs();

  if (configReady) {
    setCollapsed("#settingsToggle", "#settingsBody", true);
    setCollapsed("#depsToggle", "#depsBody", true);
  } else {
    setCollapsed("#settingsToggle", "#settingsBody", false);
    setCollapsed("#depsToggle", "#depsBody", true);
  }

  connectSocket();
  setInterval(refreshStatus, 4000);
});
