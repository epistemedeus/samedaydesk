import { classifyAbsenceAsDemand } from "./classify.mjs";
import { PRINCIPLE } from "./root.mjs";

export function evaluateFixture(raw, expect = "reject") {
  const output = raw.output || raw;
  const meta = {
    surface: raw.surface || output.surface,
    absence: raw.absence,
    paidActivity: raw.paidActivity,
    evidence: raw.evidence,
    claims: raw.claims,
    sourceId: raw.sourceId || output.sourceId,
    availability: raw.availability || output.availability,
  };
  const verdict = classifyAbsenceAsDemand(output, meta);
  const expectAccept = expect === "accept";

  let ok;
  let status;
  let error = null;
  let exit;

  if (expectAccept) {
    if (verdict.reject) {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: raw.seededAbsenceAsDemand ? "SEED_REJECT" : "FALSE_REJECT",
        message: raw.seededAbsenceAsDemand
          ? `seeded accept refused: ${raw.id || "case"} treats absence as demand`
          : `fixture ${raw.id || "case"} rejected unexpectedly`,
        reasons: verdict.reasons,
      };
    } else {
      ok = true;
      status = "pass";
      exit = 0;
    }
  } else if (expect === "reject") {
    if (verdict.reject) {
      const expected = Array.isArray(raw.expectedReasons) ? raw.expectedReasons : [];
      const missing = expected.filter((code) => !verdict.reasons.includes(code));
      if (missing.length) {
        ok = false;
        status = "fail";
        exit = 1;
        error = {
          code: "REASON_MISMATCH",
          message: `fixture ${raw.id || "case"} missing reasons ${missing.join(",")}`,
          missing,
          reasons: verdict.reasons,
        };
      } else {
        ok = true;
        status = "pass";
        exit = 0;
      }
    } else {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "FALSE_ACCEPT",
        message: `fixture ${raw.id || "case"} was not rejected (would treat absence as demand)`,
        reasons: verdict.reasons,
      };
    }
  } else {
    ok = false;
    status = "fail";
    exit = 2;
    error = { code: "BAD_EXPECT", message: `expect must be reject|accept, got ${expect}` };
  }

  return {
    ok,
    status,
    exit,
    error,
    verdict,
    expect: expectAccept ? "accept" : expect,
    result: {
      id: raw.id,
      expect: expectAccept ? "accept" : expect,
      reject: verdict.reject,
      absenceAsDemand: verdict.absenceAsDemand,
      reasons: verdict.reasons,
      claimedDemand: verdict.detail.claimedDemand,
      demandWithheld: verdict.detail.demandWithheld,
      absenceReasons: verdict.detail.absenceReasons,
      principle: PRINCIPLE,
    },
  };
}
