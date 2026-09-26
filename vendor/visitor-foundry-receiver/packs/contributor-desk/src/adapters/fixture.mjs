import { buildFixtureSeed } from "../catalog.mjs";
import { CLOCK_ISO } from "../constants.mjs";
import { createMachine } from "../machine.mjs";

export function createFixtureAdapter({ seed, now, randomId } = {}) {
  const resolved = seed ?? buildFixtureSeed({ now: typeof now === "function" ? now() : now ?? CLOCK_ISO });
  const clock = typeof now === "function" ? now : () => resolved.clock || CLOCK_ISO;
  const machine = createMachine({ seed: resolved, now: clock, randomId });
  return {
    kind: "fixture",
    provenance: "fixture",
    walletless: true,
    browse: () => machine.browse(),
    claim: (input) => machine.claim(input),
    status: (input) => machine.status(input),
    appeal: (input) => machine.appeal(input),
    owedVersusPaid: (input) => machine.owedVersusPaid(input),
    snapshot: () => machine.snapshot(),
  };
}
