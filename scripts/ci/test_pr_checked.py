import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('pr_checked', Path(__file__).with_name('pr-checked.py'))
checked = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checked)

REPO = 'life2launchlabs/launch-lms'


def pull(**over):
    return {'number': 1, 'merged_at': '2026-11-06T00:00:00Z', 'merge_commit_sha': 'a' * 40,
            'head': {'sha': 'b' * 40, 'repo': {'full_name': REPO}}, **over}


class PullRequestCheckTests(unittest.TestCase):
    def test_only_the_merged_pull_request_that_made_the_commit_counts(self):
        self.assertEqual(1, checked.merged_pull([pull()], 'a' * 40, REPO)['number'])
        self.assertIsNone(checked.merged_pull([pull(merged_at=None)], 'a' * 40, REPO))
        self.assertIsNone(checked.merged_pull([pull(merge_commit_sha='c' * 40)], 'a' * 40, REPO))
        self.assertIsNone(checked.merged_pull([pull(head={'sha': 'b' * 40, 'repo': {'full_name': 'someone/fork'}})], 'a' * 40, REPO))
        self.assertIsNone(checked.merged_pull([pull(head={'sha': 'b' * 40, 'repo': None})], 'a' * 40, REPO))

    def test_only_exactly_the_same_code_counts(self):
        self.assertTrue(checked.same_code({'tree': 'd' * 40}, 'd' * 40))
        self.assertFalse(checked.same_code({'tree': 'd' * 40}, 'e' * 40))
        self.assertFalse(checked.same_code({}, ''))
        self.assertFalse(checked.same_code(None, 'd' * 40))

    def test_an_image_is_reused_only_with_its_exact_digest_and_build_commit(self):
        digest = 'sha256:' + 'f' * 64
        self.assertEqual((digest, 'a' * 40), checked.reusable_image({'image_digest': digest, 'sha': 'a' * 40}))
        self.assertEqual(('', ''), checked.reusable_image({'sha': 'a' * 40}))
        self.assertEqual(('', ''), checked.reusable_image({'image_digest': 'latest', 'sha': 'a' * 40}))
        self.assertEqual(('', ''), checked.reusable_image({'image_digest': digest, 'sha': 'short'}))


if __name__ == '__main__':
    unittest.main()
