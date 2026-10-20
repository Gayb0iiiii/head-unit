import hashlib
import importlib.util
import pathlib
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('native_check', pathlib.Path(__file__).resolve().parents[2] / 'scripts/native-check.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class SetupGuard(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = pathlib.Path(self.temp.name)
        self.git('init', '-q')
        (self.source / 'source.rs').write_text('original\n')
        self.git('add', '.')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')
        self.manifest = {'commit': self.git('rev-parse', 'HEAD').strip(), 'files': {
            'source.rs': {'original': check.digest(self.source / 'source.rs'), 'patched': hashlib.sha256(b'patched\n').hexdigest()},
            'new.rs': {'original': None, 'patched': hashlib.sha256(b'new\n').hexdigest()}}}

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.source, text=True)

    def test_exact_base_accepted(self):
        check.verify_source(self.source, self.manifest, False)

    def test_wrong_commit_rejected(self):
        self.manifest['commit'] = '0' * 40
        with self.assertRaisesRegex(ValueError, 'HEAD'):
            check.verify_source(self.source, self.manifest, False)

    def test_uncommitted_work_preserved(self):
        path = self.source / 'source.rs'
        path.write_text('user work\n')
        with self.assertRaises(ValueError):
            check.verify_source(self.source, self.manifest, False)
        self.assertEqual(path.read_text(), 'user work\n')

    def test_exact_patched_state_accepted_then_drift_rejected(self):
        (self.source / 'source.rs').write_text('patched\n')
        (self.source / 'new.rs').write_text('new\n')
        check.verify_source(self.source, self.manifest, True)
        (self.source / 'new.rs').write_text('drift\n')
        with self.assertRaisesRegex(ValueError, 'content'):
            check.verify_source(self.source, self.manifest, True)

    def test_unrelated_file_rejected(self):
        (self.source / 'precious.txt').write_text('keep')
        with self.assertRaisesRegex(ValueError, 'unrelated'):
            check.verify_source(self.source, self.manifest, False)
        self.assertTrue((self.source / 'precious.txt').exists())

    def test_apply_checksum_failure_cannot_modify_source(self):
        patch = self.source / 'bad.patch'
        patch.write_text('not a patch')
        self.manifest['patch_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'checksum'):
            check.execute('apply', self.source, self.manifest, patch)
        self.assertEqual((self.source / 'source.rs').read_text(), 'original\n')


if __name__ == '__main__':
    unittest.main()
