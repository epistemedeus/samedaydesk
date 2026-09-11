import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { hashTermsVersion } from "./hash.mjs";
import { LATER_BINDINGS } from "./pins.mjs";

export function boundTerms({ family, engineKind, catalogJob, verification, firstAfterSha256 }) {
  const actual = verification.verifiedInputs;
  const slot = (name) => {
    const v = actual[name];
    if (!v || v.state !== "verified" || !v.actual) return null;
    return { sha256: v.actual.sha256, bytes: v.actual.bytes };
  };
  return {
    schema: "w5.repeat-job-binder.terms.v1",
    schemaVersion: 1,
    family,
    engineKind,
    catalogJob: catalogJob || null,
    firstAfterSha256: firstAfterSha256 || null,
    secondAfterSha256: slot("after")?.sha256 || null,
    before: slot("before"),
    after: slot("after"),
    used: slot("used"),
    schedulerDaemon: false,
    settling: false,
    paidValueClaim: false,
    purchaseAuthority: false,
  };
}

export function buildSecondRun({
  ticket,
  verification,
  engineResult,
  status,
  family,
  outDir,
  engineKind,
  catalogJob,
  frozen = null,
  classified = null,
}) {
  const afterActual = verification.verifiedInputs.after?.actual?.sha256 || null;
  const beforeActual = verification.verifiedInputs.before?.actual?.sha256 || null;
  const terms = boundTerms({
    family,
    engineKind,
    catalogJob,
    verification,
    firstAfterSha256: ticket.firstAfterSha256,
  });
  const termsVersion = hashTermsVersion(terms);
  const distinctFromFirst =
    Boolean(ticket.firstAfterSha256) &&
    Boolean(afterActual) &&
    ticket.firstAfterSha256 !== afterActual;
  const transportOk = classified ? classified.transport === "ok" : status !== "actionable";
  const analysisOutcome = classified?.analysisOutcome || null;
  const slotRef = (slot) =>
    frozen?.[slot]
      ? {
          sha256: frozen[slot].sha256,
          bytes: frozen[slot].bytes,
          frozenPath: frozen[slot].frozenPath,
          sourcePath: frozen[slot].sourcePath,
        }
      : null;

  const record = {
    schema: "w5.repeat-job-binder.second-run.v1",
    binder: "repeat-job-binder",
    status,
    family,
    engineKind,
    catalogJob: catalogJob || null,
    termsVersion,
    schedulerDaemon: false,
    settling: false,
    paidValueClaim: false,
    purchaseAuthority: false,
    sampleLabelled: ticket.sampleLabelled,
    identityVerification: {
      state: verification.state,
      verified: verification.state === "verified",
    },
    transport: {
      ok: status === "informational" ? null : Boolean(transportOk),
      exitCode: engineResult?.exitCode ?? null,
    },
    analysisOutcome,
    frozen: {
      previous: {
        ticketSha256: ticket.ticketSha256 || null,
        beforeSha256: ticket.firstBeforeSha256 || null,
        afterSha256: ticket.firstAfterSha256 || null,
      },
      current: {
        before: slotRef("before"),
        after: slotRef("after"),
        used: slotRef("used"),
      },
    },
    firstRun: {
      ticketKind: ticket.kind,
      ticketPath: ticket.path,
      family: ticket.family,
      afterSha256: ticket.firstAfterSha256,
      beforeSha256: ticket.firstBeforeSha256,
      identityVerified: ticket.identityVerified,
    },
    secondRun: {
      afterSha256: afterActual,
      beforeSha256: beforeActual,
      usedSha256: verification.verifiedInputs.used?.actual?.sha256 || null,
      engine: engineResult
        ? {
            kind: engineResult.kind,
            jobId: engineResult.jobId,
            exitCode: engineResult.exitCode,
            outDir: engineResult.outDir,
            outputs: engineResult.outputs,
            argv: engineResult.argv || null,
            ok: classified ? classified.transport === "ok" && classified.analysisOutcome !== "refused" : false,
          }
        : null,
    },
    distinctFromFirst,
    missing: verification.missing,
    notMarketFact: true,
    notCustomerDemand: true,
    laterIntegrationBindings: LATER_BINDINGS,
    generatedAt: new Date().toISOString(),
  };

  record.digest = createHash("sha256")
    .update(
      JSON.stringify({
        family,
        status,
        termsVersion,
        firstAfter: ticket.firstAfterSha256,
        secondAfter: afterActual,
        engineKind,
        engineJob: engineResult?.jobId || null,
        analysisOutcome,
      }),
    )
    .digest("hex");

  return record;
}

export function toMarkdown(record) {
  const lines = [
    "# Repeat-job binder second run",
    "",
    `Status: **${record.status}**`,
    `Transport: **${record.transport?.ok === true ? "ok" : record.transport?.ok === false ? "failed" : "n/a"}**`,
    `Analysis: \`${record.analysisOutcome || "n/a"}\``,
    `Family: \`${record.family}\``,
    `Engine: \`${record.engineKind}${record.catalogJob ? ` / ${record.catalogJob}` : ""}\``,
    `Terms: \`${record.termsVersion}\``,
    `Daemon: **false**`,
    `Settling: **false**`,
    `Distinct from first: **${record.distinctFromFirst === true}**`,
    "",
    `First after sha256: \`${record.firstRun.afterSha256 || "n/a"}\``,
    `Second after sha256: \`${record.secondRun.afterSha256 || "n/a"}\``,
    `Frozen current after: \`${record.frozen?.current?.after?.frozenPath || "n/a"}\``,
    "",
    "Not a scheduler. Not cron. SAMPLE is not live recurrence. Not a sale.",
    "",
  ];
  return lines.join("\n");
}

export function writeSecondRun(outDir, record) {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "second-run.json");
  const mdPath = path.join(outDir, "second-run.md");
  writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(mdPath, `${toMarkdown(record)}\n`);
  return { jsonPath, mdPath };
}
