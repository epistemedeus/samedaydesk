# CW06 Python/stdin consumer for useful-jobs 1.4.0

This is a thin Python standard-library bridge to the **actual released Node.js
command-line interface (CLI)** in `useful-jobs-1.4.0.tar.gz`. It does not copy or
reimplement any job engine. The hinge is simple: caller-owned bytes arrive as
one bounded JSON object on standard input, become temporary files, and are
passed as a literal argument vector to the released CLI.

The release contains ten offline jobs. They are not ten paid Hypertext Transfer
Protocol (HTTP) endpoints. This consumer has no payment, purchase, public
network-fetch, or scheduler path.

## Exact source

- Original implementation base: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`
- CW39 review base: `84257ecca8e8e91f51b73f76088d0816a48c05d2`
- Archive: `client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz`
- Bytes: `2575215`
- SHA-256 (Secure Hash Algorithm 256-bit):
  `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`
- Runtime: Linux with procfs and `renameat2`, Python 3.11+ standard library,
  Node.js 22+, and GNU tar for the nested legacy engines. Other operating
  systems refuse explicitly.

## Run directly

From this directory:

```sh
python3 -m cw06_useful_jobs \
  --archive ../../../client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz \
  --output-dir '/tmp/cw06 result' \
  < examples/lockfile-pin-delta.json
```

The output directory must not exist. On success it contains exactly the job's
catalog-promised artifacts plus `result-manifest.json`. Publication uses Linux `renameat2(RENAME_NOREPLACE)` on the destination
filesystem. A competing file, directory, or dangling symlink is preserved and
causes a refusal. Parent directory descriptors prevent a renamed parent from
redirecting staged writes. No copy fallback publishes partial output.

## Build a standard-library Linux zip application

```sh
python3 build_zipapp.py /tmp/cw06-useful-jobs.pyz
```

The builder includes only the runtime package, so rebuilding cannot embed an
old zipapp, tests, build outputs, or caller data. Copy the pyz and verified
archive into a clean Linux directory and run the same arguments with
`python3 -I cw06-useful-jobs.pyz`. A fresh virtual environment can also install
this directory with `python -m pip install .`, exposing `cw06-useful-jobs`.

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

- Read a bounded private archive snapshot, verify its exact size and SHA-256,
  and extract that same snapshot. Caller path replacement cannot substitute bytes.
- Extract regular files/directories only; reject links, devices, traversal,
  foreign roots, raw dot/empty components, duplicate paths, excessive member
  counts, and excessive expanded bytes. Ignore archive owner/mode metadata.
- Resolve Node.js once and invoke it with `subprocess.Popen([...])`, never
  `shell=True` or interpolated shell text.
- Set GNU tar's consumer-side `--no-same-owner` option so the released nested
  archives retain their bytes without attempting an unavailable uid/gid chown
  in user-namespace filesystems.
- Run each command under a dedicated Linux child subreaper. On timeout or
  completion, terminate and reap its descendants, including detached sessions.
  The Python API host never becomes a process-wide subreaper. Engine scratch
  directories are private and removed after the descendants exit.
- Capture stdout and stderr incrementally, limiting each to 1 MiB.
- Require the exact catalog artifact set with no extra directories or special
  files. Artifacts must be owned regular files with one link, each nonempty and
  at most 8 MiB, at most 16 MiB in total. Validate UTF-8, strict JSON, released
  envelope identity and status consistency, Markdown headings, and balanced
  calendar envelopes before hashing and publication.
- Refuse an already-existing output path, including an empty or stale one.
- Preserve valid domain outcomes such as `partial` as useful delivery when the
  released CLI reports `ok: true` and produces every validated artifact.
  An explicit `refused` domain status fails closed even if transport returned
  `ok: true`. Partial is still non-final evidence, not an actionable claim.

The sanitized child environment replaces caller `NODE_OPTIONS` with the fixed
`--max-old-space-size=768` setting and sets `TAR_OPTIONS=--no-same-owner`.
The tar option addresses user-namespace ownership portability. It is not a
security sandbox. Subreaping and publication controls are not a sandbox either:
released code still has the caller's filesystem/network permissions. A caller
who can kill the supervisor or modify the wrapper itself is outside this boundary.

Output validation checks delivery structure and consistency, not recomputed job
semantics or production usefulness. Disk output is bounded at validation, not by
a filesystem quota while Node executes. Engine-specific referenced files (for
example page-change job companions and repeat-job inputs) retain the released
engine's path/byte rules; this v1 request transport does not materialize extra
companion files or expose optional CLI flags. The stdin/caller byte limits cover
only the materialized `inputs` map. No independent customer use is claimed.

## Tests

```sh
python3 -m unittest discover -s test -v
```

The original ten tests remain. CW39 adds raw tar, link/owner, byte-boundary,
strict-output, publication-race, detached-descendant, live-flood, and literal-argv
regressions. Fresh zipapp tests use new lockfile, used-schema, and partial-budget
inputs and assert their actual contents. Tests are sequential; the released
archive suite is run separately with `node --test --test-concurrency=1` and
`NODE_OPTIONS=--max-old-space-size=768`.

See [CW39-REVIEW.md](CW39-REVIEW.md) for witnessed defects and evidence limits.
