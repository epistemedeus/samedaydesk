# Machine promotion package

Closed source promotion from installed `aa861e980df0f75a782ff30996450cf15870f2e7` to reviewed `6bde3ec4df57df5f0783fec38f39eacbadfb6d9e`. The package is the bundle under `docs/machine-promotion/bundle`, the helpers in `server/scripts/h120010-promote.mjs`, and the contained receiving runner `server/scripts/h120010-receive.mjs`.

Identity is the measured hosted-wallet-market closure (`installedSourceSha256()` and `hostSourceSha256()`). The `installedSourceSha256` field in `vendor/hosted-wallet-market/SOURCE.json` is a recorded constant. This package does not amend it.

The payload is the machine closure that differs between those two commits: the private-control pin and the pin or source files whose bytes differ. Tests, export logs, prior H113/H115 receipts, the operator branch, and human surfaces are outside the payload. Runtime `427f5a08e3b294a8f15fb9d148f7de46ca7cb538` and desk `0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556` stay pinned.

`receive` is the synthetic zero-value proof. It builds a disposable database, boots the public 0.3.1 client, installs the bundle, applies schema 011 once, rolls the code back, and destroys that database. It is not a production installer.
