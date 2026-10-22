# Feature map — W3-14 H03 public-data corrections

| Field | Value |
| --- | --- |
| User goal | Collect a rights-cleared public catalog snippet plus one cited field correction, without private data, auto-publish, or a paying rights holder. |
| Entrypoint | `tools/public-data-corrections/` (`index.mjs`, `lib/evaluate.mjs`) |
| Command | `cd tools/public-data-corrections && node bin/public-data-corrections.mjs journey --fixture fixtures/ok.json` |
| State | `rights`: `cleared` / `unknown` / `forbidden`; `privateData` must be `false`; `publishAuthorized` always false |
| Tests | `tools/public-data-corrections/test/*.test.mjs` via `node --test` |
| Account prerequisite | None. Offline. No wallet, fetch, chain, queue, or new account. |
