# Language correction — W5-H04 lock-01 is not a vuln scanner

A version bump is not a security vulnerability without an advisory / version-range join. H04 is not a vulnerability scanner. Recommendations use operator-risk / pin-delta / integrity-change / resolved-source change. The SDS commit subject `fix(deps): update vulnerable locked dependencies` may be quoted as the commit message. The commit message claims vulnerable deps; H04 does not join advisories. Do not tell a buyer this engine proved a CVE.

Candidates unchanged: `h04-lock-01`, `h04-schema-01`, `h04-page-03`. `h04-lock-01` remains strongest as a pin-delta operator job, not as a vuln scanner.

## Files changed (old vs new claim)

### `offers/CANDIDATES.md`

| Location | Old claim | New claim |
| --- | --- | --- |
| Not-selected (`h04-lock-02`) | “not a named vulnerable version bump” | “not a named version+integrity+resolved pin-delta” |
| §1 title | “three vulnerable lock pins” | “three lock pin-deltas (version + integrity + resolved)” |
| What a buyer pays for | pin delta of version **and** integrity only | pin-delta of version, integrity, **and** resolved tarball; operator-risk / pin-delta / integrity-change / resolved-source change; **not** a vulnerability scanner; no advisory/CVE join |
| Decision that changes | “as if nothing security-relevant moved”; implied vuln from commit subject | “as if the resolved tree were unchanged”; quote SDS subject; “commit message claims vulnerable deps; H04 does not join advisories”; version bump ≠ vuln without join; not a CVE proof |
| Why stronger | “public SDS commit that says the pins were vulnerable” (as if H04 proved it) | engine names three pin-deltas; SDS **subject** claims vulnerable; H04 quotes it and does not join advisories |

### `offers/RECEIPT.md`

| Location | Old claim | New claim |
| --- | --- | --- |
| Candidates table `h04-lock-01` | “three vulnerable version+integrity pins” | “three version+integrity+resolved pin-deltas”; “commit subject claims vulnerable deps; H04 does not join advisories and is not a CVE proof” |
| Language section (added) | (none) | not a vulnerability scanner; pin-delta / operator-risk / integrity-change / resolved-source; quote subject only |
| Next owner | (no CVE note) | “Do not tell a buyer this engine proved a CVE.” |

### `offers/CURRENT-HARNESS.md`

| Location | Old claim | New claim |
| --- | --- | --- |
| Offer language (lock-01) (added) | (none; harness doc did not name vuln, but offered no anti-scanner bound) | lock-01 strongest as pin-delta operator job, not vuln scanner; quote SDS subject; H04 does not join advisories; not a CVE proof |

### `RECEIPT.md` (h04 root — offer-candidate / lockfile wording only)

| Location | Old claim | New claim |
| --- | --- | --- |
| Strongest offer #1 | version+integrity bumps; do not `npm ci` as if unchanged (no scanner disclaimer) | version+integrity+resolved pin-deltas; SDS subject quoted; commit message claims vulnerable deps; H04 does not join advisories; not a CVE proof / not a vulnerability scanner |

### `examples/lockfile/h04-lock-01/example.json`

| Location | Old claim | New claim |
| --- | --- | --- |
| `title` | “SDS vulnerable lock pins: concurrently, qs, shell-quote” | “SDS lock pin-delta: concurrently, qs, shell-quote (version+integrity+resolved)” |

### `examples/lockfile/h04-lock-01/fact.md`

| Location | Old claim | New claim |
| --- | --- | --- |
| Body | quoted SDS subject + pin triples only (could be read as H04 proving vuln) | same quoted subject + pin triples, plus: pin-delta / integrity-change / resolved-source; commit message claims vulnerable deps; H04 does not join advisories; version bump ≠ vuln without advisory join; not a CVE proof |

## Owned files not rewritten

| File | Why |
| --- | --- |
| `FEATURE-MAP.md` | already “version+integrity bumps”; no scanner/CVE claim |
| `examples/lockfile/INDEX.json` | triples + SHAs only; no “vulnerable” as a scanner claim |

## Remaining `vulnerab*` hits that are allowed

Quoted SDS commit subject `fix(deps): update vulnerable locked dependencies`, or explicit “commit message **claims** vulnerable deps; H04 does not join advisories”:

- `offers/CANDIDATES.md` — quoted subject; “claims vulnerable deps”
- `offers/RECEIPT.md` — “commit subject claims vulnerable deps”
- `offers/CURRENT-HARNESS.md` — quoted subject; “claims vulnerable deps”
- `RECEIPT.md` — quoted subject; “claims vulnerable deps”
- `examples/lockfile/h04-lock-01/fact.md` — quoted subject; “claims vulnerable deps”
- `examples/lockfile/h04-lock-01/SOURCE.md` — table quotes after-commit subject (not owned; left as git subject)
- `docs/PRIMARY-SOURCE-CANDIDATES.md` / `PROMPT-CONTINUE-M01.md` — not owned

Out of scope (not owned): `src/`, `bin/`, `inventory/`, `test/`, other examples. No commit from this child.
