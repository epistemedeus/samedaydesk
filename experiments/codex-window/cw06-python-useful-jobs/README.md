# CW06 Python/stdin consumer for useful-jobs 1.4.0

This is a thin Python standard-library bridge to the **actual released Node.js
command-line interface (CLI)** in `useful-jobs-1.4.0.tar.gz`. It does not copy or
reimplement any job engine. The hinge is simple: caller-owned bytes arrive as
one bounded JSON object on standard input, become temporary files, and are
passed as an argument vector—not a shell string—to the released CLI.

The release contains ten offline jobs. They are not ten paid Hypertext Transfer
Protocol (HTTP) endpoints. This consumer has no payment, purchase, public
network-fetch, or scheduler path.

## Exact source

- Public repository commit: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`
- Archive: `client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz`
- Bytes: `2575215`
- SHA-256 (Secure Hash Algorithm 256-bit):
  `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`
- Runtime: Python 3.11+ standard library and Node.js 22+

## Run directly

From this directory:

```sh
python3 -m cw06_useful_jobs \
  --archive ../../../client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz \
  --output-dir '/tmp/cw06 result' \
  < examples/lockfile-pin-delta.json
```

The output directory must not exist. On success it contains exactly the job's
catalog-promised artifacts plus `result-manifest.json`. Publication is a final
directory rename, so a failed/refused run does not leave a plausible result.

## Build a portable standard-library zip application

```sh
python3 -m zipapp . \
  -m 'cw06_useful_jobs.consumer:main' \
  -p '/usr/bin/env python3' \
  -c -o cw06-useful-jobs.pyz
```

Then copy `cw06-useful-jobs.pyz` and the verified release archive to any clean
directory and run the same arguments with `python3 cw06-useful-jobs.pyz`.

## Standard-input contract

```json
{
  "schema": "samedaydesk.cw06.stdin-request.v1",
  "job": "lockfile-pin-delta",
  "inputs": {
    "before": {"filename": "before.json", "text": "{...}"},
    "after": {"filename": "after.json", "text": "{...}"}
  }
}
```

`inputs` must exactly match the selected job's required catalog flags (apart
from `--out-dir`, which the bridge owns). Filenames are basenames; Unicode,
spaces, and shell metacharacters remain literal. Per-file caller content is
limited to 512 KiB, aggregate caller content to 1 MiB, and raw stdin to 2 MiB.

## Safety and lifecycle boundary

- Verify exact archive size and SHA-256 before extraction.
- Extract regular files/directories only; reject links, devices, traversal,
  foreign roots, excessive member counts, and excessive expanded bytes.
- Resolve Node.js once and invoke it with `subprocess.Popen([...])`, never
  `shell=True` or interpolated shell text.
- Set GNU tar's consumer-side `--no-same-owner` option so the released nested
  archives retain their bytes without attempting an unavailable uid/gid chown
  in user-namespace filesystems.
- Start one owned process group; on timeout, kill and reap that group.
- Run into a private staging directory and require the exact catalog artifact
  set before publication.
- Refuse an already-existing output path, including an empty or stale one.
- Preserve valid domain outcomes such as `partial` as useful delivery when the
  released CLI reports `ok: true` and produces every promised artifact.

The sanitized child environment removes JavaScript hook variables such as
`NODE_OPTIONS`. It does **not** claim operating-system network isolation: a job
inside Node.js could still use networking if its released code did so.

## Tests

```sh
python3 -m unittest discover -s test -v
```

The suite builds a zip application, moves execution to a clean temporary
directory, and sends three semantically different caller inputs through the
real released CLI. It also checks real engine failure, timeout group cleanup,
bad archive digest, stdin/caller byte ceilings, Unicode/path-space handling,
literal shell text, path traversal, exact artifact enforcement, occupied/stale
output, and a valid partial domain report.
