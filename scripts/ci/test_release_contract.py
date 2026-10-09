import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('contract', Path(__file__).with_name('release-contract.py'))
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


class ContractTests(unittest.TestCase):
    def candidate(self):
        digest = 'sha256:'+'a'*64
        return dict(image_repository=contract.REPOSITORY, image_digest=digest,
            image_ref=contract.REPOSITORY+'@'+digest, commit_sha='b'*40,
            source_branch='main', version='sha-'+'b'*40)

    def test_promotion_preserves_checked_image(self):
        candidate = self.candidate()
        release = contract.promote(candidate, 'v1.2.3', 'b'*40)
        self.assertEqual(candidate['image_ref'], release['image_ref'])
        self.assertEqual(candidate['commit_sha'], release['commit_sha'])
        self.assertEqual('v1.2.3', release['version'])

    def test_unchecked_or_mismatched_candidates_rejected(self):
        for key, value in [('image_repository','attacker/image'), ('image_digest','latest'),
                ('image_ref',contract.REPOSITORY+':main'), ('commit_sha','short'), ('source_branch','feature')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                contract.validate({**self.candidate(), key:value})
        with self.assertRaises(ValueError):
            contract.promote(self.candidate(), 'v1.2.3', 'c'*40)
        with self.assertRaises(ValueError):
            contract.promote({**self.candidate(), 'source_branch':'dev'}, 'v1.2.3', 'b'*40)

    def test_prereleases_cannot_become_production(self):
        for tag in ['v1.2.3-rc.1','vlatest','v01.2.3','v1.2','v1.2.3; touch bad']:
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                contract.promote(self.candidate(), tag, 'b'*40)


if __name__ == '__main__':
    unittest.main()
