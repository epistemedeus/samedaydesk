import { classifyStaleArchive } from "./classify.mjs";
import { probeObtain } from "./obtain.mjs";
import { PRINCIPLE } from "./root.mjs";

export function evaluateFixture(raw, expect = "reject", pins = null) {
  const output = raw.output || raw;
  let probe = null;
  if (raw.probe?.kind === "obtain-archive") {
    const current = pins?.current;
    if (!current?.sha256 || current.bytes == null) {
      return {
        ok: false,
        status: "fail",
        exit: 1,
        error: {
          code: "PIN_REQUIRED",
          message: "obtain-archive probe requires loaded current pin",
        },
        verdict: { reject: true, staleAsCurrent: true, reasons: ["pin_required"], detail: {} },
        expect,
        result: { id: raw.id, expect, reject: true, reasons: ["pin_required"] },
        probe: null,
      };
    }
    probe = probeObtain(raw.probe, current);
  }

  const verdict = classifyStaleArchive(output, {
    surface: raw.surface || output.surface,
    probe,
    kit: pins?.kit,
    stale: pins?.stale,
  });

  const expectAccept = expect === "accept";
  let ok;
  let status;
  let error = null;
  let exit;

  if (expect !== "accept" && expect !== "reject") {
    return {
      ok: false,
      status: "fail",
      exit: 2,
      error: { code: "BAD_EXPECT", message: `expect must be reject|accept, got ${expect}` },
      verdict,
      expect,
      result: { id: raw.id, expect, reject: verdict.reject, reasons: verdict.reasons },
      probe,
    };
  }

  if (expectAccept) {
    if (verdict.reject) {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "SEED_REJECT",
        message: `seeded accept refused: ${raw.id || "case"} treats a stale archive as current`,
        reasons: verdict.reasons,
      };
    } else {
      ok = true;
      status = "pass";
      exit = 0;
    }
  } else if (verdict.reject) {
    ok = true;
    status = "pass";
    exit = 0;
  } else {
    ok = false;
    status = "fail";
    exit = 1;
    error = {
      code: "FALSE_ACCEPT",
      message: `fixture ${raw.id || "case"} was not rejected (would accept a stale archive as current)`,
      reasons: verdict.reasons,
    };
  }

  if (ok && probe) {
    if (expectAccept) {
      if (probe.ok !== true || probe.refused === true) {
        ok = false;
        status = "fail";
        exit = 1;
        error = {
          code: "PROBE_FAIL",
          message: `obtain-archive probe for ${raw.id || "case"} did not accept the current pin`,
          probe: {
            ok: probe.ok,
            refused: probe.refused,
            code: probe.code,
            childExit: probe.childExit,
          },
        };
      }
    } else if (probe.refused !== true) {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "PROBE_NOT_REFUSED",
        message: `obtain-archive probe for ${raw.id || "case"} did not refuse the stale archive`,
        probe: {
          ok: probe.ok,
          refused: probe.refused,
          code: probe.code,
          childExit: probe.childExit,
        },
      };
    } else if (raw.probe?.expectCode && probe.code !== raw.probe.expectCode) {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "PROBE_CODE_MISMATCH",
        message: `obtain-archive probe for ${raw.id || "case"} code ${probe.code} != ${raw.probe.expectCode}`,
        probe: {
          ok: probe.ok,
          refused: probe.refused,
          code: probe.code,
          childExit: probe.childExit,
        },
      };
    }
  }

  return {
    ok,
    status,
    exit,
    error,
    verdict,
    expect: expectAccept ? "accept" : "reject",
    probe,
    result: {
      id: raw.id,
      expect: expectAccept ? "accept" : "reject",
      reject: verdict.reject,
      staleAsCurrent: verdict.staleAsCurrent,
      reasons: verdict.reasons,
      claimedSuccess: verdict.detail.claimedSuccess,
      claimedCurrent: verdict.detail.claimedCurrent,
      observed: verdict.detail.observed,
      probe: probe
        ? {
            ok: probe.ok,
            refused: probe.refused,
            code: probe.code,
            childExit: probe.childExit,
            destExists: probe.destExists,
            extracted: probe.extracted,
          }
        : null,
      principle: PRINCIPLE,
    },
  };
}
