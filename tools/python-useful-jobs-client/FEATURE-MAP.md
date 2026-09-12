# Feature map — W5-D08 Python useful-jobs client

SDS importable Python 3 client for the published useful-jobs archive. Thin
consumer of the PR51 archive CLI. Not F08 `server/paid-useful-jobs/` (W5-D01).
Not I01 earned-work. Not a homepage or live catalog change.

| Field | Value |
| --- | --- |
| User goal | Fresh-install Python client verifies the committed archive, extracts it, lists catalog job ids from the extracted catalog, and runs `vendor-budget-impact` as a labeled SAMPLE or on caller before/after files. Unsafe archives and missing outputs fail without orphan Node processes. |
| Entrypoint | `tools/python-useful-jobs-client/` (`samedaydesk_useful_jobs`, `python -m samedaydesk_useful_jobs`, console script `samedaydesk-useful-jobs`) |
| Command | `python3 -m pip install tools/python-useful-jobs-client && samedaydesk-useful-jobs run vendor-budget-impact --example` |
| Engine | PR51 useful-jobs Node CLI (`bin/useful-jobs.mjs`) via subprocess. Archive 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`. Hash terms require **both** bytes and sha256. |
| State | `sample` / `caller-input`; `sold` always false; `purchaseAuthority: false`; `--example` is SAMPLE, never a sale. Run `outcome`: `complete` / `missing-output` / `analysis-refusal` / `engine-refused` / `engine-crash` / `engine-timeout`. |
| Tests | `tools/python-useful-jobs-client/test/*.test.mjs` via `node --test --test-concurrency=1` including `pip install --user` |
| Account prerequisite | None. Offline committed tarball. Node 22 and Python 3. Optional local HTTP `--origin` is still hash-checked. No wallet, facilitator, chain, or new account. |

## Acceptance classes

| Class | Meaning in this package |
| --- | --- |
| fixture | `--example` SAMPLE run (not a customer) |
| local-runtime | committed file acquire, or local HTTP serving matching bytes, plus real Node |
| external-acceptance | live `https://samedaydesk.com` GET. Not claimed here (F18 already covered live GET). |

## Later integration bindings (W5-D01)

- Tested against useful-jobs CLI from the PR51 archive and SDS pin `aeef964fa188443078958d9d6d393afae1d542ee` (PR52 wrapper, read-only; not vendored).
- D01 still owns the supplied-input paid wrapper contract. This client does not claim that wrapper's future behavior.
- I01 earned-work kernel is not imported.
