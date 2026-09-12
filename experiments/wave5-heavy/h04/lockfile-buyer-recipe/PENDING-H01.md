# Pending H01 transfer

Merchant client one-path admission is applied on
`epistemedeus/x402-url-extractor` branch
`codex/w5-lockfile-customer-client-20260912` (base pin
`ca38205279f0d543515b81b7261909e55ea2600f`, local head
`ee669a5877bc8df28b5fa90ccb55e06fc60816d1`).

`git push -u origin HEAD` from this session returned **403**
(`Permission to epistemedeus/x402-url-extractor.git denied to cursor[bot]`).
Draft PR into `master` was not opened. Root/H01 needs to push that local
branch and open the draft PR.

Owned on that branch:

- `examples/customer-x402/**`
- `examples/lockfile-pin-delta-buyer/README.md`

**Not applied** (stay in this SDS packet for H01):

- `mcp-tool-metadata.mjs`
- `lockfile-pin-delta-config.mjs`

See `patch/files/` for those two hunks. Do not treat kit 1.1.0 as a live
public URL; it remains a candidate / not publicly deployed.
