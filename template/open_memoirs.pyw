"""
open_memoirs.pyw  —  双击打开回忆录阅读器（无控制台窗口）

职责：纯浏览，不负责构建。
  - 启动本地静态服务器（服务 dist/ 目录）
  - 打开无边框原生窗口

数据更新流程（由用户手动执行）：
  python .agents/skills/biographer-skill/tools/build_memoir_api.py
  然后重新打开 app 或在窗口内按 F5 刷新即可。
"""

import os, sys, threading, http.server, webbrowser, time
from socketserver import ThreadingMixIn

# ── 路径配置 ──────────────────────────────────────────────────────────────────
HERE     = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(HERE, "memoirs", "webapp", "dist")
ICON_PATH = os.path.join(DIST_DIR, "icon.ico")
PORT     = 8787
_window  = None

# ── 多线程 HTTP 服务器 ─────────────────────────────────────────────────────────
class SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

class ThreadedHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def start_server():
    os.chdir(DIST_DIR)
    ThreadedHTTPServer(("localhost", PORT), SilentHandler).serve_forever()

threading.Thread(target=start_server, daemon=True).start()
time.sleep(0.25)

# ── 打开原生窗口 ───────────────────────────────────────────────────────────────
try:
    import webview

    class WindowApi:
        def __init__(self):        self._maximized = False
        def minimize(self):        _window.minimize()
        def toggle_maximize(self):
            if self._maximized: _window.restore();  self._maximized = False
            else:               _window.maximize(); self._maximized = True
        def close(self):           _window.destroy()

    _window = webview.create_window(
        title     = "我的回忆录",
        url       = f"http://localhost:{PORT}",
        width     = 1200,
        height    = 820,
        resizable = True,
        min_size  = (800, 600),
        frameless = True,
        js_api    = WindowApi(),
    )

    webview.start(icon=ICON_PATH if os.path.exists(ICON_PATH) else None)

except ImportError:
    webbrowser.open(f"http://localhost:{PORT}")
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        pass
