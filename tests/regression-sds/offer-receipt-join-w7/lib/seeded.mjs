/**
 * Interpret verify --expect accept on the seeded mismatch fixture.
 * Always a failure for the operator (exit ≠0). FALSE_ACCEPT means the
 * joiner wrongly accepted; SEED_REJECT means the seed was actually refused.
 */
export function seededMismatchOutcome({ status, body }) {
  const reasons = body?.result?.reasons || body?.error?.reasons || [];
  const joined = body?.result?.joined === true;
  const childOk = body?.ok === true;
  if (joined || (status === 0 && childOk)) {
    return {
      code: "FALSE_ACCEPT",
      message: "seeded mismatch joined when fed as accept",
      reject: false,
      mismatch: Boolean(body?.result?.mismatch),
      reasons,
    };
  }
  return {
    code: "SEED_REJECT",
    message: "seeded mismatch refused when fed as accept",
    reject: true,
    mismatch: true,
    reasons,
  };
}
