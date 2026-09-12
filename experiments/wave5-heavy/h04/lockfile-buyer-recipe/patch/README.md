# Merchant patch packet (Root transfer)

Pin: `ca38205279f0d543515b81b7261909e55ea2600f`.
Do not apply from this SDS branch onto the live merchant. Root copies
these exact consumer paths.

## Targets

See `TARGETS.json`. Smallest functional change is
`examples/customer-x402/src/authorization.mjs` POST routing:
`/lockfile-pin-delta` vs `/extract/batch`. Purchase, preflight, wallet,
attempt-receipt, and reconcile are already generic.

Discoverability extras (keep if applying the packet):

- `examples/customer-x402/src/constants.mjs`
- `examples/customer-x402/bin/cli.mjs` (usage only)
- `examples/customer-x402/README.md`
- `examples/customer-x402/fixtures/authorization-lockfile.json`
- `examples/lockfile-pin-delta-buyer/README.md`
- `mcp-tool-metadata.mjs` (lockfile tool copy)
- `lockfile-pin-delta-config.mjs` (description / quote meaning)

GET `/extract` and POST `/extract/batch` authorization are unchanged.

## Apply (merchant repo)

```bash
cd x402-url-extractor
git checkout ca38205279f0d543515b81b7261909e55ea2600f
git apply /path/to/merchant-ca38205.lockfile-customer-x402.patch
```

Or copy files from `files/` over the same relative paths.
