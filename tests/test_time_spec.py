import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "template" / ".agents" / "skills" / "biographer-skill" / "tools" / "time_spec.py"

spec = importlib.util.spec_from_file_location("time_spec", MODULE_PATH)
time_spec = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(time_spec)


class TimeSpecTests(unittest.TestCase):
    def test_parse_exact_day(self):
        parsed = time_spec.parse_time_spec("2024-09-18")

        self.assertEqual(parsed.status, "resolved")
        self.assertEqual(parsed.to_manifest(), {
            "value": "2024-09-18",
            "label": "2024-09-18",
            "precision": "day",
            "start": "2024-09-18",
            "end": "2024-09-18",
            "sort": "2024-09-18",
            "approximate": False,
        })

    def test_parse_month_year_quarter_and_chinese_quarter(self):
        month = time_spec.parse_time_spec("2024年9月").to_manifest()
        year = time_spec.parse_time_spec("2024年").to_manifest()
        quarter = time_spec.parse_time_spec("2024年第三季度").to_manifest()

        self.assertEqual(month["value"], "2024-09")
        self.assertEqual(month["precision"], "month")
        self.assertEqual(month["start"], "2024-09-01")
        self.assertEqual(month["end"], "2024-09-30")
        self.assertEqual(year["value"], "2024")
        self.assertEqual(year["precision"], "year")
        self.assertEqual(year["start"], "2024-01-01")
        self.assertEqual(year["end"], "2024-12-31")
        self.assertEqual(quarter["value"], "2024-Q3")
        self.assertEqual(quarter["precision"], "quarter")
        self.assertEqual(quarter["start"], "2024-07-01")
        self.assertEqual(quarter["end"], "2024-09-30")

    def test_parse_approximate_year(self):
        parsed = time_spec.parse_time_spec("约2024年")

        self.assertEqual(parsed.status, "resolved")
        self.assertTrue(parsed.to_manifest()["approximate"])
        self.assertEqual(parsed.to_manifest()["label"], "约2024")

    def test_reject_invalid_or_ambiguous_dates(self):
        self.assertEqual(time_spec.parse_time_spec("2024-13").status, "invalid")
        self.assertEqual(time_spec.parse_time_spec("2024-Q5").status, "invalid")
        self.assertEqual(time_spec.parse_time_spec("9月").status, "ambiguous")


if __name__ == "__main__":
    unittest.main()
