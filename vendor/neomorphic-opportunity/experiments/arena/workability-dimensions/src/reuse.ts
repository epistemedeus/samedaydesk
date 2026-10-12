/**
 * Reuse pins. This arm does not rewrite those packs.
 */
import { HONESTY_NOTES } from "../../../../packs/capability-preflight/src/index.mjs";
import { CAPABILITY_PREFLIGHT_PIN } from "./constants.ts";
import {
  capabilityPreflightRoot,
  externalJobIntakeRoot,
  outsideOperatorFirstJobRoot,
} from "./paths.ts";

export { HONESTY_NOTES };

export const REUSE_PINS = Object.freeze({
  capabilityPreflight: CAPABILITY_PREFLIGHT_PIN,
  capabilityPreflightHonesty: HONESTY_NOTES,
  externalJobIntakePresent: Boolean(externalJobIntakeRoot()),
  outsideOperatorFirstJobPresent: Boolean(outsideOperatorFirstJobRoot()),
  capabilityPreflightPresent: Boolean(capabilityPreflightRoot()),
});
