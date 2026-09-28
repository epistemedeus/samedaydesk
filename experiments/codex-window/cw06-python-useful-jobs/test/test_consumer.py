from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import zipapp
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
REPO = PROJECT.parents[2]
ARCHIVE = REPO / "client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz"
EXAMPLES = PROJECT / "examples"
sys.path.insert(0, str(PROJECT))

from cw06_useful_jobs import consumer  # noqa: E402


class RealReleasedCliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.clean = tempfile.TemporaryDirectory(prefix="cw06 clean env 雪 ")
        cls.clean_root = Path(cls.clean.name)
        cls.pyz = cls.clean_root / "cw06-useful-jobs.pyz"
        zipapp.create_archive(
            PROJECT,
            cls.pyz,
            interpreter="/usr/bin/env python3",
            main="cw06_useful_jobs.consumer:main",
            compressed=True,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.clean.cleanup()

    def invoke(self, example: str, output_name: str) -> tuple[subprocess.CompletedProcess[bytes], Path, dict]:
        output = self.clean_root / output_name
        request = (EXAMPLES / example).read_bytes()
        run = subprocess.run(
            [
                sys.executable,
                str(self.pyz),
                "--archive",
                str(ARCHIVE),
                "--output-dir",
                str(output),
            ],
            input=request,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.clean_root,
            check=False,
            timeout=45,
        )
        payload = json.loads(run.stdout)
        return run, output, payload

    def assert_exact_result(self, output: Path, payload: dict, expected: set[str]) -> dict:
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["executed"])
        self.assertTrue(payload["published"])
        self.assertFalse(payload["purchaseAuthority"])
        self.assertEqual({path.name for path in output.iterdir()}, expected | {consumer.MANIFEST_NAME})
        manifest = json.loads((output / consumer.MANIFEST_NAME).read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema"], consumer.RESULT_SCHEMA)
        self.assertEqual(manifest["release"]["archiveSha256"], consumer.ARCHIVE_SHA256)
        self.assertEqual({entry["name"] for entry in manifest["artifacts"]}, expected)
        for entry in manifest["artifacts"]:
            artifact = output / entry["name"]
            self.assertEqual(artifact.stat().st_size, entry["bytes"])
            self.assertEqual(consumer._sha256_path(artifact), entry["sha256"])
        return manifest

    def test_clean_zipapp_lockfile_unicode_spaces_and_literal_shell_text(self) -> None:
        sentinel = self.clean_root / "literal-shell-must-not-run"
        run, output, payload = self.invoke("lockfile-pin-delta.json", "results with spaces 雪")
        self.assertEqual(run.returncode, 0, run.stderr.decode())
        manifest = self.assert_exact_result(output, payload, {"pin-delta.json", "pin-delta.md"})
        self.assertEqual(manifest["engine"]["report"]["status"], "actionable")
        self.assertFalse(sentinel.exists())

    def test_real_json_schema_job_from_stdin(self) -> None:
        run, output, payload = self.invoke("json-schema-webhook-drift.json", "schema result")
        self.assertEqual(run.returncode, 0, run.stderr.decode())
        self.assert_exact_result(output, payload, {"drift-brief.json", "drift-brief.md"})

    def test_real_partial_domain_report_is_valid_delivery(self) -> None:
        run, output, payload = self.invoke("vendor-budget-partial.json", "partial result")
        self.assertEqual(run.returncode, 0, run.stderr.decode())
        manifest = self.assert_exact_result(output, payload, {"budget-impact.json", "budget-impact.md"})
        self.assertEqual(payload["domainStatus"], "partial")
        self.assertEqual(manifest["engine"]["report"]["status"], "partial")
        self.assertTrue(manifest["ok"])

    def test_actual_engine_failure_publishes_nothing(self) -> None:
        request = json.loads((EXAMPLES / "lockfile-pin-delta.json").read_text(encoding="utf-8"))
        request["inputs"]["before"]["text"] = "{\"not\":\"a package lock\"}\n"
        output = self.clean_root / "failure output"
        run = subprocess.run(
            [sys.executable, str(self.pyz), "--archive", str(ARCHIVE), "--output-dir", str(output)],
            input=json.dumps(request).encode(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.clean_root,
            check=False,
            timeout=45,
        )
        payload = json.loads(run.stdout)
        self.assertEqual(run.returncode, 2)
        self.assertEqual(payload["code"], "engine-failed")
        self.assertTrue(payload["executed"])
        self.assertFalse(payload["published"])
        self.assertFalse(output.exists())

    def test_occupied_and_stale_output_refuse_before_execution(self) -> None:
        output = self.clean_root / "occupied"
        output.mkdir()
        (output / "stale.json").write_text("stale", encoding="utf-8")
        request = json.loads((EXAMPLES / "lockfile-pin-delta.json").read_text(encoding="utf-8"))
        with self.assertRaises(consumer.ConsumerRefusal) as caught:
            consumer.consume(request, archive=ARCHIVE, output_dir=output)
        self.assertEqual(caught.exception.code, "occupied-output")
        self.assertFalse(caught.exception.executed)
        self.assertEqual((output / "stale.json").read_text(), "stale")


class BoundaryAndLifecycleTests(unittest.TestCase):
    def test_stdin_and_caller_byte_limits(self) -> None:
        with self.assertRaises(consumer.ConsumerRefusal) as caught:
            consumer._read_request(io.BytesIO(b"x" * (consumer.MAX_STDIN_BYTES + 1)))
        self.assertEqual(caught.exception.code, "stdin-byte-limit")
        jobs = {"j": {"requiredInputs": ["--input"]}}
        request = {
            "schema": consumer.REQUEST_SCHEMA,
            "job": "j",
            "inputs": {"input": {"filename": "input.txt", "text": "x" * (consumer.MAX_CALLER_FILE_BYTES + 1)}},
        }
        with self.assertRaises(consumer.ConsumerRefusal) as caught:
            consumer._validate_request(request, jobs)
        self.assertEqual(caught.exception.code, "caller-file-byte-limit")

    def test_input_path_escape_refused(self) -> None:
        jobs = {"j": {"requiredInputs": ["--input"]}}
        request = {
            "schema": consumer.REQUEST_SCHEMA,
            "job": "j",
            "inputs": {"input": {"filename": "../escape.json", "text": "{}"}},
        }
        with self.assertRaises(consumer.ConsumerRefusal) as caught:
            consumer._validate_request(request, jobs)
        self.assertEqual(caught.exception.code, "unsafe-input-path")

    def test_archive_digest_mismatch_refuses_before_extract(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            corrupt = Path(temporary) / "archive.tar.gz"
            data = bytearray(ARCHIVE.read_bytes())
            data[-1] ^= 1
            corrupt.write_bytes(data)
            with self.assertRaises(consumer.ConsumerRefusal) as caught:
                consumer._verify_archive(corrupt)
            self.assertEqual(caught.exception.code, "archive-digest-mismatch")

    def test_exact_artifact_set_rejects_partial_success(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            stage = Path(temporary)
            (stage / "one.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(consumer.ConsumerRefusal) as caught:
                consumer._validate_artifacts(stage, ["one.json", "two.md"])
            self.assertEqual(caught.exception.code, "artifact-set-mismatch")
            self.assertTrue(caught.exception.executed)

    @unittest.skipUnless(hasattr(os, "killpg"), "process-group control requires POSIX")
    def test_timeout_kills_owned_process_group(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            pid_file = Path(temporary) / "child.pid"
            code = (
                "import pathlib,subprocess,sys,time; "
                "p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)']); "
                "pathlib.Path(sys.argv[1]).write_text(str(p.pid)); time.sleep(30)"
            )
            with self.assertRaises(consumer.ConsumerRefusal) as caught:
                consumer._run_owned([sys.executable, "-c", code, str(pid_file)], timeout=0.5)
            self.assertEqual(caught.exception.code, "engine-timeout")
            child_pid = int(pid_file.read_text())
            deadline = time.monotonic() + 3
            alive = True
            while time.monotonic() < deadline:
                try:
                    os.kill(child_pid, 0)
                except ProcessLookupError:
                    alive = False
                    break
                time.sleep(0.05)
            self.assertFalse(alive, f"owned child {child_pid} survived timeout")


if __name__ == "__main__":
    unittest.main()

