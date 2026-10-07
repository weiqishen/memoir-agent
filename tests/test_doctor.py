import importlib.util
import os
import pathlib
import tempfile
import unittest

MODULE_PATH = (
    pathlib.Path(__file__).resolve().parents[1]
    / "template"
    / ".agents"
    / "skills"
    / "biographer-skill"
    / "tools"
    / "doctor.py"
)

spec = importlib.util.spec_from_file_location("memoir_doctor", MODULE_PATH)
doctor = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(doctor)


def write(path: pathlib.Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class DoctorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.memoirs = self.root / "memoirs"
        (self.memoirs / "periods" / "US_PhD" / "raw_notes").mkdir(parents=True)
        (self.memoirs / "webapp" / "public").mkdir(parents=True)
        (self.memoirs / "webapp" / "dist").mkdir(parents=True)

        self.overrides = {
            "MEMOIRS_DIR": str(self.memoirs),
            "PERIODS_DIR": str(self.memoirs / "periods"),
            "PUBLIC_DIR": str(self.memoirs / "webapp" / "public"),
            "DIST_DIR": str(self.memoirs / "webapp" / "dist"),
            "CACHE_MANIFEST": str(self.memoirs / ".cache" / "memoirs.manifest.json"),
        }
        self.originals = {name: getattr(doctor, name) for name in self.overrides}
        self.original_collect = doctor.collect_unsynthesized_entries
        self.original_draft = doctor.is_draft_pending

        for name, value in self.overrides.items():
            setattr(doctor, name, value)
        doctor.collect_unsynthesized_entries = lambda: []
        doctor.is_draft_pending = lambda: False

    def tearDown(self):
        for name, value in self.originals.items():
            setattr(doctor, name, value)
        doctor.collect_unsynthesized_entries = self.original_collect
        doctor.is_draft_pending = self.original_draft
        self.temp.cleanup()

    def codes(self, checks):
        return {item["code"] for item in checks}

    def write_valid_project(self):
        write(
            self.memoirs / "periods" / "US_PhD" / "timeline.yaml",
            'period: US_PhD\nentries:\n  - id: arrival\n    date: "2024-09"\n    event: "Arrival"\n    summary: "s"\n    related_files: ["raw_notes/arrival.md"]\n',
        )
        write(self.memoirs / "periods" / "US_PhD" / "raw_notes" / "arrival.md", "---\npeople: []\nplaces: []\n---\nbody\n")
        write(self.memoirs / "entities.yaml", "people: {}\nplaces: {}\n")

    def test_healthy_project_has_no_errors(self):
        self.write_valid_project()
        write(self.memoirs / ".cache" / "memoirs.manifest.json", "{}")

        checks = doctor.run_checks()
        self.assertEqual(doctor.summarize(checks)["errors"], 0)

    def test_malformed_timeline_is_error(self):
        self.write_valid_project()
        write(self.memoirs / "periods" / "US_PhD" / "timeline.yaml", 'period: US_PhD\nentries:\n  - id: "broken\n')

        checks = doctor.run_checks()
        self.assertIn("timeline_parse", self.codes(checks))
        self.assertGreaterEqual(doctor.summarize(checks)["errors"], 1)

    def test_duplicate_event_ref_is_error(self):
        self.write_valid_project()
        write(
            self.memoirs / "periods" / "US_PhD" / "timeline.yaml",
            'period: US_PhD\nentries:\n  - id: same\n    date: "2024-09"\n    event: "A"\n    summary: "a"\n  - id: same\n    date: "2024-10"\n    event: "B"\n    summary: "b"\n',
        )

        checks = doctor.run_checks()
        self.assertIn("duplicate_event_ref", self.codes(checks))

    def test_legacy_layout_is_error(self):
        self.write_valid_project()
        write(self.memoirs / "webapp" / "public" / "chapters" / "US_PhD" / "a.md", "# a")

        checks = doctor.run_checks()
        self.assertIn("legacy_layout", self.codes(checks))

    def test_place_cycle_is_error(self):
        self.write_valid_project()
        write(
            self.memoirs / "entities.yaml",
            "people: {}\nplaces:\n  甲:\n    parent: 乙\n  乙:\n    parent: 甲\n",
        )

        checks = doctor.run_checks()
        self.assertIn("place_cycle", self.codes(checks))

    def test_stale_manifest_warns(self):
        self.write_valid_project()
        manifest = self.memoirs / ".cache" / "memoirs.manifest.json"
        write(manifest, "{}")
        os.utime(manifest, (1_000_000, 1_000_000))
        os.utime(self.memoirs / "periods" / "US_PhD" / "timeline.yaml", (2_000_000, 2_000_000))

        checks = doctor.run_checks()
        self.assertIn("manifest_stale", self.codes(checks))
        self.assertEqual(doctor.summarize(checks)["errors"], 0)

    def test_missing_id_warns_and_missing_raw_note_warns(self):
        write(
            self.memoirs / "periods" / "US_PhD" / "timeline.yaml",
            'period: US_PhD\nentries:\n  - date: "2024-09"\n    event: "A"\n    summary: "a"\n    related_files: ["raw_notes/gone.md"]\n',
        )
        write(self.memoirs / "entities.yaml", "people: {}\nplaces: {}\n")

        checks = doctor.run_checks()
        codes = self.codes(checks)
        self.assertIn("missing_id", codes)
        self.assertIn("missing_raw_note", codes)
        self.assertEqual(doctor.summarize(checks)["errors"], 0)


if __name__ == "__main__":
    unittest.main()
