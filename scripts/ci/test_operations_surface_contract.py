from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class OperationsSurfaceContractTests(unittest.TestCase):
    def test_navigation_updates_context_without_remounting_iframe(self):
        source = (ROOT / "apps/web/components/Operations/OperationsSurface.tsx").read_text()
        mount_dependencies = "[accessToken, authenticated, enabled, environment, orgId, platformUrl, project]"
        self.assertIn(mount_dependencies, source)
        for changing_context in ("pathname", "theme", "release", "viewportSize", "org?.org_uuid"):
            self.assertNotIn(changing_context, mount_dependencies)
        self.assertIn("controller.current?.update({ route: pathname, theme, viewport: viewportSize", source)

    def test_session_token_provider_receives_only_protocol_nonce_and_app_token(self):
        source = (ROOT / "apps/web/components/Operations/OperationsSurface.tsx").read_text()
        self.assertIn("getSessionToken: ({ nonce, protocol }", source)
        self.assertIn("issueOperationsSession(Number(orgId), nonce, protocol, accessToken)", source)
        self.assertNotIn("localStorage", source)


if __name__ == "__main__":
    unittest.main()
