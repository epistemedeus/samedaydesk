# F18-bytes — gzip/br Content-Length ≠ decoded JSON byte pins

- **Disposition:** `reproduced`
- **Evaluator:** `f18-bytes`
- **Kind:** pack-local reproduction
- **Sale state:** `not_a_sale`
- **Authorized:** `false`
- **Live HTTP:** none
- **Production change:** none

## Finding

F18 live journeys compared HTTP `Content-Length` on gzip/br responses to a decoded JSON byte pin. Those numbers are different quantities:

- `Content-Length` under `Content-Encoding: gzip` or `br` is the **compressed body size**.
- The JSON pin is **utf8 `Buffer.byteLength` of the decoded JSON text** (plus sha256 of those bytes).

Treating compressed `Content-Length` as the JSON pin is a mismatch.

## Local reproduction (this pack)

`src/f18-bytes.ts` compresses a small JSON fixture with `node:zlib` `gzipSync` / `brotliCompressSync`. No live HTTP. No SDS route edits.

Example from this Node 22 run:

| Quantity | Bytes |
| --- | ---: |
| decoded JSON utf8 | 219 |
| gzip `Content-Length` | 191 |
| br `Content-Length` | 144 |

`match` is `false` for both encodings. `assertCompressedLengthIsNotJsonPin({ treatCompressedAsPin: true })` returns `{ ok: false, rejected: true, code: "compressed-length-is-not-json-pin" }`.

## Out of scope

- `server/` / `client/` edits
- Live prices, payment, settle
- Changing SDS Content-Encoding or Content-Length behavior
