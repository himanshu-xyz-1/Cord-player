#!/usr/bin/env python3
import sys
import os
import time
import socket
import threading
import subprocess
import shutil
import webbrowser
from pathlib import Path
import uvicorn
from backend.main import app

PORT = 8765

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def start_server():
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")

def get_browser_command(url: str):
    user_data = Path.home() / ".config" / "cord-player"
    user_data.mkdir(parents=True, exist_ok=True)
    
    # 1. Windows: Check Edge (pre-installed on all Windows), Chrome, Brave
    if sys.platform == "win32":
        candidates = [
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]
        for c in candidates:
            if os.path.exists(c):
                return [c, f"--app={url}", f"--user-data-dir={user_data}", "--window-size=1200,820"]

    # 2. macOS: Check Chrome, Brave, Edge
    elif sys.platform == "darwin":
        mac_apps = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
        for app_path in mac_apps:
            if os.path.exists(app_path):
                return [app_path, f"--app={url}", f"--user-data-dir={user_data}", "--window-size=1200,820"]

    # 3. Linux: Check chromium, google-chrome, brave
    else:
        for bin_name in ["chromium", "google-chrome-stable", "google-chrome", "brave-browser", "brave"]:
            path = shutil.which(bin_name)
            if path:
                return [
                    path,
                    f"--app={url}",
                    "--class=CordPlayer",
                    "--name=CordPlayer",
                    f"--user-data-dir={user_data}",
                    "--ozone-platform-hint=auto",
                    "--disable-vulkan",
                    "--enable-features=WebAudio,VaapiVideoDecoder",
                    "--autoplay-policy=no-user-gesture-required",
                    "--window-size=1200,820",
                ]

    return None

def launch_window():
    url = f"http://127.0.0.1:{PORT}"
    cmd = get_browser_command(url)
    if cmd:
        try:
            subprocess.run(cmd)
            return
        except Exception:
            pass
    webbrowser.open(url)

def main():
    if not is_port_in_use(PORT):
        server_thread = threading.Thread(target=start_server, daemon=True)
        server_thread.start()
        time.sleep(0.8)

    launch_window()

if __name__ == "__main__":
    main()
