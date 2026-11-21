# Root receiving commands

Root supplies every path, including the release contract. These commands do not embed a host scratch directory, an account store, or a production credential. `install` and `rollback` change only bundle members in `--destination`. They do not open a database, sign, grant, fund, or deploy. The progress file records the task transition. It is not a credential store.

The checked-in contract for this pair is `docs/machine-promotion/release-contract.json`. A missing, wrong, or contradictory contract fails before writes.

Measure the destination before trusting any recorded constant:

```
node server/scripts/h120010-promote.mjs verify --root <installed-root> --contract <release-contract.json>
```

Build and seal from the owning repository. `--measured` is a JSON file with `sourceSha256` and `hostSha256` from `verify`, and it must match the contract.

```
node server/scripts/h120010-promote.mjs bundle --repo <sds-root> --out <bundle-dir> --contract <release-contract.json>
node server/scripts/h120010-promote.mjs seal --bundle <bundle-dir> --measured <measured.json> --contract <release-contract.json>
node server/scripts/h120010-promote.mjs compare-human --baseline <baseline-root> --candidate <candidate-root> --out <human.json> --contract <release-contract.json>
```

Human comparison runs `server/scripts/publish-preserved-client.mjs` only. It does not run Vite.

## Two-artifact order

Release the code bundle first. Publish the acquisition descriptor only after the destination measures as the candidate identity named in the contract.

1. Install the code bundle onto a tree that still measures as the baseline identity.
2. Apply `vendor/hosted-wallet-market/schema/011_capability_composition.sql` once. Do not run `applyAdditiveSchema` again. Its earlier `CREATE TRIGGER` statements are not idempotent. Do not drop 011 when code rolls back.
3. Boot and measure. If the tree is not the candidate identity, do not publish a descriptor.
4. Publish a successor 0.3.1 descriptor only then. Its client source provenance stays the published client. Its required profile is the measured candidate source and host. Its public profile and participation endpoints stay unchanged.
5. If code must roll back, restore the baseline descriptor in the same decision. A baseline descriptor on candidate code, or a candidate descriptor on baseline code, fails closed with `acquisition_profile_mismatch`. That refusal is not continuity.

Do not set `HOSTED_WALLET_MARKET_QUALIFIED_CAPABILITY`. Keep money `unfunded`, payments off, public reads `0`, funded tasks off, and human assets off.

A fresh install refuses a destination whose measured identity is not the baseline pair, and it refuses a member that is not the predecessor bytes. Every bundle member is checked before the first payload write. The pin is written last. Pin-last alone is not atomic. Resume uses the same progress file and accepts only predecessor or candidate bytes; it does not require the interrupted tree to still measure as the baseline.

```
node server/scripts/h120010-promote.mjs install \
  --bundle <bundle-dir> \
  --destination <installed-root> \
  --contract <release-contract.json> \
  --progress <progress.json>
```

If that process is interrupted, repeat the same install command with the same progress file to finish the exact candidate. To return to the exact predecessor instead, run rollback with that same progress file. A destination member that matches neither admitted byte string is refused and is not repaired. Credentials, obligations, terms, and database authority are outside this repair.

```
node server/scripts/h120010-promote.mjs rollback \
  --bundle <bundle-dir> \
  --destination <installed-root> \
  --contract <release-contract.json> \
  --progress <progress.json>
```

Rollback of a completed candidate restores the baseline bytes, including removal of files the candidate added. It does not drop schema 011 or any obligation row.

The private successor descriptor, which Root does not publish, can be reproduced with:

```
node server/scripts/h120010-promote.mjs successor \
  --contract <release-contract.json> \
  --descriptor <aa861e98-descriptor.json> \
  --out <private-successor-descriptor.json>
```

The contained proof, which Root does not point at production, is:

```
node server/scripts/h120010-promote.mjs receive \
  --repo <sds-root> \
  --destination <empty-directory> \
  --state <empty-private-directory> \
  --client <cold-requester-0.3.1.mjs> \
  --descriptor <aa861e98-descriptor.json> \
  --contract <release-contract.json> \
  --bundle <bundle-dir> \
  --evidence <evidence-dir> \
  --result <result.md>
```

The client and the published descriptor must match the contract bytes. Lost-response recovery is `readback` of the same operation, not a second post. The contained journey leaves that lost baseline POST unresolved until the candidate descriptor is in use.
