# Offer candidates (W5-H04)

Exactly three. Ranked by whether a paying caller would change an operational decision, with primary-source proof and a recorded useful engine report. Not ranked by engine marketing. No CLI crash on any of the 12 examples; gaps below are vocabulary/compare, not invented product bugs.

Selected: `h04-lock-01`, `h04-schema-01`, `h04-page-03`.

Not selected (short): `h04-lock-02` is one integrity-algorithm rewrite, not a named version+integrity+resolved pin-delta, and the harness still has a highlight mismatch on `integrity-only`. `h04-lock-03` / `h04-schema-03` / `h04-page-02` / `h04-route-03` are no-change controls. `h04-schema-02` is unused additive noise (buyer of used paths does nothing). `h04-page-01` is a marketing rename, not a contract. `h04-route-01` adds a public SPA path (catalog/SEO, not a break). `h04-route-02` is a real SDS52 used-ops add (`consider-adoption`, medium) but it is additive: existing `GET /api/health` and moltjobs-stats callers do not break.

## 1. h04-lock-01 — three lock pin-deltas (version + integrity + resolved)

### What a buyer pays for

A lockfile pin-delta that names the three packages whose version, integrity, and resolved tarball URL moved, and omits the other 99 pins. Input is the real SDS `package-lock.json` blobs, not the W4 SAMPLE fixture. This is an **operator-risk / pin-delta / integrity-change / resolved-source change** job. H04 is **not** a vulnerability scanner and does not join advisories or version-range CVEs.

### Decision that changes

Do not run `npm ci` against the after lock as if the resolved tree were unchanged. Review/apply `concurrently` 10.0.3→10.0.5, `qs` 6.15.2→6.16.0, `shell-quote` 1.8.4→1.9.0 (new `resolved` + `sha512`) before trusting the tree. The SDS commit subject is `fix(deps): update vulnerable locked dependencies` (quoted as the commit message). The commit message claims vulnerable deps; H04 does not join advisories. A version bump is not a security vulnerability without that join. Do not tell a buyer this engine proved a CVE.

### Primary-source proof

Repo `epistemedeus/samedaydesk`, path `package-lock.json`.

| Role | SHA |
| --- | --- |
| before | `ff381d2b46e9beec1475212df2eb610a7b01229b` |
| after | `62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf` |
| before blob also at parent | `8ffef693719456a0acbc1e2afbbdff5900b82736` |

`git show` of the after commit on `package-lock.json` changes only those three `packages` entries (plus their nested `dependencies` version strings). Quoted in `examples/lockfile/h04-lock-01/SOURCE.md`.

### Engine: useful vs gap

`w4-lockfile-pin-delta` `e81efc8ab71b1bde88eca743d297149e61bbb6f2` produced a useful report: `status=actionable`, changed 3, unchanged 99 omitted, missingIntegrity 0, `changeKinds: ["version","integrity"]` on each named pin. Harness compare `match`. No vocabulary gap on this id.

Same engine on `h04-lock-03` correctly uses `informational` for zero pin delta (oracle already matches that token). `h04-lock-02` status also `actionable`, but harness compare is `mismatch` on the phrase `ms@2.1.3 integrity-only` versus engine `changeKinds: ["integrity"]`.

### Why stronger than the other nine

It is the only example where a recorded engine report names three version+integrity+resolved pin-deltas that an operator must treat as a lock update. The public SDS commit subject (`fix(deps): update vulnerable locked dependencies`) claims the pins were vulnerable; H04 quotes that subject and does not join advisories. Integrity-only `ms` (`h04-lock-02`) does not change the version string. SPA path add (`h04-route-01`) and validator rename (`h04-page-01`) do not force a dependency decision.

## 2. h04-schema-01 — exclusiveMinimum boolean → number

### What a buyer pays for

A used-path JSON Schema drift brief: only the pinned keyword, not the rest of the Draft 06 meta-schema. Callers who serialize `exclusiveMinimum: true` against a Draft 06+ meta-schema need that fact; unused `exclusiveMaximum` / `const` / `$id` must stay off the brief.

### Decision that changes

Stop emitting or accepting boolean `exclusiveMinimum`. Draft 04: `{ "type": "boolean", "default": false }` (modifier of `minimum`). Draft 06: `{ "type": "number" }` (the exclusive bound itself). Validators and code generators pinned to `/properties/exclusiveMinimum` break if they keep `true`/`false`.

### Primary-source proof

Repo `json-schema-org/json-schema-spec`, path `schema.json`.

| Side | Tag | SHA |
| --- | --- | --- |
| before | Draft 04 `draft-fge-json-schema-validation-00` | `d4c5b3a2924370c51b710c8bfd81d3644a92766e` |
| after | Draft 06 `draft-wright-json-schema-01` | `4b495a2933b1d6f75298abdd23f018ba6a9d4f4a` |

Fact is the published meta-schema, not a copy of `tools/json-schema-webhook-drift/fixtures/*` (those use `/properties/amount`).

### Engine: useful vs gap

`w4-json-schema-webhook-drift` `94c7bfdfeaa99f5e70f341504df3051cc7717f91` produced a useful report: `status=actionable`, `kind=json-schema`, `breaking=1`, pointer `/properties/exclusiveMinimum`, `reason=type-change`, before type `boolean`, after type `number`. Unused Draft 06 additions absent. Harness compare `match`.

The **same engine** vocabulary-gaps on the two no-break schema examples: it emits `informational` while oracles `h04-schema-02` and `h04-schema-03` say `unchanged`. Harness aliases those tokens to `no-change`, so compare still `match`. That is a finding about labels, not a failure of this breaking report.

### Why stronger than the other nine

It is the only used-path **type-change** that invalidates existing emitters. `h04-schema-02` adds unused `repository.custom_properties` (engine correctly stays non-breaking). `h04-schema-03` is key-order plus unused `debug`. Observatory `consider-adoption` (`h04-route-02`) is additive. This one is a validator break.

## 3. h04-page-03 — /x402/verified 7-day Bazaar freshness

### What a buyer pays for

An offline selected-field page-change brief for `https://samedaydesk.com/x402/verified`: description + crawler paragraph (the inspection rule), with title/h1 held constant so a title-only watcher cannot substitute.

### Decision that changes

Stop reading a “verified” row as “OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row agree.” After `3c96d3137f815035ed4a6467d28c8041916a9aa8`, the published rule is a matching CDP Bazaar row observed within seven days of the crawl. Badge names (verified / drift / unverified) stay; the criterion does not.

### Primary-source proof

Repo `epistemedeus/samedaydesk`, path `server/lib/spa-route-shells.js` (crawler-readable first-byte HTML for `/x402/verified`).

| Role | SHA | Subject |
| --- | --- | --- |
| before | `3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0` | Add build-time /x402/verified inspection feed and page |
| after | `3c96d3137f815035ed4a6467d28c8041916a9aa8` | Constrain verified feed to current owner evidence |

Unchanged: title `Inspected x402 routes | SameDayDesk`, h1 `Inspected routes, not a certificate`. Changed: `description` and the crawler `<p>` sentence. Quoted in `examples/page-facts/h04-page-03/SOURCE.md`.

Honesty (not hidden): `client/index.html` still uses the older “agree” blurb at both SHAs. The watched page is the route shell, not the homepage.

### Engine: useful vs gap

`w4-page-change-offline-job` `91b57334818ecd7940cb854e9864f3b1749d1d1d` produced a useful report: `verdict=changed`, 2 semantic replaces (`/description`, `/text`), headings not in `changes[]`. Harness compare `match`. Engine token is `verdict`, not `status`; oracle duplicates both, so this id does not vocabulary-gap.

Sister example **`h04-route-03`** on the **same SHAs**, `w4-route-table-diff` `7387eb677abd442dfab9081cb0ad95451fd2a762`: added 0, removed 0, changed 0, titleOnly 0, equal tableDigest. That is the correct route-identity answer (copy is not canonical/robots). It is not a failed page-fact job. Harness compare on route-03 is `unknown` only because route-diff emits `ok: true` and no `status` string while the oracle says `status: "ok"`.

### Why stronger than the other nine

Same commit pair as `h04-route-03` proves the useful-job split: route identity did not change; the inspection sentence did. A buyer who only bought route-table-diff would keep the old verification meaning. `h04-page-01` rewrites title/h1 (search snippet), not a freshness rule. `h04-route-02` asks callers to adopt new GET routes; it does not change what “verified” means on an existing page.
