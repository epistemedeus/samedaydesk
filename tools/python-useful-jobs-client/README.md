# samedaydesk_useful_jobs

Importable Python 3 client for the SameDayDesk useful-jobs package. It verifies
the committed archive sha256 and byte length, extracts to a temp directory, and
runs `list` / `help` / `run` through subprocess Node. It does not rewrite job
engines and has no payment path.

Stdlib only. No pip dependencies.

## Requirements

- Python 3.10+
- Node.js 22 or newer on PATH (after extract)
- The SameDayDesk checkout with PR51 `useful-jobs-1.0.0.tar.gz`, or an
  `--archive` file whose sha256 and bytes match the published hash terms

## Hash terms

Both size and digest must match before extract. Current pin from
`client/src/data/usefulJobsKit.json`:

- bytes: `2522418`
- sha256: `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`
- jobs: `api-upgrade-brief`, `vendor-budget-impact`, `feed-agenda`,
  `evidence-ci-annotation`, `listing-repair-packet`, `repeat-job-record`

## Install

From the repository root (uses the same published hash terms; `pins.json` is
packaged with the wheel):

```bash
python3 -m pip install tools/python-useful-jobs-client
samedaydesk-useful-jobs run vendor-budget-impact --example
```

Set `SAMEDAYDESK_ROOT` to the SameDayDesk checkout, or pass `--archive` to a
file whose sha256 and bytes match. A catalog/list/run with no archive and no
kit JSON refuses `missing-archive`; it does not print a constant job list.

## Run without install

```bash
PYTHONPATH=tools/python-useful-jobs-client python3 -m samedaydesk_useful_jobs acquire
PYTHONPATH=tools/python-useful-jobs-client python3 -m samedaydesk_useful_jobs list
PYTHONPATH=tools/python-useful-jobs-client python3 -m samedaydesk_useful_jobs help vendor-budget-impact
PYTHONPATH=tools/python-useful-jobs-client python3 -m samedaydesk_useful_jobs run vendor-budget-impact --example
```

Caller files copied from the archive (not `--example`):

```bash
PYTHONPATH=tools/python-useful-jobs-client python3 -m samedaydesk_useful_jobs run vendor-budget-impact \
  --before ./before.json \
  --after ./after.json \
  --out-dir ./out/budget
```

`--example` is a labeled SAMPLE. Passing `--sold` / `--sale` / `--settle` with
`--example` refuses `sample-as-sale`.

Optional `--origin URL` fetches `{origin}/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`
and still verifies sha256 and bytes. Mismatch refuses before extract. Default
acquire uses the committed tarball, not live HTTP.

Unsafe archive members (`..`, absolute paths, links) refuse before extract.
The client never falls back to unfiltered `tarfile.extractall`. Missing
expected outputs after an engine `ok` refuse as `missing-output`. Node
subprocesses are process-group killed on timeout (`USEFUL_JOBS_TIMEOUT_SEC`,
default 120).

## Import

```python
from samedaydesk_useful_jobs import JOB_IDS, HASH_TERMS, acquire, run_job

kit = acquire()
result = run_job("vendor-budget-impact", ["--example"], kit=kit)
```

## Tests

Python 3 and Node 22. No Postgres. Local HTTP is used only for `--origin`.
A fresh `pip install --user` of this directory is required by
`test/installed-cli.test.mjs`.

```bash
node --test --test-concurrency=1 tools/python-useful-jobs-client/test/*.test.mjs
```

or:

```bash
cd tools/python-useful-jobs-client && npm test
```

## Later integration

W5-D01 owns the PR52 paid wrapper at `aeef964fa188443078958d9d6d393afae1d542ee`.
This client consumes the published useful-jobs Node CLI from the verified
archive. It does not vendor that wrapper or the earned-work kernel.

## License

MIT (`LICENSE`). Nested useful-jobs archives keep their own licenses (`NOTICE`).
