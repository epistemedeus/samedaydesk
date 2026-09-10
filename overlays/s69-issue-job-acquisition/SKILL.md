---
metadata:
  semanticsTip: a63c77d528bbdc2de1558c56e8262e04c7420ae3
  inputBase: c295af075c86ab28fea075633e95934a776d006c
name: issue-evidence
description: Collect GitHub issue evidence with the local token-free issue-evidence recipe (no API token, no payment). Use when a cold agent must read this skill, unpack an archive, run the brief, save a prior record, and later write a changed record via node bin/issue-evidence.mjs. Triggers on issue-evidence, GitHub issue snapshots, hermes-agent issue evidence, unpack archive, save prior, and changed record. Example issue https://github.com/NousResearch/hermes-agent/issues/99533.
---

# issue-evidence

AgentSkills / Hermes / Grok compatible skill. Self-contained for a **cold agent** (no prior chat, no secrets, no paid APIs).

Default is **token-free**. Do **not** set `GITHUB_TOKEN`, do **not** pass `--token`, do **not** log in, do **not** pay, do **not** call billed GitHub or scrape APIs. Recipe name: `issue-evidence`.

Run every command from the skill root (the directory that contains `bin/issue-evidence.mjs`).

## Cold agent procedure

Follow this order. Do not skip steps. Do not invent evidence.

1. **Read this skill** end to end, including CLI flags and outputs.
2. **Unpack archive** (package archive (then use live GitHub REST by default, or fixtures offline)):

```bash
node bin/issue-evidence.mjs unpack archive
```

3. **Run brief** (token-free default; recipe `issue-evidence`):

```bash
node bin/issue-evidence.mjs brief
```

4. **Save prior** (write the prior evidence record before any later comparison):

```bash
node bin/issue-evidence.mjs save prior
```

5. **Later: changed record** (after investigation or when the issue snapshot has changed):

```bash
node bin/issue-evidence.mjs changed record
```

Worked example (same recipe, token-free, no payment):

```bash
node bin/issue-evidence.mjs unpack archive
node bin/issue-evidence.mjs brief --recipe issue-evidence --issue https://github.com/NousResearch/hermes-agent/issues/99533
node bin/issue-evidence.mjs save prior
node bin/issue-evidence.mjs changed record
```

Equivalent recipe-only form (still token-free; still no payment):

```bash
node bin/issue-evidence.mjs --recipe issue-evidence unpack archive
node bin/issue-evidence.mjs --recipe issue-evidence brief --issue https://github.com/NousResearch/hermes-agent/issues/99533
node bin/issue-evidence.mjs --recipe issue-evidence save prior
node bin/issue-evidence.mjs --recipe issue-evidence changed record
```

## CLI

Binary: `node bin/issue-evidence.mjs`

| Step | Literal command | Writes |
| --- | --- | --- |
| unpack archive | `node bin/issue-evidence.mjs unpack archive` | unpacked snapshot under the working tree |
| run brief | `node bin/issue-evidence.mjs brief` | brief text on stdout; optional brief file |
| save prior | `node bin/issue-evidence.mjs save prior` | prior record |
| later changed record | `node bin/issue-evidence.mjs changed record` | changed record |

Flags (all optional; defaults are token-free and recipe `issue-evidence`):

- `--recipe issue-evidence` — select this recipe (default).
- `--issue <url>` — issue URL. Example: `https://github.com/NousResearch/hermes-agent/issues/99533`.
- `--out <path>` — override output path.
- `--token-free` — explicit token-free mode (already the default). Never pass a token.

Do not pass `--token`, `--github-token`, or `--paid`.

## What each step must produce

**unpack archive.** Expand the local archive shipped with the skill or the current workspace. Use only local bytes. If unpack already ran and the snapshot dir exists, re-run `node bin/issue-evidence.mjs unpack archive` only when the archive is new.

**brief.** A short, factual issue brief from the unpacked snapshot: title, body, labels, state, author, timestamps, and linked paths. No speculation. For the example issue `https://github.com/NousResearch/hermes-agent/issues/99533`, the brief must be grounded in the unpacked archive, not a live tokenized API fetch.

**prior.** The evidence record *before* later changes: snapshot hash, issue identity, file list, and brief fingerprint. Always save prior before writing a changed record.

**changed record.** The evidence record *later*: what differed vs prior (body, labels, comments, attachments, snapshot hash). If nothing changed, the changed record must say so explicitly.

## Default outputs

Unless `--out` is set, the recipe writes:

- `evidence/brief.md` — from `node bin/issue-evidence.mjs brief`
- `evidence/prior.json` — from `node bin/issue-evidence.mjs save prior`
- `evidence/changed.json` — from `node bin/issue-evidence.mjs changed record`

Keep these paths. Do not substitute a GitHub API dump.

## Rules

- Recipe is `issue-evidence`. Default is token-free. No payment.
- Compatible with AgentSkills, Hermes, and Grok: only `name` and `description` are required in YAML frontmatter; this body is markdown.
- Cold agents must execute the five-step procedure with the literal `node bin/issue-evidence.mjs` commands above.
- Prefer the unpacked archive over the network. If a fetch happens, it must still be token-free and unpaid.
- Never fabricate comments, reactions, or diffs. If the archive lacks a field, record it as missing.
- Example issue URL for this recipe: `https://github.com/NousResearch/hermes-agent/issues/99533`.

## Quick copy

```bash
node bin/issue-evidence.mjs unpack archive
node bin/issue-evidence.mjs brief --recipe issue-evidence --issue https://github.com/NousResearch/hermes-agent/issues/99533
node bin/issue-evidence.mjs save prior
node bin/issue-evidence.mjs changed record
```


## Exact package CLI (authoritative)

Use these flags with `node bin/issue-evidence.mjs` (Node 22.x). Private-token-free default.

```bash
# First brief + immutable prior
node bin/issue-evidence.mjs   --issue-url https://github.com/NousResearch/hermes-agent/issues/99533   --max-comment-pages 2   --per-page 50   --schedule once   --clock "$(date -u +%Y-%m-%dT%H:%M:%SZ)"   --out-dir ./native-out1   --write-artifact

# Later changed-state check
node bin/issue-evidence.mjs   --issue-url https://github.com/NousResearch/hermes-agent/issues/99533   --prior ./native-out1/issue-evidence.seq-1.json   --max-comment-pages 2   --out-dir ./native-out2   --write-artifact
```

Do not infer `GITHUB_TOKEN` from the environment. Optional explicit `--github-token` only.
HTML issue pages are not complete comment evidence; this job uses GitHub REST only.
