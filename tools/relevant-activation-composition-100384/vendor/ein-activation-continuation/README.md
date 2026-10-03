# EIN activation continuation

SPDX-License-Identifier: MIT

Caller-owned continuation for the public EIN.LLC formation HTTP flow.
It sits on the existing public client (`ein-formation-http-client` v0.1.0).
A later process can discover, assess one supplied business/task context, prepare once, hand
the existing claim link to a human, and read grant-scoped status. It does
not claim, pay, attest, or invent a company or a person.

License: `LICENSE` (MIT). Source pin and vendor notice: `PROVENANCE.md`.
Install and the two-process example: `INSTALL.md`. What root may run on
the live origin: `RECEIVING.md`.

The useful commands are `discover`, `assess`, `prepare`, `resume`, `status`,
`show`, and `cancel`. `EIN_CONTINUATION_TRANSPORT` selects `http` (default),
`mcp`, `a2a`, or `a2a-rest`. MCP reads the catalog itself. A2A does not:
unset catalog transport stops discover, and `EIN_CONTINUATION_CATALOG_TRANSPORT=http`
labels the catalog read as HTTP while operations stay on A2A. A stored offer
is not the current contract. `cancel` updates only the local continuation file.
This API has no agent cancel for the server case. Autonomous machine
purchase is refused. Viewing a claim link is not a sale, a claim, or filing
authority.

A prepare reply that is lost after the server may have committed is stored
as `prepare_uncertain`. `resume` sends the same assessment, recipient,
operation id, and transport. A proven pre-dispatch refusal stays a
deterministic error and does not become an uncertain case.

Run `node bin/ein-continuation.mjs help`. Configuration is environment
variables, not argv. The continuation file is mode 0600 and is the only
place the claim URL is stored unless the operator passes `--show-claim-url`.


v0.1.2 adds explicit supplied-context projection, one deadline covering stdin
and discovery, and a concise machine claim action with application scope.
Unknown prerequisites return clarification without an offer. No description
is promoted to a new-company requirement. The server records closed activation
states and unknown fields in its existing `agent_call` journey contract;
caller labels and link visits never establish purchases. v0.1.3 repairs the
client view so terminal or uncertain assessment output also omits the catalog offer,
and shares one raw response byte allowance across setup and operation replies.

The candidate is `/downloads/ein-activation-continuation-v0.1.3.tgz` with a
versioned JSON manifest alongside it. Frozen v0.1.0/v0.1.1/v0.1.2 archives are
preserved. Root's mutable machine index records publication preparation.
