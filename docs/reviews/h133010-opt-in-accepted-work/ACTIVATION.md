# Activation packet

This packet is not an activation. Nothing here was installed, and public reads stay off.

## Current configuration

- No schema change. Publication state is the existing `ae14_market_tasks.voluntary` JSON.
- No new environment key. `ADDITIVE_ENV_KEYS` is unchanged. `HOSTED_WALLET_MARKET_PUBLIC_READS` remains `0`.
- `acceptedWorkPublic` is true only when the caller passes the boolean. `server/app.js`, `bin/hosted-wallet-market.mjs`, and the mount do not read it from the environment.
- The served participation contract file is unchanged. The 0.3.0 client is unchanged and still refuses `permitAcceptedWork` before HTTP.
- `client/accepted-work-source.mjs` is a source candidate. It is not a hosted release. The live pin now records its bytes and the publication module so a changed or missing copy fails `hostSourceSha256` with `binding_stale`. Restoring the bytes admits the previous source and host hashes. `installedSourceFiles()` already walked both paths; the pin is the boundary that refuses them.
- The live source pin records the five earlier edited files plus those two members. `docs/machine-promotion` is unchanged. That pin edit is not a Hostinger configuration write.
- The source client's transport deadline is one 20 second timer for the whole request. A slow body does not extend it. Timeout leaves a mutation `unknown` and does not POST again. `--deadline-ms` is a test bound from 50 to 20000, not a production flag.
- Emitted human assets were not regenerated. `publish-preserved-client.mjs` on this tree and on base `b28b3c00` both report inventory `6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5` (352 files, 59,951,737 bytes, Vite not invoked). The 46 desk files match that base. The candidate is not installed.

## Rollback

Leave `acceptedWorkPublic` unset. The GET routes are not mounted, the two mutations are not dispatched, and stored publication JSON is ignored. Private grants, funded rows, and the operation journal stay. No `DROP`.

## Not done

No production schema or config write, no public-read enablement, no live task, account, consent, offer, customer, signer, payment, funding, merge, or deploy.
