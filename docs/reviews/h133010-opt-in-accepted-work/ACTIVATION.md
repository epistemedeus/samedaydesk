# Activation packet

This packet is not an activation. Nothing here was installed, and public reads stay off.

## Current configuration

- No schema change. Publication state is the existing `ae14_market_tasks.voluntary` JSON.
- No new environment key. `ADDITIVE_ENV_KEYS` is unchanged. `HOSTED_WALLET_MARKET_PUBLIC_READS` remains `0`.
- `acceptedWorkPublic` is true only when the caller passes the boolean. `server/app.js`, `bin/hosted-wallet-market.mjs`, and the mount do not read it from the environment.
- The served participation contract file is unchanged. The 0.3.0 client is unchanged and still refuses `permitAcceptedWork` before HTTP.
- `client/accepted-work-source.mjs` is a source candidate. It is not a hosted release and it is not in the host pin.
- The live source pin records new hashes for the five edited pinned files so this tree still admits. `docs/machine-promotion` is unchanged. That pin edit is not a Hostinger configuration write.
- Emitted human assets were not regenerated. Their inputs are unchanged.

## Rollback

Leave `acceptedWorkPublic` unset. The GET routes are not mounted, the two mutations are not dispatched, and stored publication JSON is ignored. Private grants, funded rows, and the operation journal stay. No `DROP`.

## Not done

No production schema or config write, no public-read enablement, no live task, account, consent, offer, customer, signer, payment, funding, merge, or deploy.
