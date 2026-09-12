# R03-moby-engine-api result

Status: **complete**. Tests: **11 pass / 0 fail**.

`NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs`

## Source

Official `moby/moby` `api/swagger.yaml` (Apache-2.0).

- before `235d2876f80fff1ee13378646a4d41a4c670a052` — Add container umask (473773 bytes, sha256 `abd97457e0c5aa5646f466516de9daf7bd81722c0ab96a47fb2ac393023cbab6`)
- after `2803839c3f30344de950e35dfe5cc4e1e170cb0d` — Align Healthcheck name (473773 bytes, sha256 `f09a22ad220d551dca5d6c402052204d3e9fd1f16943cd78ba6677ea1266616f`)

Retrieved via GitHub contents API + raw bytes. Bounded excerpts plus full-blob sha256 (full YAML stored; single official file per SHA).

## Projection (not equivalent)

Swagger 2.0 path maps are refused by `route-table-diff`. Caller projected 98 paths into `samedaydesk.route-table.v1` `{path, canonical, title}` with `authority: caller` and `publishedRouteTable: false`. Methods (108 ops, 8 multi-method paths), parameters, and definitions are dropped.

## Engine vs witness

| Check | Engine (`route-table-diff`) | Independent witness (swagger paths) |
|-------|-----------------------------|--------------------------------------|
| Official pair | `outcome: no-change`, added/removed/changed = 0 | path set unchanged (98/98), ops 108/108 |
| Control (identical catalogs) | `no-change` | added/removed empty |
| Raw swagger JSON | `unsupported_catalog` | n/a (not an SDS catalog) |
| Caller-mutated extra path | `changed`, added `/containers/umask-probe` | same added path |

They **agree** on the official path set: umask and Healthcheck edits are not path adds/removes. Witness records the definition rename `TaskSpec.ContainerSpec.HealthCheck` → `Healthcheck` as unknown/out-of-job.

## Secondary `api-upgrade-brief`

Did **not** refuse swagger 2.0. Status `informational`: no used-operation structural delta on the pinned ops. Not a runtime compatibility proof. **No `regression-artifact.json`** because the documented trigger was a swagger2 refuse. Engines were not edited.

## Honesty

- Not a published SDS route table. Not a homepage rewrite.
- Not a customer, paid call, or live Engine daemon proof.
- `purchaseAuthority=false`. Job path is offline.
