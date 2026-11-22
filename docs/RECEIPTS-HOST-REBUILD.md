# Hosted receipt rebuild

Root owns host enrollment and scheduled execution. This adds one finite wrapper
around the existing read-only chain builder and atomic snapshot publisher. It
adds no financial ledger, buyer route, service or monitor.

The current host has 97 retained values and no receipt/RPC settings. Use the
complete-environment broker; preserve every existing value. Enroll these two
host-only inputs first:

| Variable | Value |
| --- | --- |
| SDS_RECEIPTS_PRIVATE_EXPORT_GZIP_BASE64 | Canonical unwrapped Base64 of the gzip buffer produced from the exact reviewed private gateway projection; never source or public files |
| SDS_RECEIPTS_REBUILD_PATH | /home/u188979531/.samedaydesk-receipts/snapshot.json |

The reviewed VM input is
`/home/ubuntu/.grand-native-recipient-20261121/sds-receipts-private-20261121.json`,
11,114 bytes, SHA-256
`d66b647fddc59ccc4bd881ff69ce1e5e1bfe9f821c66dd0b9fe087663d305712`.
It is Root's November 21 15:08:37 UTC gateway projection: 81 records, zero
invalid. It is not a new gateway export. Keep it private and preserve its bytes.

Hostinger rejected the plain Base64 enrollment with HTTP422 and an observed
8,192-character per-value limit. The 11,114-byte input's plain Base64 is 14,820
characters. No host values were installed and no native job ran. Root's rejected
99-value postimage remains safely saved as VLT-6BD3FDB0596D3EF050364BB0; preserve
the currently installed 97-value preimage when preparing the corrected postimage.

Use exported `gzipPrivateExport` from `scripts/refresh-receipts.mjs`: it applies
Node `gzipSync` at level9 directly to the validated original Buffer, without
reformatting, compaction or reclassification. Encode its returned buffer with
`toString("base64")`, without wrapping. The reviewed Node22/zlib1.3.1 result is:

- Original: 11,114 bytes, SHA-256 `d66b647fddc59ccc4bd881ff69ce1e5e1bfe9f821c66dd0b9fe087663d305712`.
- Gzip: 3,678 bytes, SHA-256 `1ee386b30bb2f44e9db698319e0803a2027435fdcda09cfcd0a91b7d9aaacca2`.
- Canonical Base64: 4,904 characters, below the 8,192-character host limit.

The exact private gzip buffer is available on the VM at
`/tmp/sds-gzip-host-rebuild-20261121/private/payer-export.json.gz`, mode0600
inside a mode0700 directory. It is not source, public data or a second ledger.
Root may reuse those exact buffer bytes or privately regenerate/verify them
with the exported producer. Verify decoded original byte length/hash as well.

The decoder accepts exactly one of the new gzip field and legacy
`SDS_RECEIPTS_PRIVATE_EXPORT_BASE64`. Omit the old field entirely for this host;
an empty old field alongside gzip is also refused. Plain Base64 remains valid
for smaller exports, subject to the same 8,192-character cap. Both formats must
be canonical and unwrapped. Gzip uses `gunzipSync` with a 1,048,576-byte
`maxOutputLength`; truncated/corrupt streams, expansion bombs, oversized values,
invalid policy, missing input and double input fail before a decoded file or
builder is created. Decompression restores the exact original bytes.

The wrapper uses the tested public read routes, PublicNode for log ranges and
Base mainnet for individual records, with 1,000 ms pacing. These values are set
only in the builder child; no host BASE_RPC/BASE_HASH_RPC value is required.
The child receives exactly those two routes, RECEIPTS_RPC_INTERVAL_MS,
RECEIPTS_PRIVATE_EXPORT (the decoded temporary file) and its staged
SDS_RECEIPTS_SNAPSHOT_PATH. It inherits no other host secrets.

The stable snapshot parent is private mode 0700 and the file is 0600. Existing
insecure parents/files are refused without permission changes. Each invocation
owns a unique 0700 staging directory and a 0600 decoded policy file. It holds
an exclusive `.rebuild.lock`, runs the existing builder once, validates the
candidate, removes its temporary policy, then uses the existing atomic writer.
Builder, policy, invalid/stale candidate, timeout and interruption failures leave
the last-good snapshot untouched. Cleanup removes only that invocation's files.
A busy lock is reported and left alone. A lock left after an external SIGKILL
requires Root to verify no job remains before removing that exact empty lock.

The child deadline is 27 minutes, leaving cleanup time within the host's
30-minute limit. No retry, endpoint fallback, partial publication or new
resident process is used. Stdout is one safe JSON receipt with success/failure,
stage, counts, finalized block, snapshot hash, duration and cleanup state.
Raw policy, private paths, URLs, credentials and child diagnostics are omitted;
RPC method/status/code are retained when available. Nonzero means failure or
incomplete cleanup; inspect `published` separately if publication had completed.

After deploying the exact checked source, Root invokes this single executable
command through the existing Hostinger scheduler (UTC):

```text
/opt/alt/alt-nodejs22/root/usr/bin/node --env-file=/home/u188979531/domains/samedaydesk.com/hbuilds/config/.env /home/u188979531/domains/samedaydesk.com/hbuilds/current/nodejs/scripts/refresh-receipts.mjs
```

No shell prefix or compound command is needed. Keep the protected dotenv out
of the web root and retain its existing permissions. Read back the native job's
actual output; a saved schedule is not an execution receipt. The prior complete
existing-builder run took 19 minutes 32 seconds; the wrapper run's measured
result belongs in its exact-source release receipt.
The successful 19m29s wrapper run belongs to source7ebf970 with plain input.
The gzip decoder successor reuses that unchanged builder/child proof; its new
decoder/CLI/check/build receipts are separately scoped. Root's first actual
hosted full run qualifies the configured gzip path before switching app reads.
The CLI resolves its entry path before comparing it with ESM's resolved module
URL, so the host's `hbuilds/current` directory symlink is exercised correctly.

**Switch the app snapshot path last.** Only after the first native invocation
returns `ok:true`, `published:true`, `cleanupComplete:true`, and Root verifies
the private snapshot, use the complete-environment broker to add:

```text
SDS_RECEIPTS_SNAPSHOT_PATH=/home/u188979531/.samedaydesk-receipts/snapshot.json
```

Retain both rebuild inputs and all 97 original values. The running app and
future rebuilds must use the same stable file. Root owns the required app
restart and HTTP readback. Before that final switch the app retains its existing
compiled snapshot. Rollback preserves the private last-good file; pause only
this owned job and remove the app override through Root's normal broker if needed.

Focused verification: `node --test scripts/refresh-receipts.test.mjs` (also in
the existing nine-gate release check). Whole-source qualification still uses
`npm run release:check` and the saved `npm run build:managed-foundry` profile.
