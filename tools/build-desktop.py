"""Build an offline desktop alpha from exact Git objects. No vehicle assets."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import zipfile

VERSION = '0.2.0-alpha.1'
PREFIX = 'mazda-connect-desktop-' + VERSION
SOURCES = {
    'index.html': 'simulator/setup.html',
    'research.html': 'simulator/index.html',
    'GETTING-STARTED.txt': 'desktop/GETTING-STARTED.txt',
    'NOTICE.txt': 'desktop/NOTICE.txt',
}
for name in ['capabilities.js', 'controller.js', 'mock-adapter.js', 'app.js',
             'aio-catalog.js', 'aio-workbench.js', 'setup-model.js', 'setup.js',
             'style.css', 'palette.css', 'setup.css']:
    SOURCES[name] = 'simulator/' + name


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def archive_bytes(reader, revision):
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Expected a full Git commit ID')
    files = {name: reader(source) for name, source in SOURCES.items()}
    if any(not isinstance(data, bytes) or not data for data in files.values()):
        raise ValueError('Missing or empty desktop source')
    info = {
        'version': VERSION, 'sourceRevision': revision,
        'repository': 'https://github.com/Ameer-Jamal/mazda-connect-gen1-root',
        'kind': 'offline-desktop-alpha', 'vehicleReady': False,
        'usbPreparationAvailable': False, 'vehiclePayloadsIncluded': False,
    }
    files['release-info.json'] = (json.dumps(info, indent=2) + '\n').encode()
    manifest = {'algorithm': 'sha256', 'files': {name: sha256(data) for name, data in sorted(files.items())}}
    files['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED) as output:
        for name, data in sorted(files.items()):
            entry = zipfile.ZipInfo(PREFIX + '/' + name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            output.writestr(entry, data)
    return archive.getvalue()


def build(root, destination):
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root)
    # Untracked dependencies and user files are never read by the fixed allowlist.
    if git('status', '--porcelain', '--untracked-files=no').strip():
        raise RuntimeError('Commit or preserve working changes before building a release')
    revision = git('rev-parse', 'HEAD').decode().strip()
    records = git('ls-tree', '-rz', revision, '--', *SOURCES.values()).split(b'\0')
    found = set()
    for record in filter(None, records):
        metadata, name = record.split(b'\t', 1)
        if metadata.split()[:2] != [b'100644', b'blob']:
            raise RuntimeError('Desktop sources must be tracked regular, non-executable files')
        found.add(name.decode())
    if found != set(SOURCES.values()):
        raise RuntimeError('Missing tracked desktop source')
    subprocess.run(['node', 'tools/check-upstream.cjs'], cwd=root, check=True)
    data = archive_bytes(lambda source: git('show', revision + ':' + source), revision)
    destination.mkdir(parents=True, exist_ok=False)
    name = PREFIX + '.zip'
    (destination / name).write_bytes(data)
    (destination / 'SHA256SUMS.txt').write_text(sha256(data) + '  ' + name + '\n', encoding='utf-8')
    return destination / name


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path, help='New output folder; existing folders are rejected')
    args = parser.parse_args()
    print(build(Path(__file__).resolve().parent.parent, args.destination.resolve()))
