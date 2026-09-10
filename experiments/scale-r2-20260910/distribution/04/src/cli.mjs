#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-DISTRIBUTION-04.
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs tag <entries.json>
 *   node src/cli.mjs event <tagged.json> <signal.json>
 *   node src/cli.mjs validate <tagged-or-events.json>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTURE_OUTCOME, TAGGED_SCHEMA, EVENTS_SCHEMA } from "./constants.mjs";
import { tagEntries, TAGGED_STATUS } from "./tag.mjs";
import { emitResultEvents } from "./events.mjs";
import { validateTaggedLinks, validateResultEvents } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs tag <entries.json>
  node src/cli.mjs event <tagged.json> <signal.json>
  node src/cli.mjs validate <tagged-or-events.json>`);
  process.exit(2);
}

const [cmd, a, b] = process.argv.slice(2);
if (!cmd) usage();

const clock = () => Date.parse("2026-09-10T19:00:00.000Z");

try {
  if (cmd === "tag") {
    if (!a) usage();
    const tagged = tagEntries(loadJson(a), { clock });
    console.log(JSON.stringify(tagged, null, 2));
    process.exit(tagged.status === TAGGED_STATUS.PARTIAL ? 1 : 0);
  } else if (cmd === "event") {
    if (!a || !b) usage();
    const events = emitResultEvents(loadJson(a), loadJson(b), { clock });
    console.log(JSON.stringify(events, null, 2));
    const bad = [CAPTURE_OUTCOME.UNAVAILABLE].includes(events.outcome);
    process.exit(bad ? 1 : 0);
  } else if (cmd === "validate") {
    if (!a) usage();
    const doc = loadJson(a);
    if (doc.schema === TAGGED_SCHEMA) {
      const tagged = validateTaggedLinks(doc);
      console.log(
        JSON.stringify(
          {
            ok: true,
            kind: "tagged",
            status: tagged.status,
            linkCount: tagged.links?.length ?? 0,
            sourceTags: (tagged.links || []).map((l) => ({
              id: l.id,
              sourceTag: l.sourceTag,
            })),
            schema: tagged.schema,
          },
          null,
          2,
        ),
      );
    } else if (doc.schema === EVENTS_SCHEMA) {
      const events = validateResultEvents(doc);
      console.log(
        JSON.stringify(
          {
            ok: true,
            kind: "events",
            outcome: events.outcome,
            eventCount: events.events?.length ?? 0,
            activationCount: Object.prototype.hasOwnProperty.call(events, "activationCount")
              ? events.activationCount
              : null,
            hasActivationCount: Object.prototype.hasOwnProperty.call(events, "activationCount"),
            claims: events.claims || null,
            schema: events.schema,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(
        JSON.stringify({
          error: "invalid_input",
          message: `unknown schema for validate: ${doc.schema ?? null}`,
        }),
      );
      process.exit(1);
    }
  } else if (cmd === "demo") {
    const positive = tagEntries(loadJson(join(root, "fixtures/entries.positive.json")), {
      clock,
    });
    const partial = tagEntries(loadJson(join(root, "fixtures/entries.partial.json")), {
      clock,
    });
    const recorded = emitResultEvents(
      positive,
      loadJson(join(root, "fixtures/signal.recorded.json")),
      { clock },
    );
    const unavailable = emitResultEvents(
      positive,
      loadJson(join(root, "fixtures/signal.unavailable.json")),
      { clock },
    );
    const noUsers = emitResultEvents(
      positive,
      loadJson(join(root, "fixtures/signal.no-users.json")),
      { clock },
    );
    const taggedPath = "/tmp/r2-dist-04-tagged.json";
    const eventsPath = "/tmp/r2-dist-04-events.json";
    writeFileSync(taggedPath, JSON.stringify(positive, null, 2));
    writeFileSync(eventsPath, JSON.stringify(recorded, null, 2));
    console.log(
      JSON.stringify(
        {
          tagged: {
            status: positive.status,
            linkIds: positive.links.map((l) => l.id),
            sourceTags: positive.links.map((l) => l.sourceTag),
            sampleTaggedHref: positive.links[0]?.taggedHref,
            allLinksDenyBuyerIntent: positive.links.every((l) => l.impliesBuyerIntent === false),
          },
          partial: {
            status: partial.status,
            missingInputs: partial.missingInputs,
          },
          recorded: {
            outcome: recorded.outcome,
            activationCount: recorded.activationCount,
            eventKinds: recorded.events.map((e) => e.kind),
            activationEqualsBuyerIntent: recorded.claims?.activationEqualsBuyerIntent,
          },
          unavailable: {
            outcome: unavailable.outcome,
            hasActivationCount: Object.prototype.hasOwnProperty.call(
              unavailable,
              "activationCount",
            ),
          },
          noUsers: {
            outcome: noUsers.outcome,
            activationCount: noUsers.activationCount,
          },
          distinct:
            unavailable.outcome === CAPTURE_OUTCOME.UNAVAILABLE &&
            noUsers.outcome === CAPTURE_OUTCOME.NO_USERS &&
            unavailable.outcome !== noUsers.outcome,
          clickIsNotIntent:
            recorded.claims?.activationEqualsBuyerIntent === false &&
            recorded.events
              .filter((e) => e.kind === "linkActivated")
              .every((e) => e.impliesBuyerIntent === false),
          wroteTagged: taggedPath,
          wroteEvents: eventsPath,
          mutationBoundary: positive.mutationBoundary,
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
