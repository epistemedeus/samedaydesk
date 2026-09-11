import {
  LIVE_EXTRACT,
  LIVE_SELLER_INTEGRITY_AUDIT,
  MERCHANT_PR54,
  PROPOSED_PRICE,
  PROPOSED_PRICE_ATOMIC,
} from "./catalog.mjs";

function commandBlock(commands) {
  return (commands || [])
    .map((row) => `${row.commandLine}  # exit ${row.exitCode}`)
    .join("\n");
}

export function renderExplanation(assessment) {
  const target = assessment.target || {};
  const commands = assessment.commands || [];
  const usable = assessment.usableReproduction === true;
  const acquire = assessment.acquisition || {};
  const lines = [];

  lines.push(`# Cold-start assessment — ${target.title || target.id || "package"}`);
  lines.push("");
  lines.push(
    usable
      ? "This run produced a **usable reproduction** of the public package in a temporary directory. It is not customer completion and it is not a paid sale."
      : "This run **did not** produce a usable reproduction. Digest, size, honesty, or command failures are recorded below. Nothing was marked `actual_completion` or paid.",
  );
  lines.push("");
  lines.push("## Exact commands");
  lines.push("");
  lines.push("From the unpacked package directory:");
  lines.push("");
  lines.push("```sh");
  lines.push(commandBlock(commands) || "# no commands ran (acquire stopped before extract)");
  lines.push("```");
  lines.push("");
  lines.push("A stranger can rerun those commands offline after a matching digest extract. Tests do not require live DNS.");
  lines.push("");
  lines.push("## Acquisition");
  lines.push("");
  lines.push(`- URL: \`${acquire.url || ""}\``);
  lines.push(`- HTTP status: ${acquire.status ?? "(none)"}`);
  lines.push(`- Bytes: ${acquire.bytes ?? "(none)"} (expected ${acquire.expectedBytes ?? "?"})`);
  lines.push(`- SHA-256: \`${acquire.sha256 || "(none)"}\``);
  lines.push(`- Extracted: ${acquire.extracted === true ? "yes" : "no"}`);
  if (acquire.stoppedBeforeExtract) {
    lines.push("- Stopped before extract because status, size, or digest did not match.");
  }
  lines.push("- Public path does not require GitHub credentials.");
  lines.push("");
  lines.push("## Price (fixture only)");
  lines.push("");
  lines.push(
    `Proposed assessment price is labelled \`${PROPOSED_PRICE.amount} ${PROPOSED_PRICE.asset}\` on network \`${PROPOSED_PRICE.network}\` (${PROPOSED_PRICE_ATOMIC} atomic). It is **not** posted, **not** a live catalog price, and **cannot settle**.`,
  );
  lines.push("");
  lines.push(
    `Existing SameDayDesk extract remains \`${LIVE_EXTRACT.display}\` (${LIVE_EXTRACT.amount} atomic). Seller-integrity-audit remains \`${LIVE_SELLER_INTEGRITY_AUDIT.display}\` (${LIVE_SELLER_INTEGRITY_AUDIT.amount} atomic).`,
  );
  lines.push("");
  lines.push("## Honesty");
  lines.push("");
  lines.push(`- \`purchaseAuthority\`: false`);
  lines.push(`- \`fundingState\`: fixture`);
  lines.push(`- \`actualCompletion\`: false`);
  lines.push(`- SAMPLE / demo output is not a paid completion.`);
  lines.push(`- Merchant PR54 \`${MERCHANT_PR54.merge}\` is a metadata-continuity reference only.`);
  lines.push("");
  if (assessment.contract?.findings?.length) {
    lines.push("## Output-contract findings");
    lines.push("");
    for (const finding of assessment.contract.findings) {
      lines.push(`- ${finding.ok ? "ok" : "fail"} \`${finding.code}\` ${finding.path}: ${finding.message}`);
    }
    lines.push("");
  }
  lines.push("## Rerun offline");
  lines.push("");
  lines.push("```sh");
  lines.push(
    "node tools/cold-start-assessment/bin/assess.mjs --fixture-dir fixtures/ok --out /tmp/w2-06-out",
  );
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
