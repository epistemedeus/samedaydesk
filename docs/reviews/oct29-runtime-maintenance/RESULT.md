# H64207 runtime dependency maintenance

Product base `a5b40cb015d30de8bf8f3cbbeda1360151279fb0`. Branch `codex/root64207-heavy-window-20261029`. Node v22.23.4, npm 10.9.9, on this VM. Checkpoint `2026-10-29T17:25:00.000Z` and requiredUntil `2026-10-29T17:40:00.000Z` stayed frozen. This record is the maintenance decision for a later release. It is not an advisory dashboard, a support promise, or a customer or revenue claim.

## Decision

Pin exact `body-parser` `2.4.0` and exact `qs` `6.16.1` in the root production manifest. The lock also moves the required transitives `iconv-lite` `0.7.2` to `0.7.3` and `body-parser`'s nested `content-type` `2.0.0` to `2.1.0`. No overrides. No other direct pin changed.

`express` `5.2.1` depends on `body-parser` `^2.2.1`. The hosted install is root `npm ci --omit=dev --ignore-scripts`. That install hoists `body-parser` `2.4.0`, and `express.json({ limit: "1mb" })` in `server/app.js` uses it with inflation left on. OSV reports `GHSA-27r3-jxmh-p828` for `body-parser` `>=2.0.0 <2.4.0` and a clean result for `2.4.0`. `2.4.0` is the only patched 2.x release, and it requires `qs` `^6.16.1`. `qs` `6.16.1` is the smallest version that satisfies that range. `6.17.1` was not selected. `iconv-lite` `0.7.2` does not satisfy `^0.7.3`. `0.7.3` and both `content-type` versions queried are OSV-clean, so they are not extra direct pins.

The same release accepts `Content-Encoding: zstd` when Node provides that decoder (`node_modules/body-parser/lib/read.js`). This Node does. That behavior comes with `2.4.0` and was not split out.

## Actual crash before the pin

On the unpatched install (`body-parser` `2.3.0`, Node v22.23.4, disposable `127.0.0.1`, `express.json({ limit: "1mb" })`):

- Payload: one complete gzip frame of `{"a":1}` (`1f8b0800000000000003ab564a54b232ac0500afac1b5607000000`) plus `0x00` plus 100KiB of `0x58`.
- The request returned HTTP 200 `{"ok":true,"body":{"a":1}}`. The process then died with uncaught `incorrect header check`. The observer exited 77. Without that observer the process dies uncaught.
- `gzipSync` of JSON plus one extra byte returned 400 `unexpected end of file` and the process stayed up. That shape is not this advisory.
- A split deflate of the same JSON, with padding sent about 80ms later, returned 200 and stayed up in that timing. It is not claimed as the crash.

Parsing runs in the global JSON middleware, before the route. Webhook routes still use `express.raw` before that middleware.

## Graph and usage

Root production direct dependencies that stayed pinned: `express` `^5.2.1` resolved `5.2.1`, `proxy-addr` `2.0.8`, `ipaddr.js` `1.9.1`, `zod` `^3.25.76` resolved `3.25.76`, `jose` `^6.2.3`, `pg` `^8.23.0`, `resend` `^6.14.0`, `stripe` `^22.2.2`, `@supabase/supabase-js` `^2.108.2`, and the two file vendors. Engines stay `22.x`.

`axios` is not in any root or client manifest or lock, and `require.resolve("axios")` from the installed `express` package fails. The only source string is a user-agent check in `server/lib/pulse.js`. Outbound HTTP in this app uses Node `fetch` / `http` / `https`. `axios@1.19.0` is the other merchant named by H64003. OSV lists `GHSA-3pq3-5fj3-cg6v` and `GHSA-542g-h47m-68v8` on that version. Both are inapplicable here because the package is not installed.

`qs.stringify` with `arrayFormat: "comma"` is the `GHSA-6pq8-jhm2-2vcw` sink. Express and `body-parser` call `qs.parse` for urlencoded bodies. This app does not call comma stringify. The version floor is still required by `body-parser` `2.4.0`. The regression checks `qs.parse("a=1&b=2")` and comma stringify of an array whose own `toString` is not callable (`a=ok`, no throw).

## Classified and not changed

- `fast-uri` `3.1.8` (OSV `GHSA-333x-w4r6-6crp`, `GHSA-w74x-v6f9-j3xg`, `GHSA-wjr9-j795-jxcr`, `GHSA-xhq7-xmqj-769h`). Reachable when `vendor/agent-payment-integrity/integrity.mjs` compiles a remote 402 bazaar schema. That caller does not fetch `$ref` and does not treat the normalized URI as an authorization boundary. `3.1.9` was not applied.
- `zod` `3.25.76` (OSV `GHSA-mrhx-c7xc-m3w5`). The installed default entry re-exports v3. The reported function is the v4 array helper. App imports are `import { z } from "zod"`. npm's fix is `zod` `4.6.7`, a major bump. Not applied. `@x402/core` and `@x402/extensions` audit highs are that same zod range, not a separate runtime bump.
- Client `dompurify` `3.4.13` via `posthog-js` `1.414.0` product tours. The configured call is string-mode sanitize with `ADD_TAGS: ['iframe']`. The client lock was not changed. No homepage or branded copy was edited.
- `express` `5.2.1`, `proxy-addr` `2.0.8`, and `ipaddr.js` `1.9.1` are OSV-clean. The proxy-addr `2.0.7` refusal test still passes.
- Nested locks are not the hosted graph and were left unchanged. `vendor/neomorphic-opportunity/services/earned-work/package-lock.json` and `vendor/visitor-foundry-receiver/services/correspondence/package-lock.json` still resolve `body-parser` `2.3.0`. `vendor/agent-payment-integrity` still has its own lock. Root `npm ci` does not consult those locks.

No client build was run. No file under `client/` changed, so no emitted human asset changed in this tree.

## Caller closure

`server/foundry/activation/private-control-pin.json` hashes root `package.json` and `package-lock.json`. After the manifest edit, `test:proxy-addr` failed the first two tests with `caller_source_changed` (exit 1). The cold `proxy-addr` install tests in that same run still passed. The pin now stores the new file hashes and keeps the previous closure `sha256:fc14eac1601172bfbfc9a30480455281ae75d6528e24733740f022939496d68e` in `receivedCallerClosures`. Current closure is `sha256:f2def46cb1cae795981c5fe4308a60ed8b3007e5367fea0ad7e9fda9b3d8a049`. Base `08b90bdef8dbd198023be447942a3119cb268235` and `SOURCE-PIN.json` `02d42a4d5777ae94082547dabc842c9ff035afc0354e1e7678ced72daef18e15` are unchanged. No other pinned file hash changed.

## Commands and exits

| Command | Exit |
| --- | --- |
| Unpatched trailing-gzip listener on `127.0.0.1` | HTTP 200, then uncaught `incorrect header check`, observer exit 77 |
| `npm install --ignore-scripts --package-lock-only --no-audit --no-fund` | 0 |
| `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` | 0. Installed `body-parser` 2.4.0, `qs` 6.16.1, `express` 5.2.1 |
| `npm run test:runtime-maintenance` | 0. 4 passed, 0 failed |
| `npm run test:proxy-addr` before the pin hash update | 1. `caller_source_changed` on the two closure tests. Proxy-addr resolution tests passed |
| `npm run test:proxy-addr` after the pin hash update | 0. 7 passed, 0 failed |
| `npm audit --omit=dev` before | 1. 6 findings: `body-parser`, `qs`, `fast-uri`, `zod`, `@x402/core`, `@x402/extensions` |
| `npm audit --omit=dev` after | 1. 4 findings remain: `fast-uri` moderate, `zod` high, and both `@x402` highs via zod. `body-parser` and `qs` are gone |

`npm audit fix` and `npm audit fix --force` were not run. `.github/workflows/runtime-startup.yml` was not edited. The new script is `npm run test:runtime-maintenance`.

The regression listens only on `127.0.0.1`. It checks a plain JSON body, a malformed JSON 400, the trailing gzip frame, and a following health read. The journey uses `createSdsApp` with correspondence `NODE_ENV=test` and no Stripe key: `GET /api/health`, the original-task descriptor (`payment` false, `fundedJob` false), `GET /.well-known/agent-card.json`, and `POST /api/checkout/seller-repair-session` returning 503 `Payments not configured` for both a normal JSON body and the gzip frame. No live account, provider, payment, or signer was contacted.

## Remaining boundary

- A standalone `npm ci` inside the vendored earned-work or correspondence directories still installs the old nested lock, including `body-parser` `2.3.0`.
- Do not import `zod/v4` from `zod` `3.25.76`. A later v4 import needs a fixed 4.x release.
- Do not add a bazaar schema loader that fetches `$ref`, and do not treat `fast-uri` normalization as a security boundary.
- Do not enable DOMPurify `IN_PLACE`, `SAFE_FOR_TEMPLATES`, or an XHTML parser media type on the client tour sanitizer.
- `body-parser` `2.4.0` will inflate zstd bodies on a Node build that has zstd.
- An older Node 22 image is outside this lock. This crash was reproduced on v22.23.4. Engines were not retargeted.
- Root owns merge, workflow inclusion of `test:runtime-maintenance`, and any deploy. This branch was not merged or deployed.

## RESULT

The hosted production graph had one confirmed crash: `body-parser` `2.3.0` under the configured `express.json` inflation path. It is pinned to `2.4.0`, with required `qs` `6.16.1`, `iconv-lite` `0.7.3`, and nested `content-type` `2.1.0`. Axios HTTP/2 advisories do not apply to this repository. The other audit hits stay unpatched because their vulnerable options are not the configured call, or because the offered fix is a major upgrade.

## NEXT

Root can merge this candidate and add `npm run test:runtime-maintenance` beside `test:proxy-addr` in the existing Node 22 startup workflow. A separate admission is required before changing vendored locks or the client `posthog-js` / DOMPurify graph. No deploy and no homepage preview is required for this server pin.

## Inventory

- `package.json`
- `package-lock.json`
- `server/foundry/activation/private-control-pin.json`
- `server/scripts/test-runtime-dependency-maintenance.js`
- `server/scripts/fixtures/runtime-maintenance-listener.mjs`
- `docs/reviews/oct29-runtime-maintenance/RESULT.md`

## Session

Model `grok-4.7`, effort `xhigh`, session `ae045d44-5aa0-4584-8f35-f7138193ecda`, host `bc-64116dca-c560-466c-9fbb-7d6311dcf4ce`, worktree `/home/ubuntu/ae14-work/h64207`. One native Grok process was present at sampling (RSS about 157092 KiB). No native model child was spawned. npm and `node --test` were ordinary processes. The admitted 2097152 KiB figure was an estimate, not a measured child footprint.
