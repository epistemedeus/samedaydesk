import { relative } from "node:path";
import { catalogJobs, jobGuide, SHARED_LIMITS, testedRecord } from "./jobs-guide.mjs";
import { PREVIEW_CLI, QUICKSTART_SCHEMA, REPO_ROOT, WRAPPER_CLI } from "./paths.mjs";

function rel(p) {
  return relative(REPO_ROOT, p) || p;
}

export function buildQuickstart() {
  const jobs = catalogJobs().map((job) => {
    const guide = jobGuide(job.id);
    return {
      id: job.id,
      title: job.title,
      requiredInputs: job.requiredInputs,
      optionalInputs: job.optionalInputs,
      outputs: job.outputs,
      notes: job.notes,
      outcome: guide.outcome,
      preview: [
        "node",
        rel(PREVIEW_CLI),
        "preview",
        "--job",
        job.id,
        ...job.requiredInputs.flatMap((flag) => [flag, `<${flag.slice(2)}>`]),
      ],
      run: ["node", rel(WRAPPER_CLI), "run", job.id, ...job.requiredInputs, "[--out-dir dir]"],
      example: ["node", rel(WRAPPER_CLI), "run", job.id, "--example"],
    };
  });

  return {
    schema: QUICKSTART_SCHEMA,
    node: ">=22",
    network: "offline",
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    testedImplementation: testedRecord(),
    entry: {
      preview: ["node", rel(PREVIEW_CLI)],
      wrapper: ["node", rel(WRAPPER_CLI)],
    },
    commands: {
      listJobs: ["node", rel(PREVIEW_CLI), "quickstart"],
      chooseFiles: ["node", rel(PREVIEW_CLI), "choose", "--files", "<path>", "[path...]"],
      chooseJob: ["node", rel(PREVIEW_CLI), "choose", "--job", "<job-id>"],
      preview: ["node", rel(PREVIEW_CLI), "preview", "--job", "<job-id>", "--before", "<file>", "--after", "<file>"],
      limits: ["node", rel(PREVIEW_CLI), "limits", "--job", "<job-id>"],
      wrapperRun: ["node", rel(WRAPPER_CLI), "run", "<job-id>"],
      wrapperList: ["node", rel(WRAPPER_CLI), "list"],
    },
    jobs,
    sharedLimits: [...SHARED_LIMITS],
    remainingBinding: testedRecord().remainingBinding,
    notClaimed: [
      "D24 clean-environment install without this checkout",
      "M01 later catalog or engine selection",
      "D01 execution.v1 transport/analysis/delivery fields unless present on the result",
      "Live sale, payout, or production deploy",
    ],
  };
}

export function renderQuickstartText(doc) {
  const lines = [];
  lines.push("# Machine-first quickstart (current SDS52 wrapper)");
  lines.push("");
  lines.push("Node >= 22. Offline. Not a live sale.");
  lines.push(`Tested wrapper ${doc.testedImplementation.sha} (${doc.testedImplementation.ref}).`);
  lines.push("");
  lines.push("## Choose an input");
  lines.push(`node ${rel(PREVIEW_CLI)} choose --files <before> <after>`);
  lines.push(`node ${rel(PREVIEW_CLI)} choose --job vendor-budget-impact`);
  lines.push("");
  lines.push("## Preview a result");
  lines.push(`node ${rel(PREVIEW_CLI)} preview --job vendor-budget-impact --before <pricing.json> --after <pricing.json>`);
  lines.push("JSON is the default stdout. Add --format text for a human excerpt.");
  lines.push("");
  lines.push("## Run the wrapper (same bytes the preview classifies)");
  lines.push(`node ${rel(WRAPPER_CLI)} list`);
  lines.push(`node ${rel(WRAPPER_CLI)} run vendor-budget-impact --before <file> --after <file> --out-dir ./out`);
  lines.push("");
  lines.push("## Jobs");
  for (const job of doc.jobs) {
    lines.push(`- ${job.id}: ${job.requiredInputs.join(" ")} -> ${job.outputs.join(", ")}`);
  }
  lines.push("");
  lines.push("## Limits");
  for (const limit of doc.sharedLimits) lines.push(`- ${limit}`);
  return `${lines.join("\n")}\n`;
}
