function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPath(obj, path) {
  const parts = String(path).split(".");
  let cur = obj;
  for (const part of parts) {
    if (!isObject(cur) && !Array.isArray(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function matchSubset(expected, actual) {
  if (expected === null || typeof expected !== "object") {
    return Object.is(expected, actual);
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((item, i) => matchSubset(item, actual[i]));
  }
  if (!isObject(actual)) return false;
  for (const [key, value] of Object.entries(expected)) {
    if (!matchSubset(value, actual[key])) return false;
  }
  return true;
}

export function honestProductVerdict(observed) {
  if (observed.json && typeof observed.json.ok === "boolean") {
    return observed.json.ok === true ? "accept" : "reject";
  }
  if (typeof observed.httpStatus === "number") {
    return observed.httpStatus >= 200 && observed.httpStatus < 400 ? "accept" : "reject";
  }
  return observed.exitCode === 0 ? "accept" : "reject";
}

export function naiveProductVerdict(observed, naiveRule) {
  if (naiveRule === "http-200") {
    return observed.httpStatus === 200 ? "accept" : "reject";
  }
  if (naiveRule === "html-body") {
    const body = observed.body || observed.json?.body || "";
    return /<[a-z][\s\S]*>/i.test(String(body)) ? "accept" : "reject";
  }
  return observed.exitCode === 0 ? "accept" : "reject";
}

export function evaluateCase(spec, observed) {
  const expectProduct = spec.expectProduct || {};
  const expectCorpus = spec.expectCorpus;
  const honest = honestProductVerdict(observed);
  const naive = naiveProductVerdict(observed, expectCorpus.naiveRule);
  const mismatches = [];

  if (expectCorpus.productVerdict !== honest) {
    mismatches.push({
      path: "productVerdict",
      expected: expectCorpus.productVerdict,
      actual: honest,
    });
  }
  if (expectProduct.exitCode !== undefined && expectProduct.exitCode !== observed.exitCode) {
    mismatches.push({
      path: "exitCode",
      expected: expectProduct.exitCode,
      actual: observed.exitCode,
    });
  }
  if (expectProduct.stdoutJson) {
    if (!observed.json || !matchSubset(expectProduct.stdoutJson, observed.json)) {
      mismatches.push({
        path: "stdoutJson",
        expected: expectProduct.stdoutJson,
        actual: observed.json,
      });
    }
  }
  if (expectProduct.destExists !== undefined && expectProduct.destExists !== Boolean(observed.destExists)) {
    mismatches.push({
      path: "destExists",
      expected: expectProduct.destExists,
      actual: observed.destExists,
    });
  }
  if (expectProduct.httpStatus !== undefined && expectProduct.httpStatus !== observed.httpStatus) {
    mismatches.push({
      path: "httpStatus",
      expected: expectProduct.httpStatus,
      actual: observed.httpStatus,
    });
  }
  if (expectProduct.kind !== undefined && expectProduct.kind !== observed.kind) {
    mismatches.push({
      path: "kind",
      expected: expectProduct.kind,
      actual: observed.kind,
    });
  }
  if (Array.isArray(expectProduct.missing) && !matchSubset(expectProduct.missing, getPath(observed.json, "missing"))) {
    mismatches.push({
      path: "missing",
      expected: expectProduct.missing,
      actual: observed.json?.missing,
    });
  }
  if (observed.timedOut) {
    mismatches.push({
      path: "timedOut",
      expected: false,
      actual: true,
    });
  }

  const honestCasePass = mismatches.length === 0;
  const naiveCasePass = naive === "accept";
  const falseAccept = naive === "accept" && honest === "reject";
  const falseReject = naiveCasePass === false && honestCasePass === true;

  return {
    id: spec.id,
    honestProductVerdict: honest,
    naiveProductVerdict: naive,
    honestCasePass,
    naiveCasePass,
    falseAccept,
    falseReject,
    mismatches,
    observed: {
      exitCode: observed.exitCode,
      json: observed.json,
      httpStatus: observed.httpStatus ?? null,
      kind: observed.kind ?? null,
      destExists: observed.destExists ?? null,
      timedOut: Boolean(observed.timedOut),
    },
  };
}
