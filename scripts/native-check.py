#!/usr/bin/env python3
"""Verify/apply the repository's exact LIVI patch and run reviewed test targets only."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


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


def execute(mode, source, manifest, patch):
    if digest(patch) != manifest['patch_sha256']:
        raise ValueError('patch checksum does not match manifest')
    if mode == 'apply':
        verify_source(source, manifest, False)
        run(['git', 'apply', '--check', str(patch)], source)
        run(['git', 'apply', str(patch)], source)
    verify_source(source, manifest, True)
    if mode in ('compile', 'test'):
        check_toolchain(manifest, source)
        if mode == 'compile':
            run(['cargo', 'build', '--manifest-path', 'native/Cargo.toml', '--locked', '-p', 'livi-core'], source, capture=False)
        command = ['cargo', 'test', '--manifest-path', 'native/Cargo.toml',
                   '--locked' if mode == 'compile' else '--frozen',
                   '-p', 'livi-core', '-p', 'livi-aa-stack']
        if mode == 'compile':
            command += ['--no-run']
        else:
            command += ['owned_input', '--', '--test-threads=1']
        run(command, source, capture=False)
    print(f'Native {mode}: verified pinned source and patch; no engine startup performed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['apply', 'check', 'compile', 'test'])
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'native/manifest.json').read_text())
    execute(args.mode, args.source.resolve(), manifest, ROOT / 'native' / manifest['patch'])


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Native check failed: {error}', file=sys.stderr)
        sys.exit(1)
