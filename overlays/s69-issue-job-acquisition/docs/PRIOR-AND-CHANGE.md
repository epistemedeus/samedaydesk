# Prior and change consumer workflow

Schema: `samedaydesk.recurring-job-prior.v1` (sequenced artifact).

1. Run without `--prior` and with `--write-artifact` to create `issue-evidence.seq-1.json`.
2. Keep that file immutable. Do not open-and-rewrite it.
3. Later run with `--prior path/to/issue-evidence.seq-1.json` and `--write-artifact`
   to emit `seq-2` plus a result where `outcome` is `unchanged` | `changed` | `partial` | error.
4. Same-length comment body edits still classify as changed when hashes differ.
5. Consumers should read `evidence.delta` / fingerprint fields and preserve
   `retrievalStatus` / completeness rather than inventing full history.
