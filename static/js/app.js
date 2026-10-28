/* global io, t, applyI18n, setLang, currentLang */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function csrfToken() {
  const el = document.querySelector('meta[name="csrf-token"]');
  return el ? el.getAttribute("content") || "" : "";
}

function apiHeaders(extra) {
  const h = Object.assign({ "X-CSRF-Token": csrfToken() }, extra || {});
  return h;
}

async function apiFetch(url, options) {
  options = options || {};
  const opts = Object.assign({}, options);
  opts.headers = apiHeaders(options.headers || {});
  if (opts.body && !opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json";
  }
  return fetch(url, opts);
}


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
    const sysProxy = !!data.system_proxy_active;
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
    // Start disabled only while truly running; Stop always clickable if
    // process/port active OR system proxy still points at us.
    if (bs) bs.disabled = isRunning;
    if (bt) bt.disabled = !(isRunning || sysProxy);
    // Visual: if system proxy stuck, keep Stop looking active
    if (bt && (isRunning || sysProxy)) {
      bt.removeAttribute("disabled");
    }
    renderDeps(data.deps);
    updateHeroHint();
  } catch (e) {
    console.error(e);
  }
}


// ── Deployment ID switcher (Web UI only; maps to core script_id / script_ids) ─
let scriptIdRows = [""]; // values
let activeScriptIndex = 0;

function isParallelMode() {
  const el = $("#parallel_scripts");
  return !!(el && el.checked);
}

function syncParallelBodyClass() {
  document.body.classList.toggle("parallel-on", isParallelMode());
  renderScriptIdRows();
}

function renderScriptIdRows() {
  const list = $("#scriptIdList");
  if (!list) return;
  if (!scriptIdRows.length) scriptIdRows = [""];
  if (activeScriptIndex >= scriptIdRows.length) activeScriptIndex = scriptIdRows.length - 1;
  if (activeScriptIndex < 0) activeScriptIndex = 0;
  const parallel = isParallelMode();
  list.innerHTML = "";
  scriptIdRows.forEach((val, idx) => {
    const row = document.createElement("div");
    row.className = "script-id-row" + (!parallel && idx === activeScriptIndex ? " active" : "");
    row.dataset.index = String(idx);

    const badge = document.createElement("span");
    badge.className = "sid-badge";
    badge.setAttribute("data-i18n", "config.active");
    badge.textContent = (typeof t === "function" ? t("config.active") : "Active");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "AKfycb…";
    input.autocomplete = "off";
    input.value = val || "";
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("input", () => {
      scriptIdRows[idx] = input.value;
    });
    input.addEventListener("focus", () => {
      if (!isParallelMode() && activeScriptIndex !== idx) {
        activeScriptIndex = idx;
        list.querySelectorAll(".script-id-row").forEach((r) => {
          r.classList.toggle("active", r.dataset.index === String(idx));
        });
      }
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost btn-sm btn-remove-sid";
    remove.textContent = "×";
    remove.title = typeof t === "function" ? t("config.remove_script") : "Remove";
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      if (scriptIdRows.length <= 1) {
        scriptIdRows[0] = "";
        activeScriptIndex = 0;
      } else {
        scriptIdRows.splice(idx, 1);
        if (activeScriptIndex >= scriptIdRows.length) activeScriptIndex = scriptIdRows.length - 1;
        else if (activeScriptIndex > idx) activeScriptIndex -= 1;
      }
      renderScriptIdRows();
    });

    row.addEventListener("click", () => {
      if (isParallelMode()) return;
      activeScriptIndex = idx;
      renderScriptIdRows();
    });

    row.appendChild(badge);
    row.appendChild(input);
    row.appendChild(remove);
    list.appendChild(row);
  });
}

function addScriptIdRow() {
  scriptIdRows.push("");
  if (!isParallelMode()) activeScriptIndex = scriptIdRows.length - 1;
  renderScriptIdRows();
  const list = $("#scriptIdList");
  const last = list && list.querySelector(".script-id-row:last-child input");
  if (last) last.focus();
}

function collectScriptIdsFromUi() {
  const list = $("#scriptIdList");
  if (list) {
    const inputs = list.querySelectorAll("input[type='text']");
    scriptIdRows = Array.from(inputs).map((el) => (el.value || "").trim());
  }
  return scriptIdRows.filter((x) => x);
}


async function loadConfig() {
  try {
    const r = await fetch("/api/config");
    const data = await r.json();
    const cfg = data.config || data;
    if ($("#auth_key")) $("#auth_key").value = cfg.auth_key || "";

    let ids = [];
    if (Array.isArray(cfg.webui_script_ids) && cfg.webui_script_ids.length) {
      ids = cfg.webui_script_ids.map(String);
    } else if (Array.isArray(cfg.script_ids) && cfg.script_ids.length) {
      ids = cfg.script_ids.map(String);
    } else if (cfg.script_id) {
      ids = [String(cfg.script_id)];
    }
    if (!ids.length) ids = [""];
    scriptIdRows = ids;
    try {
      activeScriptIndex = parseInt(cfg.webui_active_index, 10) || 0;
    } catch (_) {
      activeScriptIndex = 0;
    }
    if (activeScriptIndex >= scriptIdRows.length) activeScriptIndex = 0;

    const parallel =
      !!cfg.parallel_scripts ||
      (Array.isArray(cfg.script_ids) && cfg.script_ids.length > 1 && (cfg.parallel_relay || 1) > 1);
    if ($("#parallel_scripts")) $("#parallel_scripts").checked = parallel;
    syncParallelBodyClass();

    if ($("#listen_host")) $("#listen_host").value = cfg.listen_host || "127.0.0.1";
    if ($("#listen_port")) $("#listen_port").value = cfg.listen_port || 8085;
    if ($("#socks5_enabled")) $("#socks5_enabled").checked = cfg.socks5_enabled !== false;
    if ($("#socks5_port")) $("#socks5_port").value = cfg.socks5_port || 1080;
    if ($("#lan_sharing")) $("#lan_sharing").checked = !!cfg.lan_sharing;
    if ($("#front_domain")) $("#front_domain").value = cfg.front_domain || "www.google.com";
    if ($("#log_level")) $("#log_level").value = cfg.log_level || "INFO";
  } catch (err) {
    console.error(err);
  }
}

async function saveConfig(e) {
  if (e && e.preventDefault) e.preventDefault();
  collectScriptIdsFromUi();
  const ids = scriptIdRows.map((x) => (x || "").trim()).filter(Boolean);
  let parallel = isParallelMode() && ids.length > 1;
  if (!parallel) {
    const filledIdx = scriptIdRows
      .map((v, i) => ((v || "").trim() ? i : -1))
      .filter((i) => i >= 0);
    if (filledIdx.length && filledIdx.indexOf(activeScriptIndex) < 0) {
      activeScriptIndex = filledIdx[0];
    }
  }
  const payload = {
    auth_key: ($("#auth_key") && $("#auth_key").value.trim()) || "",
    webui_script_ids: ids,
    webui_active_index: activeScriptIndex,
    parallel_scripts: parallel,
    listen_host: ($("#listen_host") && $("#listen_host").value.trim()) || "127.0.0.1",
    listen_port: parseInt($("#listen_port") && $("#listen_port").value, 10) || 8085,
    socks5_enabled: $("#socks5_enabled") ? $("#socks5_enabled").checked : true,
    socks5_port: parseInt($("#socks5_port") && $("#socks5_port").value, 10) || 1080,
    lan_sharing: $("#lan_sharing") ? $("#lan_sharing").checked : true,
    front_domain: ($("#front_domain") && $("#front_domain").value.trim()) || "www.google.com",
    log_level: ($("#log_level") && $("#log_level").value) || "INFO",
  };
  try {
    const r = await apiFetch("/api/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data && data.ok) {
      toast(t("toast.saved"), "success");
      if (typeof refreshStatus === "function") refreshStatus();
    } else {
      toast((data && data.error) || t("toast.error"), "error");
    }
  } catch (err) {
    toast(String(err), "error");
  }
}

async function startProxy() {
  try {
    collectScriptIdsFromUi();
  if ($("#auth_key") && $("#auth_key").value.trim() && scriptIdRows.some((x) => (x || "").trim())) {
      await saveConfig({ preventDefault() {} });
    }
    const useSys = $("#systemProxy") ? $("#systemProxy").checked : true;
    const r = await apiFetch("/api/start", {
      method: "POST",
      body: JSON.stringify({ system_proxy: useSys }),
    });
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
  // Always try hard — even if response is not JSON (proxy may intercept)
  try {
    const r = await apiFetch("/api/stop", {
      method: "POST",
      cache: "no-store",
      body: "{}",
    });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (data && data.ok) {
      toast(t("toast.stopped"), "success");
    } else {
      toast(t("toast.stopped"), "success");
    }
  } catch (err) {
    // Network error often means system proxy ate the request —
    // tell user to run stop_proxy.bat once, but still refresh UI.
    console.error(err);
    toast(t("toast.stopped") + " / stop_proxy.bat", "error");
  }
  // Poll status a few times after stop
  setTimeout(refreshStatus, 400);
  setTimeout(refreshStatus, 1200);
  setTimeout(refreshStatus, 2500);
}

async function installDeps() {
  toast(t("toast.install"), "success");
  try {
    await apiFetch("/api/install-deps", {
      method: "POST",
      body: JSON.stringify({ use_mirror: $("#useMirror") && $("#useMirror").checked }),
    });
  } catch (err) {
    toast(String(err), "error");
  }
}

async function runScan() {
  try {
    await apiFetch("/api/scan", { method: "POST" });
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
  const addSid = $("#btnAddScriptId");
  if (addSid) addSid.addEventListener("click", addScriptIdRow);
  const par = $("#parallel_scripts");
  if (par) par.addEventListener("change", syncParallelBodyClass);
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
