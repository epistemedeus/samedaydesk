# R03-moby-engine-api — source pin

Official Docker Engine API Swagger 2.0 pair from `moby/moby`.

## Repository

- Repo: [moby/moby](https://github.com/moby/moby)
- Path: `api/swagger.yaml`
- License: Apache-2.0 (`LICENSE` at after SHA)
- Retrieval: GitHub REST `contents` API metadata (content omitted) + `raw.githubusercontent.com` file bytes. No clone of the full moby tree.

## Revision pair

| Side | Full SHA | Commit | Date |
|------|----------|--------|------|
| before | `235d2876f80fff1ee13378646a4d41a4c670a052` | api: Add container umask configuration | 2026-09-03T08:41:23Z (author 2026-09-02) |
| after | `2803839c3f30344de950e35dfe5cc4e1e170cb0d` | api/swagger: Align Healthcheck name with Go struct | 2026-09-03T17:34:13Z |

These are consecutive `api/swagger.yaml` commits on that path.

## Stored fixture hashes

| File | bytes | sha256 |
|------|------:|--------|
| `fixtures/raw/before.swagger.yaml` | 473773 | `abd97457e0c5aa5646f466516de9daf7bd81722c0ab96a47fb2ac393023cbab6` |
| `fixtures/raw/after.swagger.yaml` | 473773 | `f09a22ad220d551dca5d6c402052204d3e9fd1f16943cd78ba6677ea1266616f` |
| `fixtures/raw/LICENSE` | 10765 | `7c87873291f289713ac5df48b1f2010eb6963752bbd6b530416ab99fc37914a8` |

Git blob SHAs from contents API: before `2e2d010fd97bef91382bbd547e66d468bd89ac1e`, after `8ed37b2501cd487be6cdf7df42513a1ca8093008`.

Bounded excerpts live under `fixtures/excerpt/` (header, Umask, HealthCheck/Healthcheck, path inventory). Full blobs are stored because they are a single official file per SHA, not a scrape.

## What actually changed

- Path set: **unchanged** (98 paths, 108 operations, 8 multi-method paths).
- `HostConfig.Umask` is already present at the before SHA (added in that commit) and remains at after.
- After SHA renames `TaskSpec.ContainerSpec.properties.HealthCheck` → `Healthcheck`. That is a **definition property**, not a path.

## Non-equivalent projection

Swagger 2.0 is **not** an SDS route catalog. Paths are projected to `samedaydesk.route-table.v1` `{path, canonical, title}` with `authority: caller` and `publishedRouteTable: false`. HTTP methods, parameters, bodies, responses, and definitions are dropped. Label: `equivalent: false`.

Canonical URLs are documentation identities under `https://docs.docker.com/reference/api/engine/version/v1.56{path}`, not a published SDS table and not a homepage rewrite.

## Jobs

- Primary: useful-jobs 1.4.0 `route-table-diff` on the projected catalogs.
- Negative: raw swagger JSON (official path map) → `unsupported_catalog`.
- Secondary: `api-upgrade-brief` on the official swagger YAML **did not refuse swagger 2.0**; status `informational` / no used-op structural delta on the pinned operations. Not a runtime compatibility proof. Engines were not edited.
