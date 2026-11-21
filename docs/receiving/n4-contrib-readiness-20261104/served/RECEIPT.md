# Served artifact receipt

Anonymous read of the published first-party accepted work. No account, no credential, no wallet, no settlement, no publication change, and no further task. This is first-party controlled reuse of the published caller. It is not outside reuse and it is not revenue.

The proof input is `public-artifact.json`, written from the object extracted out of `artifact.body`. The prepublication file `query-key-caller.json` was not passed to the caller.

## Custody

| Item | Value |
| --- | --- |
| GET | `https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/accepted-work/market-8ed4c3f4c4dcbfc074027b1e915064f2294926e03ac4131fe3854d5165806d5a/artifact` |
| When | `Wed, 04 Nov 2026 23:51:51 GMT` |
| Status | 200 |
| `cache-control` | `no-store` |
| Raw body | `artifact.body`, 1305 bytes |
| Raw body sha256 | `e737cbfd5cb68175721b8c219e6a7c5b4368cfec9cdd2377f706955a49a826ea` |
| Headers | `artifact.headers` |
| Task | `market-8ed4c3f4c4dcbfc074027b1e915064f2294926e03ac4131fe3854d5165806d5a` |
| Terms digest on the body | `fb3b25d796e431290aca7251f2775bd947f4c96ae5a1b8d8e8b0be4f7a21fe9a` |
| Served `publicArtifactDigest` | `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3` |
| Foundation digest of the extracted object | `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3` |
| Extracted file | `public-artifact.json`, 304 bytes |
| Extracted file sha256 | `32000ca78bd47d8cd304cfee506389037a96d8d1de5bd5d34d3a7bab4beb54ad` |
| Prepublication file sha256 | `c7f63611f4247f9a04c95b16aff4d94a322cfc149cd1d06ead75d9118d5c1424` |
| Private `artifactDigest` on the body | `49ee5455d99edbce786538e16095ca96f213c7077c3e89f96e2ca2d8a9e3f5c7` |

The artifact response has no revision field. Root's stated final revision 6 is not on this body. Summary digest `4f07cb0db1756b5a09f94b982bcce40e271e016b2fc0a922c9d232425285992d`. Rights digest `efb163e6a44161f61ac538de5fc880b7803a367fc3744c1bbf8970bf37a5d550`. License on the body is `CC0-1.0`.

The extracted file is not byte-equal to `query-key-caller.json`. The served object orders keys the way the response JSON did (`left`, `right`, `schema`, and `path` before `method`). The foundation digest sorts keys, so both files digest to `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3`.

Extraction used the client parse at `accepted-work-source.mjs` line 60, `JSON.parse` of the raw body, then `value.publicArtifact` as that client's artifact command reads it. The written file is `JSON.stringify` of that object. The query-key caller then parsed that file with `execute.py` `read_bounded`.

## Commands

| Command | Exit |
| --- | ---: |
| `curl` of the artifact URL, body and headers saved here | 0, HTTP 200 |
| Node extract and foundation `digest` from `runtime/agent-economy-foundation/dist/index.js` | 0 |
| `curl` of `https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz` | 0, HTTP 200, 14566 bytes |
| sha256 of that archive | `51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa` |
| `node apply.mjs apply` key execution on `served/public-artifact.json` | 0 |
| `node apply.mjs apply --mount` on the same served file | 0 |

Pins, clean `HEAD` of `https://github.com/dhyabi2/x402-nano-exact`: `f0b3e89463d4b291cab95830151c4c1c05ff04b6`, `164d9e30abf5cd8aa3c2eaae617c71a115b24fbe`, `9cdf0e470a232c2a9779c88f080a2aeb1e76a664`. Local Python path had fastapi 0.162.0, starlette 1.10.0, and uvicorn 0.54.0. `walletCalls` 0. `liveSettlement` false.

## Comparison

Key execution: `oldEqual` true, `midEqual` true, `nowEqual` false. Before and middle map both `seal` forms to an empty string. The current pin maps bare `seal` to null and blank `seal` to an empty string.

Mount: before 200 then 200, replayed false then true. Middle 200 then 200, replayed false then true. Current 200 then 409, replayed false then false. The 409 body says the payment was already consumed by another request. Loopback `127.0.0.1`.

Complete stdout is `caller-runs.txt`.
