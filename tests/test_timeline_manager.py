import functools
import http.server
import importlib.util
import contextlib
import io
import pathlib
import socketserver
import tempfile
import threading
import unittest

import yaml

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "template" / ".agents" / "skills" / "biographer-skill" / "tools" / "timeline_manager.py"

spec = importlib.util.spec_from_file_location("timeline_manager", MODULE_PATH)
timeline_manager = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(timeline_manager)


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True


class TimelineManagerRemoteImageTests(unittest.TestCase):
    def test_safe_append_to_timeline_uses_file_slug_as_stable_event_id(self):
        with tempfile.TemporaryDirectory() as workspace_dir:
            original_periods_dir = timeline_manager.PERIODS_DIR
            timeline_manager.PERIODS_DIR = str(pathlib.Path(workspace_dir) / "memoirs" / "periods")

            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    ok = timeline_manager.safe_append_to_timeline(
                        period="US_PhD",
                        date="2024-Q3",
                        event="Original Title",
                        summary="Summary",
                        file_slug="2024_q3_first_semester",
                    )

                self.assertTrue(ok)
                timeline_path = pathlib.Path(timeline_manager.PERIODS_DIR) / "US_PhD" / "timeline.yaml"
                content = timeline_path.read_text(encoding="utf-8")
                self.assertIn('id: "2024_q3_first_semester"', content)
                self.assertIn('event: "Original Title"', content)
            finally:
                timeline_manager.PERIODS_DIR = original_periods_dir

    def test_safe_append_to_timeline_rejects_duplicate_event_id(self):
        with tempfile.TemporaryDirectory() as workspace_dir:
            original_periods_dir = timeline_manager.PERIODS_DIR
            timeline_manager.PERIODS_DIR = str(pathlib.Path(workspace_dir) / "memoirs" / "periods")

            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    first_ok = timeline_manager.safe_append_to_timeline(
                        period="US_PhD",
                        date="2024-Q3",
                        event="Original Title",
                        summary="Summary",
                        file_slug="2024_q3_first_semester",
                    )
                    second_ok = timeline_manager.safe_append_to_timeline(
                        period="US_PhD",
                        date="2024-Q4",
                        event="Renamed Title",
                        summary="Different Summary",
                        file_slug="2024_q3_first_semester",
                    )

                timeline_path = pathlib.Path(timeline_manager.PERIODS_DIR) / "US_PhD" / "timeline.yaml"
                content = timeline_path.read_text(encoding="utf-8")
                self.assertTrue(first_ok)
                self.assertFalse(second_ok)
                self.assertEqual(content.count('id: "2024_q3_first_semester"'), 1)
                self.assertNotIn('event: "Renamed Title"', content)
            finally:
                timeline_manager.PERIODS_DIR = original_periods_dir

    def test_build_asset_filename_sanitizes_fuzzy_date_for_filesystem(self):
        self.assertEqual(
            timeline_manager.build_asset_filename("约2024年第三季度", "banner photo.jpg"),
            "2024_Q3_banner photo.jpg",
        )

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


class TimelineManagerWriteSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_periods_dir = timeline_manager.PERIODS_DIR
        timeline_manager.PERIODS_DIR = str(pathlib.Path(self.temp_dir.name) / "memoirs" / "periods")

    def tearDown(self):
        timeline_manager.PERIODS_DIR = self.original_periods_dir
        self.temp_dir.cleanup()

    def test_append_round_trips_quotes_and_newlines(self):
        event = '他说"你好"，然后走了'
        summary = "line one\nline two"

        with contextlib.redirect_stdout(io.StringIO()):
            ok = timeline_manager.safe_append_to_timeline(
                period="US_PhD",
                date="2024-09",
                event=event,
                summary=summary,
                file_slug="2024_09_quotes",
            )

        self.assertTrue(ok)
        timeline_path = pathlib.Path(timeline_manager.PERIODS_DIR) / "US_PhD" / "timeline.yaml"
        document = yaml.safe_load(timeline_path.read_text(encoding="utf-8"))
        entry = document["entries"][0]
        self.assertEqual(entry["id"], "2024_09_quotes")
        self.assertEqual(entry["event"], event)
        self.assertEqual(entry["summary"], summary)

    def test_append_refuses_to_touch_a_malformed_timeline(self):
        period_dir = pathlib.Path(timeline_manager.PERIODS_DIR) / "US_PhD"
        period_dir.mkdir(parents=True)
        timeline_path = period_dir / "timeline.yaml"
        broken = 'period: US_PhD\nentries:\n  - id: "a"\n    date: "2024-09\n'
        timeline_path.write_text(broken, encoding="utf-8")

        with contextlib.redirect_stdout(io.StringIO()):
            ok = timeline_manager.safe_append_to_timeline(
                period="US_PhD",
                date="2024-10",
                event="New",
                summary="New",
                file_slug="2024_10_new",
            )

        self.assertFalse(ok)
        self.assertEqual(timeline_path.read_text(encoding="utf-8"), broken)


class TimelineManagerCorrectionTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_periods_dir = timeline_manager.PERIODS_DIR
        timeline_manager.PERIODS_DIR = str(pathlib.Path(self.temp_dir.name) / "memoirs" / "periods")
        period_dir = pathlib.Path(timeline_manager.PERIODS_DIR) / "US_PhD"
        period_dir.mkdir(parents=True)
        self.timeline_path = period_dir / "timeline.yaml"
        self.timeline_path.write_text(
            "period: US_PhD\n"
            "entries:\n"
            '  - id: "first"\n'
            '    date: "2024-09-01"\n'
            '    event: "First Event"\n'
            '    summary: "first summary"\n'
            '    related_files: ["raw_notes/first.md"]\n'
            '  - id: "second"\n'
            '    date: "2024-09-01"\n'
            '    event: "Second Event"\n'
            '    summary: "second summary"\n'
            '    related_files: ["raw_notes/second.md"]\n',
            encoding="utf-8",
        )

    def tearDown(self):
        timeline_manager.PERIODS_DIR = self.original_periods_dir
        self.temp_dir.cleanup()

    def test_correct_by_id_updates_event_summary_and_date(self):
        with contextlib.redirect_stdout(io.StringIO()):
            ok = timeline_manager.correct_timeline(
                period="US_PhD",
                entry_id="second",
                new_event='Renamed "quoted"',
                new_summary="updated\nsummary",
                new_date="2024-10",
            )

        self.assertTrue(ok)
        document = yaml.safe_load(self.timeline_path.read_text(encoding="utf-8"))
        self.assertEqual(document["entries"][0]["event"], "First Event")
        updated = document["entries"][1]
        self.assertEqual(updated["event"], 'Renamed "quoted"')
        self.assertEqual(updated["summary"], "updated\nsummary")
        self.assertEqual(updated["date"], "2024-10")

    def test_correct_by_date_rejects_ambiguous_match(self):
        with contextlib.redirect_stdout(io.StringIO()):
            ok = timeline_manager.correct_timeline(
                period="US_PhD", date="2024-09-01", new_summary="nope"
            )

        self.assertFalse(ok)
        document = yaml.safe_load(self.timeline_path.read_text(encoding="utf-8"))
        self.assertEqual(document["entries"][0]["summary"], "first summary")
        self.assertEqual(document["entries"][1]["summary"], "second summary")

    def test_correct_by_unique_date_succeeds(self):
        self.timeline_path.write_text(
            "period: US_PhD\n"
            "entries:\n"
            '  - id: "first"\n'
            '    date: "2024-09-01"\n'
            '    event: "First Event"\n'
            '    summary: "first summary"\n'
            '  - id: "second"\n'
            '    date: "2024-09-02"\n'
            '    event: "Second Event"\n'
            '    summary: "second summary"\n',
            encoding="utf-8",
        )

        with contextlib.redirect_stdout(io.StringIO()):
            ok = timeline_manager.correct_timeline(
                period="US_PhD", date="2024-09-02", new_summary="unique now"
            )

        self.assertTrue(ok)
        document = yaml.safe_load(self.timeline_path.read_text(encoding="utf-8"))
        self.assertEqual(document["entries"][0]["summary"], "first summary")
        self.assertEqual(document["entries"][1]["summary"], "unique now")


class TimelineManagerAssetDedupTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp_dir.name)
        self.assets_dir = self.root / "assets"
        self.assets_dir.mkdir(parents=True)
        self.source_dir = self.root / "source"
        self.source_dir.mkdir(parents=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_identical_content_reuses_the_same_asset(self):
        first = self.source_dir / "photo.png"
        first.write_bytes(b"same-bytes")
        second_dir = self.source_dir / "copy"
        second_dir.mkdir()
        second = second_dir / "photo.png"
        second.write_bytes(b"same-bytes")

        first_path = timeline_manager.copy_markdown_asset(str(first), "2024-09", str(self.assets_dir))
        second_path = timeline_manager.copy_markdown_asset(str(second), "2024-09", str(self.assets_dir))

        self.assertEqual(first_path, second_path)
        self.assertEqual(len(list(self.assets_dir.glob("*.png"))), 1)

    def test_different_content_with_same_name_gets_hash_suffix(self):
        first = self.source_dir / "photo.png"
        first.write_bytes(b"first-bytes")
        second_dir = self.source_dir / "other"
        second_dir.mkdir()
        second = second_dir / "photo.png"
        second.write_bytes(b"second-bytes")

        first_path = timeline_manager.copy_markdown_asset(str(first), "2024-09", str(self.assets_dir))
        second_path = timeline_manager.copy_markdown_asset(str(second), "2024-09", str(self.assets_dir))

        self.assertNotEqual(first_path, second_path)
        self.assertEqual(len(list(self.assets_dir.glob("*.png"))), 2)
        self.assertEqual(
            (self.assets_dir / pathlib.Path(second_path).name).read_bytes(), b"second-bytes"
        )


if __name__ == "__main__":
    unittest.main()