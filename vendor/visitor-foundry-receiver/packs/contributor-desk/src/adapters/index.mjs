import { CODE } from "../constants.mjs";
import { DeskError } from "../errors.mjs";
import { inspectDeskAuthority, inspectContributorPayoutKey } from "../authority.mjs";
import { createFixtureAdapter } from "./fixture.mjs";
import { createHttpAdapter } from "./http.mjs";

export { createFixtureAdapter } from "./fixture.mjs";
export { createHttpAdapter } from "./http.mjs";

/**
 * Open a contributor desk adapter after authority checks.
 * Desk-held EARNED_WORK secrets are a seeded refusal. Contributor payout keys kill.
 */
export function openAdapter(options = {}) {
  const env = options.env ?? (typeof process !== "undefined" ? process.env : {});
  const { config = {}, flags = {}, kind = "fixture" } = options;
  const desk = inspectDeskAuthority({ env, config, flags });
  if (!desk.ok) throw desk.error;

  const contributor = inspectContributorPayoutKey({
    env,
    contributor: config.contributor ?? {},
    session: config.session ?? {},
    flags,
  });
  if (!contributor.ok) throw contributor.error;

  if (kind === "http") {
    return createHttpAdapter({
      origin: options.origin ?? config.origin,
      contributorToken: options.contributorToken ?? config.contributorToken ?? null,
      fetchImpl: options.fetchImpl,
      now: options.now,
    });
  }
  if (kind === "fixture") {
    return createFixtureAdapter({
      seed: options.seed,
      now: options.now,
      randomId: options.randomId,
    });
  }
  throw new DeskError({
    code: CODE.INVALID_INPUT,
    message: `unknown adapter kind: ${kind}`,
    status: 400,
  });
}
