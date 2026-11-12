# samedaydesk CLI: install path preview (operator review only)

Status: draft for operator review. Not published, not linked from any page and
not human website copy. Nothing here changes the homepage or any hosted route.
Facts are stated as of samedaydesk@32437117 plus the CLI branch, and live reads
on 2026-11-12 PST.

## What this package is

- Name in `package.json`: `@samedaydesk/cli`, version `0.1.0`, `"private": true`.
  It is **not published to npm** and cannot be installed by name. The npm scope
  and the `samedaydesk` binary name have not been checked for ownership or
  collision. Binary name, package namespace and site branding are separate facts.
- Runtime: Node 22.14 or later. No runtime npm dependencies.
- Source: `tools/samedaydesk-cli/` in `epistemedeus/samedaydesk` on a draft
  branch. It is not merged or released.

## Package rights (truthful state)

- The CLI's own files carry `"license": "UNLICENSED"` in `package.json`: no
  license is granted yet. The operator decides the license before any
  distribution.
- `vendor/task-continuation/` is a byte-exact copy of an MIT-licensed file
  (`LICENSE` beside it, Copyright (c) 2026 SameDayDesk).
- The packed archive copies `server/vendor/machine-gateway/bin/client-io.mjs`,
  `src/util.mjs` and `src/errors.mjs`. The `@neomorphic/machine-gateway`
  package states no license, and the samedaydesk repository has no LICENSE
  file. Redistribution rights for that closure need an operator decision.
- No right to use any result for a particular purpose is stated by the server.
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
  whether the server applied the request. `--recovery-file` records the attempt
  identity before sending and nothing more.
- Saved records live only where the caller puts them. If that storage is lost,
  rerun the read.
