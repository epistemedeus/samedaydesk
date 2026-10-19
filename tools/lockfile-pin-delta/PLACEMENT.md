# Current-source placement

ROOT704 places this package on current SameDayDesk main. This is an import of `tools/lockfile-pin-delta/` only. Draft PR 82 was not merged, rebased, or retargeted.

| Fact | Value |
| --- | --- |
| Base main | `d8cea059213e06d2f263be67f82e498f8052a50f` |
| Imported commit | `55b2dd385ab399d3919e1922dd4a0b11edccbb4a` |
| Imported tree before this note | `545819f5b898a271f75ee6f3c82fb2090d43b12d` |
| Repair parent | `fba9d14872bc4c04214e527b9edfb30c2123c9e7` |
| Owned path | `tools/lockfile-pin-delta/` |

`RECEIPT.md` is unchanged historical evidence. Its 160-pin local observation belongs to that earlier checkout.

Current root `package-lock.json`, received by `test/local-runtime.test.mjs` without editing the lockfile: lockfileVersion 3, `packages` map, 194 pins, 5 missing-integrity pins, `node_modules/zod` at `3.25.76` (`zod-3.25.76.tgz`). The historical zod pin still matches, so the local-runtime assertions stay true on this main. No root dependency, catalog row, homepage, offer, or customer page was added.

Identity behavior remains the received ROOT688 contract: whole-segment scoped names and locked `npm:` alias identity. Integrity-field equality, optional and peer inclusion, and the frozen qualification kit are unchanged.

Producer command, from this directory, Node 22, serial, 1GiB heap:

```bash
NODE_OPTIONS=--max-old-space-size=1024 node --test --test-concurrency=1 test/*.test.mjs
```

Strict gate, from the frozen ROOT678 qualifier `90732c4560e0861c299620206b24aab237be7f52`:

```bash
NODE_OPTIONS=--max-old-space-size=1024 node qualify.mjs \
  --candidate-engine PATH/tools/lockfile-pin-delta \
  --require-repaired
```

That gate must report 33 cases and zero repair failures. Root owns merge and any later merchant release. This file is not copied into the merchant vendor tree.
