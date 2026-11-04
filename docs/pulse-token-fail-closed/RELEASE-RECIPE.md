# Pulse token fail-closed release recipe

This is a source-bound handoff for Root. It records the commit, the files, the
closure the host hash actually selects, the environment boundary, the install
and restart steps, the checks Root will run, and rollback.

It is not a deployment, not a Hostinger call, and not a hosted readback. It
does not say the installed host is live or fixed.

## 1. Commits and files

Repository: `https://github.com/epistemedeus/samedaydesk.git`

Branch: `codex/sds-pulse-token-fail-closed-20261104`

Base: `0593026ad155352f263e4749dc889a1578d91675`

Fail-closed route commit: `834ae52a696f68c5b25072c27958b40f58e27756`

Implementation commit: `fb777e8eeda0310b9d6601e21ff0d040d6a2fd12`

Install the branch tip. The implementation commit contains the route, the
reader, the tests, and this recipe. A later tip may change only the identity
lines in this file so they name that implementation commit.
`git diff fb777e8eeda0310b9d6601e21ff0d040d6a2fd12..HEAD --name-only` is empty
or lists only `docs/pulse-token-fail-closed/RELEASE-RECIPE.md`.

Files changed from the base:

- `.env.example`
- `docs/pulse-token-fail-closed/RELEASE-RECIPE.md`
- `server/lib/pulse-store/README.md`
- `server/routes/pulse.js`
- `server/scripts/pulse-private-read.js`
- `server/scripts/test-pulse-events.js`
- `server/scripts/test-pulse-private-read.js`

Unchanged on purpose, because they are measured pin members or forbidden
surfaces for this fix:

- `server/foundry/activation/private-control-pin.json`
- `server/lib/pulse.js`
- `server/lib/pulse-store/` implementation files
- `server/app.js`
- `server/index.js`
- `package.json`
- `package-lock.json`
- `supabase/migrations/`
- `docs/receiving/`

`server/lib/pulse-store/README.md` gains one sentence. It is not a pin key.

## 2. Route and reader

`GET /api/pulse` sets `Cache-Control: no-store`. `configuredPulseToken()` reads
`process.env.PULSE_TOKEN` on each request, trims it, and returns it only when
it is a string of at least 16 characters. Otherwise the route returns 503
`{"error":"Pulse read unconfigured"}` and does not call `pulseSnapshot()`.
`req.query.k` is compared with `crypto.timingSafeEqual` on equal-length UTF-8
buffers. A missing, array, or object `k` is a mismatch. A mismatch returns 404
`{"error":"Not found"}`. A match returns 200 `pulseSnapshot()`.

`POST /api/pulse/event` is unchanged. It stays public and credential-free.
An allowlisted event that flushes returns 204. An unsupported event returns
400 `{"error":"Unsupported event"}`. A failed flush returns 503
`{"error":"Telemetry unavailable"}`.

The private reader is `server/scripts/pulse-private-read.js`. Import
`executeReader`, `main`, `readPulse`, and `loadExplicitCredential`. The CLI
and the importable consumer are the same module.

The caller passes exactly one credential source:

- `--env-var NAME`, the name of an environment variable
- `--token-file PATH`, a single-line file

The module does not choose a variable name, does not open repository source
to find a credential, and does not contain a historical fallback. Zero sources
is exit 2. Two sources is exit 4 `credential_source_conflict`. An unset, empty,
whitespace, unreadable, or multiline file credential is exit 2, and no request
is made.

The read is one `GET` to `{origin}/api/pulse`. `origin` must be a bare
`http` or `https` origin with no userinfo, path, query, or fragment. Redirects
are `manual` and any 3xx is exit 4 `redirect_refused` without following
`Location`. The default timeout is 5000 ms, capped at 10000. The default body
cap is 1048576 bytes. A larger `Content-Length` or streamed body is exit 4
`response_too_large`.

Stdout is one JSON object. On success it has `status`, `window.startedAt`,
`window.now`, numeric `counts`, and `digest` (`sha256` of the raw response
bytes). It does not include referrers, recent rows, storage paths, the token,
or the query string. `--raw-file PATH` writes those raw bytes only after a
200, using mode `0600`. Stderr is unused by the CLI. Errors do not include the
token, the query, or the fetch error text.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | 200 and safe metadata |
| 2 | credential source missing, unset, empty, or unreadable |
| 3 | auth refused: HTTP 404 or 503 |
| 4 | usage, bound, redirect, oversize, unreachable origin, or bad response |

Root's old ROOT3424 reader is not in this source tree. It stays historical.
This recipe does not migrate, wrap, or delete it. New reads use the consumer
above. Its installed location was not available here.

## 3. Dependencies and how the host closure selects them

`hostSourceSha256(sdsRoot)` in
`vendor/hosted-wallet-market/src/native-debt.mjs` does all of the following
and nothing else:

1. Read `server/foundry/activation/private-control-pin.json`.
2. Take `Object.keys(pin.files)` as the file set.
3. Reject an empty set, a set longer than 4000, or any name that is absolute,
   contains `..`, or contains a backslash.
4. Require `sha256(file bytes) === pin.files[name]` for every name. Any
   mismatch throws `binding_stale`.
5. Hash those names plus the pin file itself.

The function does not walk `import` graphs, does not resolve `package.json`
dependency edges, and does not read `node_modules`. `pin.receivedCallerClosures`
is not a file selector. In this pin it is a 36-element array of historical
`base`, `sourcePinSha256`, and `closureDigest` records. Those records affect
the hash only because they are bytes inside the pin file, which is hashed as
one file.

Local source computation on this checkout, after these edits and again at the
base, returns:

`8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`

`pin.files` has 1323 keys. The successful hash means each of those keys exists
here and matches its pinned digest. That is source selection on this checkout.
It is not an observation of the installed release.

Selected by the closure (pin keys, unchanged by this fix):

- `server/lib/pulse.js`
- `server/app.js` (it imports `./routes/pulse.js`; the hasher does not follow
  that import)
- `server/index.js`
- `package.json`
- `package-lock.json`
- the other keys already listed in the pin, including the pinned pulse-store
  implementation files and `supabase/migrations/0010_pulse_free_tool_outcomes.sql`

Not selected by the closure:

- `server/routes/pulse.js`
- `server/scripts/pulse-private-read.js`
- `server/scripts/test-pulse-private-read.js`
- `server/scripts/test-pulse-events.js`
- `server/lib/pulse-store/README.md`
- `.env.example`
- this recipe
- `node_modules/` and every installed package directory

Declared in `package.json`, which is itself a pinned file, so the declaration
text is inside the closure. Declaration is not installation:

- dependencies: `@exodus/bytes` 1.16.0, `@neomorphic/correspondence` (file
  vendor), `@neomorphic/earned-work` (file vendor), `@neomorphic/machine-gateway`
  (file vendor), `@supabase/supabase-js` ^2.108.2, `ajv` 8.20.0, `ajv-formats`
  3.0.1, `express` ^5.2.1, `ipaddr.js` 1.9.1, `jose` ^6.2.3, `pg` ^8.23.0,
  `proxy-addr` 2.0.8, `resend` ^6.14.0, `stripe` ^22.2.2, `viem` 2.55.11,
  `zod` ^3.25.76
- devDependency: `concurrently` ^10.0.3
- the lockfile in this checkout resolves `express` to 5.2.1. The lockfile is
  a pin member. `node_modules/express` is not.

This fix adds no package dependency. The reader uses `node:crypto`, `node:fs`,
`node:url`, and global `fetch`. The route uses `express`, `node:crypto`, and
the pinned `server/lib/pulse.js`.

This workspace ran `npm ci` so the local tests could import `express`. That
`node_modules` tree is test machinery on this workspace. It is not the host
install and it is not closure evidence.

## 4. Environment and profile boundary

The server variable is `PULSE_TOKEN`. `server/routes/pulse.js` reads it from
the process that loads the route. `server/index.js` is the direct entry
(`node server/index.js`, `npm start`) and listens on `process.env.PORT` or
3000. A managed loader that imports `server/app.js` loads the same route.
The variable is not a Vite variable and the committed example value stays
empty.

Root sets the value from the restricted store, either in that process
environment or in a mode `0600` file passed to `--token-file`. This recipe
does not contain the value. The reader learns the variable only when Root
passes `--env-var PULSE_TOKEN`.

Preimage-preserving edit:

1. Copy the full current server environment to a new mode `0600` preimage
   before any edit. Do not print the copy. Keep it for rollback.
2. Start the new environment as that same set of keys and values.
3. Change only `PULSE_TOKEN`. Add the key when it is absent. Replace only its
   value when it is present.
4. Do not delete, rename, or rewrite any other key. In a line-oriented env
   file, every other line stays byte-for-byte, in the same order.
5. The new value is one line from Root's restricted store. After trim it must
   be at least 16 characters and must not contain control characters. Do not
   substitute the historical module fallback.
6. Do not edit profile documents or `private-control-pin.json`. This patch
   does not retarget a profile hash. `hostSourceSha256` stays on the value in
   section 3 because no selected file changes.

## 5. Install and restart

Root runs these steps. This worker does not.

1. On the installed source checkout, fast-forward this branch tip or
   cherry-pick the recorded commits. Do not merge `main`.
2. Confirm the protected diff is empty:

```sh
git diff 0593026ad155352f263e4749dc889a1578d91675 -- \
  server/foundry/activation/private-control-pin.json \
  server/lib/pulse.js server/app.js package.json
```

3. Confirm this search prints nothing:

```sh
git grep -nE 'PULSE_TOKEN[[:space:]]*(\|\||\?\?)'
```

4. Confirm `hostSourceSha256(process.cwd())` from
   `vendor/hosted-wallet-market/src/native-debt.mjs` equals
   `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`.
5. `package.json` and the lockfile do not change. An install that already
   matches that lockfile does not need a new dependency install for this
   patch. A clean tree uses `npm ci` from the pinned lockfile. This recipe
   does not run that against the host.
6. Apply the environment edit in section 4.
7. Restart the existing server so it loads `server/routes/pulse.js` from the
   new tree. `server/index.js` drains on `SIGTERM` and `SIGINT` through
   `bindListenerLifecycle`. Root uses the existing supervisor. The unit name
   and any Hostinger control path were not read for this recipe, so no
   provider command is invented here.
8. Do not start a second public listener from this recipe.

## 6. Checks Root runs after release

These checks are for Root. This worker did not run them on a live host and
does not report their result.

1. Full environment values are present. Compare the running environment with
   the preimage without printing values. Every preimage key is still present
   with the same value. `PULSE_TOKEN` is present, its trimmed length is at
   least 16, and it is not the historical module fallback.
2. A new-token read succeeds through the consumer against the installed
   origin:

```sh
node server/scripts/pulse-private-read.js --origin <installed-origin> --env-var PULSE_TOKEN
```

   Expect exit 0. Stdout has `status` 200, `counts`, `window.startedAt`,
   `window.now`, and `digest.hex`. Stdout and stderr do not contain the token
   or a query string. `--raw-file` is optional and must be a path Root creates
   as mode `0600`. Do not trace the process environment.
3. The historical fallback is refused. With the new token configured, a
   consumer call whose explicit credential is that old fallback exits 3 with
   status 404. A read while `PULSE_TOKEN` is absent returns 503, not 200.
4. `POST /api/pulse/event` is unchanged. The allowlisted
   `seller_repair_brief_viewed` body with
   `finding_id` `hypernatt-liq-radar-20260830` and `route_class` `paid_get`,
   and with no credential, returns 204. An unsupported event returns 400.
5. Original business and human assets are unchanged by this patch. No pinned
   human or business file, client build input, or migration is in the file
   list. `hostSourceSha256` matches section 3. Root still compares the hosted
   human HTML and asset preimage with the postimage. Equality of this source
   tree is not that comparison.

Workspace tests that were run here, and are not host evidence:

- `node --test server/scripts/test-pulse-private-read.js` passed, 27 tests,
  0 failed, exit 0.
- `node --experimental-strip-types --test server/scripts/test-pulse-events.js`
  passed, 26 tests, 0 failed, exit 0.
- Local PostgreSQL binaries and `pg_config` were absent, so
  `npm run test:pulse` was not run as a full suite. The postgres-backed files
  in that script were not executed for this extension.

## 7. Rollback

1. Restore the mode `0600` environment preimage, including the previous
   absence of `PULSE_TOKEN` if that was the preimage.
2. Return the checkout to base `0593026ad155352f263e4749dc889a1578d91675`, or
   revert the branch commits from the tip downward. A rollback to that base
   restores the previous route module and its previous behavior when
   `PULSE_TOKEN` is unset. Do that only as an explicit rollback.
3. Restart the same server process from the rolled-back tree.
4. No database, pin, package, or client-asset rollback belongs to this patch.
   Those bytes do not change.
5. Delete private raw files written by the consumer. They are not server state.
6. Leave the historical ROOT3424 reader where Root already has it. This patch
   does not install or remove it.

## 8. Unknowns

- Installed file bytes were not read. Whether the running host copy of
  `server/routes/pulse.js` matches this source is unknown.
- The replacement token stays in Root's restricted store. Its value is unknown
  here.
- The installed supervisor command, the environment file path, and whether the
  process is `node server/index.js` or a managed import of `server/app.js`
  were not read.
- ROOT3424 is absent from this repository. Its installed path was not
  inspected.
- The host `node_modules` tree was not inspected. Closure selection does not
  include it.
- No live origin was contacted. Nothing in this recipe is a hosted success or
  a hosted failure.
