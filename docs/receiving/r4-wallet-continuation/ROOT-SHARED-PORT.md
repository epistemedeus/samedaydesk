Root-owned retained-result reader boundary, discovered during real HTTP/PG receiving.

The installed `retained-outcome.mjs` authenticates a session by either SHA256(full cookie pair) or SHA256(bare token). Machine `issueSession` correctly stores SHA256(bare token) in `journey_account_sessions` and SHA256(full pair) in `hosted_wallet_market.session_delivery`. The retained reader then compares delivery's pair hash to `session.token_hash`. These hashes differ for native machine sessions, so an otherwise current session receives `401 unauthenticated` before membership checking. Legacy-issued sessions use the pair hash in both places and still retrieve the old accepted/owed/paid results. Continuation changes neither hash nor session identity.

This failure was first retained in `12-continuation-http-pg.log`. `15-original-retained-session-boundary.log` independently reproduces both session contracts at the exact original package/host hashes, with no continuation implementation loaded. No production account or result was used. The baseline assertion receives the native refusal; it is not a claim that native old-result retrieval passes.

Exact minimal proposal for Root's shared amendment, not applied to the admitted branch:

```diff
--- a/vendor/hosted-wallet-market/src/retained-outcome.mjs
+++ b/vendor/hosted-wallet-market/src/retained-outcome.mjs
@@
-  if (delivery.rows[0] && delivery.rows[0].cookie_hash !== session.token_hash) fail(401, 'unauthenticated');
+  if (delivery.rows[0] && delivery.rows[0].cookie_hash !== pairHash) fail(401, 'unauthenticated');
```

`pairHash` is already computed from the presented cookie in this same function, and the session query already matches pairHash or valueHash. Root should receive the patch through a native session that actually has existing task/result membership, preserving both legacy session success and foreign/revoked refusals. The one-line proposal itself has not been applied or tested here. No sibling implementation or shared source pin is exported. This is a shared integration boundary, not missing old-key authority or permission to move old debt.
