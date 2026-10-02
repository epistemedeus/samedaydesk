# Public EIN formation HTTP client (standalone)

Small **downloadable** Node client/example for the exact public HTTPS flow documented at
[`/agents/http-quickstart`](https://ein.llc/agents/http-quickstart).

- **Zero npm dependencies** (Node 22+ built-ins only: `fetch`, `fs`, `path`, `process`, `url`, `crypto`)
- Usable **without** a private `ein-llc-lean` checkout or unpublished npm packages
- Does **not** duplicate the http-quickstart page — it implements the same paths/fields as a runnable client

This is not a private SDK, not claim automation, and not a payment integration. Agents never claim, pay, or invent grants.

## Exact external download / run path

The `epistemedeus/ein-llc-lean` repository is **private**. Outside agents must use the
**public HTTPS static download** (allowlisted pack; not an npm publish):

- Docs: [`/agents/http-client-download`](https://ein.llc/agents/http-client-download)
- Versioned tarball: [`/downloads/ein-formation-http-client-v0.1.0.tgz`](https://ein.llc/downloads/ein-formation-http-client-v0.1.0.tgz)
- Zip: [`/downloads/ein-formation-http-client-v0.1.0.zip`](https://ein.llc/downloads/ein-formation-http-client-v0.1.0.zip)
- Manifest: [`/downloads/ein-formation-http-client.json`](https://ein.llc/downloads/ein-formation-http-client.json)

Requires Node 22+ and a POSIX shell (macOS/Linux) with `curl` and `tar`.
Run from a directory where `ein-client-download` does not exist. The subshell
stops on a failed download or extraction and leaves your shell directory unchanged.

<!-- S43:download-tgz -->
```sh
(
  set -eu
  mkdir ein-client-download
  cd ein-client-download
  curl -fsS --max-time 30 -o ein-formation-http-client-v0.1.0.tgz \
    https://ein.llc/downloads/ein-formation-http-client-v0.1.0.tgz
  tar -xzf ein-formation-http-client-v0.1.0.tgz
  cd ein-formation-http-client
  node cli.mjs help
  node cli.mjs discover --origin https://ein.llc
  node cli.mjs assess --origin https://ein.llc < examples/assess-positive.json
)
```

ZIP alternative (requires `unzip`; use a separate fresh directory):

<!-- S43:download-zip -->
```sh
(
  set -eu
  mkdir ein-client-zip-download
  cd ein-client-zip-download
  curl -fsS --max-time 30 -o ein-formation-http-client-v0.1.0.zip \
    https://ein.llc/downloads/ein-formation-http-client-v0.1.0.zip
  unzip -q ein-formation-http-client-v0.1.0.zip
  cd ein-formation-http-client
  node cli.mjs help
  node cli.mjs discover --origin https://ein.llc
  node cli.mjs assess --origin https://ein.llc < examples/assess-positive.json
)
```

On Windows, download the ZIP link, use **Extract All**, and open a terminal in
`ein-formation-http-client`. Run `node cli.mjs help`, then
`node cli.mjs discover --origin https://ein.llc`. No package installation is needed.
The manifest records archive byte lengths, media types and SHA-256 hashes.
These hashes identify release contents; they do not independently authenticate the publisher.

In-repo source path (private checkout only): `tools/public-ein-http-client/`.
Pack script: `node scripts/public-ein-client-pack.mjs` → site static `/downloads/`.
See `LICENSE` (MIT) and `PROVENANCE.md` (reviewed runtime commit and SPDX) inside the archive.
The runtime commit identifies code and examples; manifest `sourceFiles` identifies every
exact release file, including metadata and documentation added for this download.

## Commands

| Command | HTTP | Notes |
| --- | --- | --- |
| `discover` | `GET /api/v1/service-catalog` + `GET /api/agent/v1/openapi.json` | Anonymous discovery |
| `assess` | `POST /api/agent/v1/assessments` | Operator-supplied AssessmentInput JSON on stdin |
| `prepare` | `POST /api/agent/v1/applications` | **Explicit only**; each success creates a **new** case |
| `status` | `GET /api/agent/v1/applications/{id}/status` | Requires `EIN_AGENT_GRANT` or `EIN_AGENT_GRANT_FILE` |

### Claim / review URLs

Prepare returns `reviewUrl` (`/review/{applicationId}`) and, when complete, `claimUrl` (`?claim=`).

- By default the CLI **redacts** the claim token in stdout.
- Pass `--show-claim-url` to print the full `claimUrl` for human handoff (stderr notice included).
- Humans claim (verified Firebase email matching `intendedEmail`); agents do not.

### Status grants

```sh
EIN_AGENT_GRANT='…human-issued…' node cli.mjs status --application-id app_…
# or owner-only file (mode 0600):
EIN_AGENT_GRANT_FILE=./grant.txt node cli.mjs status --application-id app_…
```

Grants are never accepted as CLI flags, URL query params, or JSON body fields. This client never invents grants.
Grant credentials are bound to `https://ein.llc` by default. For an intentional non-production
origin, set `EIN_AGENT_GRANT_ORIGIN` to the exact same scheme and host; a mismatch is rejected before
the grant environment variable or file is read.

## Safety properties

- Manual redirect mode; **refuses redirects** and **wrong-origin** responses
- Bounded timeouts (default 15s) and response/body size limits
- **No auto-retry** on unknown prepare outcomes (API has no idempotency key)
- Redacted error output (no Bearer / claim token leakage)
- `http://` origins allowed **only** for loopback disposable servers (tests / local verify)

## Payment and human consent boundaries

- Assessment never creates checkout (`createsCheckout: false`)
- Prepare creates a non-sensitive provisional case only — not approval or payment
- Confidential intake, claim, and merchant checkout are **human** steps after review
- Offer id when present: `llc-ein-399` · $399 + state filing fees · 2–3-business-day EIN route for qualifying cases (not a universal guarantee)
- Do not create production prepare/claim/pay traffic as QA; use a disposable local origin for mutate examples

Human surfaces (not this client): [formation](https://ein.llc/agents/formation) · [partner decision](https://ein.llc/agents/partner-decision).

## Library usage

```js
import { FormationHttpClient } from "./client.mjs";

const client = new FormationHttpClient({
  origin: process.env.ORIGIN || "https://ein.llc",
  fetch: globalThis.fetch,
});

const { catalog, openapi } = await client.discover();
const assessed = await client.assess({
  goal: "Accept Stripe for a SaaS product",
  hasUsEntity: "no",
  hasEin: "no",
  providerRequiresUsEntity: "yes",
  providerRequiresEin: "yes",
  selectedState: "Wyoming",
});
// If assessed.terminal === true, stop. Do not prepare.
```

## Maintainer tests (private source checkout only)

The public archive intentionally excludes `test/`. The following command requires
the private source folder, `tools/public-ein-http-client/`; it cannot run from a download.
No monorepo install is required:

```sh
node --test --test-concurrency=1 test/*.test.mjs
```

- `test/client.test.mjs` — executable tests against an isolated disposable local server (fixture in `test/local-server.mjs`)
- `test/fresh-directory.test.mjs` — copies only this folder to a temp dir and runs discovery+assess with no private packages / no repo root

Packing and release checks run from the private repository root with Node 22+ and
Python 3 standard libraries only. Set `EIN_PUBLIC_CLIENT_PYTHON` to a Python 3
executable if it is not named `python3` (or `python` on Windows):

```sh
node scripts/public-ein-client-pack.mjs
node scripts/public-ein-client-pack.mjs --check
node --test scripts/public-ein-client-pack.test.mjs
node scripts/public-ein-client-acceptance.mjs
```

Pack writes only `public/downloads/`; it does not build Astro, modify source, or
patch an old build. `--check` verifies both archives and the manifest without writing.
Acceptance tests the existing static input over loopback HTTP. After a full site build,
run `node scripts/public-ein-client-acceptance.mjs --site-root artifacts/ein-llc/dist/public`
to verify the emitted downloads and HTML page. Neither mode proves public hosted availability.
Keep the versioned URL immutable after publication; new public contents need a new version.
