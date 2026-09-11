# RECEIPT — W5-M04 Co12 route-table comparison

Repo: `epistemedeus/samedaydesk`
Owned paths: `tools/route-table-diff/`, `experiments/wave5/m04/RECEIPT.md`
Feature branch: `cursor/w5-m04-co12-route-table-comparison-faa0`
Starting ref: `7387eb677abd442dfab9081cb0ad95451fd2a762`
Implementation: `386b8f9fc4745afdc520d1e650d520280936eb39`
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/88
Integration owner: W5-M01

## Current-source finding

Root Co12: route ordering is not necessarily semantic change; duplicates, weak URL parsing, and custom catalogs need domain-specific comparison.

Reproduced at starting SHA `7387eb6`:

- Permuting `fixtures/journey/before.json` left added/removed/changed at 0 but changed `tableDigest` (`digest.v1` hashed array order).
- Duplicate path threw `duplicate_path` (exit 2), so a collision looked like engine failure rather than a breaking analysis.
- Trailing-slash path was `invalid_path`. Trailing-slash canonical stayed in `URL.href`, so `/terms` vs `/terms/` was not the same SDS route.
- OpenAPI `{paths}` used the generic `invalid_catalog` message.

Smallest fix: SDS path/canonical identity, order-independent `digest.v2`, `breaking` true only for collisions and removals. Unlike OpenAPI/framework catalogs are refused, not hashed equal.

## Commands

Node v22.14.0. No extra npm packages. No env secrets. Loopback HTTP only in tests.

```bash
node --test tools/route-table-diff/test/*.test.mjs
node tools/route-table-diff/bin/route-diff.mjs \
  --before tools/route-table-diff/fixtures/journey/before.json \
  --after tools/route-table-diff/fixtures/comparison/permuted.json \
  --out-dir /tmp/w5-m04-perm
node tools/route-table-diff/bin/route-diff.mjs \
  --before tools/route-table-diff/fixtures/journey/before.json \
  --after tools/route-table-diff/fixtures/comparison/removed-privacy.json \
  --out-dir /tmp/w5-m04-rm
```

## Tests

`node --test tools/route-table-diff/test/*.test.mjs`

23 passed, 0 failed, 0 skipped.

9 new comparison tests (8 CLI file cases + 1 loopback HTTP permutation). Prior 14 still pass.

CLI proof: permutation `breaking=false`, `outcome=permutation`, equal digest `sha256:6356c57429cce944e66cedf9d19b8d7019a9a9865384eafd5ab9e1e38364e36e`. Removal of `/privacy`: `breaking=true`, exit 0. Duplicate `/terms`: `ok=true`, `breaking=true`, collision listed. Journey add/canonical/robots stays `outcome=changed`, `breaking=false`.

Postgres is not an input. The no-postgres assertion remains a documented non-claim, not a skipped gate.

## Input refs

| Ref | Use |
| --- | --- |
| SDS `7387eb677abd442dfab9081cb0ad95451fd2a762` `tools/route-table-diff/` | starting implementation |
| SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` | read-only wrapper/engine pin. Does not call this job. |

## Remaining integration binding

W5-M01 wires catalog/wrapper if this engine is selected. Live PUBLIC_SHELLS export, listing-repair-packet, and I01 `hashTermsVersion` stay unbound. This receipt does not claim PR52 wrapper behavior.

pstack: marketplace plugin `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8` present on this VM. Read `principle-prove-it-works`, `tdd`, `principle-sequence-verifiable-units`, `unslop`. No native slash attachment. Parent model `cursor-grok-4.6-xhigh`. `~/.cursor/rules/pstack-models.mdc` absent. No extra Cloud agents.

## Non-claims

No default-branch push, deploy, spend, payout, or messages. `paid=false`, `settled=false`.
