@echo off
cd /d "%~dp0"
echo.
echo  MHR-CFW Web UI
echo  Starting... browser will open automatically.
echo.
python app.py
if errorlevel 1 (
  echo.
  echo  Error: Python or dependencies missing.
  echo  Run:  python -m pip install -r requirements-webui.txt
  echo.
  pause
)
