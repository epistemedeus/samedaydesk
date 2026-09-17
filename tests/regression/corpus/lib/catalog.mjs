import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CORPUS_ROOT } from "./root.mjs";

export function loadCatalog() {
  return JSON.parse(readFileSync(join(CORPUS_ROOT, "catalog.json"), "utf8"));
}

export function loadSeed(name) {
  return JSON.parse(readFileSync(join(CORPUS_ROOT, "fixtures", "seeded", name), "utf8"));
}

export function isSeededKind(kind) {
  return kind === "seeded_false_accept" || kind === "seeded_false_reject";
}

export function judge(entry, observed) {
  const productExpected = entry.expected;
  const productOk =
    observed.verdict === productExpected && (entry.expectCode == null || observed.code === entry.expectCode);

  if (entry.kind === "seeded_false_accept") {
    const caught = observed.verdict === "reject" && entry.claimedVerdict === "accept";
    return {
      ok: caught && productOk,
      status: caught ? "caught" : "missed",
      seeded: "false_accept",
      claimedVerdict: entry.claimedVerdict,
      observedVerdict: observed.verdict,
    };
  }

  if (entry.kind === "seeded_false_reject") {
    const caught = observed.verdict === "accept" && entry.claimedVerdict === "reject";
    return {
      ok: caught && productOk,
      status: caught ? "caught" : "missed",
      seeded: "false_reject",
      claimedVerdict: entry.claimedVerdict,
      observedVerdict: observed.verdict,
    };
  }

  return {
    ok: productOk,
    status: productOk ? "pass" : "fail",
    seeded: null,
    claimedVerdict: productExpected,
    observedVerdict: observed.verdict,
  };
}

/** Naive consumer: claimedVerdict is treated as the required product verdict. */
export function judgeNaive(entry, observed) {
  const claimed = entry.claimedVerdict ?? entry.expected;
  const match = observed.verdict === claimed;
  if (match) {
    return { ok: true, status: "pass", seeded: null, claimedVerdict: claimed, observedVerdict: observed.verdict };
  }
  const seeded =
    claimed === "accept" && observed.verdict === "reject"
      ? "false_accept"
      : claimed === "reject" && observed.verdict === "accept"
        ? "false_reject"
        : "mismatch";
  return {
    ok: false,
    status: "fail",
    seeded,
    claimedVerdict: claimed,
    observedVerdict: observed.verdict,
  };
}
