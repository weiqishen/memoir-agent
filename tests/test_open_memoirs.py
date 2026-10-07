import importlib.util
import os
import pathlib
import tempfile
import unittest
import urllib.error
import urllib.request

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "template" / "open_memoirs.pyw"

spec = importlib.util.spec_from_file_location("open_memoirs", MODULE_PATH)
open_memoirs = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(open_memoirs)


class ManifestStalenessTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp_dir.name)
        self.original_periods_dir = open_memoirs.PERIODS_DIR
        self.original_cache_manifest = open_memoirs.CACHE_MANIFEST

        periods_dir = self.root / "memoirs" / "periods"
        (periods_dir / "US_PhD").mkdir(parents=True)
        self.timeline_path = periods_dir / "US_PhD" / "timeline.yaml"
        self.timeline_path.write_text("period: US_PhD\nentries:\n", encoding="utf-8")

        self.cache_manifest = self.root / "memoirs" / ".cache" / "memoirs.manifest.json"
        self.cache_manifest.parent.mkdir(parents=True)

        open_memoirs.PERIODS_DIR = str(periods_dir)
        open_memoirs.CACHE_MANIFEST = str(self.cache_manifest)

    def tearDown(self):
        open_memoirs.PERIODS_DIR = self.original_periods_dir
        open_memoirs.CACHE_MANIFEST = self.original_cache_manifest
        self.temp_dir.cleanup()

    def test_missing_manifest_is_stale(self):
        self.assertFalse(self.cache_manifest.exists())
        self.assertTrue(open_memoirs.manifest_is_stale())

    def test_manifest_newer_than_sources_is_fresh(self):
        self.cache_manifest.write_text("{}", encoding="utf-8")
        os.utime(self.timeline_path, (1_000_000, 1_000_000))
        os.utime(self.cache_manifest, (2_000_000, 2_000_000))
        self.assertFalse(open_memoirs.manifest_is_stale())

    def test_timeline_newer_than_manifest_is_stale(self):
        self.cache_manifest.write_text("{}", encoding="utf-8")
        os.utime(self.cache_manifest, (1_000_000, 1_000_000))
        os.utime(self.timeline_path, (2_000_000, 2_000_000))
        self.assertTrue(open_memoirs.manifest_is_stale())


class MediaRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_periods_dir = open_memoirs.PERIODS_DIR
        periods_dir = pathlib.Path(self.temp_dir.name) / "memoirs" / "periods"
        (periods_dir / "US_PhD" / "assets").mkdir(parents=True)
        (periods_dir / "US_PhD" / "assets" / "banner photo.jpg").write_bytes(b"img")
        open_memoirs.PERIODS_DIR = str(periods_dir)
        self.periods_dir = periods_dir

    def tearDown(self):
        open_memoirs.PERIODS_DIR = self.original_periods_dir
        self.temp_dir.cleanup()

    def resolve(self, path):
        return open_memoirs.MemoirRequestHandler._resolve_media_path(None, path)

    def test_valid_encoded_media_path_resolves(self):
        resolved = self.resolve("/media/US_PhD/banner%20photo.jpg")
        self.assertEqual(pathlib.Path(resolved), self.periods_dir / "US_PhD" / "assets" / "banner photo.jpg")

    def test_traversal_attempts_are_blocked(self):
        blocked = [
            "/media/US_PhD/../../entities.yaml",
            "/media/US_PhD/%2e%2e%2fentities.yaml",
            "/media/../entities.yaml",
            "/media/US_PhD/sub/file.png",
            "/media/US_PhD/a\\b.png",
            "/media//banner.jpg",
        ]
        for path in blocked:
            self.assertEqual(
                self.resolve(path),
                open_memoirs.MISSING_PLACEHOLDER,
                f"{path} should be blocked",
            )


class ServerIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = pathlib.Path(self.temp.name)
        self.dist = root / "memoirs" / "webapp" / "dist"
        self.dist.mkdir(parents=True)
        (self.dist / "index.html").write_text("<html>memoir-app</html>", encoding="utf-8")

        self.periods = root / "memoirs" / "periods"
        (self.periods / "US_PhD" / "assets").mkdir(parents=True)
        (self.periods / "US_PhD" / "assets" / "banner photo.jpg").write_bytes(b"image-bytes")

        self.cache = root / "memoirs" / ".cache"
        self.cache.mkdir(parents=True)
        (self.cache / "memoirs.manifest.json").write_text('{"schema_version": 2}', encoding="utf-8")

        self.overrides = {
            "DIST_DIR": str(self.dist),
            "PERIODS_DIR": str(self.periods),
            "CACHE_MANIFEST": str(self.cache / "memoirs.manifest.json"),
        }
        self.originals = {name: getattr(open_memoirs, name) for name in self.overrides}
        for name, value in self.overrides.items():
            setattr(open_memoirs, name, value)

        self.server, self.port = open_memoirs.start_server()
        self.assertTrue(open_memoirs.wait_until_ready(self.port))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        for name, value in self.originals.items():
            setattr(open_memoirs, name, value)
        self.temp.cleanup()

    def fetch(self, path):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}", timeout=5) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def test_serves_app_shell_manifest_and_media(self):
        status, body = self.fetch("/")
        self.assertEqual(status, 200)
        self.assertIn(b"memoir-app", body)

        status, body = self.fetch("/memoirs.manifest.json")
        self.assertEqual(status, 200)
        self.assertEqual(body, b'{"schema_version": 2}')

        status, body = self.fetch("/media/US_PhD/banner%20photo.jpg")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"image-bytes")

    def test_blocks_traversal_and_missing_media(self):
        for path in (
            "/media/US_PhD/..%2F..%2Fentities.yaml",
            "/media/..%2Fmemoirs.manifest.json",
            "/media/US_PhD/missing.jpg",
            "/chapters/US_PhD/anything.md",
        ):
            status, _body = self.fetch(path)
            self.assertEqual(status, 404, f"{path} should 404")


if __name__ == "__main__":
    unittest.main()
