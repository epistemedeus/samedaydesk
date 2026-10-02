# Install and continue

SPDX-License-Identifier: MIT

Node 22 or newer. No npm install. The public client is imported from
`../public-ein-http-client` in this repository, or from
`vendor/ein-formation-http-client` inside the packed archive.

`EIN_CONTINUATION_MAX_RESPONSE_BYTES` bounds total raw response bytes for one
command, including catalog, protocol setup, OpenAPI and operation replies
(default 1 MiB, maximum 4 MiB). Stdin and request bodies remain at 32 KiB;
stdout remains at 64 KiB. `EIN_CONTINUATION_DEADLINE_MS` covers all command reads.

## From this checkout

```sh
cd tools/activation-continuation
node bin/ein-continuation.mjs help
```

## Anonymous install

The candidate archive is `ein-activation-continuation-v0.1.3.tgz`. Its
machine manifest is `/downloads/ein-activation-continuation-v0.1.3.json`.
All v0.1.0, v0.1.1 and v0.1.2 bytes remain frozen. The live unversioned index stays Root-owned.
`ACQUISITION.json` records the MIT license, the vendored public client, and
the source pin. Extracting that archive is not a customer activation, a
claim, or a payment. No npm install and no private Git checkout are required.

```sh
tar -xzf ein-activation-continuation-v0.1.3.tgz
cd ein-activation-continuation
node bin/ein-continuation.mjs help
```

`EIN_CONTINUATION_TRANSPORT` is `http` (default), `mcp`, `a2a`, or
`a2a-rest`. MCP reads the catalog from its own resource. A2A does not serve
the catalog: leave `EIN_CONTINUATION_CATALOG_TRANSPORT` unset and discover
stops, or set it to `http` so the catalog read is labeled HTTP while assess,
prepare, and status stay on A2A. A stored offer is not reused as the current
contract. Claim, payment, and grant issuance are refused on every transport.

## One task, two cold processes

Use a private directory. The customer key is an opaque caller secret, not a
name or a government id. The task file is the non-sensitive assessment only.

```sh
umask 077
mkdir -p "$HOME/.ein-continuation"
export EIN_CONTINUATION_FILE="$HOME/.ein-continuation/task-qualifying-01.json"
export EIN_CONTINUATION_TASK_ID="task-qualifying-01"
export EIN_CONTINUATION_CUSTOMER_KEY="replace-with-12-plus-opaque-chars"
export EIN_CONTINUATION_LANE="agent_assisted_human"
export EIN_ACTIVATION_BASE_URL="https://ein.llc"
export EIN_CONTINUATION_INTENDED_EMAIL="${SUPPLIED_HUMAN_EMAIL:?Set the actual intended recipient}"

node bin/ein-continuation.mjs discover
node bin/ein-continuation.mjs assess < examples/task-qualifying.json
node bin/ein-continuation.mjs prepare
```

`prepare` stores the claim URL in the continuation file and prints a redacted
view. Exit 0 means the case is waiting for the human. Exit 2 is a structured
refusal. A lost prepare reply exits 2 with `prepare_uncertain`. Run `resume`
with the same file, task id, and customer key. The stored recipient is sufficient; a supplied replacement must match. Do not choose a
new operation id. The operation id is `task:` plus the task id.

Hand off only when the human is at the decision:

```sh
node bin/ein-continuation.mjs show --show-claim-url
```

That prints `claimUrl` once. Forward it to the intended human. Opening the
URL does not claim, pay, or finish the case. The agent does not pay or attest.

## Later process

A new shell, or a machine whose API origin changed, uses the same file and
the current origin. The client re-reads the catalog and adopts that origin
only when the terms still match. It does not log in again.

```sh
export EIN_CONTINUATION_FILE="$HOME/.ein-continuation/task-qualifying-01.json"
export EIN_CONTINUATION_TASK_ID="task-qualifying-01"
export EIN_CONTINUATION_CUSTOMER_KEY="replace-with-12-plus-opaque-chars"
export EIN_CONTINUATION_LANE="agent_assisted_human"
export EIN_ACTIVATION_BASE_URL="https://ein.llc"
export EIN_AGENT_GRANT_FILE="$HOME/.ein-continuation/grant.txt"
export EIN_AGENT_GRANT_ORIGIN="https://ein.llc"
chmod 600 "$EIN_AGENT_GRANT_FILE"

node bin/ein-continuation.mjs status
```

The human issues the grant from the claimed application. This client does not
mint one. A wrong customer key or task id is refused before a request. An
expired, revoked, or foreign grant is refused with `grant_rejected` or
`foreign_credential`. Changed terms after prepare are `terms_changed`. The
stored case is not replaced.

`EIN_CONTINUATION_LANE=disposable_owner_qa` is only for an `http://127.0.0.1`
API. `autonomous_machine_purchase` is refused. Loopback is not an
agent-assisted human sale.

`cancel` marks the local file cancelled and does not call the server.
Grant expiry and human revoke remain the server operations.

## Supplied business/task context

Flat public assessment JSON remains supported. Alternatively pipe one
`ein.supplied-context.v1` object with a non-sensitive `task` string,
`business` (`hasUsEntity`, `hasEin`), and `requirements`
(`providerRequiresUsEntity`, `providerRequiresEin`, `jurisdictionKnown`,
`selectedState`). Optional `foreignOwnedCaution` is boolean. Tri-state facts
are `yes`, `no`, or `unknown`. The client projects only these explicit facts
onto the existing assessment; task descriptions never infer a requirement.
Use the caller's actual facts, not the example facts or a guessed identity.

The four `examples/context-*.json` files are disposable demonstrations.
Payment-provider and supplier examples cite different supplied prerequisites;
technical and unconfirmed examples demonstrate a useful stop/clarification.
They are not observed customers or invitations to create real applications.

An insufficient assessment returns `clarify_prerequisite` with the missing
inputs. An already satisfied or irrelevant task stops with the existing next
step. A changed task needs a separate task id/file. After prepare dispatch,
reassessment cannot replace the owning assessment even when the reply was lost.
A proven expired assessment with no application may be explicitly reassessed
using the same facts and operation id (`EIN_CONTINUATION_REASSESS=1`).

The claim action includes `requiredScope` for the application and intended
verified-email owner, the existing review link, and a `continuationScope` of
`status` only. `claimLink.field` identifies the private continuation's
`claimUrl`. Share that URL only with the intended human; use `--show-claim-url`
when explicitly handing it over. Payment and confidential intake are later
human decisions. The continuation file/caller key is not a server credential;
a human-issued application grant is still required to read server status.

Raw stdin is capped at 32 KiB. `EIN_CONTINUATION_DEADLINE_MS` bounds the entire
command, including stdin, catalog, OpenAPI, protocol setup, and result read
(default 15000 ms; range 50–60000). Per-response bounds and the existing
`EIN_CONTINUATION_TIMEOUT_MS` remain active. Stdout JSON is capped at 64 KiB.
