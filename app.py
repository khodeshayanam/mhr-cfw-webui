#!/usr/bin/env python3
"""
MHR-CFW Web UI
A beautiful local web interface for the mhr-cfw project by denuitt1.
This is only a convenience UI — the core project belongs to its original author.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO, emit

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
EXAMPLE_PATH = HERE / "config.example.json"
ORIGINAL_REQ = HERE / "requirements.txt"
WEBUI_REQ = HERE / "requirements-webui.txt"

app = Flask(__name__)
app.config["SECRET_KEY"] = "mhr-cfw-webui-local-only"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# ── Global state ─────────────────────────────────────────────────────────────
proxy_process: subprocess.Popen | None = None
system_proxy_owned = False
log_buffer: list[str] = []
request_count = 0
bytes_up = 0
bytes_down = 0
_lock = threading.Lock()
MAX_LOG_LINES = 2000

REQUEST_PATTERNS = [
    re.compile(r"\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\S+", re.I),
    re.compile(r"relay|forward|proxy.*(req|request|conn)", re.I),
    re.compile(r"→|->.*https?://", re.I),
]


def _append_log(line: str) -> None:
    global request_count
    with _lock:
        log_buffer.append(line)
        if len(log_buffer) > MAX_LOG_LINES:
            del log_buffer[: len(log_buffer) - MAX_LOG_LINES]
        for pat in REQUEST_PATTERNS:
            if pat.search(line):
                request_count += 1
                break
    socketio.emit("log", {"line": line})
    socketio.emit(
        "stats",
        {"requests": request_count, "up": bytes_up, "down": bytes_down},
    )


def _reader(pipe, prefix: str = "") -> None:
    try:
        for raw in iter(pipe.readline, b""):
            try:
                line = raw.decode("utf-8", errors="replace").rstrip()
            except Exception:
                line = str(raw)
            if line:
                _append_log(f"{prefix}{line}")
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except Exception:
            pass


def check_package(pkg: str) -> bool:
    try:
        __import__(pkg)
        return True
    except ImportError:
        return False


def get_deps_status() -> dict:
    checks = {
        "cryptography": check_package("cryptography"),
        "h2": check_package("h2"),
        "brotli": check_package("brotli"),
        "zstandard": check_package("zstandard"),
        "flask": check_package("flask"),
        "flask_socketio": check_package("flask_socketio"),
    }
    if sys.platform != "win32":
        checks["certifi"] = check_package("certifi")
    return checks


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            with CONFIG_PATH.open(encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    if EXAMPLE_PATH.exists():
        with EXAMPLE_PATH.open(encoding="utf-8") as f:
            return json.load(f)
    return {
        "mode": "apps_script",
        "auth_key": "",
        "script_id": "",
        "listen_host": "127.0.0.1",
        "listen_port": 8085,
        "socks5_enabled": True,
        "socks5_port": 1080,
        "lan_sharing": False,
        "log_level": "INFO",
        "front_domain": "www.google.com",
        "google_ip": "216.239.38.120",
    }




def _windows_proxy_notify() -> None:
    """Tell WinINet that Internet Settings changed."""
    try:
        import ctypes
        internet_set_option = ctypes.windll.Wininet.InternetSetOptionW
        INTERNET_OPTION_SETTINGS_CHANGED = 39
        INTERNET_OPTION_REFRESH = 37
        internet_set_option(0, INTERNET_OPTION_SETTINGS_CHANGED, 0, 0)
        internet_set_option(0, INTERNET_OPTION_REFRESH, 0, 0)
    except Exception:
        pass


def _read_windows_proxy() -> tuple[int, str]:
    """Return (ProxyEnable, ProxyServer) from current user Internet Settings."""
    if sys.platform != "win32":
        return 0, ""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            0,
            winreg.KEY_READ,
        )
        try:
            enable, _ = winreg.QueryValueEx(key, "ProxyEnable")
        except FileNotFoundError:
            enable = 0
        try:
            server, _ = winreg.QueryValueEx(key, "ProxyServer")
        except FileNotFoundError:
            server = ""
        winreg.CloseKey(key)
        return int(enable or 0), str(server or "")
    except Exception:
        return 0, ""


def _is_our_system_proxy(server: str, port: int | None = None) -> bool:
    """True if ProxyServer points at this machine's mhr-cfw HTTP port."""
    s = (server or "").lower().replace(" ", "")
    if not s:
        return False
    markers = ["127.0.0.1", "localhost"]
    if port is None:
        try:
            cfg = load_config()
            port = int(cfg.get("listen_port") or 8085)
        except Exception:
            port = 8085
    port_s = str(port)
    if not any(m in s for m in markers):
        return False
    return port_s in s


def set_system_proxy(host: str, port: int) -> tuple[bool, str]:
    """Enable OS HTTP(S) system proxy. Currently implemented for Windows."""
    if sys.platform != "win32":
        return False, "System proxy auto-set is only supported on Windows"
    try:
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            0,
            winreg.KEY_SET_VALUE,
        )
        # Apply to both HTTP and HTTPS protocols
        proxy = f"http={host}:{port};https={host}:{port}"
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, proxy)
        # Bypass local + Windows/Microsoft noise so GAS quota is not burned
        bypass = ";".join([
            "<local>",
            "localhost",
            "127.*",
            "10.*",
            "192.168.*",
            "172.16.*",
            "172.17.*",
            "172.18.*",
            "172.19.*",
            "172.2*.*",
            "172.30.*",
            "172.31.*",
            "*.local",
            "*.lan",
            "<-loopback>",
            "*.microsoft.com",
            "*.windows.com",
            "*.windowsupdate.com",
            "*.msn.com",
            "*.live.com",
            "*.office.com",
            "*.office.net",
            "*.skype.com",
            "*.azure.com",
            "*.azureedge.net",
            "*.msftconnecttest.com",
            "*.msedge.net",
            "*.bing.com",
            "*.microsoftonline.com",
            "*.visualstudio.com",
            "*.github.com",
            "*.githubusercontent.com",
            "*.npmjs.org",
            "*.pypi.org",
            "*.pythonhosted.org",
        ])
        try:
            winreg.SetValueEx(key, "ProxyOverride", 0, winreg.REG_SZ, bypass)
        except Exception:
            pass
        winreg.CloseKey(key)
        _windows_proxy_notify()
        return True, f"System proxy set to {host}:{port}"
    except Exception as e:
        return False, str(e)


def clear_system_proxy(force: bool = False) -> tuple[bool, str]:
    """Disable OS HTTP(S) system proxy (Windows).

    If force is False, only clears when the current ProxyServer looks like ours
    (127.0.0.1 / localhost + our listen port). force=True always disables.
    """
    if sys.platform != "win32":
        return False, "System proxy auto-set is only supported on Windows"
    try:
        import winreg

        enable, server = _read_windows_proxy()
        if not force and enable and not _is_our_system_proxy(server):
            return True, f"System proxy left untouched (not ours): {server}"

        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            0,
            winreg.KEY_SET_VALUE,
        )
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 0)
        # Clear server string so nothing is left half-configured
        try:
            winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, "")
        except Exception:
            pass
        winreg.CloseKey(key)
        _windows_proxy_notify()
        return True, "System proxy cleared"
    except Exception as e:
        return False, str(e)


def ensure_system_proxy_off() -> None:
    """Best-effort cleanup used on stop / exit / startup recovery."""
    global system_proxy_owned
    try:
        ok, msg = clear_system_proxy(force=False)
        # If we owned it, force clear even if detection failed
        if system_proxy_owned:
            ok2, msg2 = clear_system_proxy(force=True)
            msg = msg2 or msg
            ok = ok or ok2
        system_proxy_owned = False
        try:
            _append_log(f"[webui] {msg}")
        except Exception:
            print(f"[webui] {msg}")
    except Exception as e:
        try:
            _append_log(f"[webui] clear proxy error: {e}")
        except Exception:
            print(f"[webui] clear proxy error: {e}")


def get_lan_ips() -> list[str]:
    """Best-effort list of non-loopback IPv4 addresses on this machine."""
    ips: list[str] = []
    try:
        import socket
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127.") and ip not in ips:
            ips.insert(0, ip)
    except Exception:
        pass
    return ips


def is_config_ready(cfg: dict | None = None) -> bool:
    """True when auth_key and script_id look valid (user already set them up)."""
    if cfg is None:
        cfg = load_config()
    key = (cfg.get("auth_key") or "").strip()
    sid = cfg.get("script_id") or cfg.get("script_ids")
    if isinstance(sid, list):
        sid = sid[0] if sid else ""
    sid = (sid or "").strip()
    placeholders = {
        "",
        "CHANGE_ME_TO_A_STRONG_SECRET",
        "your-secret-password-here",
        "YOUR_APPS_SCRIPT_DEPLOYMENT_ID",
    }
    return key not in placeholders and sid not in placeholders and bool(sid)


def save_config(data: dict) -> None:
    """Merge with existing/example defaults and normalize script_id fields.

    Critical: never leave both script_id and script_ids set — the core
    prefers script_ids when present, which can silently use stale IDs.
    """
    base: dict = {}
    if EXAMPLE_PATH.exists():
        try:
            with EXAMPLE_PATH.open(encoding="utf-8") as f:
                base = json.load(f)
        except Exception:
            base = {}
    if CONFIG_PATH.exists():
        try:
            with CONFIG_PATH.open(encoding="utf-8") as f:
                existing = json.load(f)
            base.update(existing)
        except Exception:
            pass
    base.update(data)
    base["mode"] = "apps_script"

    # Normalize auth_key
    auth = str(base.get("auth_key") or "").strip()
    base["auth_key"] = auth

    # Normalize script id(s) — exclusive
    raw = base.get("script_id")
    if raw is None or raw == "":
        raw = base.get("script_ids")
    ids: list[str] = []
    if isinstance(raw, list):
        ids = [str(x).strip() for x in raw if str(x).strip()]
    elif isinstance(raw, str):
        ids = [x.strip() for x in raw.split(",") if x.strip()]
    # Drop placeholder values
    placeholders = {
        "",
        "YOUR_APPS_SCRIPT_DEPLOYMENT_ID",
        "CHANGE_ME_TO_A_STRONG_SECRET",
        "your-secret-password-here",
    }
    ids = [i for i in ids if i not in placeholders]
    base.pop("script_id", None)
    base.pop("script_ids", None)
    if len(ids) > 1:
        base["script_ids"] = ids
    elif len(ids) == 1:
        base["script_id"] = ids[0]

    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(base, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def api_status():
    running = proxy_process is not None and proxy_process.poll() is None
    cfg = load_config()
    return jsonify(
        {
            "running": running,
            "pid": proxy_process.pid if running else None,
            "requests": request_count,
            "deps": get_deps_status(),
            "config_exists": CONFIG_PATH.exists(),
            "config_ready": is_config_ready(cfg),
        }
    )



@app.route("/api/proxy-info")
def api_proxy_info():
    """Return ready-to-use proxy connection details for clients."""
    cfg = load_config()
    lan_sharing = bool(cfg.get("lan_sharing", False))
    listen_host = cfg.get("listen_host") or "127.0.0.1"
    http_port = int(cfg.get("listen_port") or 8085)
    socks_enabled = cfg.get("socks5_enabled", True)
    socks_port = int(cfg.get("socks5_port") or 1080)
    lan_ips = get_lan_ips() if lan_sharing or listen_host in ("0.0.0.0", "::") else []

    # Primary host shown to the user
    if lan_sharing or listen_host in ("0.0.0.0", "::"):
        primary = lan_ips[0] if lan_ips else "127.0.0.1"
    else:
        primary = listen_host if listen_host not in ("0.0.0.0", "::") else "127.0.0.1"

    return jsonify({
        "name": "mhr-cfw",
        "host": primary,
        "http_port": http_port,
        "socks5_enabled": bool(socks_enabled),
        "socks5_port": socks_port,
        "lan_sharing": lan_sharing,
        "lan_ips": lan_ips,
        "http_url": f"http://{primary}:{http_port}",
        "socks5_url": f"socks5://{primary}:{socks_port}",
        "telegram_socks": {
            "server": primary,
            "port": socks_port,
            "type": "socks5",
        },
    })


@app.route("/api/config", methods=["GET", "POST"])
def api_config():
    if request.method == "GET":
        return jsonify(load_config())
    data = request.get_json(force=True, silent=True) or {}
    # Coerce types from the form
    if "listen_port" in data:
        try:
            data["listen_port"] = int(data["listen_port"])
        except (TypeError, ValueError):
            data["listen_port"] = 8085
    if "socks5_port" in data:
        try:
            data["socks5_port"] = int(data["socks5_port"])
        except (TypeError, ValueError):
            data["socks5_port"] = 1080
    for bkey in ("socks5_enabled", "lan_sharing", "verify_ssl", "youtube_via_relay"):
        if bkey in data:
            data[bkey] = bool(data[bkey])
    data["mode"] = "apps_script"
    save_config(data)
    cfg = load_config()
    return jsonify({"ok": True, "config": cfg, "config_ready": is_config_ready(cfg)})


@app.route("/api/install-deps", methods=["POST"])
def api_install_deps():
    body = request.get_json(force=True, silent=True) or {}
    use_mirror = bool(body.get("use_mirror", False))

    def _run():
        cmd = [sys.executable, "-m", "pip", "install", "-r", str(ORIGINAL_REQ)]
        if use_mirror:
            cmd += [
                "-i",
                "https://mirror-pypi.runflare.com/simple/",
                "--trusted-host",
                "mirror-pypi.runflare.com",
            ]
        cmd2 = [sys.executable, "-m", "pip", "install", "-r", str(WEBUI_REQ)]
        for c in (cmd, cmd2):
            _append_log(f"$ {' '.join(c)}")
            try:
                p = subprocess.Popen(
                    c,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    cwd=str(HERE),
                )
                for raw in iter(p.stdout.readline, b""):
                    line = raw.decode("utf-8", errors="replace").rstrip()
                    if line:
                        _append_log(line)
                p.wait()
                _append_log(f"[pip] exit code {p.returncode}")
            except Exception as e:
                _append_log(f"[pip] error: {e}")
        socketio.emit("deps_done", {"deps": get_deps_status()})

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"ok": True, "message": "Installation started"})


@app.route("/api/start", methods=["POST"])
def api_start():
    global proxy_process, request_count
    if proxy_process is not None and proxy_process.poll() is None:
        return jsonify({"ok": False, "error": "Already running"}), 400

    if not CONFIG_PATH.exists():
        return jsonify({"ok": False, "error": "config.json missing — save config first"}), 400

    cfg = load_config()
    if not is_config_ready(cfg):
        return jsonify(
            {
                "ok": False,
                "error": "auth_key یا Deployment ID تنظیم نشده — اول تنظیمات را ذخیره کنید",
            }
        ), 400

    with _lock:
        request_count = 0
        log_buffer.clear()

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    try:
        proxy_process = subprocess.Popen(
            [sys.executable, str(HERE / "main.py"), "-c", str(CONFIG_PATH)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=str(HERE),
            env=env,
            bufsize=1,
        )
        threading.Thread(
            target=_reader, args=(proxy_process.stdout, ""), daemon=True
        ).start()
        _append_log(f"[webui] Proxy started (pid={proxy_process.pid})")

        global system_proxy_owned
        body = request.get_json(force=True, silent=True) or {}
        if body.get("system_proxy", True):
            host = "127.0.0.1"
            port = int(cfg.get("listen_port") or 8085)
            ok, msg = set_system_proxy(host, port)
            _append_log(f"[webui] {msg}")
            system_proxy_owned = ok
        return jsonify({"ok": True, "pid": proxy_process.pid, "system_proxy": system_proxy_owned})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/stop", methods=["POST"])
def api_stop():
    global proxy_process
    if proxy_process is None or proxy_process.poll() is not None:
        proxy_process = None
        ensure_system_proxy_off()
        return jsonify({"ok": True, "message": "Not running"})
    try:
        proxy_process.terminate()
        try:
            proxy_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proxy_process.kill()
            proxy_process.wait(timeout=3)
        _append_log("[webui] Proxy stopped")
    except Exception as e:
        _append_log(f"[webui] Stop error: {e}")
    finally:
        proxy_process = None
        ensure_system_proxy_off()
    return jsonify({"ok": True})


@app.route("/api/logs")
def api_logs():
    with _lock:
        return jsonify({"lines": list(log_buffer), "requests": request_count})


@app.route("/api/scan", methods=["POST"])
def api_scan():
    def _run():
        _append_log("[webui] Starting Google IP scan…")
        try:
            p = subprocess.Popen(
                [sys.executable, str(HERE / "main.py"), "--scan", "-c", str(CONFIG_PATH)],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=str(HERE),
            )
            for raw in iter(p.stdout.readline, b""):
                line = raw.decode("utf-8", errors="replace").rstrip()
                if line:
                    _append_log(line)
            p.wait()
            _append_log(f"[webui] Scan finished (exit {p.returncode})")
        except Exception as e:
            _append_log(f"[webui] Scan error: {e}")

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"ok": True})


@socketio.on("connect")
def on_connect():
    with _lock:
        emit("log_history", {"lines": list(log_buffer)})
        emit(
            "stats",
            {"requests": request_count, "up": bytes_up, "down": bytes_down},
        )


def _open_browser():
    time.sleep(1.2)
    try:
        webbrowser.open("http://127.0.0.1:5050")
    except Exception:
        pass


if __name__ == "__main__":
    import atexit
    import signal

    def _cleanup(*_args):
        global proxy_process
        try:
            if proxy_process is not None and proxy_process.poll() is None:
                proxy_process.terminate()
                try:
                    proxy_process.wait(timeout=3)
                except Exception:
                    try:
                        proxy_process.kill()
                    except Exception:
                        pass
        except Exception:
            pass
        proxy_process = None
        ensure_system_proxy_off()

    atexit.register(_cleanup)
    try:
        signal.signal(signal.SIGINT, lambda *a: (_cleanup(), sys.exit(0)))
        signal.signal(signal.SIGTERM, lambda *a: (_cleanup(), sys.exit(0)))
    except Exception:
        pass

    # Recover from previous crash: if system proxy still points at us, clear it
    try:
        enable, server = _read_windows_proxy()
        if enable and _is_our_system_proxy(server):
            print(f"  Found leftover system proxy ({server}) — clearing…")
            clear_system_proxy(force=True)
    except Exception:
        pass

    print()
    print("  MHR-CFW Web UI")
    print("  Open → http://127.0.0.1:5050")
    print("  (This UI is a helper for the original project by denuitt1)")
    print()
    if os.environ.get("MHR_NO_BROWSER") != "1":
        threading.Thread(target=_open_browser, daemon=True).start()
    try:
        socketio.run(app, host="127.0.0.1", port=5050, debug=False, allow_unsafe_werkzeug=True)
    finally:
        _cleanup()
