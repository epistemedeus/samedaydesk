# AE21 U2c result (20261015T142007Z)

- Host: cursor; node v22.14.0; Postgres ssl=on (prereqs via pilot e0857e831b52e3841bdbb97362a482adaaf49113 tools/ae14-pg-receiving; SDS test/run.mjs owns the disposable verify-full cluster).
- Ran from samedaydesk `435872eac2fd52ae0edc808ebf919c6a256b48cc` with the U2c vendor and mount changes uncommitted. Writer-path guard passed.
- u2c.sh sha256 `259031983f3fc4e6dcf63ad4dc7c055dd2b035a57bf1f704bf2bc0bcbc852fd5` (pilot `codex/ae14-launch`, unmodified).
- Gateway archive `neomorphic-machine-gateway-0.1.2.tgz` sha256 `0171af58f67ac845b720ee6d1cf7765cc1a0b4c65c5b258fc1dbd5ea99f5cfb6` (U1 `09d37501dc0ffedc67e3e7c8c3e3e97a05bef3a3`).
- **Verdict: pass** (`U2C_VERDICT=pass`)

| Step | Exit | Counts |
| --- | --- | --- |
| Writer paths | 0 | ok |
| Archive pin | 0 | ARCHIVE ok |
| Vendor verify (10 blobs) | 0 | verified 10 vendored files |
| Full machine-services PG | 0 | # tests 69 # pass 69 # fail 0 # cancelled 0 # skipped 0 |
| Full SQLite/vendor | 0 | # tests 100 # pass 100 # fail 0 # cancelled 0 # skipped 0 |
| Regression | 0 | # tests 49 # pass 49 # fail 0 # cancelled 0 # skipped 0 |

No failing tests. NC1–NC6 are inside the PG 69.
