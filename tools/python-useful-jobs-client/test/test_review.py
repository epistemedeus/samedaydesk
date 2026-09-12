"""Integration regressions against the pinned archive, with bounded fault injection."""
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

from samedaydesk_useful_jobs import HASH_TERMS, JOB_IDS, acquire, run_job
from samedaydesk_useful_jobs.acquire import _safe_extract
from samedaydesk_useful_jobs.delivery import publication
from samedaydesk_useful_jobs.process import spawn_node
from samedaydesk_useful_jobs.refuse import ClientRefuse

REPO = Path(__file__).resolve().parents[3]
ARCHIVE = REPO / HASH_TERMS.archive_rel
NODE = shutil.which('node')


class Review(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.area = tempfile.TemporaryDirectory(prefix='cw64-review-')
        cls.root = Path(cls.area.name)
        cls.kit = acquire(archive=ARCHIVE)

    @classmethod
    def tearDownClass(cls):
        cls.kit.close()
        cls.area.cleanup()

    def setUp(self):
        self.work = Path(tempfile.mkdtemp(dir=self.root))
        self.cwd = Path.cwd()
        os.chdir(self.work)

    def tearDown(self):
        os.chdir(self.cwd)

    def refused(self, code, fn):
        with self.assertRaises(ClientRefuse) as caught:
            fn()
        self.assertEqual(caught.exception.code, code, caught.exception.payload())
        self.assertFalse(caught.exception.payload()['published'])
        return caught.exception

    def write(self, name, value):
        path = self.work / name
        path.write_text(json.dumps(value))
        return path

    def run_sample(self, **kwargs):
        return run_job('vendor-budget-impact', ['--example', '--out-dir', str(self.work / 'out')], kit=self.kit, **kwargs)

    def injector(self, mutation):
        script = self.work / 'node-injector'
        script.write_text('#!' + sys.executable + '\n' + '''import json, os, pathlib, subprocess, sys
r = subprocess.run([os.environ['REVIEW_NODE'], *sys.argv[1:]], capture_output=True)
if r.returncode:
    sys.stdout.buffer.write(r.stdout); sys.stderr.buffer.write(r.stderr); sys.exit(r.returncode)
body = json.loads(r.stdout)
out = pathlib.Path(body['outDir'])
''' + mutation + '\nsys.stdout.write(json.dumps(body))\n')
        script.chmod(0o700)
        return str(script)

    def test_all_sample_capable_jobs_and_page_contract(self):
        for job in JOB_IDS:
            with self.subTest(job=job):
                output = self.work / job
                if job == 'page-change-offline-job':
                    inputs = REPO / 'server/paid-useful-jobs/release/public-samples/page/h04-page-01'
                    shutil.copytree(inputs, self.work / 'held')
                    args = ['--job', 'held/job.json']
                else:
                    args = ['--example']
                result = run_job(job, [*args, '--out-dir', str(output)], kit=self.kit)
                self.assertTrue(result['published'])
                self.assertEqual(set(p.name for p in output.iterdir()), set(HASH_TERMS.outputs_for(job)))
                for artifact in result['artifacts']:
                    self.assertEqual(artifact['sha256'], hashlib.sha256((output / artifact['name']).read_bytes()).hexdigest())

    def test_real_partial_and_refused_budget_are_distinct(self):
        before = self.write('before.json', {'rows': [{'field': 'quota', 'value': 3, 'unit': 'USD/unit'}, {'field': 'quota', 'value': 7, 'unit': 'USD/unit'}]})
        after = self.write('after.json', {'rows': [{'field': 'quota', 'value': 4, 'unit': 'USD/unit'}]})
        result = run_job('vendor-budget-impact', ['--before', str(before), '--after', str(after), '--out-dir', 'partial'], kit=self.kit)
        self.assertEqual(result['domainStatus'], 'partial')
        self.assertTrue(result['published'])
        before.write_text('{"notPricing":true}'); after.write_text('{"notPricing":true}')
        self.refused('engine-failed', lambda: run_job('vendor-budget-impact', ['--before', str(before), '--after', str(after), '--out-dir', 'refused'], kit=self.kit))
        self.assertFalse((self.work / 'refused').exists())

    def test_relative_paths_and_equals_with_literal_shell_characters(self):
        names = ['--before $() `literal` Ω\n.json', 'after "quotes" space.json']
        for name, version in zip(names, ['1.0.0', '2.0.0']):
            self.write(name, {'name': 'caller', 'lockfileVersion': 3, 'packages': {'': {'name': 'caller'}, 'node_modules/owned': {'version': version, 'integrity': 'sha512-test', 'resolved': 'https://example.test/a.tgz'}}})
        result = run_job('lockfile-pin-delta', ['--before=' + names[0], '--after', names[1], '--out-dir=out $() `literal` Ω'], kit=self.kit)
        self.assertTrue(result['published'])
        body = json.loads((Path(result['outDir']) / 'pin-delta.json').read_text())
        self.assertEqual(len(body['changed']), 1)
        for args in [['--out-dir', 'x', '--out-dir=y'], ['--example=false'], ['--before'], ['--out-dir=']]:
            with self.subTest(args=args), self.assertRaises(ClientRefuse):
                run_job('vendor-budget-impact', args, kit=self.kit)

    def test_nonzero_cannot_publish_success_including_124(self):
        for status in [7, 124]:
            with self.subTest(status=status), patch.dict(os.environ, {'REVIEW_NODE': NODE}):
                binary = self.injector(f'sys.stdout.write(json.dumps(body)); sys.exit({status})')
                err = self.refused('engine-failed', lambda: self.run_sample(node_bin=binary))
                self.assertEqual(err.extra['engineStatus'], status)
                self.assertFalse((self.work / 'out').exists())

    def test_corrupted_real_success_never_publishes(self):
        mutations = {
            'partial-json': "(out / 'budget-impact.json').write_text('{')",
            'empty-markdown': "(out / 'budget-impact.md').write_text('')",
            'wrong-identity': "data=json.loads((out/'budget-impact.json').read_text()); data['appId']='other'; (out/'budget-impact.json').write_text(json.dumps(data))",
            'status-mismatch': "data=json.loads((out/'budget-impact.json').read_text()); data['status']='informational' if body['status'] != 'informational' else 'partial'; (out/'budget-impact.json').write_text(json.dumps(data))",
            'json-duplicate': "p=out/'budget-impact.json'; p.write_text(p.read_text().replace('{', '{\"schema\": \"duplicate\",', 1))",
        }
        for label, mutation in mutations.items():
            with self.subTest(label=label), patch.dict(os.environ, {'REVIEW_NODE': NODE}):
                binary = self.injector(mutation)
                self.refused('invalid-artifact-content', lambda: self.run_sample(node_bin=binary))
                self.assertFalse((self.work / 'out').exists())

    def test_malformed_transport_and_foreign_output(self):
        for mutation, code in [
            ("sys.stdout.write('prefix ')", 'invalid-engine-report'),
            ("sys.stdout.write(json.dumps(body)[:-2]); sys.exit(0)", 'invalid-engine-report'),
            ("sys.stdout.buffer.write(b'\\xff'); sys.exit(0)", 'invalid-engine-report'),
            ("body['outDir'] = str(out.parent / 'foreign')", 'output-ownership'),
            ("body['status'] = 'refused'", 'engine-failed'),
            ("body['status'] = {}", 'invalid-engine-report'),
            ("sys.stdout.write('x' * (1024*1024+1)); sys.exit(0)", 'engine-output-limit'),
        ]:
            with self.subTest(code=code), patch.dict(os.environ, {'REVIEW_NODE': NODE}):
                self.refused(code, lambda: self.run_sample(node_bin=self.injector(mutation)))
                self.assertFalse((self.work / 'out').exists())

    def test_output_symlink_hardlink_and_extra_file(self):
        outside = self.work / 'outside.json'
        outside.write_text('preserve me')
        for mutation, code in [
            (f"p=out/'budget-impact.json'; p.unlink(); p.symlink_to({str(outside)!r})", 'unsafe-output'),
            (f"p=out/'budget-impact.json'; p.unlink(); os.link({str(outside)!r}, p)", 'unsafe-output'),
            ("(out/'unexpected').write_text('extra')", 'unexpected-output'),
        ]:
            with self.subTest(code=code), patch.dict(os.environ, {'REVIEW_NODE': NODE}):
                self.refused(code, lambda: self.run_sample(node_bin=self.injector(mutation)))
                self.assertEqual(outside.read_text(), 'preserve me')
                self.assertFalse((self.work / 'out').exists())

    def test_destination_occupancy_and_atomic_races(self):
        out = self.work / 'out'
        out.symlink_to(self.work / 'absent')
        self.refused('occupied-output', self.run_sample)
        self.assertTrue(out.is_symlink()); self.assertFalse((self.work / 'absent').exists())
        out.unlink(); out.mkdir(); (out/'caller').write_text('held')
        self.refused('occupied-output', self.run_sample)
        self.assertEqual((out/'caller').read_text(), 'held')
        shutil.rmtree(out)
        with self.assertRaises(ClientRefuse) as caught:
            with publication(out) as (stage, publish):
                stage.mkdir(); (stage/'ours').write_text('ours'); out.mkdir(); publish()
        self.assertEqual(caught.exception.code, 'occupied-output')
        self.assertEqual(list(out.iterdir()), [])

    def test_parent_swap_cannot_redirect_output(self):
        parent = self.work / 'parent'; parent.mkdir()
        other = self.work / 'other'; other.mkdir()
        with self.assertRaises(ClientRefuse):
            with publication(parent / 'out') as (stage, publish):
                parent.rename(self.work / 'moved'); parent.symlink_to(other, target_is_directory=True)
                stage.mkdir(); (stage / 'proof').write_text('owned'); publish()
        self.assertEqual(list(other.iterdir()), [])
        self.assertEqual(list((self.work / 'moved').iterdir()), [])

    def test_archive_path_type_duplicate_and_expansion_controls(self):
        cases = [('root/../escape', 'file', 'extract-unsafe-path'), ('root//file', 'file', 'extract-unsafe-path'),
                 ('root/./file', 'file', 'extract-unsafe-path'), ('/escape', 'file', 'extract-unsafe-path'),
                 ('root/link', 'link', 'extract-unsafe-member'), ('root/fifo', 'fifo', 'extract-unsafe-member'),
                 ('root/dupe', 'duplicate', 'extract-duplicate'), ('root/big', 'large', 'extract-limit')]
        for name, kind, code in cases:
            with self.subTest(kind=kind, name=name):
                buffer = io.BytesIO()
                with tarfile.open(fileobj=buffer, mode='w:gz') as bundle:
                    member = tarfile.TarInfo(name)
                    if kind == 'link': member.type = tarfile.SYMTYPE; member.linkname = '/tmp'
                    elif kind == 'fifo': member.type = tarfile.FIFOTYPE
                    elif kind == 'large': member.size = 64 * 1024 * 1024 + 1
                    if kind != 'large': bundle.addfile(member)
                    if kind == 'duplicate': bundle.addfile(member)
                if kind == 'large':
                    buffer = io.BytesIO(gzip.compress(member.tobuf() + bytes(1024)))
                dest = Path(tempfile.mkdtemp(dir=self.work))
                self.refused(code, lambda: _safe_extract(buffer.getvalue(), dest))
                self.assertEqual(list(dest.iterdir()), [])

    def test_explicit_archive_does_not_depend_on_surrounding_checkout(self):
        shadow = self.work / 'shadow/client/src/data'; shadow.mkdir(parents=True)
        (shadow/'usefulJobsKit.json').write_text('{}')
        with patch.dict(os.environ, {'SAMEDAYDESK_ROOT': str(self.work/'shadow')}):
            with acquire(archive=ARCHIVE) as kit:
                self.assertEqual(kit.sha256, HASH_TERMS.sha256)
            self.assertFalse(kit.work_dir.exists())

    def test_process_timeout_normal_exit_and_literal_argv(self):
        literal = ['', 'a b', 'Ω', '"', "'", 'line\nbreak', '--before', '$(no)', '`no`']
        echo = self.work / 'echo-node'
        echo.write_text('#!' + sys.executable + '\nimport json,sys;print(json.dumps(sys.argv[2:]))\n'); echo.chmod(0o700)
        result = spawn_node(self.kit, literal, node_bin=str(echo))
        self.assertEqual(json.loads(result.stdout), literal)
        unrelated = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(60)'])
        try:
            for parent_exits in [False, True]:
                with self.subTest(parent_exits=parent_exits):
                    pidfile = self.work / f'pids-{parent_exits}'
                    binary = self.work / 'tree-node'
                    child_code = f"import os,signal,time;open({str(pidfile)!r},'a').write(str(os.getpid())+'\\n');signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)"
                    binary.write_text('#!' + sys.executable + '\nimport subprocess,sys,time\n' + f'subprocess.Popen([sys.executable,"-c",{child_code!r}], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n' + 'time.sleep(.2)\n' + ('print("{}")\n' if parent_exits else 'time.sleep(60)\n'))
                    binary.chmod(0o700)
                    with patch.dict(os.environ, {'USEFUL_JOBS_TIMEOUT_SEC': '.6'}):
                        if parent_exits: spawn_node(self.kit, [], node_bin=str(binary))
                        else: self.refused('engine-timeout', lambda: spawn_node(self.kit, [], node_bin=str(binary)))
                    self.assertTrue(pidfile.exists())
                    for pid in pidfile.read_text().split():
                        self.assertFalse(Path('/proc', pid).exists(), f'owned child survived: {pid}')
                    self.assertIsNone(unrelated.poll())
        finally:
            unrelated.terminate(); unrelated.wait(timeout=5)
        for invalid in ['nan', 'inf', '-1', '0', '301', 'garbage']:
            with patch.dict(os.environ, {'USEFUL_JOBS_TIMEOUT_SEC': invalid}):
                self.refused('invalid-timeout', lambda: spawn_node(self.kit, [], node_bin=str(echo)))


if __name__ == '__main__':
    unittest.main(verbosity=2)
