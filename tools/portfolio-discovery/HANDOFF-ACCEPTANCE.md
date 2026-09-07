# Agent-handoff acceptance

Bounded GET probe for a **declared** per-site handoff contract. This is not a
new protocol, crawler, ranking product, or correspondence server.

The reusable HTTP probe stays in `lib.mjs`. `--mode agent-handoff` adds optional
declaration checks. Default `catalog.json` lists the three live public origins
and only capabilities observed today. It does **not** advertise EIN or
Neomorphic correspondence endpoints. Those tracks are not deployed on this
branch. A separate worker owns SameDayDesk server and payment changes.

## Commands

Offline (deterministic):

```
node --test --test-concurrency=1 tools/portfolio-discovery/handoff.test.mjs
node tools/portfolio-discovery/cli.mjs --mode agent-handoff --fixture tools/portfolio-discovery/fixtures/healthy.json
```

Default catalog plus healthy fixtures stays undeclared and should exit 0.
`fixtures/handoff-overlay-healthy.json` is a caller-supplied example contract;
pairing it with current live or healthy discovery responses is expected to
yield `broken_exact_link` until those GET surfaces exist. Staged-origin example:

```
node tools/portfolio-discovery/cli.mjs --mode agent-handoff --catalog tools/portfolio-discovery/fixtures/handoff-staged-catalog.json --fixture tools/portfolio-discovery/fixtures/handoff-staged-responses.json
```

Live (explicit, no credentials, no effects):

```
node tools/portfolio-discovery/cli.mjs --mode agent-handoff --live
```

Do not pass a staged or future overlay against live apex unless that origin
already publishes the same contract. `--live` is not part of `npm run build`.

## Declared contract

Caller-supplied catalog `handoff` object, or `--handoff` overlay:

```
{
  "sites": [
    {
      "id": "<catalog site id>",
      "handoff": {
        "origin": "https://example.test",
        "availability": "observed",
        "method": "GET",
        "humanReviewUrlTemplate": "https://example.test/review/{projectId}",
        "machineGuide": "https://example.test/openapi.json",
        "requiredInputs": ["title", "summary"],
        "example": {
          "url": "https://example.test/review/demo",
          "inputs": { "title": "Demo", "summary": "Fixture" }
        }
      }
    }
  ]
}
```

Field meaning:

| Field | Rule |
| --- | --- |
| `origin` | Exact catalog origin. Trailing slash ignored. Mismatch is `foreign_url`. |
| `availability` | `observed`, `proposed`, or `not_advertised`. Observed GET surfaces must exist. Proposed missing surfaces stay `not_applicable`. Foreign URLs, query secrets, unsupported methods, and bad published examples still fail. |
| `method` | Human-review URL method. This probe only accepts `GET`. POST/DELETE belong in a machine guide and are not executed. Anything else is `unsupported_method`. |
| `humanReviewUrlTemplate` | Same-origin HTTPS template (`{name}` or `/:name`). Not fetched until `example.url` is supplied. This probe never invents ids. |
| `machineGuide` | Same-origin HTTPS GET document (OpenAPI JSON or other published guide). |
| `requiredInputs` | Names a published example must include. No example means the check is not run, except `observed` without an example cannot confirm the contract. |
| `example` | Concrete GET review URL plus input names. Forwarded GET must do nothing. |

Omit `handoff` entirely for current sites. Undeclared is `not_applicable`, not
broken.

## Findings (not a trust score)

| Code | When |
| --- | --- |
| `foreign_url` | Declared origin or URL is not the catalog origin, including a foreign final redirect. Foreign URLs are not fetched. |
| `secret_in_query` | Handoff template, example, or guide query uses a token/secret name, or a JWT-shaped value. Tokens stay out of URLs. |
| `broken_exact_link` | Declared exact GET link missing, unexpected status, path drift, or homepage fallback. |
| `unsupported_method` | Documented review method is not GET. |
| `missing_required_input` | Published example omits a required input name. |

Receipt statuses stay `ok`, `missing`, `invalid`, `not_applicable`. Redirect
authority matches search-readiness: foreign final origin, homepage fallback, and
path drift cannot be `ok`.

## What a 200 does not prove

Always `not_observed` in this mode:

- claim protection
- legal eligibility
- ranking
- human consent
- payment
- demand

A readable review page is not approval, filing, checkout, or ranking. Probes
are GET only. No auth header, payment, form submit, or other effect.

## Observed today vs later contracts

Recorded on the default catalog, not invented here:

- SameDayDesk: public HTML, robots, sitemap, llms.txt, JSON-LD, truthful
  machine 404, and `/.well-known/agent-card.json`. Apex MCP readiness at `/mcp`
  is a separate discovery surface, not this correspondence contract.
- EIN.LLC and Neomorphic.io: same public documents; agent-card is
  `not_applicable`. Neomorphic publishes a static read-only OpenAPI for lab
  JSON. That is not `POST /v1/projects`.

Do not treat those documents as the INTERFACE.md correspondence API. When a
site later advertises that API, supply a catalog or overlay that matches the
deployed origin, including a fixture or staging host.

## Controller checklist: two-runtime and human-review trials

Grounded in INTERFACE.md and the grand plan (branches B, D, F). This harness
does not perform the trial. Use it first to see whether a contract is even
advertised.

### 0. Gate

- [ ] `agent-handoff` on default catalog is green with undeclared handoff
      (`not_applicable`), or a supplied overlay matches the origin under test.
- [ ] Availability is `observed` only for URLs that exist now. Upcoming EIN or
      Neomorphic endpoints stay `proposed` or omitted until deployed.
- [ ] OpenAPI or machine guide, if declared, describes implemented behavior,
      not a future wish.
- [ ] Offer and price used in any human trial stay the current merchant values.

### 1. Transport bounds (INTERFACE.md)

- [ ] HTTPS only. Bearer grant in `Authorization`, never in the URL or query.
- [ ] Human-review URL is GET. Link preview / email scanner / this probe cannot
      approve, charge, or file.
- [ ] Mutations use `Idempotency-Key`. After an unknown POST result, do not
      invent a new key. Reconcile with the same key.
- [ ] Title / summary / event text / URL / body stay inside documented limits.
- [ ] Artifact references are HTTPS URLs stored without fetching.
- [ ] Unknown fields that would imply unsupported behavior are rejected by the
      service, not by this GET probe.

### 2. Two-runtime resume (plain HTTP/CLI first)

Runtime A (preparer), unpaid or test-mode only:

- [ ] `POST /v1/projects` with `{title,summary}` and `Idempotency-Key` returns
      201 `{project,ownerToken}` or the documented recoverable grant path.
- [ ] Exact retry with the same key does not create a second project.
- [ ] `nextAction` is null or a real human-review URL. The client must not
      invent one.
- [ ] Owner issues a reader or writer grant if a successor needs access.
      Return the token once; store hashes only.

Runtime B (successor, different process, no copied human credentials):

- [ ] `GET /v1/projects/:projectId` with the successor grant returns the same
      project.
- [ ] `GET /v1/projects/:projectId/events?after=&limit=` is stable ascending
      sequence. Invalid or foreign cursors are rejected.
- [ ] Writer can `POST` events; reader cannot. Cross-project grants fail.
- [ ] Revoked or expired grant fails clearly. Repeat revoke of an owned grant
      succeeds.
- [ ] Restart persistence: in-memory adapters are test-only.

If the host cannot speak this HTTP contract, use the protected ordinary review
link and stop. Do not promise MCP, A2A, or one-tap checkout on a runtime that
cannot render or authorize it.

### 3. Human review

- [ ] Human opens the review URL while signed in as the intended operator.
- [ ] Wrong account cannot claim or approve.
- [ ] GET of the review URL does nothing to payment, filing, or project status.
- [ ] Remaining human tasks, scope, and price (if any) are visible on the
      merchant surface. Merchant-owned Stripe / intake stays on that merchant.
- [ ] Record where the human had to act, why, how many repeated explanations,
      and whether runtime B resumed without re-entering confidential fields.

### 4. Minimum negative cases (INTERFACE.md)

- [ ] Unauthorized create/read.
- [ ] Wrong-project token.
- [ ] Reader cannot write.
- [ ] Conflicting idempotent replay (same key, changed body) is 409.
- [ ] Concurrent `resolved`/`reopened` without matching `expectedVersion` fails.
- [ ] Oversized body is 413. Messages never echo secrets.
- [ ] No artifact fetch as a side effect of storing a URL.

### 5. Second client interface (grand plan D)

After HTTP/CLI works:

- [ ] Repeat resume from an MCP-capable runtime **only if** that runtime can
      elicit and open the ordinary review URL. Otherwise keep the protected
      link.
- [ ] Do not publish a transactional plugin until channel eligibility is real.
- [ ] Hold the first comparison against the current journey at constant price.

### 6. Stop conditions for this checklist

- [ ] Operators ignore the packet and keep using email/dashboard with equal
      effort.
- [ ] The review URL authenticates by secret-in-query.
- [ ] A GET or probe can mutate state.
- [ ] OpenAPI disagrees with the running service.
- [ ] Trial requires live charge, browser automation, or undeployed origins.

## Limits of this branch

This package only extends `tools/portfolio-discovery`. It does not deploy
INTERFACE.md, change SameDayDesk payment or MCP entitlement, or add EIN
formation grants. Offline tests use fixtures. Live GET against apex records
HTTP facts for declared URLs only.
