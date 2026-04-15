import importlib.util
import json
import pathlib
import sys
import tempfile
import textwrap
import unittest

MODULE_PATH = (
    pathlib.Path(__file__).resolve().parents[1]
    / "template"
    / ".agents"
    / "skills"
    / "biographer-skill"
    / "tools"
    / "workflow_guard.py"
)

spec = importlib.util.spec_from_file_location("workflow_guard", MODULE_PATH)
workflow_guard = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(workflow_guard)


class WorkflowGuardTests(unittest.TestCase):
    def setUp(self):
        self.original_workspace_dir = workflow_guard.WORKSPACE_DIR
        self.original_memoirs_dir = workflow_guard.MEMOIRS_DIR
        self.original_periods_dir = workflow_guard.PERIODS_DIR
        self.original_draft_buffer_path = workflow_guard.DRAFT_BUFFER_PATH
        self.original_audit_log_path = workflow_guard.AUDIT_LOG_PATH

    def tearDown(self):
        workflow_guard.WORKSPACE_DIR = self.original_workspace_dir
        workflow_guard.MEMOIRS_DIR = self.original_memoirs_dir
        workflow_guard.PERIODS_DIR = self.original_periods_dir
        workflow_guard.DRAFT_BUFFER_PATH = self.original_draft_buffer_path
        workflow_guard.AUDIT_LOG_PATH = self.original_audit_log_path

    def configure_workspace(self, root: pathlib.Path):
        memoirs_dir = root / "memoirs"
        periods_dir = memoirs_dir / "periods"
        periods_dir.mkdir(parents=True)

        workflow_guard.WORKSPACE_DIR = str(root)
        workflow_guard.MEMOIRS_DIR = str(memoirs_dir)
        workflow_guard.PERIODS_DIR = str(periods_dir)
        workflow_guard.DRAFT_BUFFER_PATH = str(memoirs_dir / ".draft_buffer.md")
        workflow_guard.AUDIT_LOG_PATH = str(memoirs_dir / ".workflow_guard.log")

        return memoirs_dir, periods_dir

    def create_period(
        self,
        periods_dir: pathlib.Path,
        period: str,
        *,
        timeline_date: str = "2024-09",
        with_raw_note: bool = True,
        with_chapter: bool = False,
    ):
        period_dir = periods_dir / period
        raw_notes_dir = period_dir / "raw_notes"
        chapters_dir = period_dir / "chapters"
        raw_notes_dir.mkdir(parents=True)
        chapters_dir.mkdir(parents=True)

        (period_dir / "timeline.yaml").write_text(
            textwrap.dedent(
                f"""\
                period: {period}
                entries:
                  - date: "{timeline_date}"
                    event: "Test Event"
                    summary: "Summary"
                    related_files: ["raw_notes/test.md"]
                """
            ),
            encoding="utf-8",
        )
        if with_raw_note:
            (raw_notes_dir / "test.md").write_text("raw note", encoding="utf-8")
        if with_chapter:
            (chapters_dir / f"{timeline_date}_test.md").write_text("# chapter", encoding="utf-8")

    def run_guard_main(self, *args: str):
        argv_backup = sys.argv
        sys.argv = ["workflow_guard.py", *args]
        try:
            return workflow_guard.main()
        finally:
            sys.argv = argv_backup

    def test_commit_blocks_without_pending_draft(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            self.configure_workspace(root)

            reasons = workflow_guard.evaluate("commit", None)
            self.assertTrue(reasons)

    def test_commit_passes_with_pending_draft(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, _ = self.configure_workspace(root)
            (memoirs_dir / ".draft_buffer.md").write_text("pending", encoding="utf-8")

            reasons = workflow_guard.evaluate("commit", None)
            self.assertEqual(reasons, [])

    def test_memoir_build_blocks_when_draft_is_pending(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, periods_dir = self.configure_workspace(root)
            (memoirs_dir / ".draft_buffer.md").write_text("pending", encoding="utf-8")
            self.create_period(periods_dir, "US_PhD", with_raw_note=True, with_chapter=False)

            reasons = workflow_guard.evaluate("memoir-build", "US_PhD")
            self.assertTrue(any("Run /commit before /memoir-build" in reason for reason in reasons))

    def test_memoir_build_passes_for_recall_path_without_draft(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            _, periods_dir = self.configure_workspace(root)
            self.create_period(periods_dir, "US_PhD", with_raw_note=True, with_chapter=False)

            reasons = workflow_guard.evaluate("memoir-build", "US_PhD")
            self.assertEqual(reasons, [])

    def test_build_blocks_when_timeline_entry_has_no_chapter(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            _, periods_dir = self.configure_workspace(root)
            self.create_period(periods_dir, "US_PhD", with_raw_note=True, with_chapter=False)

            reasons = workflow_guard.evaluate("build", None)
            self.assertTrue(any("unsynthesized timeline entries" in reason for reason in reasons))

    def test_build_passes_when_all_timeline_entries_have_chapters(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            _, periods_dir = self.configure_workspace(root)
            self.create_period(periods_dir, "US_PhD", with_raw_note=True, with_chapter=True)

            reasons = workflow_guard.evaluate("build", None)
            self.assertEqual(reasons, [])

    def test_force_bypass_writes_audit_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            memoirs_dir, _ = self.configure_workspace(root)
            (memoirs_dir / ".draft_buffer.md").write_text("pending", encoding="utf-8")

            status = self.run_guard_main("--action", "build", "--force")
            self.assertEqual(status, 0)

            log_path = memoirs_dir / ".workflow_guard.log"
            self.assertTrue(log_path.exists())
            record = json.loads(log_path.read_text(encoding="utf-8").splitlines()[-1])
            self.assertEqual(record["action"], "build")
            self.assertTrue(record["forced"])


if __name__ == "__main__":
    unittest.main()
