# samedaydesk CLI: install path preview (operator review only)

Status: draft for operator review. Not published, not linked from any page and
not human website copy. Nothing here changes the homepage or any hosted route.
Facts are stated as of samedaydesk@32437117 plus the CLI branch and the #398
client repair (release branch), and live reads on 2026-11-12 PST.

## What this package is

- Name in `package.json`: `@samedaydesk/cli`, version `0.1.0`, `"private": true`.
  It is **not published to npm** and cannot be installed by name. The npm scope
  and the `samedaydesk` binary name have not been checked for ownership or
  collision. Binary name, package namespace and site branding are separate facts.
- Runtime: Node 22.14 or later. No runtime npm dependencies.
- Source: `tools/samedaydesk-cli/` in `epistemedeus/samedaydesk` on a draft
  branch. It is not merged or released.

## Package rights (truthful state)

Root ruling, 2026-11-12: the package stays `UNLICENSED`. No repository-wide
license is inferred.

- The CLI's own files carry `"license": "UNLICENSED"` in `package.json`, so no
  license is granted.
- `vendor/task-continuation/` is a byte-exact copy of a file that ships with an
  MIT `LICENSE` beside it (Copyright (c) 2026 SameDayDesk). That grant covers
  that file only.
- The packed archive also copies the SameDayDesk shared-client closure:
  `server/vendor/machine-gateway/bin/client-io.mjs`, `src/util.mjs` and
  `src/errors.mjs`. On the release branch `client-io.mjs` is the repaired client,
  byte-identical to the `bin/client-io.mjs` member of the prepared
  machine-gateway 0.1.3 archive; `util.mjs` and `errors.mjs` are unchanged from
  samedaydesk@32437117. There is no LICENSE file at
  the inspected path (`server/vendor/machine-gateway/`), and the
  `@neomorphic/machine-gateway` `package.json` states no license.
- **Public promotion is a separate future step.** It is gated on the actual
  license grant of each bundled archive and file, checked one by one. It is not
  part of this preview, and nothing here should be read as permission to
  redistribute.
- The server states no right to use any result for a particular purpose.
  Handbacks say `rights: {stated: false}`.

## How someone would install it today

From a checkout of the branch (operator or reviewer only):

```sh
cd tools/samedaydesk-cli
node bin/samedaydesk.mjs help
```

As an archive, built locally (no registry):

```sh
cd tools/samedaydesk-cli
npm run pack:clean -- /abs/out          # writes samedaydesk-cli-0.1.0.tgz plus sha256
npm install --prefix /tmp/sds-cli --ignore-scripts /abs/out/samedaydesk-cli-0.1.0.tgz
/tmp/sds-cli/node_modules/.bin/samedaydesk version
```

The archive has no registry dependencies, so it also installs from an empty,
offline prefix and cache:

```sh
npm install --global --offline --prefix /abs/empty-prefix --cache /abs/empty-cache \
  --ignore-scripts --no-audit --no-fund /abs/out/samedaydesk-cli-0.1.0.tgz
/abs/empty-prefix/bin/samedaydesk version
```

There is no hosted download of this archive, no install script on any
SameDayDesk host, and no `npx samedaydesk` route.

## What is hosted and what is not

Hosted and reachable without credentials (read live 2026-11-12 PST):

- `GET https://samedaydesk.com/agent-readiness?host=H&format=json`: the free
  readiness report used by `readiness check`.
- `https://samedaydesk.com/api/machine-gateway`: `healthz`, `v1/discover`
  (5 routes, `paymentsEnabled: false`), route schemas, `POST v1/test` (labeled
  fixture) and `POST v1/quote` (anonymous quotes are previews and never
  executable).
- `https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/profile`
  and `/v1/market/discover` (public reads). Following `nextCursor` with
  `limit=1` was refused (`cursor_refused`). A server repair is tracked
  separately.

Hosted but not usable by this CLI version:

- `POST /api/machine-gateway/v1/execute` and receipts: need an
  operator-enrolled tenant bearer. That is not self-serve, and this CLI version
  reads no credential.
- `https://agents.samedaydesk.com/mcp`: an MCP endpoint that lists charged
  tools. This CLI does not call it.

Not hosted:

- `https://agents.samedaydesk.com/.well-known/mcp.json` returned 404. This
  preview does not claim that route.
- No npm package, no hosted tarball, no hosted CLI documentation page.
- No payment, signing or settlement path in this CLI.

## Limits stated to users

- POST requests are never retried. A failure after sending does not show
  whether the server applied the request; read `error.evidence.recovery`.
- Ctrl-C (SIGINT) exits 130. With the pinned client it stops waiting, but a
  request already sent may still complete remotely. `--recovery-file` records the attempt
  identity before sending and nothing more.
- Saved records live only where the caller puts them. If that storage is lost,
  rerun the read.
