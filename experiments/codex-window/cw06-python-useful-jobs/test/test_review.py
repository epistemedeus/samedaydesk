"""CW39 regressions: self-authored boundary tests, not independent customer use."""
from __future__ import annotations

import io
import json
import os
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from test_consumer import ARCHIVE, PROJECT
from cw06_useful_jobs import consumer as c
from cw06_useful_jobs import linux


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cw39 review 雪 ")
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def refusal(self, code, function, *args, **kwargs):
        with self.assertRaises(c.ConsumerRefusal) as caught:
            function(*args, **kwargs)
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def archive(self, entries):
        target = self.root / 'test.tar.gz'
        with tarfile.open(target, 'w:gz') as bundle:
            for entry, data in entries:
                bundle.addfile(entry, io.BytesIO(data) if data is not None else None)
        return target

    def regular(self, name, data=b'x'):
        entry = tarfile.TarInfo(name)
        entry.size = len(data)
        return entry, data

    def test_raw_archive_components_are_checked_before_normalization(self):
        for name in ['', '/root/file', c.ARCHIVE_ROOT+'/../out', c.ARCHIVE_ROOT+'/./x', c.ARCHIVE_ROOT+'//x', './'+c.ARCHIVE_ROOT+'/x', c.ARCHIVE_ROOT+'/x\\y']:
            with self.subTest(name=name):
                self.refusal('unsafe-archive-path', c._member_target, self.root, tarfile.TarInfo(name))
        self.refusal('archive-root-mismatch', c._member_target, self.root, tarfile.TarInfo('foreign/x'))

    def test_extraction_refuses_symlink_hardlink_and_specials(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE]:
            with self.subTest(kind=kind):
                entry = tarfile.TarInfo(c.ARCHIVE_ROOT+'/escape')
                entry.type = kind
                entry.linkname = str(self.root/'outside')
                archive = self.archive([(entry, None)])
                dest = self.root / kind.decode()
                self.refusal('unsafe-archive-member', c._extract_verified_archive, archive, dest)
                self.assertFalse((self.root/'outside').exists())

    def test_extraction_refuses_existing_destination_and_retains_owner_modes(self):
        entry, data = self.regular(c.ARCHIVE_ROOT+'/bin/useful-jobs.mjs')
        entry.uid, entry.gid, entry.mode = 123456, 654321, 0o6777
        archive = self.archive([(entry, data)])
        root = c._extract_verified_archive(archive, self.root/'fresh')
        info = (root/'bin/useful-jobs.mjs').stat()
        self.assertEqual(info.st_uid, os.geteuid())
        self.assertEqual(info.st_mode & 0o7777, 0o600)
        self.refusal('archive-extract-failed', c._extract_verified_archive, archive, self.root/'fresh')

    def test_archive_member_and_expansion_limits(self):
        archive = self.archive([self.regular(c.ARCHIVE_ROOT+'/one'), self.regular(c.ARCHIVE_ROOT+'/two')])
        with patch.object(c, 'MAX_ARCHIVE_MEMBERS', 1):
            self.refusal('archive-member-limit', c._extract_verified_archive, archive, self.root/'count')
        with patch.object(c, 'MAX_EXTRACTED_BYTES', 1):
            self.refusal('archive-byte-limit', c._extract_verified_archive, archive, self.root/'bytes')

    def test_duplicate_and_truncated_archive_members(self):
        entry = self.regular(c.ARCHIVE_ROOT+'/one')
        self.refusal('duplicate-archive-member', c._extract_verified_archive, self.archive([entry, entry]), self.root/'duplicate')
        self.refusal('truncated-archive-member', c._copy_exact, io.BytesIO(b'x'), io.BytesIO(), 2)
        self.refusal('oversized-archive-member', c._copy_exact, io.BytesIO(b'xx'), io.BytesIO(), 1)
        self.refusal('unsafe-archive-member', c._member_target, self.root, self.negative_member())

    @staticmethod
    def negative_member():
        entry = tarfile.TarInfo(c.ARCHIVE_ROOT+'/negative')
        entry.size = -1
        return entry

    def test_snapshot_survives_caller_archive_replacement(self):
        source = self.root/'source.gz'
        shutil.copyfile(ARCHIVE, source)
        snapshot = self.root/'snapshot.gz'
        c._snapshot_archive(source, snapshot)
        source.write_bytes(b'replaced')
        extracted = c._extract_verified_archive(snapshot, self.root/'extracted')
        self.assertTrue((extracted/'bin/useful-jobs.mjs').is_file())
        self.assertEqual(c._sha256_path(snapshot), c.ARCHIVE_SHA256)

    def test_archive_fifo_and_symlink_do_not_block(self):
        fifo = self.root/'fifo'; os.mkfifo(fifo)
        self.refusal('missing-archive', c._snapshot_archive, fifo, self.root/'copy')
        link = self.root/'link'; link.symlink_to(ARCHIVE)
        self.refusal('archive-read-failed', c._snapshot_archive, link, self.root/'copy')

    def test_strict_json_and_unicode_refuse_without_tracebacks(self):
        for data in [b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":1e999}', b'{"x":"\\ud800"}', b'{', b'{} {}', b'\xff', b'['*1200]:
            self.refusal('invalid-stdin-json', c._read_request, io.BytesIO(data))
        jobs = {'j': {'requiredInputs': ['--input']}}
        req = {'schema':c.REQUEST_SCHEMA, 'job':'j', 'inputs':{'input':{'filename':'ok', 'text':'\ud800'}}}
        self.refusal('invalid-input', c._validate_request, req, jobs)
        self.refusal('invalid-filename', c._validate_filename, '\ud800')
        self.refusal('invalid-filename', c._validate_filename, '雪'*86)

    def test_utf8_and_aggregate_byte_boundaries(self):
        jobs = {'j': {'requiredInputs':['--a','--b','--c']}}
        req = {'schema':c.REQUEST_SCHEMA, 'job':'j', 'inputs': {k:{'filename':k, 'text':'é'*(c.MAX_CALLER_FILE_BYTES//2)} for k in 'abc'}}
        self.refusal('caller-byte-limit', c._validate_request, req, jobs)
        req['inputs']['c']['text'] = ''
        _, normalized = c._validate_request(req, jobs)
        self.assertEqual(sum(len(data) for _,data in normalized.values()), c.MAX_CALLER_BYTES)

    def test_nonfinite_timeouts_refuse_before_execution(self):
        for timeout in [float('nan'), float('inf'), 0, -1, 301, True]:
            self.refusal('invalid-timeout', c.consume, {}, archive=ARCHIVE, output_dir=self.root/'out', timeout=timeout)

    def artifacts(self, json_bytes=b'{}', text=b'# report\n'):
        stage = self.root/'stage'; stage.mkdir(exist_ok=True)
        (stage/'one.json').write_bytes(json_bytes)
        (stage/'two.md').write_bytes(text)
        return stage

    def test_malformed_empty_and_non_utf8_artifacts_refuse(self):
        for data in [b'{"partial":', b'[]', b'{"x":NaN}', b'{"x":1,"x":2}', b'\xff']:
            stage = self.artifacts(json_bytes=data)
            self.refusal('invalid-artifact-content', c._validate_artifacts, stage, ['one.json','two.md'])
        stage = self.artifacts(text=b'')
        self.refusal('artifact-byte-limit', c._validate_artifacts, stage, ['one.json','two.md'])
        stage = self.artifacts(text=b'partial report without header')
        self.refusal('invalid-artifact-content', c._validate_artifacts, stage, ['one.json','two.md'])

    def test_output_links_and_specials_refuse(self):
        stage = self.artifacts(); target = stage/'one.json'; target.unlink()
        outside = self.root/'outside'; outside.write_text('{}')
        for mode in ['symlink', 'hardlink', 'fifo']:
            if mode == 'symlink': target.symlink_to(outside)
            elif mode == 'hardlink': os.link(outside, target)
            else: os.mkfifo(target)
            self.refusal('unsafe-artifact', c._validate_artifacts, stage, ['one.json','two.md'])
            target.unlink()
        self.assertEqual(outside.read_text(), '{}')

    def test_empty_extra_directory_and_output_bytes_refuse(self):
        stage = self.artifacts()
        (stage/'unpromised').mkdir()
        self.refusal('artifact-set-mismatch', c._validate_artifacts, stage, ['one.json','two.md'])
        (stage/'unpromised').rmdir()
        with patch.object(c, 'MAX_ARTIFACT_BYTES', 1):
            self.refusal('artifact-byte-limit', c._validate_artifacts, stage, ['one.json','two.md'])
        with patch.object(c, 'MAX_OUTPUT_BYTES', 3):
            self.refusal('artifact-byte-limit', c._validate_artifacts, stage, ['one.json','two.md'])
        with patch.object(c.os, 'geteuid', return_value=os.geteuid()+1):
            self.refusal('unsafe-artifact', c._validate_artifacts, stage, ['one.json','two.md'])

    def test_report_envelope_must_match_artifact_not_just_ok_true(self):
        body = {'schema':'s233.useful-application.artifact.v1','appId':'vendor-budget-impact','status':'partial','summary':'held rows','actions':[],'gaps':['missing unit'],'noPurchaseAuthority':True,'digest':'a'}
        report = {'ok':True,'appId':'vendor-budget-impact','status':'partial','digest':'a'}
        c._validate_artifact_body(body, 'vendor-budget-impact', report)
        for change in [{'status':'refused'}, {'status':'actionable'}, {'appId':'feed-agenda'}, {'digest':'b'}, {'schema':'wrong'}, {'actions':None}, {'ok':False}]:
            self.refusal('invalid-artifact-content', c._validate_artifact_body, body|change, 'vendor-budget-impact', report)
        for stdout in ['{}','[]','{"ok":"true"}','{"ok":true} trailing','{"ok":true,"ok":false}']:
            self.refusal('invalid-engine-report', c._parse_engine_report, stdout)

    def test_ics_requires_complete_calendar(self):
        stage = self.root/'ics'; stage.mkdir()
        path = stage/'agenda.ics'
        path.write_text('BEGIN:VCALENDAR\nVERSION:2.0\n')
        self.refusal('invalid-artifact-content', c._validate_artifacts, stage, ['agenda.ics'])
        path.write_text('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n')
        self.assertEqual(len(c._validate_artifacts(stage, ['agenda.ics'])), 1)

    def test_dangling_destination_and_parent_symlinks_are_preserved(self):
        target = self.root/'output'; target.symlink_to(self.root/'unowned')
        self.refusal('occupied-output', c.consume, {}, archive=ARCHIVE, output_dir=target)
        self.assertTrue(target.is_symlink()); self.assertFalse((self.root/'unowned').exists())
        actual = self.root/'actual'; actual.mkdir()
        link = self.root/'parent-link'; link.symlink_to(actual, target_is_directory=True)
        with self.assertRaises(OSError):
            with linux.publication(link/'out'): self.fail('followed parent link')
        self.assertEqual(list(actual.iterdir()), [])

    def test_atomic_publish_never_replaces_racing_entries(self):
        for kind in ['directory', 'file', 'dangling-link']:
            target = self.root/kind
            with linux.publication(target) as (stage, publish):
                stage.mkdir(); (stage/'ours').write_text('new')
                if kind == 'directory': target.mkdir()
                elif kind == 'file': target.write_text('keep')
                else: target.symlink_to(self.root/'absent')
                inode = target.lstat().st_ino
                with self.assertRaises(FileExistsError): publish()
                self.assertEqual(target.lstat().st_ino, inode)
            self.assertFalse(any(self.root.glob('.cw06-publish-*')))

    def test_parent_swap_cannot_redirect_writes_or_publish(self):
        parent = self.root/'parent'; parent.mkdir()
        other = self.root/'other'; other.mkdir()
        with linux.publication(parent/'out') as (stage, publish):
            parent.rename(self.root/'moved')
            parent.symlink_to(other, target_is_directory=True)
            stage.mkdir(); (stage/'ours').write_text('private')
            self.assertEqual(list(other.iterdir()), [])
            with self.assertRaises(OSError): publish()
        self.assertEqual(list(other.iterdir()), [])
        self.assertEqual(list((self.root/'moved').iterdir()), [])

    def test_same_filesystem_publication_when_tmpdir_differs(self):
        if not Path('/dev/shm').is_dir(): self.skipTest('/dev/shm absent')
        with tempfile.TemporaryDirectory(prefix='cw39-',dir='/dev/shm') as tmp:
            with patch.dict(os.environ, {'TMPDIR':tmp}):
                with linux.publication(self.root/'published') as (stage,publish):
                    stage.mkdir(); (stage/'ok').write_text('complete')
                    publish()
            self.assertEqual((self.root/'published/ok').read_text(), 'complete')

    def test_exact_subprocess_argv_and_sanitized_node_environment(self):
        values = ['', '--input', '-leading', 'space 雪', '"quote"', "'single'", '$(touch MUST_NOT_EXIST);`id`', 'line\nbreak']
        code = 'import json,os,sys;print(json.dumps({"argv":sys.argv[1:],"node":os.getenv("NODE_OPTIONS"),"tar":os.getenv("TAR_OPTIONS"),"secret":os.getenv("CW39_TEST_SECRET")}))'
        with patch.dict(os.environ, {'NODE_OPTIONS':'--require /unowned/hook','TAR_OPTIONS':'--to-command=bad','CW39_TEST_SECRET':'not-forwarded'}):
            result = c._run_owned([sys.executable,'-c',code,*values],timeout=3,cwd=self.root)
        body=json.loads(result.stdout)
        self.assertEqual(body['argv'], values)
        self.assertEqual(body['node'], '--max-old-space-size=768')
        self.assertEqual(body['tar'], '--no-same-owner')
        self.assertIsNone(body['secret'])
        self.assertEqual(list(self.root.iterdir()), [])

    def test_stream_limits_stop_a_live_writer_promptly(self):
        for fd in [1,2]:
            start=time.monotonic()
            code=f'import os; chunk=b"x"*65536\nwhile True: os.write({fd},chunk)'
            self.refusal('engine-output-limit',c._run_owned,[sys.executable,'-c',code],timeout=8)
            self.assertLess(time.monotonic()-start,3)

    def test_exact_stream_byte_limit_and_invalid_utf8(self):
        result=c._run_owned([sys.executable,'-c',f'import os;os.write(1,b"x"*{c.MAX_CAPTURE_BYTES})'],timeout=3)
        self.assertEqual(len(result.stdout),c.MAX_CAPTURE_BYTES)
        self.refusal('invalid-engine-encoding',c._run_owned,[sys.executable,'-c','import os;os.write(1,b"\\xff")'],timeout=3)

    def test_detached_sigterm_ignoring_descendants_are_reaped(self):
        pidfile=self.root/'detached.pid'
        descendant='import os,pathlib,signal,sys,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)'
        code='import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",sys.argv[1],sys.argv[2]],start_new_session=True);time.sleep(30)'
        self.refusal('engine-timeout',c._run_owned,[sys.executable,'-c',code,descendant,str(pidfile)],timeout=.4)
        pid=int(pidfile.read_text())
        self.assertFalse(Path(f'/proc/{pid}').exists(),f'detached child {pid} remains, including zombie')

    def test_successful_parent_cannot_leave_detached_descendant(self):
        pidfile=self.root/'success-child.pid'
        code='import pathlib,subprocess,sys; p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"],start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);pathlib.Path(sys.argv[1]).write_text(str(p.pid));print("done")'
        result=c._run_owned([sys.executable,'-c',code,str(pidfile)],timeout=3)
        self.assertEqual(result.returncode,0)
        self.assertFalse(Path('/proc/'+pidfile.read_text()).exists())

    def test_closed_streams_do_not_shorten_the_requested_timeout(self):
        code='import os,time;os.close(1);os.close(2);time.sleep(2.2)'
        result=c._run_owned([sys.executable,'-c',code],timeout=4)
        self.assertEqual(result.returncode,0)

    def test_released_cli_detached_spawn_is_reaped_on_timeout(self):
        root=c._extract_verified_archive(ARCHIVE,self.root/'released')
        pidfile=self.root/'released-child.pid'
        child='require("node:fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)'
        code='import {spawnOwned} from '+json.dumps((root/'lib/owned-spawn.mjs').as_uri())+'; await spawnOwned(process.execPath,["-e",process.argv[1],process.argv[2]]);'
        self.refusal('engine-timeout',c._run_owned,[shutil.which('node'),'--input-type=module','-e',code,child,str(pidfile)],timeout=.4)
        self.assertFalse(Path('/proc/'+pidfile.read_text()).exists())

    def test_engine_scratch_directory_is_private_and_removed(self):
        code='import os,pathlib; p=pathlib.Path(os.environ["TMPDIR"]);(p/"engine-leftover").write_text("held");print(p)'
        result=c._run_owned([sys.executable,'-c',code],timeout=3)
        self.assertFalse(Path(result.stdout.strip()).exists())

    def test_supervisor_does_not_reap_unrelated_callers_child(self):
        other=subprocess.Popen([sys.executable,'-c','import time;time.sleep(20)'],start_new_session=True)
        try:
            self.refusal('engine-timeout',c._run_owned,[sys.executable,'-c','import time;time.sleep(20)'],timeout=.1)
            self.assertIsNone(other.poll())
        finally:
            other.terminate(); other.wait(timeout=3)


if __name__ == '__main__':
    unittest.main()
