All three original receiving directories are immutable in this integration.
Their missing dependency/setup failures, ROOT425 pre-case schema failures,
native-reader 401 and original reports remain at the exact supplied exports.
`ORIGINAL-EXPORTS.json` inventories their original paths and bytes.

This owner's material failures are retained, without promoting them to passes:

- `00-telemetry.log.gz` is empty: attempting the required absent
  `tools/ops/agent-status --json` raised Python `FileNotFoundError` in the
  new sampler before a command could start (outer exit 1). It supplied no
  telemetry or resource receipt. No other component/job was investigated.
- `03-wallet-first.log.gz`: 18 passes / 4 failures including the parent.
  Native login on a legacy-created account returns 503 because its password
  record uses a different existing credential format; native recovery of its
  legacy-format recovery code returns 400. The missing native session row is
  a cascading fixture error. This job does not change credential issuance or
  migrate those credentials. The corrected fixture creates its native account
  through the actual native issuer **before** original work exists, then logs
  into that same account after actual task/result membership exists. The real
  legacy-issued requester retains its original membership and success. No old
  debt or membership is moved to a replacement principal.
- `04-wallet-corrected.log.gz`: 20 passes / 2 failures including the parent.
  Setting expiry before auth_time violates the existing database constraint.
  Advance the fixture's actual configured clock instead; explicit revocation
  is separately exercised and restored.
- `12-wallet-final.log.gz`: 20 passes / 2 failures including the parent.
  The populated store refuses a foreign tenant at startup with `tenant_refused`;
  the test incorrectly expected a running HTTP listener. The corrected test
  asserts this exact existing refusal, then restarts the original tenant and
  receives the same artifact/financial state.
- `17-wallet-historical.log.gz`: exit 1 / `spawnSync git ENOBUFS` before PG.
  The complete SDS79 source is 82,530,144 file bytes, exceeding the harness's
  64 MiB archive buffer. Stream Git's archive to an owned temporary file and
  extract it; do not raise Node's heap cap. `18-wallet-historical.log.gz`
  receives the complete original graph, five verified old authority hashes,
  both legacy result success and native historical 401, 5/5 assertions.
- `28-source-closure.log.gz`: exit 1 at the first inherited runtime-file-map
  mismatch, in SDS79 itself. All three mismatches and exact corrections are in
  `RUNTIME-CONTRACT-REPAIR.json`. The maintained map last changed at `3009b83`;
  the later owning cold-receipt implementation `b6fb689` changed those three
  runtime members without refreshing this map. Receive their actual bytes in
  the existing map and regenerate the ordinary source closure. No runtime
  bytes, financial contract/authority, schema, base/commerce identities or other
  map member changes. Final audit explicitly receives the three historical
  SDS79 mismatches and requires zero mismatches on the successor. Actual
  underlying runtime members remain byte equal across both sources.
- `48-monitor-historical.log.gz`: expected exit 1, 0/2 on exact SDS79. Both
  original availability/document acquisition failures reproduce. This is an
  accepted negative control, not an unsuccessful candidate.

Earlier successful intermediate runs retain their original command receipts and
logs. Only the final source-bound groups listed in QUALIFICATION.md establish
combined acceptance. Raw logs are gzip-compressed losslessly with original
uncompressed SHA256 in `EVIDENCE-INDEX.json`; no diagnostic whitespace was edited.
