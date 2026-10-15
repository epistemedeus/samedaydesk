# AE21 U2 remote result (20261015T124443Z)
- Host: cursor; node v22.14.0; Postgres bin /usr/lib/postgresql/16/bin (prereqs via pilot e0857e831b52e3841bdbb97362a482adaaf49113 tools/ae14-pg-receiving; SDS test/run.mjs owns the disposable verify-full cluster).
- Base: samedaydesk daa3bdee79c441ba89559ea4eb2c749e312435fd. U2 commit: d6988a152f8a8bdbea348e91a99c3b6647a90803. Branch tip at start: 6ad00114f7e1470c802e704c9518835df9a8bca4.
- **Verdict: fail**

| Step | Exit | Counts |
| --- | --- | --- |
| RED (base + tests only; NC1-NC6 must all fail) | 1 | NC failed 6 / passed 0; # tests 8 # pass 2 # fail 6 # cancelled 0 # skipped 0  |
| Vendor verify (10 blobs) | 0 | verified 10 vendored files |
| GREEN NC1-NC6 | 1 | NC passed 1; # tests 8 # pass 3 # fail 5 # cancelled 0 # skipped 0  |
| Full machine-services PG (lifecycle, integration, url-extract) | 1 | # tests 69 # pass 64 # fail 5 # cancelled 0 # skipped 0  |
| Full SQLite/vendor (gateway incl. U1 tenant tests, monitor) | 0 | # tests 100 # pass 100 # fail 0 # cancelled 0 # skipped 0  |
| Regression (hosted startup, SPA, correspondence, webhook, drain) | 0 | # tests 49 # pass 49 # fail 0 # cancelled 0 # skipped 0  |

Negative controls (test/url-extract.test.mjs):
- NC1 url.extract.* mounted and discoverable; loopback submit -> no_fit, attempts 0.
- NC2 job persisted in PG survives a process restart (same jobId/digest/state; idempotent replay; tenant sds-u2:tenant-0).
- NC3 cross-tenant poll/result refused (e08_job_forbidden).
- NC4 missing env name fails closed with a named error (url_extract_unbound, url_extract_binding_missing, machine_database_unconfigured, invalid_url_extract_binding, url_extract_schema_absent with no auto-migrate); .names subset of env.keys; N2 runtime.example accepted.
- NC5 vendor script refuses a tampered file (blob mismatch) and an unlisted file.
- NC6 closed extraction pool -> url_extract_store_closed 503; services close unbinds (url_extract_unbound); no unhandled rejections.

Failing test names (if any):
```
not ok 3 - NC1 url.extract.* is mounted and discoverable on the SDS gateway
not ok 4 - NC2 a job persisted in Postgres survives a process restart (same jobId, digest, one row)
not ok 5 - NC3 a cross-tenant read is refused
not ok 6 - NC4 a missing env name fails closed with a named error; the env packet is one coherent set
not ok 8 - NC6 a closed extraction pool makes url.extract calls fail cleanly; lifecycle follows the store
not ok 64 - NC1 url.extract.* is mounted and discoverable on the SDS gateway
not ok 65 - NC2 a job persisted in Postgres survives a process restart (same jobId, digest, one row)
not ok 66 - NC3 a cross-tenant read is refused
not ok 67 - NC4 a missing env name fails closed with a named error; the env packet is one coherent set
not ok 69 - NC6 a closed extraction pool makes url.extract calls fail cleanly; lifecycle follows the store
```
