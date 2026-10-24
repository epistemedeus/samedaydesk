#!/usr/bin/env python3
"""Run the current focused receiver against an exact disposable d310 archive."""
import os, pathlib, shutil, subprocess, tempfile
repo = pathlib.Path(__file__).resolve().parents[3]
evidence = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='root6712-base-', dir='/tmp') as scratch:
    scratch = pathlib.Path(scratch)
    archive = scratch / 'base.tar'
    subprocess.run(['git', '-C', str(repo), 'archive', 'd310f4cf37fb190d850ac0cea71ec34787972162', '-o', str(archive)], check=True)
    source = scratch / 'source'
    source.mkdir()
    subprocess.run(['tar', '-xf', str(archive), '-C', str(source)], check=True)
    test = 'server/scripts/test-root6712-authority-read.mjs'
    shutil.copyfile(repo / test, source / test)
    (source / 'node_modules').symlink_to((repo / 'node_modules').resolve(), target_is_directory=True)
    env = dict(os.environ, ROOT6712_EXPECT_SETUP_CALLS='3', ROOT6712_EVIDENCE=str(evidence / 'baseline-received.json'))
    result = subprocess.run(['python3', str(evidence / 'run-focused.py'), 'node', '--test', '--test-concurrency=1', str(source / test)], env=env)
raise SystemExit(result.returncode)
