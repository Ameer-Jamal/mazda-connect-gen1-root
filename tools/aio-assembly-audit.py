"""Audit a pinned external AIO compiler in temporary storage; retain metadata only."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
PROFILE = ROOT / 'research/aio-assembly-profile.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(repo, *arguments):
    env = dict(os.environ, GIT_NO_LAZY_FETCH='1', GIT_TERMINAL_PROMPT='0')
    return subprocess.check_output(['git', '-C', str(repo), *arguments], env=env, timeout=60)


def regular_relative(name):
    path = PurePosixPath(name)
    if not path.parts or name != path.as_posix() or path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name or any(ord(char) < 32 for char in name):
        raise ValueError('Invalid source path')
    return path


def source_snapshot(repo, revision):
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Expected a full source revision')
    if git(repo, 'rev-parse', 'HEAD').decode().strip() != revision:
        raise ValueError('External repository HEAD does not match the reviewed compiler revision')
    rows = git(repo, 'ls-tree', '-rz', revision, '--', 'cli/bin', 'cli/src', 'cli/package.json', 'cli/package-lock.json')
    sources = {}
    for row in filter(None, rows.split(b'\0')):
        meta, raw_name = row.split(b'\t', 1)
        name = raw_name.decode()
        regular_relative(name)
        if meta.split()[:2] not in [[b'100644', b'blob'], [b'100755', b'blob']]:
            raise ValueError('Compiler source must be a regular Git blob')
        sources[name] = git(repo, 'show', revision + ':' + name)
    if 'cli/bin/mzd-aio.js' not in sources or 'cli/package-lock.json' not in sources:
        raise ValueError('Missing compiler sources')
    return sources


def inspect_script(script, fragments):
    # These are inclusion/order checks, not a proof of shell semantics or safety.
    text = script.decode('utf-8')
    offset = 0
    records = []
    for name, data in fragments.items():
        normalized = data.decode('utf-8').replace('\r\n', '\n').replace('\r', '\n')
        if not normalized.endswith('\n'):
            normalized += '\n'
        position = text.find(normalized, offset)
        if position < 0:
            raise ValueError('Missing, changed or reordered AIO fragment: ' + name)
        records.append({'path': name, 'sha256': digest(data), 'scriptOffset': position})
        offset = position + len(normalized)
    setup_start = text.index(fragments['app/files/tweaks/00_start.txt'].decode().replace('\r\n', '\n').replace('\r', '\n'))
    for line in ['KEEPBKUPS=1', 'TESTBKUPS=1', 'SKIPCONFIRM=0']:
        if line not in text[:setup_start].splitlines():
            raise ValueError('Backup/confirmation variable was not preserved: ' + line)
    return records


def output_manifest(directory, payloads):
    expected = {'run.sh', 'MZD_LOG.md'} | {record['target'] for record in payloads}
    directories = {str(parent) for name in expected for parent in PurePosixPath(name).parents if str(parent) != '.'}
    entries = []
    for entry in sorted(directory.rglob('*')):
        name = entry.relative_to(directory).as_posix()
        if entry.is_symlink():
            raise ValueError('Generated symlink is not allowed')
        if entry.is_dir() and name in directories:
            continue
        if not entry.is_file() or name not in expected:
            raise ValueError('Unexpected generated path')
        entries.append(entry)
    if {entry.relative_to(directory).as_posix() for entry in entries} != expected:
        raise ValueError('Unexpected generated output; nothing will be exported')
    result = []
    for entry in entries:
        if entry.is_symlink() or not entry.is_file() or entry.stat().st_size > 2 * 1024 * 1024:
            raise ValueError('Invalid generated file')
        data = entry.read_bytes()
        result.append({'path': entry.relative_to(directory).as_posix(), 'bytes': len(data), 'sha256': digest(data)})
    return result


def audit(repo, dependencies, report_path):
    if report_path.exists() or report_path.is_symlink():
        raise FileExistsError('Report destination already exists')
    profile = json.loads(PROFILE.read_text())
    revision = profile['compilerCommit']
    sources = source_snapshot(repo, revision)
    fragments = {}
    for record in profile['fragments']:
        data = git(repo, 'show', revision + ':' + record['path'])
        if digest(data) != record['sha256']:
            raise ValueError('Fragment differs from recorded AIO baseline: ' + record['path'])
        fragments[record['path']] = data
        sources[record['path']] = data
    for record in profile['payloads']:
        data = git(repo, 'show', revision + ':' + record['path'])
        if digest(data) != record['sha256']:
            raise ValueError('Payload differs from recorded AIO baseline: ' + record['path'])
        sources[record['path']] = data
    dependencies = dependencies.resolve(strict=True)
    if not dependencies.is_dir():
        raise ValueError('Expected a prepared node_modules directory')
    lock = json.loads(sources['cli/package-lock.json'])
    versions = {}
    for name in ['sharp', 'xml2js', 'yaml', 'yauzl']:
        expected = lock['packages']['node_modules/' + name]['version']
        actual = json.loads((dependencies / name / 'package.json').read_text())['version']
        if actual != expected:
            raise ValueError('Direct dependency version differs from the lockfile: ' + name)
        versions[name] = actual
    with tempfile.TemporaryDirectory(prefix='mazda-aio-assembly-audit-') as scratch:
        stage = Path(scratch)
        for name, data in sources.items():
            relative = regular_relative(name)
            target = stage.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        (stage / 'cli/node_modules').symlink_to(dependencies, target_is_directory=True)
        config = stage / 'audit-request.json'
        config.write_text(json.dumps(profile['request'], indent=2) + '\n')
        # This catches ordinary JS network calls; it is not an OS security sandbox.
        blocker = stage / 'no-network.mjs'
        blocker.write_text("import { Socket } from 'node:net';\nconst deny = () => { throw new Error('Network disabled during assembly audit'); };\nSocket.prototype.connect = deny;\nglobalThis.fetch = deny;\n")
        child_env = {key: value for key, value in os.environ.items() if key in ['PATH', 'SystemRoot', 'TMP', 'TEMP', 'TMPDIR', 'LANG', 'LC_ALL']}
        node = ['node', '--import', str(blocker), str(stage / 'cli/bin/mzd-aio.js')]
        results = {}
        for command in ['validate', 'plan', 'build']:
            arguments = node + [command, str(config)]
            if command == 'build':
                arguments += ['--output', str(stage / 'generated')]
            try:
                result = subprocess.run(arguments, cwd=stage, env=child_env, text=True, capture_output=True, timeout=120, check=True)
            except subprocess.CalledProcessError as error:
                raise ValueError('External compiler ' + command + ' failed: ' + error.stderr[-4000:]) from error
            results[command] = {'exitCode': result.returncode}
        generated = stage / 'generated'
        files = output_manifest(generated, profile['payloads'])
        for record in profile['payloads']:
            if digest((generated / record['target']).read_bytes()) != record['sha256']:
                raise ValueError('Generated payload differs from its upstream source: ' + record['target'])
        preserved = inspect_script((generated / 'run.sh').read_bytes(), fragments)
        # Syntax parsing only: never invoke the generated file as a program.
        subprocess.run(['bash', '-n', str(generated / 'run.sh')], check=True, timeout=15, capture_output=True)
        report = {
            'schemaVersion': 1, 'kind': 'aio-assembly-audit',
            'compilerRepository': profile['compilerRepository'], 'compilerCommit': revision,
            'aioRepository': profile['aioRepository'], 'aioCommit': profile['aioCommit'],
            'request': profile['request'], 'commands': results,
            'compilerSources': [{'path': name, 'sha256': digest(data)} for name, data in sorted(sources.items()) if name.startswith('cli/')],
            'directDependencyVersions': versions,
            'dependencyReview': profile['dependencyReview'],
            'payloadsPreserved': profile['payloads'],
            'fragmentsPreservedInOrder': preserved, 'generatedFiles': files,
            'shellSyntaxCheck': 'bash -n passed; installer not executed',
            'vehicleAllowed': False, 'vehicleQualification': 'none',
            'artifactExported': False, 'generatedFilesRemovedOnExit': True,
            'limits': ['One three-tweak assembly request only', 'Dependency versions checked; installed dependency bytes are not attested', 'JavaScript network guard is not an OS sandbox', 'Syntax and source inclusion do not validate installation or restoration']
        }
    # Exclusive write happens after temporary source and generated files are removed.
    with report_path.open('x', encoding='utf-8') as output:
        json.dump(report, output, indent=2)
        output.write('\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='External Git repository at the reviewed revision; Git objects must already be local')
    parser.add_argument('--dependencies', type=Path, required=True, help='Previously installed locked CLI node_modules; no automatic install')
    parser.add_argument('--report', type=Path, required=True, help='New metadata-only JSON file; parent must exist')
    arguments = parser.parse_args()
    try:
        report_path = Path(os.path.abspath(arguments.report))
        result = audit(arguments.source.resolve(), arguments.dependencies, report_path)
        print('Assembly audited; generated files removed. Metadata: ' + str(report_path))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(1, 'Assembly audit failed: ' + str(error) + '\n')
