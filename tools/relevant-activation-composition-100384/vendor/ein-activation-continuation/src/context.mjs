/** SPDX-License-Identifier: MIT
 * Project explicit supplied facts onto the existing assessment input.
 * Descriptions never infer entity, EIN, jurisdiction, or provider requirements.
 */
import { ContinuationError, recovery } from "./errors.mjs";

function object(value, allowed, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new ContinuationError({
      code: "invalid_input",
      message: `${name} must contain only the documented non-sensitive context fields`,
      recovery: recovery("fix_input", "Use the supplied-context schema in INSTALL.md. Keep unknown facts unknown."),
    });
  }
  return value;
}

export function assessmentFromContext(value) {
  if (value?.schema !== "ein.supplied-context.v1") return value;
  object(value, ["schema", "task", "business", "requirements", "foreignOwnedCaution"], "context");
  const business = object(value.business ?? {}, ["hasUsEntity", "hasEin"], "business");
  const requirements = object(value.requirements ?? {}, [
    "providerRequiresUsEntity", "providerRequiresEin", "jurisdictionKnown", "selectedState",
  ], "requirements");
  return {
    goal: value.task,
    ...business,
    ...requirements,
    ...(value.foreignOwnedCaution === undefined ? {} : { foreignOwnedCaution: value.foreignOwnedCaution }),
  };
}
