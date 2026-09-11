export const D03_PIN = {
  repo: "epistemedeus/samedaydesk",
  sha: "58cba6324c1d9793d344bc13154b8b2380e8166f",
  module: "tools/job-output-atomicity/index.mjs",
  exportName: "verifyComplete",
  cli: "tools/job-output-atomicity/bin/verify-complete.mjs",
  note: "W5-D03 current pin. This exporter does not vendor that kernel.",
};

export function completenessRecord(result = null) {
  if (!result) {
    return {
      bound: false,
      pin: D03_PIN,
      note: "D03 verifyComplete not injected. Catalog job/output correspondence is local. F08 receipt completeness stays on W5-D03 at this pin.",
    };
  }
  return {
    bound: true,
    pin: D03_PIN,
    ok: result.ok === true,
    classification: result.classification || null,
    code: result.code || null,
  };
}
