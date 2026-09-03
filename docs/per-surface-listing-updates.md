# Per-surface listing update instructions

SameDayDesk lists the same canonical handlers on six distribution surfaces. Each surface must advertise its own listing path so a later settlement receipt can record which registry presented the URL.

Do not point two registries at the same canonical path. The handler is shared; the listed URL is not.

## Shared rules

1. Keep the canonical handler path unchanged (`/mcp`, `/scan`, `/api/tools`).
2. Publish only the surface-specific path from the table below.
3. After the live path is serving, update the registry record in place. Do not create a second listing for the same resource on that surface.
4. Confirm an unpaid GET or MCP initialize against the new path before submitting the registry change.
5. A successful settlement through that path must write a receipt whose `surface` field equals the registry slug.

Live catalog of current listing URLs:

```sh
curl -sS https://samedaydesk.com/listings
```

Path pattern:

```
/listings/<surface><canonical-path>
```

| Surface slug | Registry | Example listing URL |
| --- | --- | --- |
| `bazaar` | Coinbase x402 Bazaar / CDP Discovery | `https://samedaydesk.com/listings/bazaar/mcp` |
| `agent402` | Agent402 | `https://samedaydesk.com/listings/agent402/mcp` |
| `agentcash` | AgentCash discovery | `https://samedaydesk.com/listings/agentcash/mcp` |
| `mcp-registry` | Official MCP Registry | `https://samedaydesk.com/listings/mcp-registry/mcp` |
| `x402jobs` | x402.jobs | `https://samedaydesk.com/listings/x402jobs/mcp` |
| `mppscan` | MPPScan / official MPP catalog | `https://samedaydesk.com/listings/mppscan/mcp` |

The same substitution applies to `/scan` and `/api/tools`.

## bazaar (Coinbase x402 Bazaar)

Bazaar materializes rows from the live 402 resource URL and `/.well-known/x402`, not from a dashboard-only nickname.

1. Set the advertised resource URL to `https://samedaydesk.com/listings/bazaar/<canonical-path>`.
2. If the resource also appears in a well-known x402 item or OpenAPI server URL used by CDP, change that item to the Bazaar path. Leave other surfaces on their own paths.
3. Confirm `GET` on the new path returns the same unpaid challenge or MCP body as the canonical handler.
4. Update or rematerialize the existing Bazaar row. Do not submit a second merchant item that still points at `/mcp` or another surface path.
5. After the first settlement on the Bazaar path, check the receipt `surface` field is `bazaar`.

## agent402

Agent402 indexes the seller-declared resource URL.

1. In the Agent402 seller record, replace the previous endpoint with `https://samedaydesk.com/listings/agent402/<canonical-path>`.
2. Keep title, price, network, and pay-to identical to the canonical offer. Only the path changes.
3. Save the existing listing; do not open a duplicate Agent402 item for the same capability.
4. Refresh search until the indexed URL shows the `/listings/agent402/` prefix.
5. Attribute any later settlement from that URL as `surface: "agent402"`.

## agentcash

AgentCash discovery reads OpenAPI plus the live `PAYMENT-REQUIRED` challenge.

1. Expose the AgentCash listing path in the document AgentCash crawls (`/listings/agentcash/<canonical-path>`).
2. Do not list the canonical path or another surface path in that document.
3. Confirm `@agentcash/discovery` (or an unpaid GET) accepts the 402 body and input/output schema on the new path.
4. If a previous AgentCash row still shows the canonical path, edit that row rather than adding a second one.
5. Receipts from this path must carry `surface: "agentcash"`.

## mcp-registry

The official MCP Registry lists a remote Streamable HTTP URL under the `com.samedaydesk` namespace. Domain ownership remains `/.well-known/mcp-registry-auth` on the apex.

1. Set the published server URL to `https://samedaydesk.com/listings/mcp-registry/mcp`.
2. Leave `/.well-known/mcp-registry-auth` on the apex host. Do not move the ownership proof under `/listings/`.
3. Publish the update against the existing registry entry (`server.json` / registry publisher flow). Do not create a second server for the same namespace.
4. Confirm `initialize` and `tools/list` on the listing path match `/mcp`.
5. Receipts from this path must carry `surface: "mcp-registry"`.

## x402jobs

x402.jobs stores an explicit `resource_url` on each listing.

1. Edit the live item and set `resource_url` to `https://samedaydesk.com/listings/x402jobs/<canonical-path>`.
2. Keep `pay_to`, network, asset, and amount aligned with the canonical offer.
3. Do not create a second x402.jobs item that still points at the canonical path.
4. Confirm the public listing page and search record show the `/listings/x402jobs/` URL.
5. Receipts from this path must carry `surface: "x402jobs"`.

## mppscan

MPPScan and the official MPP catalog index the advertised MPP route.

1. Update the catalog row to `https://samedaydesk.com/listings/mppscan/<canonical-path>`.
2. Keep native MPP terms (amount, asset, recipient) identical to the canonical handler.
3. Replace the previous URL on the same row. Do not leave the canonical path published beside the alias.
4. Confirm an unpaid MPP challenge on the listing path matches the canonical challenge.
5. Receipts from this path must carry `surface: "mppscan"`.

## After every registry edit

- `GET https://samedaydesk.com/listings` still lists one URL per surface per resource.
- A test settlement through the new path writes a receipt with that surface slug.
- Canonical `/mcp`, `/scan`, and `/api/tools` remain the durable handler mounts for first-party callers that are not coming from a registry.
