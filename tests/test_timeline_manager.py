import functools
import http.server
import importlib.util
import pathlib
import socketserver
import tempfile
import threading
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "template" / ".agents" / "skills" / "biographer-skill" / "tools" / "timeline_manager.py"

spec = importlib.util.spec_from_file_location("timeline_manager", MODULE_PATH)
timeline_manager = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(timeline_manager)


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True


class TimelineManagerRemoteImageTests(unittest.TestCase):
    def test_generate_raw_note_downloads_remote_markdown_image_to_assets(self):
        with tempfile.TemporaryDirectory() as workspace_dir, tempfile.TemporaryDirectory() as served_dir:
            original_periods_dir = timeline_manager.PERIODS_DIR
            timeline_manager.PERIODS_DIR = str(pathlib.Path(workspace_dir) / "memoirs" / "periods")

            try:
                image_path = pathlib.Path(served_dir) / "banner.jpg"
                image_path.write_bytes(b"fake-image-bytes")

                handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=served_dir)
                with ThreadedTCPServer(("127.0.0.1", 0), handler) as server:
                    thread = threading.Thread(target=server.serve_forever, daemon=True)
                    thread.start()

                    remote_url = f"http://127.0.0.1:{server.server_address[1]}/banner.jpg"
                    raw_input = f"Look at this image: ![Bird view]({remote_url})"

                    timeline_manager.generate_raw_note(
                        period="US_PhD",
                        file_slug="2024_09_lexington_crossing",
                        date="2024-09",
                        people="",
                        places="",
                        context_text="Context",
                        conflict_text="Conflict",
                        reflection_text="Reflection",
                        raw_input=raw_input,
                    )

                    server.shutdown()
                    thread.join(timeout=5)

                note_path = pathlib.Path(timeline_manager.PERIODS_DIR) / "US_PhD" / "raw_notes" / "2024_09_lexington_crossing.md"
                note_content = note_path.read_text(encoding="utf-8")
                asset_path = pathlib.Path(timeline_manager.PERIODS_DIR) / "US_PhD" / "assets" / "2024-09_banner.jpg"

                self.assertTrue(asset_path.exists())
                self.assertEqual(asset_path.read_bytes(), b"fake-image-bytes")
                self.assertIn("![Bird view](../assets/2024-09_banner.jpg)", note_content)
            finally:
                timeline_manager.PERIODS_DIR = original_periods_dir


if __name__ == "__main__":
    unittest.main()
