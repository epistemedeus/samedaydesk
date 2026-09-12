#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertArchivePins, distributionRepairBin, runNodeJson, writeJson, writeText, parseArgs, fixture, labelSample,
} from "../../lib/common.mjs";
import { envelope, digestObj } from "../../lib/artifact.mjs";
import { requireCallerInputs, resolveOutDir } from "../../lib/cli-runtime.mjs";
import { mapListingRepairStatus } from "./listing-repair-boundary.mjs";

const APP = "listing-repair-packet";
const OUTPUTS = ["repair-packet.json", "repair-packet.md"];

function normalizeGuidanceList(underlying, diagnosis) {
  const raw =
    underlying?.ownerRepairGuidance ||
    underlying?.repairGuidance ||
    diagnosis.ownerGuidance ||
    underlying?.repair?.recommendations ||
    [];
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  return list.filter((g) => g != null && g !== true && g !== false);
}

function guidanceNote(g) {
  if (typeof g === "string") return g;
  if (g.recommendation || g.routeKey) {
    const route = g.routeKey || "?";
    const rec = g.recommendation || "review";
    const delta = g.delta ? ` delta=${g.delta}` : "";
    const notes = Array.isArray(g.notes) && g.notes.length ? ` - ${g.notes.join("; ")}` : "";
    return `${route}: ${rec}${delta}${notes}`;
  }
  return g.summary || g.note || JSON.stringify(g);
}

function readCallerInput(inputPath) {
  try {
    return JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    return null;
  }
}

export function buildPacket(underlying, caller, input) {
  const mapped = mapListingRepairStatus({ underlying, input });
  const statusRaw = underlying?.status || "";
  const refused = mapped.refused;
  const partial = mapped.partial;
  const status = mapped.status;
  const diagnosis = underlying?.diagnosis || {};
  const actions = [];
  if (status === "refused") {
    actions.push({
      priority: "high",
      kind: "fix-identity-or-source-join",
      note: mapped.reason || "Mismatched or refused join; do not invent identity",
    });
  } else {
    const guidanceList = normalizeGuidanceList(underlying, diagnosis);
    for (const g of guidanceList) {
      if (g.recommendation === "no_action_unchanged") continue;
      actions.push({
        priority: "high",
        kind: "owner-repair",
        note: guidanceNote(g),
        sourceRefs: g.sourceRefs || (g.routeKey ? [`route:${g.routeKey}`] : underlying?.sourceRefs || []),
      });
    }
    if (!actions.length) {
      const unknowns = [];
      for (const j of diagnosis.joined || []) {
        const routeHint = j.usefulOutputId || j.acquisitionId || "";
        for (const u of j.unknowns || []) {
          unknowns.push(routeHint ? `${routeHint}: ${u}` : u);
        }
      }
      const seen = new Set();
      for (const u of unknowns) {
        if (seen.has(u)) continue;
        seen.add(u);
        actions.push({ priority: "medium", kind: "resolve-unknown", note: u });
        if (actions.length >= 8) break;
      }
    }
    if (!actions.length && status === "actionable") {
      actions.push({
        priority: "medium",
        kind: "review-diagnosis",
        note: "Diagnosis present; inspect joined acquisition/output links",
      });
    }
    if (!actions.length && status === "partial") {
      actions.push({
        priority: "high",
        kind: "complete-capture",
        note: "Partial/incomplete inputs; cannot claim global unlisting",
      });
    }
  }
  const gapNotes = [];
  if (partial) gapNotes.push("incomplete evidence; packet is non-final");
  if (mapped.code === "unsupported-provider" && mapped.reason && !gapNotes.includes(mapped.reason)) {
    gapNotes.push(mapped.reason);
  }
  for (const g of underlying?.gaps || []) {
    const msg = typeof g === "string" ? g : g.message || g.code;
    if (msg && !gapNotes.includes(msg)) gapNotes.push(msg);
  }
  if (status === "refused" && !gapNotes.length) {
    gapNotes.push("identity or source join refused; packet is non-final");
  }
  const art = envelope({
    appId: APP,
    status,
    summary: `Listing repair packet status=${statusRaw || "unknown"}`,
    actions,
    gaps: gapNotes,
    underlying: { tool: "distribution-repair", status: statusRaw, ok: underlying?.ok !== false },
    caller: labelSample(caller),
  });
  art.sourceLinked = true;
  art.digest = digestObj({ status: art.status, actions: art.actions, statusRaw, caller: art.caller });
  return art;
}

export function toMarkdown(art) {
  const lines = ["# Listing repair packet", "", `Status: **${art.status}**`, "", art.summary, "", "## Owner actions"];
  for (const a of art.actions) lines.push(`- (${a.priority}) ${a.kind}: ${a.note}`);
  if (art.gaps?.length) {
    lines.push("", "## Gaps");
    for (const g of art.gaps) lines.push(`- ${g}`);
  }
  lines.push(
    "",
    "_Offline diagnosis over fixture listing/route snapshots. Samples are not customers._",
    "_Partial or incomplete evidence stays non-final; this packet never claims global unlisting._",
    "",
  );
  return lines.join("\n");
}

export function run(args) {
  assertArchivePins();
  const mode = requireCallerInputs(args, ["input"]);
  const exampleMode = mode.mode === "example";
  const input = exampleMode ? fixture("listing/caller-alpha.json") : args.input;
  const outDir = resolveOutDir(APP, args, [input], OUTPUTS);
  const r = runNodeJson(distributionRepairBin(), ["diagnose", input]);
  if (!r.json) throw new Error(`distribution-repair failed: ${r.combined.slice(0, 800)}`);
  const parsed = readCallerInput(input);
  const art = buildPacket(r.json, {
    input,
    exampleMode,
    sampleLabel: exampleMode ? "explicit-example" : "caller-input",
  }, parsed);
  writeJson(path.join(outDir, "repair-packet.json"), art);
  writeText(path.join(outDir, "repair-packet.md"), toMarkdown(art));
  art.outDir = outDir;
  return art;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const art = run(parseArgs(process.argv.slice(2)));
    process.stdout.write(
      JSON.stringify({
        ok: true,
        appId: APP,
        status: art.status,
        digest: art.digest,
        outDir: art.outDir,
        actions: art.actions.length,
      }) + "\n",
    );
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        refused: true,
        code: err.code || "error",
        error: err.message,
        detail: err.detail || null,
      }) + "\n",
    );
    process.exit(err.exitCode || 2);
  }
}
