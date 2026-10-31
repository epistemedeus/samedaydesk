# H51710 result

## Outcome

First candidate only: the installed JSON writer keeps an explicit `Content-Length` and no longer forces `Connection: close`. Stage id is `no-forced-connection-close`. Omitting `Content-Length` is a separate conditional experiment and is not in this source.

Repository `epistemedeus/samedaydesk`, branch `codex/h51710-hostinger-response-framing-20261031`, base `4bc76080c45adcc1bbc490fc37e1ff47185ca491`. This export does not merge, release, deploy, or probe the hosted origin. The candidate commit is the head of this branch after the export commit. Qualified and installed remain false.

| Pair | Source | Host |
| --- | --- | --- |
| Predecessor `4bc76080` | `694d76d61a20346137ba6e280c8c36e7ce10dfa0ce686fb837c3e2fe09f3c855` | `1d6418b4b9801ceed56626800799106bc50ed3555c2a1cdb4651a3bf589657e0` |
| Candidate | `5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2` | `1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c` |

Helper sha256 moves from `3b90f4419a7100d949bd2e1ad4ba6e67dfe738fa69d8237a858ae95b352c4335` to `e1bc64cb332f1d8393c183fb4ec8a1715128344e24be5efc73c6548e5db52d90`. `consumerContractSha256` stays `fb0088a9aee06360c15211499e1345136deba09132112f8d7488e7b5dc2e7ae5`.

## Causal finding

`connection: close` and explicit `Content-Length` entered together as one inline envelope in SDS `52a93bfe` (ROOT186), copied from Pilot packaging `f461e780` `tools/root71-hosted-wallet-market/src/server.mjs`. SDS `7b8bebc5` extracted that writer into `vendor/hosted-wallet-market/src/response-completion.mjs`. `13ad40ce` and `0449d856` added the finite lifecycle trace. The close header was a one-buffer local framing choice. It is not a security, authority, cache, or wire-version control.

The maintained producer is this SDS tree plus `server/scripts/refresh-installed-receiving-source.mjs`. The historical Pilot packer omitted the helper file. No Pilot companion branch is required, and that packer was not used to overwrite this consumer. `SOURCE.json` still records succession commit `f461e780df010663d31d4d9a5632147cd983a52e` and `src/server.mjs` hash `313b6093da34e4e81d82ce0a1ff7db057947a85ee87c836d55e4f27368a59b92`. The helper is absent from `successionSource.files`.

Node 22 HTTP/1.1 with `Content-Length` delimits one JSON buffer. A keep-alive client receives `Connection: keep-alive` and reuses the socket. A client that sends `Connection: close` still receives `Connection: close`, which is why the older `agent: false` tests remain valid. `204` and `304` keep the declared length and send an empty body. HEAD does the same when the writer is asked for a body. The participation route itself is GET-only. Mounted HEAD stays the existing fall-through.

Hostinger ticket `25877560` (Nabid, 2026-10-31 16:22 UTC) reproduced an empty 200 beyond the CDN and proposed this comparison. That is a hypothesis, not a received provider fix. The original matched requests `8f50116c`, `6abe2484`, and `b021134a` remain: Node intended 39996 bytes, finish, end callback, writableFinished, and local socket delta 40339, while the client saw `Content-Length: 0`. Local handoff does not prove downstream delivery. A passing source suite does not establish LiteSpeed behavior.

Every market JSON route uses `server.mjs` `send()` and therefore this writer, including participation-contract, profile, discover, account, wallet, tasks, quotes, claims, terms, submission, review, payouts, operations, native-debt import and enroll, and funding intent or fund. Those routes were traced and covered by the mounted or unit fixtures. No funded, signed, or paid action was run. `server/vendor/machine-gateway/src/http.mjs` is a different writer and is unchanged. The pre-vendor mount guard sets length and `cache-control` and does not force close.

## Commands

`node server/scripts/refresh-installed-receiving-source.mjs` exited 0. Stdout: `consumerSourceSha256` `5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2`, `hostMembers` 1308, `qualified` false, `installed` false. The pin changed only `SOURCE.json` and `response-completion.mjs`. Historical c4 evidence and `docs/receiving/root4550-sds-consumer-integration/source-closure.json` are untouched.

`node --test --test-concurrency=1 --test-timeout=120000 vendor/hosted-wallet-market/test/response-completion.test.mjs vendor/hosted-wallet-market/test/response-lifecycle.test.mjs vendor/hosted-wallet-market/test/response-framing.test.mjs server/scripts/test-installed-response-ingress.mjs server/scripts/test-installed-response-ready.mjs` exited 0. 18 passed, 0 failed, `duration_ms` 6032. The ready test booted the real SDS app on a disposable PostgreSQL 16 cluster, admitted an unfunded voluntary profile, and reused one Unix socket for two participation-contract responses of 39996 bytes with `Connection: keep-alive`, then recovered after a client abort. No postgres process remained.

The new framing test covers one TCP socket for Unicode, the 39996-byte contract, 64, 16384, 16385, and 65536 byte bodies, 500 and 503, cookie and `x-cj-csrf` extras, HEAD, 204, 304, client `Connection: close` followed by a new socket, abort of the 65536-byte response, one recovery write, diagnostic on and off, log exclusion of the contract title and the private marker, `completion.close()`, and shutdown under one second. An earlier framing run exited 1 because two assertions did not match the source text and a 64KiB readable chunk. Those assertions were corrected. The suite above is the qualifying run.

## File inventory

- `vendor/hosted-wallet-market/src/response-completion.mjs`
- `vendor/hosted-wallet-market/SOURCE.json`
- `server/foundry/activation/private-control-pin.json`
- `vendor/hosted-wallet-market/RESPONSE-COMPLETION.md`
- `vendor/hosted-wallet-market/test/response-framing.test.mjs`
- `server/scripts/test-installed-response-ready.mjs`
- `vendor/hosted-wallet-market/H51710-RESULT.md`
- `vendor/hosted-wallet-market/H51710-STAGED-COMPARISON.json`

## Next

Root owns the hosted comparison in `H51710-STAGED-COMPARISON.json`. Use fresh origin data from actual receiving. Run one baseline of at most 32 serial GETs on the current build `01a18a3f-dae7-7107-8f0b-1e02625b76e5`, then the same sample after the normal Pilot `7c798f18` route `--phase continue --scope private-source --journey new-source` releases this branch head. Keep the 89-row environment (`2afe45a622df4123442afc02b9e747db8bccda4cb505fe18889893ca63b59493`), human assets, account, claim, terms, and debt unchanged. Leave the completion diagnostic off.

A clean sample describes that observed window only. If empty 200 responses remain, the length-omission experiment is a new source change. Rollback is a redeploy of `4bc76080` and build `01a18a3f-dae7-7107-8f0b-1e02625b76e5` with the restored 89-row environment, diagnostic off.
