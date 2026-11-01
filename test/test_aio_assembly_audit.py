import hashlib
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('assembly_audit', ROOT / 'tools/aio-assembly-audit.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AssemblyAuditTests(unittest.TestCase):
    def fragments(self):
        return dict(zip(['00_intro.txt', '00_start.txt', '05_mainloop-i.txt', '06_listloop-i.txt', '07_shorterdelay-i.txt', '00_end.txt'], [b'#!/bin/sh\n', b'# common setup\n', b'# main\n', b'# list\n', b'# delay\n', b'# end\n']))

    def test_fragment_order_bytes_and_backup_confirmation_values(self):
        fragments = {'app/files/tweaks/' + name: value for name, value in self.fragments().items()}
        values = list(fragments.values())
        variables = b'KEEPBKUPS=1\nTESTBKUPS=1\nSKIPCONFIRM=0\n'
        good = values[0] + variables + b''.join(values[1:])
        result = audit.inspect_script(good, fragments)
        self.assertEqual(len(result), 6)
        self.assertEqual(result[1]['sha256'], hashlib.sha256(values[1]).hexdigest())
        for bad in [good.replace(b'# common setup', b'# changed'), good.replace(b'SKIPCONFIRM=0', b'SKIPCONFIRM=1'), good.replace(b'# main\n# list\n', b'# list\n# main\n'), good.replace(b'# end\n', b'')]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                audit.inspect_script(bad, fragments)

    def test_source_paths_are_data_and_reject_traversal_and_aliases(self):
        for name in ['../bad', '/bad', 'C:/bad', 'a\\b', '.', '', 'a//b', 'a/./b', 'a\x00b']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                audit.regular_relative(name)
        self.assertEqual(str(audit.regular_relative('cli/src/build.js')), 'cli/src/build.js')
        # Legitimate shell-looking filenames must be treated literally, never executed.
        self.assertEqual(str(audit.regular_relative('usb/$(literal).up')), 'usb/$(literal).up')

    def test_output_manifest_requires_complete_regular_allowlisted_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            payloads = [{'target': 'config/menu.js'}]
            (root / 'config').mkdir()
            for name in ['run.sh', 'MZD_LOG.md', 'config/menu.js']:
                (root / name).write_text(name)
            manifest = audit.output_manifest(root, payloads)
            self.assertEqual({record['path'] for record in manifest}, {'run.sh', 'MZD_LOG.md', 'config/menu.js'})
            (root / 'extra.sh').write_text('unexpected')
            with self.assertRaises(ValueError):
                audit.output_manifest(root, payloads)
            (root / 'extra.sh').unlink()
            (root / 'config/menu.js').unlink()
            with self.assertRaises(ValueError):
                audit.output_manifest(root, payloads)
            (root / 'config/menu.js').symlink_to(root / 'run.sh')
            with self.assertRaises(ValueError):
                audit.output_manifest(root, payloads)

    def test_wrong_revision_and_git_symlink_never_reach_compiler_execution(self):
        with patch.object(audit, 'git', return_value=b'b' * 40):
            with self.assertRaisesRegex(ValueError, 'HEAD'):
                audit.source_snapshot(Path('/unused'), 'a' * 40)
        with patch.object(audit, 'git', side_effect=[b'a' * 40, b'120000 blob ' + b'c' * 40 + b'\tcli/src/build.js\0']):
            with self.assertRaisesRegex(ValueError, 'regular Git blob'):
                audit.source_snapshot(Path('/unused'), 'a' * 40)

    def test_existing_report_is_preserved_without_executing_external_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / 'report.json'
            report.write_text('preserve')
            with patch.object(audit, 'source_snapshot') as snapshot:
                with self.assertRaises(FileExistsError):
                    audit.audit(Path(tmp), Path(tmp), report)
                snapshot.assert_not_called()
            self.assertEqual(report.read_text(), 'preserve')

    def test_cli_rejects_dangling_report_symlink_before_git_or_compiler(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'missing-target.json'
            link = Path(tmp) / 'report.json'
            link.symlink_to(target)
            result = subprocess.run([sys.executable, '-B', str(ROOT / 'tools/aio-assembly-audit.py'), '--source', tmp, '--dependencies', tmp, '--report', str(link)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Report destination already exists', result.stderr)
            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
