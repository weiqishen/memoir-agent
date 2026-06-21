import importlib.util
import pathlib
import unittest

MODULE_PATH = (
    pathlib.Path(__file__).resolve().parents[1]
    / "template"
    / ".agents"
    / "skills"
    / "biographer-skill"
    / "tools"
    / "entity_resolver.py"
)

spec = importlib.util.spec_from_file_location("entity_resolver", MODULE_PATH)
entity_resolver = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(entity_resolver)


class EntityResolverTests(unittest.TestCase):
    def test_place_resolver_matches_parent_alias_child_alias_and_unicode_separators(self):
        registry = {
            "people": {},
            "places": {
                "佛罗里达大学": {
                    "display": "佛罗里达大学",
                    "aliases": ["UF", "University of Florida"],
                },
                "佛罗里达大学·通勤停车场": {
                    "display": "通勤停车场",
                    "parent": "佛罗里达大学",
                    "aliases": ["commuter lot"],
                },
            },
        }

        resolver = entity_resolver.EntityResolver(registry)

        self.assertEqual(resolver.resolve_place("UF／Commuter Lot").canonical, "佛罗里达大学·通勤停车场")
        self.assertEqual(resolver.resolve_place("University of Florida - commuter lot").canonical, "佛罗里达大学·通勤停车场")

    def test_place_resolver_uses_display_name_as_alias_when_unique(self):
        registry = {
            "people": {},
            "places": {
                "佛罗里达大学": {"aliases": ["UF"]},
                "佛罗里达大学·通勤停车场": {
                    "display": "通勤停车场",
                    "parent": "佛罗里达大学",
                    "aliases": [],
                },
            },
        }

        resolver = entity_resolver.EntityResolver(registry)

        self.assertEqual(resolver.resolve_place("UF 通勤停车场").canonical, "佛罗里达大学·通勤停车场")

    def test_place_resolver_reports_ambiguous_bare_child_alias(self):
        registry = {
            "people": {},
            "places": {
                "A大学": {"aliases": ["A"]},
                "A大学·图书馆": {"display": "图书馆", "parent": "A大学", "aliases": ["library"]},
                "B大学": {"aliases": ["B"]},
                "B大学·图书馆": {"display": "图书馆", "parent": "B大学", "aliases": ["library"]},
            },
        }

        resolver = entity_resolver.EntityResolver(registry)
        result = resolver.resolve_place("library")

        self.assertEqual(result.status, "ambiguous")
        self.assertIsNone(result.canonical)
        self.assertEqual(result.candidates, ["A大学·图书馆", "B大学·图书馆"])

    def test_person_resolver_matches_case_and_full_width_aliases(self):
        registry = {
            "people": {
                "张三": {
                    "display": "张三",
                    "aliases": ["Zhang San", "ZS"],
                }
            },
            "places": {},
        }

        resolver = entity_resolver.EntityResolver(registry)

        self.assertEqual(resolver.resolve_person("ｚｓ").canonical, "张三")
        self.assertEqual(resolver.resolve_person("zhang   san").canonical, "张三")


if __name__ == "__main__":
    unittest.main()
