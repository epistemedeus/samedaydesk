# Root receiving commands

Root supplies every path. These commands do not embed a host scratch directory, an account store, or a production credential. `install` and `rollback` change only files in `--destination`. They do not open a database, sign, grant, fund, or deploy.

Measure the destination before trusting any recorded constant:

```
node server/scripts/h120010-promote.mjs verify --root <installed-root>
```

Build and seal from the owning repository. The commits are fixed in the helper. `--measured` is a JSON file with `sourceSha256` and `hostSha256` from `verify`.

```
node server/scripts/h120010-promote.mjs bundle --repo <sds-root> --out <bundle-dir>
node server/scripts/h120010-promote.mjs seal --bundle <bundle-dir> --measured <measured.json>
node server/scripts/h120010-promote.mjs compare-human --baseline <baseline-root> --candidate <candidate-root> --out <human.json>
```

Install refuses a destination whose measured identity is not the baseline pair in the manifest. The pin is written last.

```
node server/scripts/h120010-promote.mjs install --bundle <bundle-dir> --destination <installed-root>
```

On a store that already has schemas 006 through 010, apply `vendor/hosted-wallet-market/schema/011_capability_composition.sql` once. Do not run `applyAdditiveSchema` again. Its earlier `CREATE TRIGGER` statements are not idempotent. Do not set `HOSTED_WALLET_MARKET_QUALIFIED_CAPABILITY`. Keep money `unfunded`, payments off, public reads `0`, funded tasks off, and human assets off.

Rollback restores the baseline bytes, including removal of files the candidate added. It does not drop schema 011 or any obligation row.

```
node server/scripts/h120010-promote.mjs rollback --bundle <bundle-dir> --destination <installed-root>
```

The contained proof, which Root does not point at production, is:

```
node server/scripts/h120010-promote.mjs receive \
  --repo <sds-root> \
  --destination <empty-directory> \
  --state <empty-private-directory> \
  --client <cold-requester-0.3.1.mjs> \
  --descriptor <aa861e98-descriptor.json> \
  --bundle <bundle-dir> \
  --evidence <evidence-dir> \
  --result <result.md>
```

The client and descriptor must match the published 0.3.1 bytes. Lost-response recovery is `readback` of the same operation, not a second post.
