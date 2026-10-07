"""
open_memoirs.pyw  —  双击打开回忆录阅读器（无控制台窗口）

职责：纯浏览 + 单源数据路由。
  - 启动本地静态服务器（app shell 来自 dist/）
  - /memoirs.manifest.json → memoirs/.cache/memoirs.manifest.json（派生缓存）
  - /media/<period>/<file> → memoirs/periods/<period>/assets/<file>（零复制）
  - 启动前做 mtime 过期检查，必要时自动重建 manifest
  - 动态端口，避免固定端口冲突；启动失败弹独立错误窗口
"""

import contextlib
import functools
import http.server
import importlib.util
import io
import os
import socket
import sys
import threading
import time
import traceback
from socketserver import ThreadingMixIn
from urllib.parse import unquote, urlparse

# ── 路径配置 ──────────────────────────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
MEMOIRS_DIR = os.path.join(HERE, "memoirs")
PERIODS_DIR = os.path.join(MEMOIRS_DIR, "periods")
DIST_DIR = os.path.join(MEMOIRS_DIR, "webapp", "dist")
CACHE_MANIFEST = os.path.join(MEMOIRS_DIR, ".cache", "memoirs.manifest.json")
BUILD_SCRIPT = os.path.join(
    HERE, ".agents", "skills", "biographer-skill", "tools", "build_memoir_api.py"
)
ICON_PATH = os.path.join(DIST_DIR, "icon.ico")

SOURCE_SUFFIXES = (".md", ".yaml", ".yml")
MISSING_PLACEHOLDER = os.path.join(DIST_DIR, "__memoir_missing__")
_window = None

# ── 数据新鲜度 + 自动重建 ─────────────────────────────────────────────────────
def latest_source_mtime():
    newest = 0.0
    if not os.path.isdir(PERIODS_DIR):
        return newest
    for root_dir, _dirs, files in os.walk(PERIODS_DIR):
        for name in files:
            if not name.lower().endswith(SOURCE_SUFFIXES):
                continue
            try:
                newest = max(newest, os.path.getmtime(os.path.join(root_dir, name)))
            except OSError:
                continue
    return newest


def manifest_is_stale():
    if not os.path.exists(CACHE_MANIFEST):
        return True
    try:
        manifest_mtime = os.path.getmtime(CACHE_MANIFEST)
    except OSError:
        return True
    return latest_source_mtime() > manifest_mtime


def run_build():
    """Import and run the compiler in-process; raises SystemExit on invalid input."""
    spec = importlib.util.spec_from_file_location("memoir_build_api", BUILD_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load build script: {BUILD_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.build_api()


def ensure_manifest():
    """Rebuild the derived manifest when missing or older than the source data."""
    if os.environ.get("MEMOIR_NO_AUTO_BUILD") == "1":
        return
    if not manifest_is_stale():
        return
    run_build()


# ── 静态服务器 + 路由 ─────────────────────────────────────────────────────────
class MemoirRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def translate_path(self, path):
        path_only = urlparse(path).path
        if path_only == "/memoirs.manifest.json":
            return CACHE_MANIFEST
        if path_only.startswith("/media/"):
            return self._resolve_media_path(path_only)
        return super().translate_path(path)

    def _resolve_media_path(self, path_only):
        """Map /media/<period>/<file> onto periods/<period>/assets/<file> with traversal guards."""
        remainder = unquote(path_only[len("/media/"):])
        parts = remainder.split("/")
        if len(parts) != 2:
            return MISSING_PLACEHOLDER
        period, filename = parts
        for value in (period, filename):
            if (
                not value
                or value in (".", "..")
                or "/" in value
                or "\\" in value
                or os.path.isabs(value)
            ):
                return MISSING_PLACEHOLDER
        assets_root = os.path.abspath(os.path.join(PERIODS_DIR, period, "assets"))
        candidate = os.path.abspath(os.path.join(assets_root, filename))
        try:
            if os.path.commonpath([candidate, assets_root]) != assets_root:
                return MISSING_PLACEHOLDER
        except ValueError:
            return MISSING_PLACEHOLDER
        return candidate


class ThreadedHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def start_server():
    handler = functools.partial(MemoirRequestHandler, directory=DIST_DIR)
    server = ThreadedHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, port


def wait_until_ready(port, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                return True
        except OSError:
            time.sleep(0.05)
    return False


# ── 错误窗口 ──────────────────────────────────────────────────────────────────
def error_html(message):
    escaped = (
        str(message)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return f"""<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>回忆录启动失败</title></head>
<body style="font-family: system-ui, sans-serif; padding: 32px; color: #333;">
  <h1 style="font-size: 20px;">回忆录启动失败</h1>
  <pre style="white-space: pre-wrap; background: #f6f6f6; padding: 16px; border-radius: 8px;">{escaped}</pre>
</body>
</html>"""


def show_error(message):
    try:
        import webview

        webview.create_window(
            title="我的回忆录 — 启动失败",
            html=error_html(message),
            width=760,
            height=520,
        )
        webview.start()
    except Exception:
        traceback.print_exc()
    raise SystemExit(1)


# ── 主入口 ────────────────────────────────────────────────────────────────────
def main():
    if not os.path.isdir(DIST_DIR):
        show_error(
            f"未找到应用资源目录：{DIST_DIR}\n请先运行：memoir sync"
        )

    if manifest_is_stale() and os.environ.get("MEMOIR_NO_AUTO_BUILD") != "1":
        build_output = io.StringIO()
        try:
            with contextlib.redirect_stdout(build_output):
                run_build()
        except SystemExit as error:
            show_error(
                "数据编译失败，已在 memoirs/.cache 中保留上一次结果。\n\n"
                + build_output.getvalue()
                + f"\nexit code: {error.code}"
            )
        except Exception:
            show_error(traceback.format_exc())

    _server, port = start_server()
    if not wait_until_ready(port):
        show_error(f"本地服务器启动超时（端口 {port}）。")

    url = f"http://127.0.0.1:{port}"

    try:
        import webview

        class WindowApi:
            def __init__(self):
                self._maximized = False

            def minimize(self):
                _window.minimize()

            def toggle_maximize(self):
                if self._maximized:
                    _window.restore()
                    self._maximized = False
                else:
                    _window.maximize()
                    self._maximized = True

            def close(self):
                _window.destroy()

        global _window
        _window = webview.create_window(
            title="我的回忆录",
            url=url,
            width=1200,
            height=820,
            resizable=True,
            min_size=(800, 600),
            frameless=True,
            js_api=WindowApi(),
        )
        webview.start(icon=ICON_PATH if os.path.exists(ICON_PATH) else None)
    except ImportError:
        import webbrowser

        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
