# Packaged hosted wallet market

Cold receiving uses this directory. The module is `src/server.mjs`, resolved from the SDS installation root as `vendor/hosted-wallet-market/src/server.mjs`. Leave `HOSTED_WALLET_MARKET_ENTRY` unset. An absolute path to a Pilot checkout or an old provider build directory is refused.

The declared dependency is `pg` `8.23.0`. The SDS package already depends on `pg`. This directory does not vendor `node_modules`.

Enrollment is `POST /api/neomorphic-contributor-journey/v1/native-debt/enroll` with body `{}` and the existing owner bearer. Import is `POST /v1/native-debt/import` on that same prefix. The process profile RPC is the only chain reader. Caller paid, installed, verified, baseline, and RPC fields are not authority. The archival obligation stays owed. A bound projection is not a new payable and does not send a transfer.

Production rollback unsets the adapter mode and restores the previous process. It does not `DROP SCHEMA hosted_wallet_market`. The full statements are in `INSTALL-ROLLBACK.md` beside this file.

Public reads, payments, funded tasks, and human assets stay off. Root performs the real enrollment and the original discharge receiving.
