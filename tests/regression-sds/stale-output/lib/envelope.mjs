import { BOUNDARY, FEATURE } from "./pin.mjs";

export function envelope({
  command,
  status,
  ok,
  evidence = [],
  error = null,
  result = null,
}) {
  return {
    ok: Boolean(ok),
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
    evidence,
    error,
    boundary: { ...BOUNDARY },
    result,
  };
}
