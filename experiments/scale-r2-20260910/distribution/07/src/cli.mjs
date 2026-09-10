#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-DISTRIBUTION-07.
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs build <request.json>
 *   node src/cli.mjs validate <packet.json>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKET_STATUS } from "./constants.mjs";
import { buildHandoffPacket } from "./build.mjs";
import { validatePacket } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs build <request.json>
  node src/cli.mjs validate <packet.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

const clock = () => Date.parse("2026-09-10T20:00:00.000Z");

try {
  if (cmd === "build") {
    if (!a) usage();
    const packet = buildHandoffPacket(loadJson(a), { clock });
    console.log(JSON.stringify(packet, null, 2));
    const bad = [
      PACKET_STATUS.BLOCKED_MISSING_INPUT,
      PACKET_STATUS.UNAVAILABLE,
      PACKET_STATUS.KILLED_REQUESTER_HAS_FIX,
    ].includes(packet.status);
    process.exit(bad ? 1 : 0);
  } else if (cmd === "validate") {
    if (!a) usage();
    const packet = validatePacket(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: packet.status,
          requestId: packet.requestId ?? null,
          runCommandCount: Array.isArray(packet.runCommands)
            ? packet.runCommands.length
            : 0,
          hasRequesterCount: Object.prototype.hasOwnProperty.call(
            packet,
            "requesterCount",
          ),
          requesterCount: Object.prototype.hasOwnProperty.call(
            packet,
            "requesterCount",
          )
            ? packet.requesterCount
            : null,
          killReason: packet.killReason ?? null,
          grexalListingStatus: packet.artifactRef?.listingStatus ?? null,
          customerRevenueClaimed:
            packet.artifactRef?.customerExecutionRevenuePayout === true,
          schema: packet.schema,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const ready = buildHandoffPacket(
      loadJson(join(root, "fixtures/request.positive.json")),
      { clock },
    );
    const killed = buildHandoffPacket(
      loadJson(join(root, "fixtures/request.kill-has-fix.json")),
      { clock },
    );
    const partial = buildHandoffPacket(
      loadJson(join(root, "fixtures/request.partial.json")),
      { clock },
    );
    const unavailable = buildHandoffPacket(
      loadJson(join(root, "fixtures/request.unavailable.json")),
      { clock },
    );
    const noUsers = buildHandoffPacket(
      loadJson(join(root, "fixtures/request.no-users.json")),
      { clock },
    );
    const outPath = "/tmp/r2-dist-07-packet.json";
    writeFileSync(outPath, JSON.stringify(ready, null, 2));
    console.log(
      JSON.stringify(
        {
          ready: {
            status: ready.status,
            requestId: ready.requestId,
            artifactType: ready.artifactRef?.type,
            packagePath: ready.artifactRef?.packagePath,
            grexalListingStatus: ready.artifactRef?.listingStatus,
            grexalAgentId: ready.artifactRef?.agentId,
            grexalRunCompletedUsd: ready.artifactRef?.pricingRunCompletedUsd,
            customerRevenueClaimed:
              ready.artifactRef?.customerExecutionRevenuePayout === true,
            runCommandCount: ready.runCommands?.length,
            acceptanceCheckCount: ready.acceptanceChecks?.length,
          },
          killed: {
            status: killed.status,
            killReason: killed.killReason,
            killSignals: killed.killSignals,
            runCommandCount: killed.runCommands?.length,
          },
          partial: {
            status: partial.status,
            missingInputs: partial.missingInputs,
          },
          unavailable: {
            status: unavailable.status,
            hasRequesterCount: Object.prototype.hasOwnProperty.call(
              unavailable,
              "requesterCount",
            ),
          },
          noUsers: {
            status: noUsers.status,
            requesterCount: noUsers.requesterCount,
          },
          distinct:
            unavailable.status === PACKET_STATUS.UNAVAILABLE &&
            noUsers.status === PACKET_STATUS.NO_USERS &&
            unavailable.status !== noUsers.status,
          killPathEmptyCommands: killed.runCommands?.length === 0,
          wrotePacket: outPath,
          mutationBoundary: ready.mutationBoundary,
        },
        null,
        2,
      ),
    );
  } else {
    usage();
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err.code || "error",
      message: err.message,
      details: err.details || null,
    }),
  );
  process.exit(1);
}
