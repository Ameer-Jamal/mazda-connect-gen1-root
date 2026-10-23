"""Exercise the standard-library ZIP builder independently of browser tests."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('desktop_builder', ROOT / 'tools/build-desktop.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class DesktopPackageTests(unittest.TestCase):
    def archive(self):
        return builder.archive_bytes(lambda name: (ROOT / name).read_bytes(), 'a' * 40)

    def test_archive_integrity_allowlist_and_manifest(self):
        data = self.archive()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertIsNone(archive.testzip())
            names = archive.namelist()
            self.assertEqual(len(names), len(set(names)))
            self.assertTrue(all(name.startswith(builder.PREFIX + '/') for name in names))
            self.assertTrue(all('..' not in name.split('/') for name in names))
            contents = {name.split('/', 1)[1]: archive.read(name) for name in names}
            self.assertEqual(set(contents), set(builder.SOURCES) | {'release-info.json', 'manifest.json'})
            for entry in archive.infolist():
                self.assertTrue(stat.S_ISREG(entry.external_attr >> 16))
                self.assertEqual(entry.external_attr >> 16 & 0o111, 0)
            for name in contents:
                self.assertNotIn(name, ['run.sh', 'tweaks.sh', 'run.js', 'dev.html', 'init.css'])
                self.assertFalse(name.endswith(('.mp3', '.exe', '.dmg', '.sh')))
            manifest = json.loads(contents.pop('manifest.json'))
            self.assertEqual(manifest['algorithm'], 'sha256')
            self.assertEqual(manifest['files'], {name: hashlib.sha256(value).hexdigest() for name, value in contents.items()})
            info = json.loads(contents['release-info.json'])
            self.assertFalse(info['vehicleReady'])
            self.assertFalse(info['vehiclePayloadsIncluded'])
            self.assertFalse(info['usbPreparationAvailable'])
            self.assertEqual(info['sourceRevision'], 'a' * 40)

    def test_dirty_missing_and_symlink_sources_do_not_build(self):
        for condition in ['dirty', 'missing', 'symlink']:
            with self.subTest(condition=condition), tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / 'source'
                root.mkdir()
                def git(*args):
                    return subprocess.check_output(['git', '-c', 'core.hooksPath=' + str(root / 'no-hooks'),
                        '-c', 'commit.gpgsign=false', '-c', 'user.name=Desktop test',
                        '-c', 'user.email=desktop-test@example.invalid', *args], cwd=root)
                git('init', '-q')
                for source in builder.SOURCES.values():
                    if condition == 'missing' and source == 'simulator/setup.js':
                        continue
                    file = root / source
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.write_bytes((ROOT / source).read_bytes())
                if condition == 'symlink':
                    file = root / 'simulator/setup.js'
                    file.unlink()
                    file.symlink_to('setup-model.js')
                git('add', '.')
                git('commit', '-qm', 'fixture')
                if condition == 'dirty':
                    (root / 'simulator/setup.js').write_text('changed')
                destination = Path(directory) / 'output'
                expected = {'dirty': 'working changes', 'missing': 'Missing tracked', 'symlink': 'regular'}[condition]
                with self.assertRaisesRegex(RuntimeError, expected):
                    builder.build(root, destination)
                self.assertFalse(destination.exists())

    def test_reproducible_and_missing_source_rejected(self):
        self.assertEqual(self.archive(), self.archive())
        with self.assertRaises(ValueError):
            builder.archive_bytes(lambda name: b'', 'a' * 40)
        with self.assertRaises(ValueError):
            builder.archive_bytes(lambda name: b'test', '../bad')


if __name__ == '__main__':
    unittest.main()
