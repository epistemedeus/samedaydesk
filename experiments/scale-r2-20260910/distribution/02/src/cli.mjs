#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-DISTRIBUTION-02.
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs stage <inventory.json>
 *   node src/cli.mjs validate <packet.json>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRootHandoffPacket } from "./stage.mjs";
import { validatePacket } from "./validate.mjs";
import { PACKET_STATUS } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs stage <inventory.json>
  node src/cli.mjs validate <packet.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "stage") {
    if (!a) usage();
    const packet = buildRootHandoffPacket(loadJson(a), {
      clock: () => Date.parse("2026-09-10T12:00:00.000Z"),
    });
    console.log(JSON.stringify(packet, null, 2));
    const bad = [PACKET_STATUS.BLOCKED_MISSING_INPUT, PACKET_STATUS.UNAVAILABLE].includes(
      packet.status,
    );
    process.exit(bad ? 1 : 0);
  } else if (cmd === "validate") {
    if (!a) usage();
    const packet = validatePacket(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: packet.status,
          audienceCaptureStatus: packet.audienceCapture?.status ?? null,
          providerReview: packet.providerReview?.status ?? null,
          schema: packet.schema,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const clock = () => Date.parse("2026-09-10T12:00:00.000Z");
    const positive = buildRootHandoffPacket(
      loadJson(join(root, "fixtures/inventory.positive.json")),
      { clock },
    );
    const partial = buildRootHandoffPacket(
      loadJson(join(root, "fixtures/inventory.partial.json")),
      { clock },
    );
    const unavailable = buildRootHandoffPacket(
      loadJson(join(root, "fixtures/inventory.unavailable.json")),
      { clock },
    );
    const noUsers = buildRootHandoffPacket(
      loadJson(join(root, "fixtures/inventory.no-users.json")),
      { clock },
    );
    writeFileSync("/tmp/r2-dist-02-packet.json", JSON.stringify(positive, null, 2));
    console.log(
      JSON.stringify(
        {
          positive: {
            status: positive.status,
            providerReview: positive.providerReview?.status,
            resubmit: positive.recommendations?.resubmit,
            demo: positive.recommendations?.exactDemoPointer,
          },
          partial: { status: partial.status, missingInputs: partial.missingInputs },
          unavailable: {
            status: unavailable.status,
            audience: unavailable.audienceCapture?.status,
            hasUsersField: Object.prototype.hasOwnProperty.call(
              unavailable.audienceCapture || {},
              "users",
            ),
          },
          noUsers: {
            status: noUsers.status,
            audience: noUsers.audienceCapture?.status,
            users: noUsers.audienceCapture?.users,
          },
          distinct:
            unavailable.status !== noUsers.status &&
            unavailable.audienceCapture.status !== noUsers.audienceCapture.status,
          wrotePacket: "/tmp/r2-dist-02-packet.json",
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
