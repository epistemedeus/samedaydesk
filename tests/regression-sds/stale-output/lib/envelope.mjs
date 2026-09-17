import { BOUNDARY, FEATURE } from "./pin.mjs";
import { WRITE_BOUNDARY } from "./root.mjs";

export function envelope({
  command,
  status,
  ok,
  evidence = [],
  error = null,
  result = null,
  extra = {},
}) {
  return {
    ok: Boolean(ok),
    schema: "samedaydesk.regression-sds.stale-output.report.v1",
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
    ...extra,
  };
}
