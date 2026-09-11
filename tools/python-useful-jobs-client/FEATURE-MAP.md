# Feature map — W4-commerce-14 Python useful-jobs client

SDS importable Python 3 client for the published useful-jobs archive. Not F08
`server/paid-useful-jobs/`. Not I01 earned-work. Not a homepage or live catalog
change.

| Field | Value |
| --- | --- |
| User goal | Verify the committed useful-jobs archive, extract it, list catalog job ids, and run `vendor-budget-impact` as a labeled SAMPLE or on caller before/after files. |
| Entrypoint | `tools/python-useful-jobs-client/` (`samedaydesk_useful_jobs`, `python -m samedaydesk_useful_jobs`) |
| Command | `PYTHONPATH=tools/python-useful-jobs-client python3 -m samedaydesk_useful_jobs run vendor-budget-impact --example` |
| Engine | PR51 useful-jobs Node CLI (`bin/useful-jobs.mjs`) via subprocess. Archive 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`. Hash terms require **both** bytes and sha256. |
| State | `sample` / `caller-input`; `sold` always false; `purchaseAuthority: false`; `--example` is SAMPLE, never a sale |
| Tests | `tools/python-useful-jobs-client/test/*.test.mjs` via `node --test --test-concurrency=1` |
| Account prerequisite | None. Offline committed tarball. Node 22 and Python 3. Optional local HTTP `--origin` is still hash-checked. No wallet, facilitator, chain, or new account. |

## Acceptance classes

| Class | Meaning in this package |
| --- | --- |
| fixture | `--example` SAMPLE run (not a customer) |
| local-runtime | committed file acquire, or local HTTP serving matching bytes, plus real Node |
| external-acceptance | live `https://samedaydesk.com` GET. Not claimed here (F18 already covered live GET). |

## Later integration bindings (Root)

- F08 Node paid wrappers remain the payment prototype; this client must not mark SAMPLE as sold.
- Live origin fetch can be bound later; mismatch refuse is already tested on local HTTP.
- I01 earned-work kernel is not imported.
