import importlib.util
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

    def tearDown(self):
        build_memoir_api.WORKSPACE_DIR = self.original_workspace_dir
        build_memoir_api.MEMOIRS_DIR = self.original_memoirs_dir
        build_memoir_api.PERIODS_DIR = self.original_periods_dir
        build_memoir_api.WEBAPP_PUBLIC_DIR = self.original_public_dir
        build_memoir_api.ALIAS_REGISTRY = self.original_alias_registry

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


if __name__ == "__main__":
    unittest.main()
