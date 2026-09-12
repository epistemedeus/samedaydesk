# Sources for W5-M07 final-engine-inputs fixtures

Bounded excerpts. Not customer files. Not the H04 mocha sample.

## Official npm

- Lockfile `packages` map, `resolved`, `integrity`, `link`, and non-identity fields (`license`, `engines`, `dev`, `optional`, `hasInstallScript`): https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json
- `link: true` means the stub has no other descriptor fields; the target is a separate `packages` entry.
- lockfileVersion 2 = npm v7/v8 (`packages` plus legacy `dependencies`). lockfileVersion 3 = npm v9+ (`packages` only).
- Aliases: https://docs.npmjs.com/cli/v10/using-npm/package-spec#aliases — `<alias>@npm:<name>`. The alias is the `node_modules` folder; `<name>` is the registry package.
- Scoped names: https://docs.npmjs.com/cli/v10/using-npm/package-spec#package-name — `[<@scope>/]<pkg>`.

## Genuine public lockfiles

- Alias `node_modules/string-width-cjs` with `"name": "string-width"` @ 4.2.3, beside unaliased `node_modules/string-width` @ 5.1.2: `npm/content-type-to-language-name` `package-lock.json` (public). Same alias shape in `nrwl/nx` `packages/nx/src/plugins/js/lock-file/__fixtures__/mixed-keys/package-lock.json.fixture`.
- Scoped pins `@stablelib/base64`, `@supabase/auth-js`; nested same-name `content-type@2.0.0` at `node_modules/body-parser/node_modules/content-type` and `node_modules/type-is/node_modules/content-type`; workspace link `node_modules/@neomorphic/correspondence` `{link:true}` plus target `vendor/neomorphic-correspondence`: `epistemedeus/samedaydesk` root `package-lock.json` (public product lock, read-only excerpts).

## Shipped engines

- Merchant vendor copy: `epistemedeus/x402-url-extractor@ca38205279f0d543515b81b7261909e55ea2600f` `vendor/lockfile-pin-delta/` (`PROVENANCE.json` projects SDS `fba9d14872bc4c04214e527b9edfb30c2123c9e7`).
- Public kit: SDS `9ae0febd8c184c0cbbb5e481ba31ac620e89b869` archive `useful-jobs-1.2.0.tar.gz`.
- D01 full tree: SDS `46f2b7f55a7fb780333073a5197b64b8fde64a33` `tools/lockfile-pin-delta/`.
