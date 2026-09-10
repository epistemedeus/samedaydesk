# S69 RESULT — issue-evidence job acquisition package

Branch: `codex/s69-issue-job-acquisition-20260910`
Semantics tip (preserved S62): `a63c77d528bbdc2de1558c56e8262e04c7420ae3`
Input base: `c295af075c86ab28fea075633e95934a776d006c`
Node: 22.x

## Outcome
Anonymous lean acquisition package + machine-readable `SKILL.md` for the existing
`issue-evidence` recurring-job recipe. Cold agent can unpack, run a complete
public-issue brief, save an immutable prior, and produce a later changed-state
record. No new parser/service/dashboard. S67 shared-host/observatory untouched.

## Package
- Overlay: `overlays/s69-issue-job-acquisition/`
- Archive: `overlays/s69-issue-job-acquisition/dist/issue-evidence-job-a63c77d528bb.tar.gz`
- Skill: `SKILL.md` + `scripts/install-local-skill.mjs`
- Thin CLI: `bin/issue-evidence.mjs` (private-token-free default)

## Tests
- Overlay acquisition: 6/6 pass
- Recurring-job-recipes regression: 89/89 pass

## Live / native
- Public issue https://github.com/NousResearch/hermes-agent/issues/99533
  - run1: changed / complete / open / 2 comments
  - run2 + prior: unchanged
- Native Grok project-skill install followed literal commands and wrote
  `native-out1` / `native-out2` artifacts (exit 0).

## Direct API baseline extras
Bounded paginated evidence retention, immutable prior/delta, constraint retention.
HTML is not complete comment evidence.

## Heavy cohort
6 concurrent tool-free xhigh children; process-overlap sum RSS ≈730 MiB; all exit 0.

## Non-goals honored
No paid endpoint, wallet op, upstream post, registry publish, main merge, deploy.
No S67 source edits. Later S62 repair ⇒ pin-only change.
