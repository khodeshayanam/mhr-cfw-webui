# MHR-CFW Web UI

A beautiful **local Web UI** for the [mhr-cfw](https://github.com/denuitt1/mhr-cfw) project.

> **Important notice**  
> This project is an **unofficial helper UI** for the original work by **denuitt1**.  
> We did **not** create the domain-fronting relay itself.  
> We only built a graphical interface so users can configure and run the original project more easily (especially those who prefer not to use the terminal wizard).

---

## Features

- **Dark / Light / Neon** themes
- **English & Persian (فارسی)** with full RTL support
- Dependency checker + one-click `pip install`
- Graphical form for:
  - `auth_key` (AUTH_KEY)
  - Google Apps Script **Deployment ID(s)**
  - Listen host / ports
  - SOCKS5, LAN sharing, log level, front domain
- Start / Stop the local proxy from the browser
- **Live logs** (WebSocket)
- Approximate **request counter** (based on log patterns)
- Optional Google IP scanner button

---

## Requirements

- Python **3.10+**
- The original mhr-cfw core files (already included in this repository: `main.py`, `src/`, `config.example.json`, …)

---

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/YOUR_USERNAME/mhr-cfw-webui.git
cd mhr-cfw-webui

# 2. Install Web UI dependencies
pip install -r requirements-webui.txt

# If PyPI is blocked:
pip install -r requirements-webui.txt -i https://mirror-pypi.runflare.com/simple/ --trusted-host mirror-pypi.runflare.com

# 3. Run the Web UI
python app.py
```

Open your browser:

```
http://127.0.0.1:5050
```

### First-time setup inside the UI

1. Check the **Dependencies** card. If anything is missing, click **Install / Update packages**.
2. Fill in:
   - **Auth Key** → same value you put in `Code.gs` as `AUTH_KEY`
   - **Deployment ID** → the long ID from Google Apps Script deployment
3. Click **Save Config**.
4. Click **Start Proxy**.

The HTTP proxy will listen on the port you configured (default `8085`).  
SOCKS5 is also available if enabled (default `1080`).

---

## Relation to the original project

| Item | Owner / Source |
|------|----------------|
| Domain-fronting relay, GAS + Cloudflare Worker code, MITM proxy logic | **denuitt1** — [mhr-cfw](https://github.com/denuitt1/mhr-cfw) |
| This Web UI (Flask panel, themes, i18n, start/stop, logs) | This repository only |

Please star and support the original project:

https://github.com/denuitt1/mhr-cfw

---

## Project structure

```
mhr-cfw-webui/
├── app.py                 # Flask + SocketIO Web UI server
├── main.py                # Original entry point (from mhr-cfw)
├── setup.py               # Original CLI wizard
├── config.example.json
├── requirements.txt       # Original deps
├── requirements-webui.txt # Web UI deps
├── src/                   # Original proxy source
├── templates/
│   └── index.html
├── static/
│   ├── css/style.css
│   └── js/{app.js,i18n.js}
└── README.md
```

---

## How to push this to your own GitHub

```bash
# Create a new empty repository on GitHub (do not add README)

cd mhr-cfw-webui

git init
git add .
git commit -m "Initial commit: MHR-CFW Web UI helper"

git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mhr-cfw-webui.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Disclaimer

This Web UI is provided for convenience only.  
Use of the underlying relay is subject to the original project's license and disclaimer.  
You are responsible for complying with all applicable laws and the terms of service of Google and Cloudflare.

---

## License

The original mhr-cfw code retains its own license (MIT — see the upstream repository).  
The Web UI code in this repository is also released under the MIT License.
