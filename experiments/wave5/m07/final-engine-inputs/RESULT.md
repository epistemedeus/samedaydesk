# W5-M07 final-engine-inputs

## Verdict

**PASS** — 16/16 engine-case runs. OWNERQA defects: 0. Payable N-BTY003: 0.

## Exact source

- Merchant: `epistemedeus/x402-url-extractor@ca38205279f0d543515b81b7261909e55ea2600f vendor/lockfile-pin-delta/`
- Public kit 1.2.0: `epistemedeus/samedaydesk@9ae0febd8c184c0cbbb5e481ba31ac620e89b869 client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz` sha256 `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb`
- D01 PR74 kernel compared: `epistemedeus/samedaydesk@46f2b7f55a7fb780333073a5197b64b8fde64a33 tools/lockfile-pin-delta/`
- Merchant CLI root: `/tmp/w5-m07-final-ro/merchant-ca382052/vendor/lockfile-pin-delta/`
- Kit root: `/tmp/w5-m07-final-ro/kit-1.2.0/useful-jobs-1.2.0`

## Command

```bash
cd experiments/wave5/m07/final-engine-inputs && node --test --test-concurrency=1 test/*.test.mjs && node bin/replay-final.mjs
```

## Observed

| Case | Engine | Kind | Detail |
| --- | --- | --- | --- |
| alias-v3-integrity | merchant | match | explained string-width at node_modules/string-width-cjs kinds=integrity |
| alias-v3-integrity | kit | match | explained string-width at node_modules/string-width-cjs kinds=integrity |
| alias-v2-integrity | merchant | match | explained string-width at node_modules/string-width-cjs kinds=integrity |
| alias-v2-integrity | kit | match | explained string-width at node_modules/string-width-cjs kinds=integrity |
| scoped-v3-version | merchant | match | explained @supabase/auth-js at node_modules/@supabase/auth-js kinds=integrity,resolved,version |
| scoped-v3-version | kit | match | explained @supabase/auth-js at node_modules/@supabase/auth-js kinds=integrity,resolved,version |
| nested-same-name-v3 | merchant | match | explained content-type at node_modules/body-parser/node_modules/content-type kinds=integrity,resolved,version |
| nested-same-name-v3 | kit | match | explained content-type at node_modules/body-parser/node_modules/content-type kinds=integrity,resolved,version |
| workspace-link-stub-v3 | merchant | supported-unknown | link-stub-skipped |
| workspace-link-stub-v3 | kit | supported-unknown | link-stub-skipped |
| workspace-target-v3 | merchant | match | explained @neomorphic/correspondence at vendor/neomorphic-correspondence kinds=version |
| workspace-target-v3 | kit | match | explained @neomorphic/correspondence at vendor/neomorphic-correspondence kinds=version |
| pin-noise-control-v3 | merchant | match | pin identity fields unchanged; extra keys omitted |
| pin-noise-control-v3 | kit | match | pin identity fields unchanged; extra keys omitted |
| scoped-resolved-integrity-v3 | merchant | match | explained @stablelib/base64 at node_modules/@stablelib/base64 kinds=integrity,resolved |
| scoped-resolved-integrity-v3 | kit | match | explained @stablelib/base64 at node_modules/@stablelib/base64 kinds=integrity,resolved |

## Failure / minimal counterexample

none

## Next owner

Root publishes after reconciliation. This worker does not merge or deploy.

Prior M07 Co11 `e81efc8a` corpus is preserved and is not this proof. Link-stub skip is supported unknown under npm `link: true` plus shipped `entry.link === true` continue.
