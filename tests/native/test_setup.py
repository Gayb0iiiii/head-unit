import hashlib
import json
import importlib.util
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

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


class EngineGuard(unittest.TestCase):
    def test_failed_preflight_replaces_old_success_report(self):
        with tempfile.TemporaryDirectory() as directory:
            report = pathlib.Path(directory) / 'engine-build.json'
            report.write_text(json.dumps({'status': 'success', 'artifacts': {'old': 'hash'}}))
            with patch.object(check, 'engine_preflight', side_effect=ValueError('missing cmake')):
                with self.assertRaisesRegex(ValueError, 'missing cmake'):
                    check.engine_compile(pathlib.Path(directory), {'commit': 'pin', 'patch_sha256': 'sha'}, pathlib.Path(directory))
            result = json.loads(report.read_text())
            self.assertEqual(result['status'], 'failed')
            self.assertIsNone(result['artifacts'])

    def test_checksum_rejection_clears_previous_build_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            record = root / 'engine-build.json'
            record.write_text(json.dumps({'status': 'success', 'artifacts': {'old': 'hash'}}))
            bad_patch = root / 'bad.patch'
            bad_patch.write_text('bad')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                check.execute('engine-compile', root, {'patch_sha256': 'wrong'}, bad_patch, root)
            self.assertEqual(json.loads(record.read_text())['status'], 'failed')
            self.assertIsNone(json.loads(record.read_text())['artifacts'])

    def test_engine_tests_override_environment_target(self):
        with patch.dict(check.os.environ, {'CARGO_BUILD_TARGET': 'wrong-target'}):
            with patch.object(check.subprocess, 'run') as process:
                check.engine_test(pathlib.Path('/tmp'), {'rustc': {'host': 'pinned-host'}})
        for call in process.call_args_list:
            command = call.args[0]
            self.assertEqual(command[command.index('--target') + 1], 'pinned-host')

    def test_missing_development_library_stops_before_cargo(self):
        calls=[]
        def fake_run(args,cwd,capture=True):
            calls.append(args)
            if args[0]=='pkg-config':
                raise subprocess.CalledProcessError(1,args)
            return 'cmake version 3.28.3\n'
        with patch.object(check,'run',side_effect=fake_run):
            with self.assertRaisesRegex(ValueError,'development'):
                check.engine_preflight(pathlib.Path('/tmp'))
        self.assertFalse(any(args[0]=='cargo' for args in calls))

    def test_unspecified_license_is_not_silently_assigned_clearance(self):
        packages=[{'id':'local','name':'livi-core','version':'0.1.0','source':None,'license':None,'license_file':None},
                  {'id':'crate','name':'example','version':'1.0','source':'registry+test','license':'MIT OR Apache-2.0','license_file':None}]
        result=check.license_inventory({'packages':packages})
        self.assertIsNone(result[0]['license'])
        self.assertEqual(result[1]['license'],'MIT OR Apache-2.0')

    def test_missing_artifacts_are_not_reported_as_a_successful_build(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError,'artifact'):
                check.engine_artifacts(pathlib.Path(directory))


class ArchitectureGuard(unittest.TestCase):
    def manifest(self):
        return {'rustc': {'release': '1.100.0-beta.3', 'commit-hash': 'pinned',
                          'host': 'x86_64-unknown-linux-gnu'}}

    def test_arm_selection_preserves_pin_and_default(self):
        original = self.manifest()
        selected = check.select_target(original, 'aarch64-unknown-linux-gnu')
        self.assertEqual(selected['rustc']['host'], 'aarch64-unknown-linux-gnu')
        self.assertEqual(selected['rustc']['commit-hash'], 'pinned')
        self.assertEqual(original['rustc']['host'], 'x86_64-unknown-linux-gnu')
        self.assertEqual(check.select_target(original, None), original)
        with self.assertRaisesRegex(ValueError, 'supported'):
            check.select_target(original, 'aarch64-apple-darwin')

    def test_arm_target_rejects_x86_compiler_before_build(self):
        selected = check.select_target(self.manifest(), 'aarch64-unknown-linux-gnu')
        with patch.object(check, 'run', return_value='release: 1.100.0-beta.3\ncommit-hash: pinned\nhost: x86_64-unknown-linux-gnu\n'):
            with self.assertRaisesRegex(ValueError, 'host'):
                check.check_toolchain(selected, pathlib.Path('/tmp'))

    def test_arm_compiler_still_requires_exact_release_and_commit(self):
        selected = check.select_target(self.manifest(), 'aarch64-unknown-linux-gnu')
        for version in ['release: other\ncommit-hash: pinned\n', 'release: 1.100.0-beta.3\ncommit-hash: other\n']:
            with patch.object(check, 'run', return_value=version+'host: aarch64-unknown-linux-gnu\n'):
                with self.assertRaises(ValueError):
                    check.check_toolchain(selected, pathlib.Path('/tmp'))

    def test_static_elf_identity_accepts_both_supported_targets_and_rejects_mislabeling(self):
        with tempfile.TemporaryDirectory() as folder:
            binary = pathlib.Path(folder) / 'fixture'
            for target, machine in [('aarch64-unknown-linux-gnu', 183), ('x86_64-unknown-linux-gnu', 62)]:
                header = bytearray(64);header[:7] = b'\x7fELF\x02\x01\x01';header[18:20] = machine.to_bytes(2, 'little')
                binary.write_bytes(header)
                self.assertEqual(check.verify_elf(binary, target)['machine'], machine)
                other = 'x86_64-unknown-linux-gnu' if machine == 183 else 'aarch64-unknown-linux-gnu'
                with self.assertRaisesRegex(ValueError, 'ELF'):
                    check.verify_elf(binary, other)
            for contents in [b'not ELF', b'\x7fELF\x01\x01'+bytes(58), b'\x7fELF\x02\x02'+bytes(58)]:
                binary.write_bytes(contents)
                with self.assertRaisesRegex(ValueError, 'ELF'):
                    check.verify_elf(binary, 'aarch64-unknown-linux-gnu')

    def test_core_compile_and_tests_cannot_inherit_an_environment_cross_target(self):
        manifest = {'patch_sha256': 'ok', 'rustc': {'host': 'aarch64-unknown-linux-gnu'}}
        with patch.object(check, 'digest', return_value='ok'), patch.object(check, 'verify_source'), patch.object(check, 'check_toolchain'), patch.object(check, 'run') as command:
            with patch.dict(check.os.environ, {'CARGO_BUILD_TARGET': 'x86_64-unknown-linux-gnu'}):
                check.execute_checked('compile', pathlib.Path('/tmp'), manifest, pathlib.Path('/tmp/patch'), None)
                check.execute_checked('test', pathlib.Path('/tmp'), manifest, pathlib.Path('/tmp/patch'), None)
        self.assertEqual(len(command.call_args_list), 3)
        for call in command.call_args_list:
            args = call.args[0]
            self.assertEqual(args[args.index('--target')+1], 'aarch64-unknown-linux-gnu')
        self.assertIn('--no-run', command.call_args_list[1].args[0])
        self.assertIn('owned_input', command.call_args_list[2].args[0])

    def test_wrong_architecture_artifact_never_reaches_readelf_or_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            target = pathlib.Path(folder);(target/'release').mkdir()
            (target/'release'/'livi-core').write_bytes(b'wrong architecture')
            with patch.object(check, 'run') as command:
                with self.assertRaisesRegex(ValueError, 'ELF'):
                    check.engine_artifacts(target, 'aarch64-unknown-linux-gnu')
                command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
