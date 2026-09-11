import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { USEFUL_JOB_IDS } from "./catalog.mjs";
import { inspectHonesty, isDemoCommand } from "./honesty.mjs";

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function add(findings, ok, code, path, message) {
  findings.push({ ok, code, path, message });
}

export function checkOutputContract({ target, extractRoot, documents, commands }) {
  const findings = [];
  for (const rel of target.requiredFiles) {
    const present = existsSync(join(extractRoot, rel));
    add(
      findings,
      present,
      present ? "required_file" : "missing_required_file",
      rel,
      present ? `required file ${rel}` : `missing required file ${rel}`,
    );
  }

  if (target.id === "useful-jobs") {
    const catalog = readJsonIfPresent(join(extractRoot, "catalog.json"));
    if (catalog) {
      documents.push(catalog);
      const ids = (catalog.jobs || []).map((job) => job.id);
      const missing = USEFUL_JOB_IDS.filter((id) => !ids.includes(id));
      add(
        findings,
        missing.length === 0,
        missing.length ? "job_list_mismatch" : "six_useful_jobs",
        "catalog.json.jobs",
        missing.length ? `catalog missing ${missing.join(", ")}` : "catalog lists the six useful jobs",
      );
      const purchase = catalog.runtime?.purchaseAuthority;
      add(
        findings,
        purchase === false,
        purchase === false ? "purchase_authority_false" : "purchase_authority_claimed",
        "catalog.json.runtime.purchaseAuthority",
        purchase === false
          ? "purchaseAuthority is false"
          : "purchaseAuthority must be false for this free package",
      );
    } else {
      add(findings, false, "missing_catalog", "catalog.json", "catalog.json missing or invalid JSON");
    }
  }

  if (target.id === "capability-preflight") {
    const statusDoc = documents.find((doc) => doc?.readyForRelease === false) || documents[0];
    if (statusDoc && typeof statusDoc === "object") {
      add(
        findings,
        statusDoc.readyForRelease === false,
        statusDoc.readyForRelease === false ? "ready_for_release_false" : "ready_for_release_claimed",
        "status.readyForRelease",
        statusDoc.readyForRelease === false
          ? "readyForRelease stays false"
          : "readyForRelease must stay false",
      );
      if ("paidCalls" in statusDoc) {
        add(
          findings,
          statusDoc.paidCalls === false,
          statusDoc.paidCalls === false ? "paid_calls_false" : "paid_calls_claimed",
          "status.paidCalls",
          statusDoc.paidCalls === false ? "paidCalls is false" : "paidCalls must be false",
        );
      }
    }
  }

  const demoContext = (commands || []).some((command, index) =>
    isDemoCommand(target.firstCommands[index] || command),
  );
  const honesty = inspectHonesty(documents, { demoContext });
  findings.push(...honesty.findings);

  if (honesty.flags.sampleLabelledAsPaidCompletion) {
    add(
      findings,
      false,
      "sample_labelled_as_paid_completion",
      "honesty",
      "SAMPLE/demo labelled as paid completion",
    );
  }

  const ok = findings.every((row) => row.ok);
  return {
    ok,
    findings,
    honesty: {
      purchaseAuthority: false,
      actualCompletion: false,
      demo: honesty.flags.demo || Boolean(target.honesty?.demo),
      localGate: honesty.flags.localGate,
      customerCompletion: false,
      sampleLabelledAsPaidCompletion: honesty.flags.sampleLabelledAsPaidCompletion,
      paid: false,
      innerPurchaseAuthority: honesty.flags.purchaseAuthority,
      innerActualCompletion: honesty.flags.actualCompletion,
    },
  };
}
