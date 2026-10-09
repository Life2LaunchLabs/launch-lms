import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ProxyContractTests(unittest.TestCase):
    def test_nginx_layers_preserve_valid_forwarded_protocol(self):
        for relative_path in (
            "docker/nginx.conf",
            "apps/cli/src/templates/nginx.ts",
        ):
            with self.subTest(path=relative_path):
                contents = (ROOT / relative_path).read_text()
                self.assertIn(
                    "map $http_x_forwarded_proto $launchlms_forwarded_proto",
                    contents,
                )
                self.assertIn("~*^https?$ $http_x_forwarded_proto;", contents)
                self.assertIn("default $scheme;", contents)
                self.assertIn(
                    "proxy_set_header X-Forwarded-Proto $launchlms_forwarded_proto;",
                    contents,
                )
                self.assertNotIn(
                    "proxy_set_header X-Forwarded-Proto $scheme;",
                    contents,
                )


if __name__ == "__main__":
    unittest.main()
