#!/usr/bin/env python3
"""Verify/apply the repository's exact LIVI patch and run reviewed test targets only."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
TARGET_MACHINES = {'x86_64-unknown-linux-gnu': 62, 'aarch64-unknown-linux-gnu': 183}


def select_target(manifest, target):
    selected = copy.deepcopy(manifest)
    target = target or manifest['rustc']['host']
    if target not in TARGET_MACHINES:
        raise ValueError('unsupported native Linux target: ' + target)
    # Same upstream compiler release/commit; only its architecture may vary.
    # check_toolchain requires an architecture-native compiler, never a cross label.
    selected['rustc']['host'] = target
    return selected


def verify_elf(path, target):
    with path.open('rb') as binary:
        header = binary.read(64)
    if (len(header) != 64 or header[:7] != b'\x7fELF\x02\x01\x01'
            or int.from_bytes(header[18:20], 'little') != TARGET_MACHINES[target]):
        raise ValueError('ELF architecture does not match ' + target + ': ' + str(path))
    return {'class': 'ELF64', 'endian': 'little', 'machine': TARGET_MACHINES[target]}



def run(args, cwd, capture=True):
    return subprocess.run(args, cwd=cwd, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source(source, manifest, patched):
    if Path(run(['git', 'rev-parse', '--show-toplevel'], source).strip()).resolve() != source.resolve():
        raise ValueError('source must be the root of its own Git checkout/worktree')
    if run(['git', 'rev-parse', 'HEAD'], source).strip() != manifest['commit']:
        raise ValueError('source HEAD does not match the pinned LIVI commit')
    # Reject unrelated tracked/untracked work; never reset, stash, clean or overwrite it.
    changed = set(run(['git', 'diff', '--name-only', 'HEAD'], source).splitlines())
    changed.update(run(['git', 'ls-files', '--others', '--exclude-standard'], source).splitlines())
    allowed = set(manifest['files']) if patched else set()
    if changed - allowed:
        raise ValueError('source has unrelated or unpatched work: ' + ', '.join(sorted(changed - allowed)))
    for name, hashes in manifest['files'].items():
        path = source / name
        if path.is_symlink() or not path.resolve().is_relative_to(source.resolve()):
            raise ValueError('source path escapes checkout: ' + name)
        expected = hashes['patched' if patched else 'original']
        if expected is None:
            if path.exists():
                raise ValueError('new patch path already exists: ' + name)
        elif not path.is_file() or digest(path) != expected:
            raise ValueError('source content does not match manifest: ' + name)


def check_toolchain(manifest, source):
    version = run(['rustc', '--version', '--verbose'], source)
    fields = dict(line.split(': ', 1) for line in version.splitlines() if ': ' in line)
    for key, expected in manifest['rustc'].items():
        if fields.get(key) != expected:
            raise ValueError(f'rustc {key} must be {expected}; got {fields.get(key)}')
    print(version, end='')


ENGINE_PACKAGES = ['livi-core', 'livi-helperd', 'gst-video-host', 'livi-compositor']
ENGINE_BINARIES = ['livi-core', 'livi-helperd', 'livi-gst-host', 'livi-compositor']
BUILD_METADATA = {'LIVI_VERSION': '9.5.0', 'LIVI_BUILD_DATE': '2026-10-17 02:47 UTC',
                  'SOURCE_DATE_EPOCH': '1792205264', 'CARGO_INCREMENTAL': '0'}


def engine_preflight(source):
    versions = {'cmake': run(['cmake', '--version'], source).splitlines()[0]}
    requirements = {'openssl': None, 'glib-2.0': '2.56', 'gio-2.0': '2.56',
                    'gstreamer-1.0': '1.24', 'gstreamer-app-1.0': '1.24',
                    'gstreamer-video-1.0': '1.24', 'wayland-client': None,
                    'wayland-server': None, 'xkbcommon': None, 'egl': None, 'libdrm': None}
    for name, minimum in requirements.items():
        try:
            if minimum:
                run(['pkg-config', '--atleast-version=' + minimum, name], source)
            versions[name] = run(['pkg-config', '--modversion', name], source).strip()
        except subprocess.CalledProcessError as error:
            raise ValueError(f'missing/incompatible development library {name}; minimum {minimum or "locked crate requirement"}') from error
    return versions


def license_inventory(metadata):
    # Null licenses remain null. Upstream LICENSE is retained, not inferred as clearance.
    return [{key: package.get(key) for key in ('id', 'name', 'version', 'source', 'license', 'license_file')}
            for package in metadata['packages']]


def engine_artifacts(target, architecture='x86_64-unknown-linux-gnu'):
    result = {}
    for name in ENGINE_BINARIES:
        path = target / 'release' / name
        if not path.is_file():
            raise ValueError('missing full-engine build artifact: ' + str(path))
        identity = verify_elf(path, architecture)
        result[name] = {'sha256': digest(path), 'bytes': path.stat().st_size, 'identity': identity,
                        'elf': run(['readelf', '-h', '-d', str(path)], target)}
    return result


def engine_compile(source, manifest, report_dir):
    report_dir.mkdir(parents=True, exist_ok=True)
    record = report_dir / 'engine-build.json'
    report = {'source_commit': manifest['commit'], 'patch_sha256': manifest['patch_sha256'],
              'status': 'in_progress', 'artifacts': None}
    record.write_text(json.dumps(report, indent=2) + '\n')
    try:
        engine_compile_checked(source, manifest, record)
    except (ValueError, OSError, subprocess.CalledProcessError):
        report = json.loads(record.read_text())
        report.update(status='failed', artifacts=None)
        record.write_text(json.dumps(report, indent=2) + '\n')
        raise


def engine_compile_checked(source, manifest, record):
    versions = engine_preflight(source)
    run(['cargo', 'fetch', '--manifest-path', 'native/Cargo.toml', '--locked',
         '--target', manifest['rustc']['host']], source, capture=False)
    metadata = json.loads(run(['cargo', 'metadata', '--manifest-path', 'native/Cargo.toml',
                              '--frozen', '--format-version=1', '--filter-platform', manifest['rustc']['host']], source))
    report = {'source_commit': manifest['commit'], 'patch_sha256': manifest['patch_sha256'],
              'cargo_lock_sha256': digest(source / 'native/Cargo.lock'),
              'upstream_license_sha256': digest(source / 'LICENSE'),
              'compiler': run(['rustc', '--version', '--verbose'], source),
              'c_compiler': run(['cc', '--version'], source),
              'cxx_compiler': run(['c++', '--version'], source),
              'build_jobs': os.environ.get('CARGO_BUILD_JOBS'),
              'build_metadata': BUILD_METADATA, 'pkg_config': versions,
              'runner_image': {key: os.environ.get(key) for key in ('ImageOS', 'ImageVersion')},
              'os_release': Path('/etc/os-release').read_text(),
              'packages': run(['dpkg-query', '-W', '-f=${binary:Package}\t${Version}\t${Architecture}\n'], source).splitlines(),
              'licenses': license_inventory(metadata),
              'license_scope': 'Workspace metadata, including packages not selected for compilation; not a distribution clearance.',
              'status': 'in_progress', 'target': manifest['rustc']['host'], 'artifacts': None,
              'capabilities': {'engine_started': False, 'phone_tested': False, 'hardware_validated': False,
                               'cross_compiled': False, 'system_packages_version_locked': False}}
    package_names = (ROOT / 'native/ubuntu24-build-packages.txt').read_text().split()
    report['system_copyrights'] = {}
    for name in package_names:
        path = Path('/usr/share/doc') / name / 'copyright'
        report['system_copyrights'][name] = {'path': str(path), 'sha256': digest(path) if path.is_file() else None}
    record.write_text(json.dumps(report, indent=2) + '\n')
    command = ['cargo', 'build', '--manifest-path', 'native/Cargo.toml', '--release', '--frozen',
               '--target', manifest['rustc']['host']]
    for package in ENGINE_PACKAGES:
        command += ['-p', package]
    # Fixed build metadata; no native executable is invoked here.
    subprocess.run(command, cwd=source, check=True, env={**os.environ, **BUILD_METADATA})
    verify_source(source, manifest, True)
    report['artifacts'] = engine_artifacts(Path(metadata['target_directory']) / manifest['rustc']['host'], manifest['rustc']['host'])
    report['status'] = 'success'
    record.write_text(json.dumps(report, indent=2) + '\n')


def engine_test(source, manifest):
    # Reviewed pure/injected tests only: no gst probe, pipelines, devices or compositor loop.
    suites = [(['livi-video-nal', 'livi-video-codec'], ['--lib'], None),
              (['livi-compositor'], ['--bin', 'livi-compositor'], 'host::tests'),
              (['livi-compositor'], ['--bin', 'livi-compositor'], 'shell::tests'),
              (['gst-video-host'], ['--lib'], 'spectrum::tests')]
    for packages, target, pattern in suites:
        command = ['cargo', 'test', '--manifest-path', 'native/Cargo.toml', '--release', '--frozen',
               '--target', manifest['rustc']['host']]
        for package in packages:
            command += ['-p', package]
        command += target
        if pattern:
            command += [pattern]
        command += ['--', '--test-threads=1']
        subprocess.run(command, cwd=source, check=True, env={**os.environ, **BUILD_METADATA})


def execute(mode, source, manifest, patch, report_dir=None):
    record = None
    if mode == 'engine-compile':
        report_dir = report_dir or ROOT / 'native-evidence'
        report_dir.mkdir(parents=True, exist_ok=True)
        record = report_dir / 'engine-build.json'
        record.write_text(json.dumps({'status': 'in_progress', 'artifacts': None}) + '\n')
    try:
        execute_checked(mode, source, manifest, patch, report_dir)
    except (ValueError, OSError, subprocess.CalledProcessError):
        if record is not None:
            report = json.loads(record.read_text())
            report.update(status='failed', artifacts=None)
            record.write_text(json.dumps(report, indent=2) + '\n')
        raise


def execute_checked(mode, source, manifest, patch, report_dir):
    if digest(patch) != manifest['patch_sha256']:
        raise ValueError('patch checksum does not match manifest')
    if mode == 'apply':
        verify_source(source, manifest, False)
        run(['git', 'apply', '--check', str(patch)], source)
        run(['git', 'apply', str(patch)], source)
    verify_source(source, manifest, True)
    if mode in ('engine-compile', 'engine-test'):
        check_toolchain(manifest, source)
        if mode == 'engine-compile':
            engine_compile(source, manifest, report_dir or ROOT / 'native-evidence')
        else:
            engine_test(source, manifest)
        verify_source(source, manifest, True)
    if mode in ('compile', 'test'):
        check_toolchain(manifest, source)
        if mode == 'compile':
            run(['cargo', 'build', '--manifest-path', 'native/Cargo.toml', '--locked', '--target', manifest['rustc']['host'], '-p', 'livi-core'], source, capture=False)
        command = ['cargo', 'test', '--manifest-path', 'native/Cargo.toml',
                   '--locked' if mode == 'compile' else '--frozen', '--target', manifest['rustc']['host'],
                   '-p', 'livi-core', '-p', 'livi-aa-stack']
        if mode == 'compile':
            command += ['--no-run']
        else:
            command += ['owned_input', '--', '--test-threads=1']
        run(command, source, capture=False)
    print(f'Native {mode}: verified pinned source and patch; no engine startup performed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['apply', 'check', 'compile', 'test', 'engine-compile', 'engine-test'])
    parser.add_argument('source', type=Path)
    parser.add_argument('--report-dir', type=Path)
    parser.add_argument('--target', choices=sorted(TARGET_MACHINES),
                        help='Native compiler host required; this does not enable cross-compilation')
    args = parser.parse_args()
    manifest = select_target(json.loads((ROOT / 'native/manifest.json').read_text()), args.target)
    execute(args.mode, args.source.resolve(), manifest, ROOT / 'native' / manifest['patch'], args.report_dir)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Native check failed: {error}', file=sys.stderr)
        sys.exit(1)
