# Job output completeness contract

Mailbox and archive consumers import this module. They do not copy the
verifier or spawn a second useful-jobs kernel.

## Pin under test

F08 public CLI `aeef964fa188443078958d9d6d393afae1d542ee` on
`fable/f08-paid-wrappers`. Named assignment pin `bae3e7cd…` is recorded in
`PIN.json` and is not spawned. D01 owns later wrapper amendments.

```js
import {
  verifyComplete,
  VERIFY_CODES,
  TESTED_PRODUCER,
  F08_TESTED_SHA,
  identityDocument,
} from "../job-output-atomicity/index.mjs";
```

`TESTED_PRODUCER.sha` is the F08 head this export was executed against. A
consumer that rebases onto a later D01 wrapper must record that new SHA. It
must not claim untested sibling behavior.

## Command

```bash
node tools/job-output-atomicity/bin/verify-complete.mjs --root <package-dir>
```

Exit 0 only when `classification` is `complete`.

## Complete means

The receipt schema is `samedaydesk.paid-useful-jobs.receipt.v1`. `jobId` is a
catalog job. Every catalog output is a regular file under `--root`, listed by
basename, with a matching `sha256`. `outputsDigest` matches those files. The
receipt `engine.archiveSha256` and `archiveBytes` match `PIN.json`. Identity
`termsVersion` is I01 `sha256:` plus 64 hex of that output identity document.
It is not compared to a disclosure or kernel `termsVersion` on the receipt.

`analysisOk`, `analysisStatus`, and `analysisRefused` report the engine
result. They do not decide delivery. A valid no-change report
(`analysisStatus: informational`) with the catalog files present is complete.
A wrapper or engine failure with missing outputs is not.

## Refusals that cannot count complete

| Code | Case |
| --- | --- |
| `empty-output-object` | `outputs: [{}]` or a nameless listed entry |
| `unknown-job` | Missing or non-catalog `jobId` |
| `unrecognized-receipt-schema` | Missing or other schema |
| `foreign-output-name` | Listed name not in that job's catalog outputs |
| `special-output-file` | FIFO, symlink, directory, socket, or device |
| `missing-output-digest` | Listed file without `sha256` |
| `missing-outputs-digest` | Receipt omits `outputsDigest` |
| `foreign-engine-archive` | Archive sha or bytes is not the pinned origin |

`sold` stays false. Payments are non-settling prototypes.

## Later bindings

D01 may change wrapper publication. Consumers keep calling `verifyComplete`.
Hosted mailbox HTTP and a Postgres archive index belong to Root, not this
export. D07 may consume this CLI or `verifyComplete` for exact-byte export.
