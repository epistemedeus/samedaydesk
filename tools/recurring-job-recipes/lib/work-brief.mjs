import { sha256Hex, stableStringify } from "./hash.mjs";
import { issueFingerprint } from "./github-issue.mjs";

const ACTION_PATTERNS = [
  { re: /\b(fix|patch|extend|give|restore|prerender)\b/i, kind: "implement" },
  { re: /\b(res\.status\(404\)|canonical|og:url|catch-all)\b/i, kind: "defect" },
  { re: /\b(measure|confirm|verify|check)\b/i, kind: "verify" },
];

/**
 * Produce a direct-use work brief from a normalized public issue.
 * Owner QA only — not demand or network claims.
 */
export function buildWorkBrief(issue, { clock, source = "github_issue" } = {}) {
  const fingerprint = issueFingerprint(issue);
  const actions = extractActions(issue.body || "");
  const fileRefs = extractFileRefs(issue.body || "");
  const summary = summarizeBody(issue.body || "");
  const brief = {
    schema: "samedaydesk.work-brief.v1",
    kind: "issue_to_work_brief",
    source,
    clock: clock || null,
    issue: {
      owner: issue.owner,
      repo: issue.repo,
      number: issue.number,
      url: issue.url,
      title: issue.title,
      state: issue.state,
      labels: issue.labels,
      updatedAt: issue.updatedAt,
      createdAt: issue.createdAt,
      author: issue.author,
      comments: issue.comments,
    },
    fingerprint,
    summary,
    actions,
    fileRefs,
    claims: {
      ownerQaOnly: true,
      notDemand: true,
      paymentImpliesUsefulOutput: false,
      automaticPaymentReplay: false,
    },
  };
  brief.contentHash = `sha256:${sha256Hex(stableStringify({
    fingerprint,
    summary,
    actions,
    fileRefs,
  }))}`;
  return brief;
}

export function renderBriefMarkdown(brief) {
  const lines = [
    `# Work brief: ${brief.issue.title}`,
    "",
    `- Source: ${brief.issue.url}`,
    `- State: ${brief.issue.state}`,
    `- Observed clock: ${brief.clock || "unset"}`,
    `- Content hash: ${brief.contentHash}`,
    `- Owner QA only (not demand)`,
    "",
    "## Summary",
    brief.summary || "(empty)",
    "",
    "## Proposed actions",
  ];
  if (!brief.actions.length) lines.push("- (none extracted; review issue body)");
  for (const action of brief.actions) {
    lines.push(`- [${action.kind}] ${action.text}`);
  }
  lines.push("", "## File references");
  if (!brief.fileRefs.length) lines.push("- (none extracted)");
  for (const file of brief.fileRefs) lines.push(`- \`${file}\``);
  lines.push("");
  return lines.join("\n");
}

function summarizeBody(body) {
  const text = String(body).replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const first = text.split(/\n\n+/).find((block) => !block.startsWith("#") && block.length > 40) || text;
  return first.replace(/\s+/g, " ").slice(0, 400);
}

function extractActions(body) {
  const actions = [];
  for (const line of String(body).split("\n")) {
    const trimmed = line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
    if (trimmed.length < 24 || trimmed.length > 240) continue;
    for (const pattern of ACTION_PATTERNS) {
      if (pattern.re.test(trimmed)) {
        actions.push({ kind: pattern.kind, text: trimmed });
        break;
      }
    }
    if (actions.length >= 8) break;
  }
  return actions;
}

function extractFileRefs(body) {
  const found = new Set();
  const re = /`?([A-Za-z0-9_./-]+\.(?:js|mjs|ts|tsx|css|html|md|json))`?(?::\d+)?/g;
  let match;
  while ((match = re.exec(body))) {
    if (!match[1].includes("://")) found.add(match[1]);
    if (found.size >= 16) break;
  }
  return [...found];
}
