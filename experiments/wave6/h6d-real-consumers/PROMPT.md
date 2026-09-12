# H6D: useful-job-real-corpus-distribution

Native Grok Heavy owns implementation. Cursor Auto is launcher/collector only.

## Identity / model
- Model: grok-4.6 at highest available xhigh effort
- Headless CLI (`--output-format json --always-approve`); no user-visible TUI
- Parent session owns every child through completion
- After ~15 min useful work: short progress export, then continue to final integrated code/tests/PR
- Do NOT stop after launch
- Provider-quota exhaustion → stop new inference; save partial source; no overage/reset

## Capacity (this VM)
- Up to 16 genuinely independent child slices with persistent source context and exclusive subpaths
- Start **12** useful children while observing actual memory at admission
- Expand to **16** only if ~25% effective reserve remains after the 12 are admitted
- Serialized heavy compiles/DBs on this VM; Node heap 768MB where appropriate (`NODE_OPTIONS=--max-old-space-size=768`)
- If fewer real work slices remain, deepen/finish useful work rather than manufacture code
- Record actual concurrent count and peaks at boundaries (no recurring monitor)
- At most 16 native children; no Cursor implementation disguised as Heavy

## Repo / ownership
- Repo: epistemedeus/samedaydesk
- Branch: `codex/wave6-h6d-20260912` (already created from pin)
- CWD: `/tmp/h6d/wt`
- Own ONLY: `experiments/wave6/h6d-real-consumers/`
- Baseline pin: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`
- useful-jobs **1.4.0** published bytes at:
  - `client/public/kit/useful-jobs-1.4.0.tar.gz` (+ sha256.json)
  - `client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz`
- Feature branch commit/push/draft PR authorized; no default merge/deploy
- No real payment, new credits, signing, external messages, or irreversible platform mutation
- Build/tests stay this VM

## Mission
Build **16 independent real open-source workload integrations** that turn existing useful-jobs tools into useful repeatable agent jobs.

Each child owns:
1. one real official repository revision pair OR maintained workflow
2. acquisition manifest
3. independent semantic witness
4. cold CLI/CI adapter
5. concrete outcome, exact inputs, owned paths
6. positive / control / negative test
7. source artifact + receiving integration owner

Families (4 each = 16):
- 4 lockfile ecosystem pairs
- 4 schema/webhook pairs
- 4 actual API route contracts
- 4 permitted supplied-page/structured vendor snapshot pairs

Choose **current useful examples** after reading current CW/Work corpora. Do **NOT** repeat:
- OpenAI routes
- Octokit organization.renamed
- existing vendor sample
- HG04 CI wrapper
- W5M workloads

No broad arbitrary scraping.

## Hard boundaries
- Tool engines being repaired by Astra → findings become exact **regression artifacts**, not source edits to those engines
- Parent composes one small catalog + job-selection CLI with honest non-equivalent migrations
- No false token arbitrage/profit claims
- No customer outreach, paid calls, or site publication
- Actual source/license/provenance and **independent** validator — not self-copied engine oracle
- Unknown outcome ≠ failure ≠ permission to retry
- Exclude exact paths owned by E01 / CW18–42 audits / HG01–04 builders; use their source dependencies read-only

## Parent duties
1. Admit 12 children with exclusive subpaths under `experiments/wave6/h6d-real-consumers/`
2. Record mem/peaks at admission and before expanding toward 16
3. Audit each child result; fix small defects
4. Run integrated acceptance
5. Publish concise `RESULT.md` with all child source/test status, parent native session id, exact head, actual experiments, next remaining proof
6. Commit/push branch; open draft PR (no merge)

## Return compact JSON at end
```json
{
  "assignment": "H6D-useful-job-real-corpus-distribution",
  "branch": "codex/wave6-h6d-20260912",
  "head": "",
  "ownedPath": "experiments/wave6/h6d-real-consumers/",
  "baselinePin": "ad9bc7b448cf1f635ff1488affbe206aaf981ac0",
  "usefulJobs": "1.4.0",
  "parentSessionId": "",
  "childrenStarted": 0,
  "childrenCompleted": 0,
  "peakConcurrent": 0,
  "memAdmission": {},
  "memPeak": {},
  "families": {"lockfile": 4, "schemaWebhook": 4, "apiRoutes": 4, "pageSnapshots": 4},
  "testsPass": false,
  "testCounts": {"pass": 0, "fail": 0},
  "draftPrUrl": "",
  "nextRemainingProof": ""
}
```
