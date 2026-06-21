import importlib.util
import json
import pathlib
import tempfile
import textwrap
import unittest

import yaml

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "template" / ".agents" / "skills" / "biographer-skill" / "tools" / "build_memoir_api.py"

spec = importlib.util.spec_from_file_location("build_memoir_api", MODULE_PATH)
build_memoir_api = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(build_memoir_api)


class BuildMemoirApiTests(unittest.TestCase):
    def setUp(self):
        self.original_workspace_dir = build_memoir_api.WORKSPACE_DIR
        self.original_memoirs_dir = build_memoir_api.MEMOIRS_DIR
        self.original_periods_dir = build_memoir_api.PERIODS_DIR
        self.original_public_dir = build_memoir_api.WEBAPP_PUBLIC_DIR
        self.original_alias_registry = build_memoir_api.ALIAS_REGISTRY
        self.original_time_report_filename = build_memoir_api.TIME_RESOLUTION_REPORT_FILENAME

    def tearDown(self):
        build_memoir_api.WORKSPACE_DIR = self.original_workspace_dir
        build_memoir_api.MEMOIRS_DIR = self.original_memoirs_dir
        build_memoir_api.PERIODS_DIR = self.original_periods_dir
        build_memoir_api.WEBAPP_PUBLIC_DIR = self.original_public_dir
        build_memoir_api.ALIAS_REGISTRY = self.original_alias_registry
        build_memoir_api.TIME_RESOLUTION_REPORT_FILENAME = self.original_time_report_filename

    def configure_workspace(self, root: pathlib.Path):
        memoirs_dir = root / "memoirs"
        periods_dir = memoirs_dir / "periods" / "US_PhD"
        raw_notes_dir = periods_dir / "raw_notes"
        public_dir = memoirs_dir / "webapp" / "public"
        raw_notes_dir.mkdir(parents=True)
        public_dir.mkdir(parents=True)

        build_memoir_api.WORKSPACE_DIR = str(root)
        build_memoir_api.MEMOIRS_DIR = str(memoirs_dir)
        build_memoir_api.PERIODS_DIR = str(memoirs_dir / "periods")
        build_memoir_api.WEBAPP_PUBLIC_DIR = str(public_dir)
        build_memoir_api.ALIAS_REGISTRY = str(memoirs_dir / "entities.yaml")

        return memoirs_dir, periods_dir, raw_notes_dir, public_dir

    def write_fixture(self, periods_dir: pathlib.Path, raw_notes_dir: pathlib.Path, frontmatter: str):
        (periods_dir / "timeline.yaml").write_text(textwrap.dedent("""\
            period: US_PhD
            entries:
              - date: "2024-09"
                event: "Test Event"
                summary: "summary"
                related_files: ["raw_notes/test.md"]
        """), encoding="utf-8")
        (raw_notes_dir / "test.md").write_text(frontmatter, encoding="utf-8")

    def write_timeline(self, periods_dir: pathlib.Path, timeline: str):
        (periods_dir / "timeline.yaml").write_text(textwrap.dedent(timeline), encoding="utf-8")

    def test_build_api_updates_memoirs_entities_yaml(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, _ = self.configure_workspace(root)
            (root / "entities.yaml").write_text("people:\nplaces:\n", encoding="utf-8")
            (memoirs_dir / "entities.yaml").write_text("people:\nplaces:\n", encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-09"
                    people: ["Alice"]
                    places: ["Lexington Crossing"]
                    ---
                    body
                """),
            )

            build_memoir_api.build_api()

            memoirs_registry = (memoirs_dir / "entities.yaml").read_text(encoding="utf-8")
            root_registry = (root / "entities.yaml").read_text(encoding="utf-8")

            self.assertIn("Alice", memoirs_registry)
            self.assertIn("Lexington Crossing", memoirs_registry)
            self.assertNotIn("Alice", root_registry)
            self.assertNotIn("Lexington Crossing", root_registry)

    def test_build_api_quotes_auto_added_place_metadata_as_strings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, _ = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text("people:\nplaces:\n", encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-09"
                    people: []
                    places: ["null·yes"]
                    ---
                    body
                """),
            )

            build_memoir_api.build_api()

            content = (memoirs_dir / "entities.yaml").read_text(encoding="utf-8")
            parsed = yaml.safe_load(content)

            self.assertEqual(parsed["places"]["null·yes"]["display"], "yes")
            self.assertEqual(parsed["places"]["null·yes"]["parent"], "null")

    def test_build_api_resolves_child_place_alias_case_insensitively_without_duplicate_place(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)

            (memoirs_dir / "entities.yaml").write_text(textwrap.dedent("""\
                people: {}
                places:
                  佛罗里达大学:
                    aliases: []
                  佛罗里达大学·通勤停车场:
                    display: 通勤停车场
                    parent: 佛罗里达大学
                    aliases:
                      - commuter lot
            """), encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-08-15"
                    people: []
                    places: ["佛罗里达大学·Commuter lot"]
                    ---
                    body
                """),
            )

            build_memoir_api.build_api()

            registry = yaml.safe_load((memoirs_dir / "entities.yaml").read_text(encoding="utf-8"))
            manifest = yaml.safe_load((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            places_index = manifest["places_index"]

            self.assertIn("佛罗里达大学·通勤停车场", registry["places"])
            self.assertNotIn("佛罗里达大学·Commuter lot", registry["places"])
            self.assertIn("佛罗里达大学·通勤停车场", places_index)
            self.assertNotIn("佛罗里达大学·Commuter lot", places_index)

    def test_build_api_resolves_child_place_with_parent_alias_and_unicode_separator(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)

            (memoirs_dir / "entities.yaml").write_text(textwrap.dedent("""\
                people: {}
                places:
                  佛罗里达大学:
                    display: 佛罗里达大学
                    aliases: [UF, University of Florida]
                  佛罗里达大学·通勤停车场:
                    display: 通勤停车场
                    parent: 佛罗里达大学
                    aliases: [commuter lot]
            """), encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-08-15"
                    people: []
                    places: ["UF／Commuter Lot"]
                    ---
                    body
                """),
            )

            build_memoir_api.build_api()

            registry = yaml.safe_load((memoirs_dir / "entities.yaml").read_text(encoding="utf-8"))
            manifest = yaml.safe_load((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))

            self.assertIn("佛罗里达大学·通勤停车场", manifest["places_index"])
            self.assertNotIn("UF／Commuter Lot", manifest["places_index"])
            self.assertNotIn("UF／Commuter Lot", registry["places"])

    def test_build_api_reports_ambiguous_place_alias_without_auto_adding_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)

            (memoirs_dir / "entities.yaml").write_text(textwrap.dedent("""\
                people: {}
                places:
                  A大学:
                    aliases: [A]
                  A大学·图书馆:
                    display: 图书馆
                    parent: A大学
                    aliases: [library]
                  B大学:
                    aliases: [B]
                  B大学·图书馆:
                    display: 图书馆
                    parent: B大学
                    aliases: [library]
            """), encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-09"
                    people: []
                    places: ["library"]
                    ---
                    body
                """),
            )

            build_memoir_api.build_api()

            registry = yaml.safe_load((memoirs_dir / "entities.yaml").read_text(encoding="utf-8"))
            manifest = yaml.safe_load((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            report = json.loads((memoirs_dir / ".entity_resolution_report.json").read_text(encoding="utf-8"))

            self.assertNotIn("library", registry["places"])
            self.assertNotIn("library", manifest["places_index"])
            self.assertEqual(report["ambiguous_places"][0]["value"], "library")
            self.assertEqual(report["ambiguous_places"][0]["candidates"], ["A大学·图书馆", "B大学·图书馆"])

    def test_build_api_rewrites_chapter_asset_paths_and_copies_files_to_public_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text("people:\nplaces:\n", encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-09"
                    people: []
                    places: []
                    ---
                    body
                """),
            )

            assets_dir = periods_dir / "assets"
            assets_dir.mkdir()
            (assets_dir / "banner.jpg").write_bytes(b"chapter-image")

            chapters_dir = periods_dir / "chapters"
            chapters_dir.mkdir()
            (chapters_dir / "2024-09-lexington.md").write_text(
                "# Title\n\n![Bird view](../assets/banner.jpg)\n",
                encoding="utf-8",
            )

            build_memoir_api.build_api()

            manifest = yaml.safe_load((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            chapter = manifest["memoirs"]["US_PhD"]["chapters"][0]
            chapter_markdown = (public_dir / "chapters" / "US_PhD" / "2024-09-lexington.md").read_text(encoding="utf-8")

            copied_asset = public_dir / "assets" / "US_PhD" / "banner.jpg"
            self.assertTrue(copied_asset.exists())
            self.assertEqual(copied_asset.read_bytes(), b"chapter-image")
            self.assertEqual(chapter["path"], "/chapters/US_PhD/2024-09-lexington.md")
            self.assertIn("![Bird view](/assets/US_PhD/banner.jpg)", chapter_markdown)

    def test_build_api_compacts_entity_indexes_and_graph_event_nodes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text("people:\nplaces:\n", encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-09"
                    people: ["Alice"]
                    places: ["Lexington Crossing"]
                    ---
                    body
                """),
            )

            build_memoir_api.build_api()

            manifest = json.loads((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            expected_ref = "US_PhD|2024-09|Test Event"

            self.assertEqual(manifest["people_index"]["Alice"], [expected_ref])
            self.assertEqual(manifest["places_index"]["Lexington Crossing"], [expected_ref])

            event_nodes = [node for node in manifest["graph"]["nodes"] if node.get("group") == 2]
            self.assertEqual(len(event_nodes), 1)
            self.assertEqual(event_nodes[0]["id"], f"event:{expected_ref}")
            self.assertEqual(event_nodes[0]["event_ref"], expected_ref)
            self.assertEqual(event_nodes[0]["name"], "Test Event")
            self.assertNotIn("entry", event_nodes[0])
            self.assertNotIn("period", event_nodes[0])

    def test_build_api_graph_uses_typed_node_ids_and_link_types(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text(textwrap.dedent("""\
                people:
                  Lexington Crossing:
                    aliases: []
                places:
                  Lexington Crossing:
                    aliases: []
            """), encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-09"
                    people: ["Lexington Crossing"]
                    places: ["Lexington Crossing"]
                    ---
                    body
                """),
            )

            build_memoir_api.build_api()

            manifest = json.loads((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            node_ids = {node["id"] for node in manifest["graph"]["nodes"]}
            links = {(link["source"], link["target"], link["type"]) for link in manifest["graph"]["links"]}
            event_ref = "US_PhD|2024-09|Test Event"

            self.assertIn(f"event:{event_ref}", node_ids)
            self.assertIn("person:Lexington Crossing", node_ids)
            self.assertIn("place:Lexington Crossing", node_ids)
            self.assertIn(("person:Lexington Crossing", f"event:{event_ref}", "mentions_person"), links)
            self.assertIn(("place:Lexington Crossing", f"event:{event_ref}", "occurred_at"), links)

    def test_build_api_graph_keeps_child_place_node_and_parent_rollup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text(textwrap.dedent("""\
                people: {}
                places:
                  佛罗里达大学:
                    aliases: [UF]
                  佛罗里达大学·通勤停车场:
                    display: 通勤停车场
                    parent: 佛罗里达大学
                    aliases: [commuter lot]
            """), encoding="utf-8")

            self.write_fixture(
                periods_dir,
                raw_notes_dir,
                textwrap.dedent("""\
                    ---
                    date: "2024-08-15"
                    people: []
                    places: ["UF commuter lot"]
                    ---
                    body
                """),
            )

            build_memoir_api.build_api()

            manifest = json.loads((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            event_ref = "US_PhD|2024-09|Test Event"
            node_ids = {node["id"] for node in manifest["graph"]["nodes"]}
            links = {(link["source"], link["target"], link["type"]) for link in manifest["graph"]["links"]}

            self.assertIn("place:佛罗里达大学", node_ids)
            self.assertIn("place:佛罗里达大学·通勤停车场", node_ids)
            self.assertIn(("place:佛罗里达大学", "place:佛罗里达大学·通勤停车场", "contains"), links)
            self.assertIn(("place:佛罗里达大学·通勤停车场", f"event:{event_ref}", "occurred_at"), links)
            self.assertEqual(manifest["places_index"]["佛罗里达大学"], [event_ref])
            self.assertEqual(manifest["places_index"]["佛罗里达大学·通勤停车场"], [event_ref])

    def test_build_api_reports_missing_raw_note_and_invalid_entity_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text("people: {}\nplaces: {}\n", encoding="utf-8")
            self.write_timeline(periods_dir, """\
                period: US_PhD
                entries:
                  - date: "2024-09"
                    event: "Missing Raw Note"
                    summary: "missing"
                    related_files: ["raw_notes/missing.md"]
                  - date: "2024-10"
                    event: "Malformed Entities"
                    summary: "malformed"
                    related_files: ["raw_notes/malformed.md"]
            """)
            (raw_notes_dir / "malformed.md").write_text(textwrap.dedent("""\
                ---
                date: "2024-10"
                people: "Alice"
                places:
                  name: "Lexington Crossing"
                ---
                body
            """), encoding="utf-8")

            build_memoir_api.build_api()

            report = json.loads((memoirs_dir / ".entity_resolution_report.json").read_text(encoding="utf-8"))
            manifest = json.loads((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            node_ids = {node["id"] for node in manifest["graph"]["nodes"]}

            self.assertEqual(report["missing_raw_notes"][0]["file"], "raw_notes/missing.md")
            self.assertEqual(report["invalid_entity_fields"][0]["field"], "people")
            self.assertEqual(report["invalid_entity_fields"][1]["field"], "places")
            self.assertNotIn("person:A", node_ids)

    def test_build_api_prefers_stable_timeline_id_for_event_ref(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text("people: {}\nplaces: {}\n", encoding="utf-8")
            self.write_timeline(periods_dir, """\
                period: US_PhD
                entries:
                  - id: walmart_visit
                    date: "2024-09"
                    event: "Original Event Title"
                    summary: "summary"
                    related_files: ["raw_notes/test.md"]
            """)
            (raw_notes_dir / "test.md").write_text(textwrap.dedent("""\
                ---
                people: []
                places: ["Lexington Crossing"]
                ---
                body
            """), encoding="utf-8")

            build_memoir_api.build_api()

            manifest = json.loads((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            event_ref = "US_PhD|walmart_visit"
            self.assertEqual(manifest["places_index"]["Lexington Crossing"], [event_ref])
            self.assertIn(
                f"event:{event_ref}",
                {node["id"] for node in manifest["graph"]["nodes"]},
            )

    def test_build_api_adds_normalized_time_metadata_for_fuzzy_dates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text("people: {}\nplaces: {}\n", encoding="utf-8")
            self.write_timeline(periods_dir, """\
                period: US_PhD
                entries:
                  - id: first_semester
                    date: "2024-Q3"
                    event: "First Semester"
                    summary: "summary"
                    related_files: ["raw_notes/test.md"]
            """)
            (raw_notes_dir / "test.md").write_text(textwrap.dedent("""\
                ---
                people: []
                places: []
                ---
                body
            """), encoding="utf-8")

            build_memoir_api.build_api()

            manifest = json.loads((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            entry = manifest["memoirs"]["US_PhD"]["timeline"]["entries"][0]

            self.assertEqual(entry["date"], "2024-Q3")
            self.assertEqual(entry["time"]["value"], "2024-Q3")
            self.assertEqual(entry["time"]["precision"], "quarter")
            self.assertEqual(entry["time"]["start"], "2024-07-01")
            self.assertEqual(entry["time"]["end"], "2024-09-30")
            self.assertEqual(entry["time"]["sort"], "2024-07-01")

    def test_build_api_reports_invalid_time_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir, raw_notes_dir, public_dir = self.configure_workspace(root)
            (memoirs_dir / "entities.yaml").write_text("people: {}\nplaces: {}\n", encoding="utf-8")
            self.write_timeline(periods_dir, """\
                period: US_PhD
                entries:
                  - date: "9月"
                    event: "Bare Month"
                    summary: "summary"
                    related_files: ["raw_notes/test.md"]
            """)
            (raw_notes_dir / "test.md").write_text(textwrap.dedent("""\
                ---
                people: []
                places: []
                ---
                body
            """), encoding="utf-8")

            build_memoir_api.build_api()

            manifest = json.loads((public_dir / "memoirs.manifest.json").read_text(encoding="utf-8"))
            report = json.loads((memoirs_dir / ".time_resolution_report.json").read_text(encoding="utf-8"))
            entry = manifest["memoirs"]["US_PhD"]["timeline"]["entries"][0]

            self.assertNotIn("time", entry)
            self.assertEqual(report["unresolved_times"][0]["status"], "ambiguous")
            self.assertEqual(report["unresolved_times"][0]["value"], "9月")
            self.assertEqual(report["unresolved_times"][0]["event_ref"], "US_PhD|9月|Bare Month")


if __name__ == "__main__":
    unittest.main()
