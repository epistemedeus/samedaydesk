---
metadata:
  semanticsTip: 063d04c3828e197bff32f3aa69a54170982a39a5
  inputBase: c295af075c86ab28fea075633e95934a776d006c
name: issue-evidence
description: Collect GitHub issue evidence with the local token-free issue-evidence recipe (no API token, no payment). Use when a cold agent must read this skill, unpack the published archive, run a bounded evidence brief, save an immutable prior, and later refresh evidence via node bin/issue-evidence.mjs. Triggers on issue-evidence, GitHub issue snapshots, hermes-agent issue evidence, unpack archive, save prior, and changed record. Example issue https://github.com/NousResearch/hermes-agent/issues/99533.
---

# issue-evidence

AgentSkills / Hermes / Grok compatible skill. Self-contained for a **cold agent** (no prior chat, no secrets, no paid APIs).

Default is **token-free**. Do **not** set `GITHUB_TOKEN`, do **not** pass `--github-token` unless an operator explicitly provides one, do **not** log in, do **not** pay, do **not** call billed GitHub or scrape APIs. Recipe name: `issue-evidence`. Semantics tip: `063d04c3828e197bff32f3aa69a54170982a39a5` (S71 reviewed).

Run every command from the skill root (the directory that contains `bin/issue-evidence.mjs`).

## Cold agent procedure

Follow this order. Do not skip steps. Do not invent evidence.

1. **Read this skill** end to end, including Exact package CLI.
2. **Unpack archive** into a working directory (tar extract of the published lean archive).
3. **First brief + immutable prior** with the Exact package CLI (token-free REST).
4. **Later evidence refresh** with `--prior` pointing at the immutable prior artifact.

### Exact package CLI (authoritative)

```bash
# Unpack published archive (example)
mkdir -p /tmp/issue-evidence-job && tar -xzf issue-evidence-job-063d04c3828e.tar.gz -C /tmp/issue-evidence-job --strip-components=1
cd /tmp/issue-evidence-job

# First brief + immutable prior
node bin/issue-evidence.mjs \
  --issue-url https://github.com/NousResearch/hermes-agent/issues/99533 \
  --max-comment-pages 2 \
  --per-page 50 \
  --schedule once \
  --clock "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --out-dir ./native-out1 \
  --write-artifact

# Later evidence refresh (bounded; compare against prior)
node bin/issue-evidence.mjs \
  --issue-url https://github.com/NousResearch/hermes-agent/issues/99533 \
  --prior ./native-out1/issue-evidence.seq-1.json \
  --max-comment-pages 2 \
  --out-dir ./native-out2 \
  --write-artifact
```

Offline fixtures (no network):

```bash
node bin/issue-evidence.mjs \
  --evidence-fixture ./vendor/recurring-job-recipes/fixtures/issue-evidence/99533-base.json \
  --schedule weekly \
  --clock 2026-09-10T01:00:00.000Z \
  --out-dir ./out1 \
  --write-artifact
```

Do not infer `GITHUB_TOKEN` from the environment.

## Why not HTML?

Generic HTML extraction of an issue page can miss comments that still exist in the discussion. This job uses bounded public GitHub REST with completeness labels. See `docs/HTML-VS-COMMENTS.md`. That note does **not** claim a paid HTML product failed, and does **not** claim full GitHub history completeness.

## Rules

- Recipe is `issue-evidence`. Default is token-free. No payment.
- Compatible with AgentSkills, Hermes, and Grok.
- Never fabricate comments, reactions, or diffs. Honor `partial` / `error` labels.
- Example issue URL: `https://github.com/NousResearch/hermes-agent/issues/99533`.
- No new pricing, hosted route, sales claim, or external post from this skill.
