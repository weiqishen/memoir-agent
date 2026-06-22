import importlib.util
import json
import pathlib
import tempfile
import textwrap
import unittest

import yaml


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "template" / ".agents" / "skills" / "biographer-skill" / "tools" / "migrate_timeline_ids.py"

spec = importlib.util.spec_from_file_location("migrate_timeline_ids", MODULE_PATH)
migrate_timeline_ids = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(migrate_timeline_ids)


class MigrateTimelineIdsTests(unittest.TestCase):
    def setUp(self):
        self.original_memoirs_dir = migrate_timeline_ids.MEMOIRS_DIR
        self.original_periods_dir = migrate_timeline_ids.PERIODS_DIR

    def tearDown(self):
        migrate_timeline_ids.MEMOIRS_DIR = self.original_memoirs_dir
        migrate_timeline_ids.PERIODS_DIR = self.original_periods_dir

    def configure_workspace(self, root: pathlib.Path):
        memoirs_dir = root / "memoirs"
        periods_dir = memoirs_dir / "periods"
        period_dir = periods_dir / "US_PhD"
        period_dir.mkdir(parents=True)
        migrate_timeline_ids.MEMOIRS_DIR = str(memoirs_dir)
        migrate_timeline_ids.PERIODS_DIR = str(periods_dir)
        return memoirs_dir, period_dir

    def test_dry_run_reports_ids_without_modifying_timeline(self):
        with tempfile.TemporaryDirectory() as tmp:
            memoirs_dir, period_dir = self.configure_workspace(pathlib.Path(tmp))
            timeline_path = period_dir / "timeline.yaml"
            timeline_path.write_text(textwrap.dedent("""\
                period: US_PhD
                entries:
                  - date: "2024-09"
                    event: "Original Title"
                    summary: "summary"
                    related_files: ["raw_notes/walmart_visit.md"]
            """), encoding="utf-8")
            original_content = timeline_path.read_text(encoding="utf-8")

            report = migrate_timeline_ids.migrate_timeline_ids(write=False)

            self.assertEqual(timeline_path.read_text(encoding="utf-8"), original_content)
            self.assertEqual(report["migrated"][0]["id"], "walmart_visit")
            self.assertEqual(report["migrated"][0]["old_ref"], "US_PhD|2024-09|Original Title")
            self.assertEqual(report["migrated"][0]["new_ref"], "US_PhD|walmart_visit")
            self.assertFalse((memoirs_dir / ".timeline_id_migration_report.json").exists())

    def test_write_adds_ids_and_writes_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            memoirs_dir, period_dir = self.configure_workspace(pathlib.Path(tmp))
            timeline_path = period_dir / "timeline.yaml"
            timeline_path.write_text(textwrap.dedent("""\
                period: US_PhD
                entries:
                  - date: "2024-09"
                    event: "Original Title"
                    summary: "summary"
                    related_files: ["raw_notes/walmart_visit.md"]
            """), encoding="utf-8")

            migrate_timeline_ids.migrate_timeline_ids(write=True)

            timeline = yaml.safe_load(timeline_path.read_text(encoding="utf-8"))
            report = json.loads((memoirs_dir / ".timeline_id_migration_report.json").read_text(encoding="utf-8"))
            self.assertEqual(timeline["entries"][0]["id"], "walmart_visit")
            self.assertEqual(report["migrated"][0]["new_ref"], "US_PhD|walmart_visit")

    def test_reports_duplicate_and_manual_review_without_writing_bad_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, period_dir = self.configure_workspace(pathlib.Path(tmp))
            timeline_path = period_dir / "timeline.yaml"
            timeline_path.write_text(textwrap.dedent("""\
                period: US_PhD
                entries:
                  - id: walmart_visit
                    date: "2024-08"
                    event: "Existing"
                    summary: "summary"
                    related_files: ["raw_notes/existing.md"]
                  - date: "2024-09"
                    event: "Duplicate"
                    summary: "summary"
                    related_files: ["raw_notes/walmart_visit.md"]
                  - date: "2024-10"
                    event: "Missing File"
                    summary: "summary"
            """), encoding="utf-8")

            report = migrate_timeline_ids.migrate_timeline_ids(write=True)

            timeline = yaml.safe_load(timeline_path.read_text(encoding="utf-8"))
            self.assertNotIn("id", timeline["entries"][1])
            self.assertNotIn("id", timeline["entries"][2])
            self.assertEqual(report["duplicates"][0]["candidate_id"], "walmart_visit")
            self.assertEqual(report["manual_review"][0]["event"], "Missing File")


if __name__ == "__main__":
    unittest.main()
