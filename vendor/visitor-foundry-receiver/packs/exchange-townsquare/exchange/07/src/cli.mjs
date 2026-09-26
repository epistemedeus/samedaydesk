#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleDisputePacket, exchange01 } from "./packet.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const f01 = join(__dirname, "../../01/fixtures");
const root = join(__dirname, "..");
const load = (p) => JSON.parse(readFileSync(p, "utf8"));

if (process.argv[2] !== "demo") {
  console.error("Usage: node src/cli.mjs demo");
  process.exit(2);
}

const brief = exchange01.buildAcceptanceBrief(load(join(f01, "requirements.positive.json")));
const proposal = load(join(root, "fixtures/proposal.json"));
const packet = assembleDisputePacket({
  brief,
  proposal,
  artifact: load(join(f01, "artifact.partial.json")),
  requesterStatement: "Digest is wrong; worker should fix evidenceDigest.",
  workerStatement: "Summary and URL are correct; digest optional.",
  sources: [{ id: "fixture", label: "synthetic", uri: "file:fixtures" }],
}, { clock: () => Date.parse("2026-09-10T17:00:00.000Z") });

console.log(JSON.stringify({
  status: packet.status,
  adjudicationPolicy: packet.adjudicationPolicy,
  briefRevision: packet.taskVersions.briefRevisionSha256.slice(0, 12),
  disagreementKinds: packet.disagreements.map((d) => d.kind),
  objectiveFailed: packet.suppliedOutputs.checkSummary.objectiveFailed,
}, null, 2));
