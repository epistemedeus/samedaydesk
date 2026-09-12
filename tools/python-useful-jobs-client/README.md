# samedaydesk-useful-jobs 1.1.0

An importable Python client and console script for the pinned SameDayDesk
useful-jobs **1.4.1** archive. It verifies the byte length and SHA-256, extracts
privately, and invokes the existing Node CLI for all ten catalog jobs. Job
semantics remain in that archive.

Requirements: Linux with procfs and renameat2, Python 3.12+, Node 22+, and GNU
tar for nested released archives. The Python runtime has no third-party
dependencies. Installation uses setuptools.

## Install and run outside a checkout

Build/install this directory or its wheel into a virtual environment:

```sh
python3 -m venv /tmp/useful-jobs-venv
/tmp/useful-jobs-venv/bin/python -m pip install ./tools/python-useful-jobs-client
cd /tmp
/tmp/useful-jobs-venv/bin/samedaydesk-useful-jobs run vendor-budget-impact \
  --archive /absolute/path/to/useful-jobs-1.4.1.tar.gz --example \
  --out-dir /absolute/path/to/new-output-directory
```

The archive is separate from the wheel. Packaged `pins.json` supplies its
complete contract; explicit `--archive` or `--origin` does not require a
checkout, `PYTHONPATH`, or `SAMEDAYDESK_ROOT`. Without either source, development
invocations discover the checkout or use `SAMEDAYDESK_ROOT` and verify its kit
metadata against the packaged pins. No archive is downloaded automatically.

Pinned archive: `client/public/for-agents/useful-jobs/useful-jobs-1.4.1.tar.gz`,
2,575,456 bytes, SHA-256
`b365d95c8fb7695f96248433a7d440c9917b4d5085b1ce71b3982e4291e1bc3d`.
Optional `--origin URL` fetches the pinned public path and verifies the same
bytes. This review used repository bytes and ephemeral loopback HTTP; it does
not establish that a live public host serves these bytes.

## Interface and ownership

Commands: `version`, `acquire`, `catalog`, `list`, `help [job]`, and
`run <job> [engine arguments]`. `python -m samedaydesk_useful_jobs` exposes the
same interface. `--example` labels SAMPLE results and cannot claim a sale.

Caller input paths are resolved against the invoking working directory before
Node changes directories. File options support `--before FILE` and
`--before=FILE`. Duplicate transport options and empty paths refuse. Arguments
are passed as an argv array without shell interpretation. Route input URLs
retain the archive's loopback policy. Companion paths inside job documents keep
the released engine's resolution rules. Page-change supports its `job`,
`compare`, and `journey` subcommands.

Output must be a new destination. Existing files, directories, and symlinks
remain untouched. An omitted `--out-dir` creates a unique named output in the
caller's working directory. The engine writes into a private stage on the
output filesystem. Publication requires zero exit status, one complete strict
JSON report, an owned output path, and exactly the promised regular artifacts.
JSON envelopes, identity/status consistency, Markdown headings and calendar
structure are validated. Atomic Linux no-replace rename publishes the directory.
`artifacts` records byte lengths and SHA-256 values; `domainStatus` preserves
partial/informational/actionable results separately from `published` delivery.
Validation does not recompute engine semantics or prove business usefulness.

Each invocation uses a dedicated Linux subreaper. Timeout and normal-exit cleanup
include detached descendants and exclude other children of the Python API host.
`USEFUL_JOBS_TIMEOUT_SEC` must be finite, positive, and at most 300 (default 120).
Stdout and stderr are limited to 1 MiB each. Extraction is limited to 5,000
members and 64 MiB expanded; artifacts to 8 MiB each and 16 MiB total at validation.
The consumer sets child-local `TAR_OPTIONS=--no-same-owner` for user-namespace
compatibility. These lifecycle controls are not a filesystem/network sandbox.

Automatic acquisitions used by list/help/catalog/run are removed after use.
Explicit `acquire` retains its returned directory for the caller. Python callers
can use `with acquire(archive=...) as kit:` or call `kit.close()`; a supplied kit
is borrowed by `run_job` and remains caller-owned. Historical `kitRoot` in an
automatic invocation's response identifies an extraction already removed.

```python
from samedaydesk_useful_jobs import acquire, run_job

with acquire(archive="/absolute/path/to/useful-jobs-1.4.1.tar.gz") as kit:
    result = run_job("vendor-budget-impact", ["--example", "--out-dir", "new-output"], kit=kit)
```

## Verification and integration

```sh
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 tools/python-useful-jobs-client/test/*.test.mjs
```

This includes a fresh venv console-script invocation outside the checkout,
archive controls, real partial/refused input, corrupted real outputs, publication
races, literal arguments, bounded streams, and detached-descendant cleanup.

The recommended future Python entry is this existing `samedaydesk-useful-jobs`
package. CW39's separate Work/stdin consumer is read-only prior evidence, with
useful request-materialization and zipapp features for a later deliberate
consolidation. No new package or alternate public command was added here. See
`experiments/codex-window/cw64-installed-client-current-runtime/GROK-HANDOFF.md`
for exact refs, evidence and integration limits. `RECEIPT.md` remains unchanged
historical evidence for the earlier consumer.
