import { BOUNDARY, FEATURE, WRITE_BOUNDARY } from "./cite.mjs";

export function envelope({
  command,
  status,
  ok,
  evidence = [],
  error = null,
  result = null,
  cases = null,
}) {
  const body = {
    ok: Boolean(ok),
    schema: "samedaydesk.regression-sds.unpaid-402.report.v1",
    schemaVersion: 1,
    command,
    repo: "samedaydesk",
    checkedAt: new Date().toISOString(),
    node: {
      wanted: "22.x",
      actual: process.version,
      major: Number(process.versions.node.split(".")[0]),
    },
    status,
    feature: FEATURE,
    writeBoundary: WRITE_BOUNDARY,
    evidence,
    error,
    boundary: { ...BOUNDARY },
    result,
  };
  if (cases) body.cases = cases;
  return body;
}
