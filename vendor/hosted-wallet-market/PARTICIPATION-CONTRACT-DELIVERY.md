# Participation contract delivery

Receiving for the exact installed route
`GET /api/neomorphic-contributor-journey/v1/market/participation-contract`.
Pinned runtime bytes are unchanged. This is not a production repair.

## Result

The installed contract file and the JSON writer produce one nonempty OpenAPI
3.1.0 document: 39996 bytes,
`f4c6b459773121ebd1355199950c5f7971cd241b9bdd9132a40bd09f89d7b737`,
eleven `POST` operations. `deliverJsonResponse` frames that buffer with
`content-length: 39996` and `connection: close`. It does not emit
`content-length: 0` for this document. A missing contract falls through to
404, not an empty 200. The current acquire/profile client still does not fetch
this route.

The intermittent public failure remains: HTTP 200, hcdn `Content-Length: 0`,
empty body, request `844aef954d3a5e26474d2e720ba0ce2b-imm-edge9`. Accept-only
and always-missing-route explanations stay rejected. Ten exact reads in this
session returned the document above and did not reproduce the empty body. The
writer sets `content-length` and `connection: close` and sets no `vary`. Those
public responses instead had `transfer-encoding: chunked`, `connection:
keep-alive`, `vary: Accept-Encoding`, no content-length, `server: hcdn`, and
`x-hcdn-cache-status: DYNAMIC`. The empty 200 is an hcdn response this writer
cannot produce. Root has to correlate that edge request with the upstream
bytes before treating the framing rewrite as the cause.

## Compared reads

| Read | Result |
| --- | --- |
| Contract file `voluntary-participation.openapi.json` | 88385 bytes, `8018fca0904cdf86259a19d9ca48f4d90938b631e937a56b46ac50eda7c28d22` |
| `JSON.stringify` of that file, the writer payload | 39996 bytes, `f4c6b459773121ebd1355199950c5f7971cd241b9bdd9132a40bd09f89d7b737` |
| Public GET at 2026-10-30T22:19:22Z, HTTP/1.1 default, JSON Accept, and identity | 200, same 39996-byte body. hcdn request ids `440c593f12792cb130e87992d04bd377-imm-edge10`, `f17ec0ff61ccffa89ec9bfec6d84c2c8-imm-edge7`, `e7fc2341905111ac192b39796d2f4ffb-imm-edge7`, `511eed99fa3a1d63d73981510a9fca3f-imm-edge8` |
| Same GET over HTTP/2, alternating default and JSON Accept | six 200 responses, same body. Request ids `9d496ea729ba42667bb37ba1f40e61a6-imm-edge9`, `00167cb3c0fa0362d510c87e37a1a515-imm-edge7`, `20ff30a0dea145851eef183a19950daa-imm-edge10`, `c8374660025e0e5b532769486a2e3c28-imm-edge9`, `e70ac361255757ad5cbcaf3cf48747d4-imm-edge7`, `e23fe0e6a53f12ba2ef84f81f8678e7f-imm-edge7` |
| Profile companion `GET /v1/market/profile` | 200, 3273 bytes, `7bfb41d9cade650062ba570301397bbda1db685352de36ae9b3db589db27a0bf`. `pilot.machine-market.capability.v1`, unfunded, source `694d76d61a20346137ba6e280c8c36e7ce10dfa0ce686fb837c3e2fe09f3c855`, host `1d6418b4b9801ceed56626800799106bc50ed3555c2a1cdb4651a3bf589657e0`, `voluntary-artifact-v1`, `signerAuthority` false, contract path advertised |
| Preserved empty edge response | 200, content-length 0, request `844aef954d3a5e26474d2e720ba0ce2b-imm-edge9` |

Origin success still carries `x-ae-wire-version: c0-1` and
`x-ae-server-class: live`. Upstream time on the successful public reads was
0.031 to 0.044 seconds. No POST, account, offer, claim, or profile write was sent.

## Publication

No pinned file changed, so no new host or profile hash is produced. Installed
source remains `4bc76080c45adcc1bbc490fc37e1ff47185ca491`. The focused test
checks the private-control pin for the writer, server route, voluntary loader,
machine binding, contract file, and wallet mount.

Synthetic git fixtures in that test clear `GIT_DIR`, `GIT_WORK_TREE`, and
process-wide `GIT_CONFIG_*` injection, then push only to a local bare path.
A poisoned `remote.origin.url` still attaches a GitHub origin on `git init`.
That containment is not the H10900 producer repair. The poisoned fixture is
never pushed.

## Next

Root owns the edge. Do not restart, rebuild, edit the machine profile, or
change qualification for this. The successful reads were `DYNAMIC` under
`cache-control: no-store`, so a cache purge is not the next action.

1. In the existing provider log for this app, open request
   `844aef954d3a5e26474d2e720ba0ce2b-imm-edge9` and any later public 200 whose
   hcdn `Content-Length` is 0 on this exact path.
2. Record the upstream status, upstream response bytes, and whether those
   bytes include `content-length: 39996` plus `x-ae-wire-version: c0-1`.
3. The boundary is confirmed when upstream carried the 39996-byte document, or
   its sha256 above, and hcdn emitted `Content-Length: 0`. The provider action
   is then to stop that edge from replacing the completed dynamic JSON
   response. Do not publish a successor profile.
4. Re-read only this command. Pass only when the body is 39996 bytes and the
   sha256 above, with `openapi` 3.1.0 and eleven paths. Status 200 or a length
   header does not pass an empty body.

```sh
curl --http1.1 --max-time 25 -D - -o /tmp/participation-contract.json \
  https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/participation-contract
```

Do not enable `HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_LIMIT` for this. That
window observes a later process and is not this repair. Missing upstream logs
leave the edge boundary unconfirmed. They do not authorize a source change.
