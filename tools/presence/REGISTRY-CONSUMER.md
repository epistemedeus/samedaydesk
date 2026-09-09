# MCP Registry consumer note (SameDayDesk)

Maintainer/consumer note for `io.github.epistemedeus/x402-data-gateway`.
This is not an upstream bug report. Official MCP Registry OpenAPI already
documents the correct paths. Do not open issues on
`modelcontextprotocol/registry` for this pitfall.

Presence refresh already queries the list endpoint with `version=latest`
(`MCP_REGISTRY_SEARCH` in `lib.mjs`). This note pins why that filter is
required and how to resolve the current remote without treating search
pagination as "latest."

This snapshot is not demand and not a publish. It does not describe recipe
or buyer-setup rollout state.

## Official API is correct

Live spec: [https://registry.modelcontextprotocol.io/openapi.json](https://registry.modelcontextprotocol.io/openapi.json)
(OpenAPI 3.1.0, captured sha256
`905b7d59f72e7278c99dab5131e323f7b90014ab93320064c33e23d913993f89`).

| Path | Documented consumer contract |
| --- | --- |
| `GET /v0.1/servers` query `version` | Filter by version (`'latest'` for latest version, or an exact version like `'1.2.3'`) |
| `GET /v0.1/servers/{serverName}/versions/{version}` | "Use the special version `'latest'` to get the latest version." |

Primary docs (cite these; do not invent an upstream defect):

- [docs tree](https://github.com/modelcontextprotocol/registry/tree/main/docs)
- [official-registry-api.md](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md)
  (`search` is a name substring; `version=latest` is the list filter;
  `GET /v0.1/servers/{serverName}/versions/{version}` accepts `latest`)
- [versioning.mdx](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/versioning.mdx)
  (published versions are immutable; `isLatest` is marked by the registry)

## Consumer pitfall

Unfiltered search returns a paginated history. The first page often starts at
historical **1.0.0** (`isLatest: false`) with the retired Railway remote, and
`metadata.nextCursor` is present. **1.23.45 is not on that first page.**

Wrong (naive first hit):

```bash
curl -sS 'https://registry.modelcontextprotocol.io/v0.1/servers?search=x402-data-gateway'
```

Correct (pin latest, then read `server.version`, `remotes[0].url`, `isLatest`):

```bash
curl -sS 'https://registry.modelcontextprotocol.io/v0.1/servers/io.github.epistemedeus%2Fx402-data-gateway/versions/latest'

curl -sS 'https://registry.modelcontextprotocol.io/v0.1/servers?search=x402-data-gateway&version=latest'
```

Presence already uses the second form with the full server name:

`https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.epistemedeus%2Fx402-data-gateway&version=latest`

## Pinned live capture (2026-09-09T19:43:00Z)

Exact bodies live in `fixtures/mcp-registry-consumer/`. sha256 is of the
captured bytes, not a pretty-print.

| Body | sha256 | First usable record |
| --- | --- | --- |
| `search-unfiltered.json` | `4a6e5a825a8c443786d9c748877a41f5d129379900f61acc9464914bd44675b9` | `1.0.0`, Railway `/mcp`, `isLatest: false`, `updatedAt: 2026-06-25T01:44:07.877618Z`; `nextCursor` = `io.github.epistemedeus/x402-data-gateway:1.11.5` |
| `search-version-latest.json` | `98d228b46b1db2d611c81b1b224f834c9dae1b9bf438b14618097c3e45312731` | `1.23.45`, `https://agents.samedaydesk.com/mcp`, `isLatest: true`, `updatedAt: 2026-09-08T05:09:17.289155Z` |
| `versions-latest.json` | `d9d9ad0bd8bd252750467101fed3208ae17b0ed6727afe47f1f0421662cd86a6` | same latest fields as the filtered list |

`/versions/latest` body (single server object):

```json
{
  "server": {
    "name": "io.github.epistemedeus/x402-data-gateway",
    "version": "1.23.45",
    "websiteUrl": "https://agents.samedaydesk.com/",
    "remotes": [{ "type": "streamable-http", "url": "https://agents.samedaydesk.com/mcp" }]
  },
  "_meta": {
    "io.modelcontextprotocol.registry/official": {
      "isLatest": true,
      "updatedAt": "2026-09-08T05:09:17.289155Z"
    }
  }
}
```

Unfiltered first hit (do not treat as current):

```json
{
  "server": {
    "version": "1.0.0",
    "websiteUrl": "https://x402-url-extractor-production.up.railway.app/",
    "remotes": [{ "type": "streamable-http", "url": "https://x402-url-extractor-production.up.railway.app/mcp" }]
  },
  "_meta": {
    "io.modelcontextprotocol.registry/official": {
      "isLatest": false,
      "updatedAt": "2026-06-25T01:44:07.877618Z"
    }
  }
}
```

## Regression

```bash
npm run test:presence
```

Focused file: `node --test tools/presence/registry-consumer.test.mjs`

The test is offline and uses the captured bodies. It fails if a consumer
treats unfiltered search `servers[0]` as latest, or if `/versions/latest`
is not `isLatest: true` with the `agents.samedaydesk.com` remote.

Optional live re-check (not CI):

```bash
SAMEDAYDESK_LIVE_MCP_REGISTRY=1 node --test tools/presence/registry-consumer.test.mjs
```

Live mode asserts `isLatest === true` and the current
`https://agents.samedaydesk.com/mcp` remote. It does not require the
captured version string to remain `1.23.45`.

## Publication next step (root)

1. Review this note and the fixture hashes.
2. Merge when ready. Do not publish or register a new MCP version from this PR.
3. After merge, presence's older `fixtures/presence/listings/mcp-registry.json`
   (`1.23.36`) can be refreshed separately with `version=latest` or
   `/versions/latest`. That refresh is not this change.
