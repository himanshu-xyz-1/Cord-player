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

# Ensure project root is in sys.path and is current working directory
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = Path(sys._MEIPASS)
else:
    PROJECT_ROOT = Path(__file__).resolve().parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(str(PROJECT_ROOT))

# Windows App ID so Taskbar / Task Manager shows Cord Player
if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("LordsIndeed.CordPlayer.Desktop.2.5")
    except Exception:
        pass

# Fix for pythonw.exe (no console allocated -> sys.stdout and sys.stderr are None)
if sys.stdout is None or sys.stderr is None:
    log_dir = Path.home() / ".config" / "cord-player"
    log_dir.mkdir(parents=True, exist_ok=True)
    _log_f = open(log_dir / "cord-player.log", "a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = _log_f
    if sys.stderr is None:
        sys.stderr = _log_f

import uvicorn
from backend.main import app

PORT = 8765

def acquire_single_instance_lock():
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            user32 = ctypes.windll.user32
            mutex = kernel32.CreateMutexW(None, False, "CordPlayerSingleInstanceMutex")
            if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
                hwnd = user32.FindWindowW(None, "Cord Player")
                if hwnd:
                    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                    user32.SetForegroundWindow(hwnd)
                return None
            return mutex
        except Exception:
            pass
    return True

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def start_server():
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")

class WindowAPI:
    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def minimize(self):
        if self._window:
            self._window.minimize()

    def maximize(self):
        if self._window:
            if getattr(self._window, 'maximized', False):
                self._window.restore()
                return False
            else:
                self._window.maximize()
                return True

    def close(self):
        if self._window:
            self._window.destroy()

    def is_standalone(self):
        return True

def launch_pywebview(url: str):
    import webview
    import gc
    gc.collect()

    wv_data_dir = str(Path.home() / "AppData" / "Local" / "CordPlayer" / "webview")
    os.makedirs(wv_data_dir, exist_ok=True)
    os.environ['WEBVIEW2_USER_DATA_FOLDER'] = wv_data_dir
    os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = (
        '--renderer-process-limit=1 '
        '--disable-background-networking '
        '--disable-component-update '
        '--disable-features=Translate,OptimizationHints,MediaRouter '
        '--enable-low-end-device-mode'
    )

    webview.settings['ALLOW_DOWNLOADS'] = True
    webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
    webview.settings['DRAG_REGION_SELECTOR'] = '.pywebview-drag-region'

    api = WindowAPI()
    window = webview.create_window(
        title="Cord Player",
        url=url,
        js_api=api,
        width=1280,
        height=840,
        min_size=(960, 640),
        resizable=True,
        frameless=True,
        easy_drag=False,
        shadow=True,
        background_color='#ECECF2'
    )
    api.set_window(window)

    def on_maximized():
        try:
            window.evaluate_js("document.body.classList.add('is-maximized'); var el = document.getElementById('win-max-icon'); if (el) el.innerText = 'filter_none';")
        except Exception:
            pass

    def on_restored():
        try:
            window.evaluate_js("document.body.classList.remove('is-maximized'); var el = document.getElementById('win-max-icon'); if (el) el.innerText = 'crop_square';")
        except Exception:
            pass

    window.events.maximized += on_maximized
    window.events.restored += on_restored

    webview.start(gui='edgechromium', private_mode=False, storage_path=wv_data_dir)

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
    try:
        launch_pywebview(url)
        return
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Cord Player] pywebview failed ({e}), falling back to browser window...")

    cmd = get_browser_command(url)
    if cmd:
        try:
            subprocess.run(cmd)
            return
        except Exception:
            pass
    webbrowser.open(url)

def main():
    mutex = acquire_single_instance_lock()
    if mutex is None:
        sys.exit(0)

    if not is_port_in_use(PORT):
        server_thread = threading.Thread(target=start_server, daemon=True)
        server_thread.start()
        time.sleep(0.8)

    launch_window()
    os._exit(0)

if __name__ == "__main__":
    main()
