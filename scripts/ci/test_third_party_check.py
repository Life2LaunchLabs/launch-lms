import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("third_party_check", ROOT / "scripts" / "third-party-check.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class ThirdPartyCheckTests(unittest.TestCase):
    def test_refuses_trackers_and_outside_loads(self):
        for sample in (
            '<Script data-website-id="x" src="/umami/script.js" />',
            "<link href=\"https://fonts.googleapis.com/css2?family=Barlow\" rel=\"stylesheet\" />",
            "<script async src='https://www.googletagmanager.com/gtag/js?id=G-1'></script>",
            "@import url('https://cdn.example.com/x.css');",
            "@font-face { font-family: X; src: url(https://cdn.example.com/x.woff2); }",
            "el.src = 'https://cdn.example.com/widget.js'",
        ):
            with self.subTest(sample=sample):
                hit = check.TRACKERS.search(sample) or any(p.search(sample) for p in check.OUTSIDE_LOADS)
                self.assertTrue(hit)

    def test_allows_own_assets(self):
        for sample in (
            "<script src=\"/runtime-config.js\" />",
            "import '@fontsource/manrope/400.css'",
            "<a href=\"https://example.org\">link</a>",
            "const gTag = (name) => name",
        ):
            with self.subTest(sample=sample):
                hit = check.TRACKERS.search(sample) or any(p.search(sample) for p in check.OUTSIDE_LOADS)
                self.assertFalse(hit)

    def test_web_source_is_clean(self):
        self.assertEqual(check.problems(), [])


if __name__ == "__main__":
    unittest.main()
