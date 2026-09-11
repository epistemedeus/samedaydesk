#!/usr/bin/env node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JOB_BY_ID, JOB_IDS, jobGuide, limitsFor } from "../lib/jobs-guide.mjs";
import { CHOOSE_SCHEMA } from "../lib/paths.mjs";
import { chooseFromFiles } from "../lib/sniff.mjs";
import { buildPreview, renderPreviewText } from "../lib/preview.mjs";
import { buildQuickstart, renderQuickstartText } from "../lib/quickstart.mjs";
import { loadResultFile, runWrapperCli } from "../lib/run.mjs";
import { LAYER } from "../lib/classify.mjs";

function parseArgs(argv) {
  const out = { _: [], files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (key === "files") {
        while (argv[i + 1] && !String(argv[i + 1]).startsWith("--")) {
          out.files.push(argv[i + 1]);
          i += 1;
        }
        continue;
      }
      const next = argv[i + 1];
      if (!next || String(next).startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `m14 preview — human result preview and machine-first quickstart (SDS52 consumer)

Commands:
  quickstart [--format json|text]
  choose --files <path> [path...]
  choose --job <job-id>
  limits [--job <job-id>]
  preview --job <job-id> [wrapper flags] [--out-dir dir] [--format json|text]
  preview --from-result <wrapper-stdout.json>

Default stdout is JSON. This is not a live sale and not a second job runner.
`;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(doc, status = 2) {
  writeJson(doc);
  process.exit(status);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "quickstart";
const format = args.format === "text" || args.format === "human" ? "text" : "json";

if (cmd === "help" || args.help === true || args.h === true) {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "quickstart") {
  const doc = buildQuickstart();
  if (format === "text") process.stdout.write(renderQuickstartText(doc));
  else writeJson(doc);
  process.exit(0);
}

if (cmd === "limits") {
  const jobId = args.job || args._[1];
  if (!jobId) {
    writeJson({
      ok: true,
      jobs: JOB_IDS,
      limitsByJob: Object.fromEntries(JOB_IDS.map((id) => [id, limitsFor(id)])),
    });
    process.exit(0);
  }
  if (!JOB_BY_ID[jobId]) fail({ ok: false, code: "unknown-job", error: `unknown job ${jobId}` });
  const guide = jobGuide(jobId);
  if (format === "text") {
    process.stdout.write(`# ${guide.title} limits\n\n${guide.limits.map((l) => `- ${l}`).join("\n")}\n`);
  } else writeJson({ ok: true, jobId, ...guide });
  process.exit(0);
}

if (cmd === "choose") {
  const jobId = args.job;
  if (jobId) {
    if (!JOB_BY_ID[jobId]) fail({ ok: false, schema: CHOOSE_SCHEMA, code: "unknown-job", error: `unknown job ${jobId}` });
    const guide = jobGuide(jobId);
    if (format === "text") {
      process.stdout.write(
        `# Choose input for ${guide.title}\n\nRequired: ${guide.requiredInputs.join(", ")}\nOutputs: ${guide.outputs.join(", ")}\n\n${guide.outcome}\n\nLimits:\n${guide.limits.map((l) => `- ${l}`).join("\n")}\n`,
      );
    } else writeJson({ ok: true, schema: CHOOSE_SCHEMA, ...guide });
    process.exit(0);
  }
  const files = args.files.length ? args.files : args._.slice(1);
  if (!files.length) fail({ ok: false, schema: CHOOSE_SCHEMA, code: "missing-files", error: "choose --files <path> [path...]" });
  const choice = chooseFromFiles(files);
  const body = { schema: CHOOSE_SCHEMA, ...choice };
  if (choice.ok && choice.jobId) {
    const guide = jobGuide(choice.jobId);
    body.title = guide.title;
    body.requiredInputs = guide.requiredInputs;
    body.limits = guide.limits;
    body.previewCommand = ["node", "experiments/wave5/m14/bin/preview.mjs", "preview", "--job", choice.jobId, ...choice.wrapperArgs];
    body.wrapperCommand = ["node", "server/paid-useful-jobs/bin/cli.mjs", "run", choice.jobId, ...choice.wrapperArgs];
    if (choice.orderRule === "files-order") {
      body.orderNote = "Pair order follows --files order. Name files before/after to pin roles.";
    }
  }
  if (format === "text") {
    if (!choice.ok) {
      process.stdout.write(`${choice.error}\n`);
      process.exit(2);
    }
    process.stdout.write(`Job: ${body.jobId}\n${(body.wrapperCommand || []).join(" ")}\n`);
    process.exit(0);
  }
  writeJson(body);
  process.exit(choice.ok ? 0 : 2);
}

if (cmd !== "preview") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

let wrapper;
if (args["from-result"]) {
  try {
    wrapper = { json: loadResultFile(args["from-result"]), status: 0 };
  } catch (err) {
    fail({ ok: false, code: "input-malformed", error: err.message });
  }
} else {
  const jobId = args.job || args._[1];
  if (!jobId) fail({ ok: false, code: "missing-job", error: "preview --job <job-id>" });
  const job = JOB_BY_ID[jobId];
  const cliArgs = ["run", jobId];
  if (args.example === true) cliArgs.push("--example");
  if (job) {
    for (const flag of [...job.requiredInputs, ...(job.optionalInputs || [])]) {
      const key = flag.replace(/^--/, "");
      if (args[key]) cliArgs.push(flag, String(args[key]));
    }
  }
  if (args.funding) cliArgs.push("--funding", String(args.funding));
  if (args.payment) cliArgs.push("--payment", String(args.payment));
  const outDir = args["out-dir"] || mkdtempSync(join(tmpdir(), `m14-preview-${jobId}-`));
  cliArgs.push("--out-dir", outDir);
  wrapper = runWrapperCli(cliArgs);
  wrapper.outDir = outDir;
}

if (!wrapper.json) {
  fail({
    ok: false,
    layer: LAYER.TRANSPORT_FAILURE,
    code: wrapper.timedOut ? "engine-timeout" : "wrapper-unparsed",
    error: wrapper.error || wrapper.stderr || "wrapper stdout was not JSON",
    status: wrapper.status,
  });
}

const preview = buildPreview(wrapper.json, { jobId: wrapper.json.jobId || args.job, outDir: wrapper.outDir || args["out-dir"] });
if (format === "text") process.stdout.write(renderPreviewText(preview));
else writeJson(preview);
process.exit(preview.ok ? 0 : 2);
