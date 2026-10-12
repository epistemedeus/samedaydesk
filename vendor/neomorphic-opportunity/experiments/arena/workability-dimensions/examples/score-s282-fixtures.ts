#!/usr/bin/env node
/**
 * Caller-first example: print the three dimensions for one claimable fixture
 * and one refuse fixture. mixedScore is labelled displayOnly and is not the gate.
 */
import { scoreCardFile } from "../src/packet.ts";
import { TEST_NOW } from "../src/constants.ts";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const fixtures = join(here, "../fixtures/s282");

const claimable = scoreCardFile(join(fixtures, "claimable-funded-open.card.json"), { now: TEST_NOW });
const refuse = scoreCardFile(join(fixtures, "refuse-expired-open.card.json"), { now: TEST_NOW });

function dims(label: string, env: typeof claimable) {
  return {
    label,
    doNotStartWork: env.doNotStartWork,
    eligibility: env.packet.eligibility,
    funding: env.packet.funding,
    effort: env.packet.effort,
    mixedScore: env.packet.mixedScore,
  };
}

console.log(
  JSON.stringify(
    {
      now: TEST_NOW,
      observationDate: "2026-09-11",
      claimable: dims("frantic-129-source-stated-claim-path", claimable),
      refuse: dims("moltjobs-expired-open", refuse),
      note: "Three dimensions are the authority fields. mixedScore.displayOnly is true and is not a gate.",
    },
    null,
    2,
  ),
);
