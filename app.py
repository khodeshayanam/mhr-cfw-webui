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
log_buffer: list[str] = []
request_count = 0
bytes_up = 0
bytes_down = 0
_lock = threading.Lock()
MAX_LOG_LINES = 2000

# Patterns that look like a real HTTP request being relayed
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
    """Return True if the given import name / package is available."""
    try:
        __import__(pkg)
        return True
    except ImportError:
        return False


def get_deps_status() -> dict:
    """Check core dependencies of both the original project and the Web UI."""
    checks = {
        "cryptography": check_package("cryptography"),
        "h2": check_package("h2"),
        "brotli": check_package("brotli"),
        "zstandard": check_package("zstandard"),
        "flask": check_package("flask"),
        "flask_socketio": check_package("flask_socketio"),
    }
    # certifi is optional on Windows
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


def save_config(data: dict) -> None:
    # Normalize script_id / script_ids
    sid = data.get("script_id") or data.get("script_ids")
    if isinstance(sid, str) and "," in sid:
        ids = [x.strip() for x in sid.split(",") if x.strip()]
        if len(ids) > 1:
            data["script_ids"] = ids
            data.pop("script_id", None)
        else:
            data["script_id"] = ids[0] if ids else ""
            data.pop("script_ids", None)
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def api_status():
    running = proxy_process is not None and proxy_process.poll() is None
    return jsonify(
        {
            "running": running,
            "pid": proxy_process.pid if running else None,
            "requests": request_count,
            "deps": get_deps_status(),
            "config_exists": CONFIG_PATH.exists(),
        }
    )


@app.route("/api/config", methods=["GET", "POST"])
def api_config():
    if request.method == "GET":
        return jsonify(load_config())
    data = request.get_json(force=True, silent=True) or {}
    # Keep unknown keys from existing config
    cfg = load_config()
    cfg.update(data)
    # Required sanitization
    cfg["mode"] = "apps_script"
    if "listen_port" in cfg:
        try:
            cfg["listen_port"] = int(cfg["listen_port"])
        except (TypeError, ValueError):
            cfg["listen_port"] = 8085
    if "socks5_port" in cfg:
        try:
            cfg["socks5_port"] = int(cfg["socks5_port"])
        except (TypeError, ValueError):
            cfg["socks5_port"] = 1080
    for bkey in ("socks5_enabled", "lan_sharing", "verify_ssl", "youtube_via_relay"):
        if bkey in cfg:
            cfg[bkey] = bool(cfg[bkey])
    save_config(cfg)
    return jsonify({"ok": True, "config": cfg})


@app.route("/api/install-deps", methods=["POST"])
def api_install_deps():
    """Install missing packages with pip (runs in background, streams log)."""
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
        # Also ensure webui deps
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
    if not cfg.get("auth_key") or cfg.get("auth_key") in (
        "",
        "CHANGE_ME_TO_A_STRONG_SECRET",
        "your-secret-password-here",
    ):
        return jsonify({"ok": False, "error": "auth_key is missing or still a placeholder"}), 400

    sid = cfg.get("script_id") or cfg.get("script_ids")
    if not sid or sid == "YOUR_APPS_SCRIPT_DEPLOYMENT_ID":
        return jsonify({"ok": False, "error": "script_id / Deployment ID is missing"}), 400

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
        return jsonify({"ok": True, "pid": proxy_process.pid})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/stop", methods=["POST"])
def api_stop():
    global proxy_process
    if proxy_process is None or proxy_process.poll() is not None:
        proxy_process = None
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
    return jsonify({"ok": True})


@app.route("/api/logs")
def api_logs():
    with _lock:
        return jsonify({"lines": list(log_buffer), "requests": request_count})


@app.route("/api/scan", methods=["POST"])
def api_scan():
    """Run Google IP scanner once."""
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


if __name__ == "__main__":
    print()
    print("  MHR-CFW Web UI")
    print("  Open → http://127.0.0.1:5050")
    print("  (This UI is a helper for the original project by denuitt1)")
    print()
    socketio.run(app, host="127.0.0.1", port=5050, debug=False, allow_unsafe_werkzeug=True)
