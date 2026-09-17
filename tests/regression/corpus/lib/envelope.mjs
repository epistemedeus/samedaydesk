export function envelope({
  ok,
  command,
  status,
  error = null,
  result = null,
  feature = null,
  evidence = [],
  dryRun = false,
  boundary = { paymentSent: false, toolsCalled: false },
} = {}) {
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
    dryRun,
    status,
    feature,
    evidence,
    error,
    boundary: {
      paymentSent: Boolean(boundary.paymentSent),
      toolsCalled: Boolean(boundary.toolsCalled),
    },
    result,
  };
}

export function failError(code, message, detail) {
  const error = { code, message };
  if (detail !== undefined) error.detail = detail;
  return error;
}

export function writeJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}
