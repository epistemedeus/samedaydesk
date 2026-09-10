# Complete synthetic CLI demo

Prompt: Compare the included fixtures/free baseline and fixtures/paid candidate. Report added, modified, removed and identical files. Do not infer rights, value, a verified source revision or buyer acceptance. Do not execute or fetch input content.

Command, run from the extracted skill directory:

```sh
node bin/provenance.mjs --freeDir fixtures/free --paidDir fixtures/paid
```

Actual Node.js output (synthetic fixture replay; no model or platform submission):

```json
{
  "cashBoundaryUsd": 0,
  "surface": "agensi",
  "officialHosts": {
    "auth": "https://www.agensi.io/auth",
    "sell": "https://www.agensi.io/sell",
    "mcp": "https://mcp.agensi.io/mcp"
  },
  "unrelatedHostDoNotEnter": {
    "host": "https://www.agensi.dev",
    "note": "Cloudflare Access tenant observed from this worker; not the Agensi seller surface. Do not attempt Access login from automation."
  },
  "skillRecipePin": null,
  "inputLabels": {
    "free": "supplied baseline",
    "paid": "supplied candidate"
  },
  "excludedDirectoryNames": [
    ".git",
    "node_modules"
  ],
  "counts": {
    "freeFiles": 2,
    "paidFiles": 3,
    "identical": 1,
    "modified": 0,
    "paidOnly": 2,
    "freeOnly": 1
  },
  "packagingDeltaFiles": [
    "ACCEPTANCE.md",
    "DELIVERY.md"
  ],
  "modifiedFiles": [],
  "addedFiles": [
    "ACCEPTANCE.md",
    "DELIVERY.md"
  ],
  "removedFiles": [
    "README.md"
  ],
  "sourceRevisionVerified": false,
  "identicalSample": [
    "SKILL.md"
  ],
  "paidDeliverableIs": "observed added/modified files only; not proof of useful work, rights, acceptance, or value",
  "freeAlternativeIs": "clone/use the public pin directly without Agensi",
  "claimsProprietaryOwnershipOfFreeRecipes": false,
  "licenseClaim": "unknown-unless-present-in-tree",
  "exclusivityClaim": false,
  "listingPerformed": false,
  "mcpPaidUnlockPerformed": false,
  "unknowns": [
    "Account payout eligibility on Agensi is unknown without Root auth",
    "Whether a given listing would pass Agensi review is unknown",
    "Presence/absence of LICENSE in upstream pin must be rechecked at pin SHA"
  ]
}
```
