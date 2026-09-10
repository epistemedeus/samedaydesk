#!/usr/bin/env node
/**
 * Dated read-only live replay for a public GitHub issue.
 * Bounded comment pages. No token env inference. No payment.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runIssueEvidence } from "../recipes/issue-evidence.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.S62_LIVE_OUT || join(here, "../../../s62/receipts");
mkdirSync(outDir, { recursive: true });

const issueUrl = process.argv[2] || "https://github.com/NousResearch/hermes-agent/issues/99533";
const clock = new Date().toISOString();
const maxCommentPages = Number(process.env.S62_MAX_COMMENT_PAGES || 2);
const perPage = Number(process.env.S62_PER_PAGE || 50);

const started = Date.now();
const result = await runIssueEvidence({
  issueUrl,
  clock,
  scheduleHint: "live-replay-once",
  maxCommentPages,
  perPage,
  githubToken: process.env.S62_EXPLICIT_GITHUB_TOKEN || null,
});
const receipt = {
  kind: "s62_live_replay_receipt",
  clock,
  issueUrl,
  bounds: { maxCommentPages, perPage },
  elapsedMs: Date.now() - started,
  outcome: result.outcome,
  ok: result.ok,
  completeness: result.evidence?.completeness || result.evidence?.observation?.completeness || null,
  commentCount: result.evidence?.observation?.comments?.length ?? null,
  sourceStatuses: (result.evidence?.observation?.sources || []).map((s) => ({
    kind: s.kind,
    retrievalStatus: s.retrievalStatus,
    url: s.url,
    id: s.id,
    updatedAt: s.updatedAt,
  })),
  claims: result.evidence?.claims || null,
  note: "Public bug-report replay only. Not a customer. Not willingness-to-pay. Free API baseline with packaged delta/prior overhead demonstrated offline.",
};

const stamp = clock.replace(/[:.]/g, "-");
const path = join(outDir, `s62-live-replay-${stamp}.json`);
writeFileSync(path, `${JSON.stringify({ receipt, result }, null, 2)}\n`);
writeFileSync(join(outDir, "s62-live-replay-latest.json"), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
process.exit(result.ok || result.outcome === "partial" ? 0 : 1);
