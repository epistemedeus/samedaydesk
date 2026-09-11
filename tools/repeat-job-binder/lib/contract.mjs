/**
 * W5-D09 binder contract. Thin consumer of PR51 useful-jobs / optional D01
 * wrapper CLI. Not a second execution kernel.
 */
export const BINDER_CONTRACT = Object.freeze({
  id: "W5-D09",
  feature: "repeat-job-binder",
  schema: "w5.repeat-job-binder.second-run.v1",
  termsSchema: "w5.repeat-job-binder.terms.v1",
  cli: "node bin/bind.mjs",
  entry: "bin/bind.mjs",
  status: Object.freeze([
    "actionable",
    "informational",
    "analysis-refused",
    "analysis-no-change",
  ]),
  transport: Object.freeze(["ok", "failed"]),
  analysisOutcome: Object.freeze(["completed", "refused", "no-change"]),
  frozenSlots: Object.freeze(["before", "after", "used"]),
  refuseCodes: Object.freeze([
    "nonzero-engine-exit",
    "missing-engine-outputs",
    "engine-failed",
    "previous-output-reused",
    "reused-output-path",
    "unchecked-next-manifest",
    "family-parser-mismatch",
    "after-digest-unchanged",
    "input-digest-mismatch",
  ]),
  d01Binding: Object.freeze({
    integrationOwner: "W5-D01",
    pinRepo: "epistemedeus/samedaydesk",
    pinSha: "aeef964fa188443078958d9d6d393afae1d542ee",
    pinRef: "fable/f08-paid-wrappers",
    pinPr: 52,
    cli: "server/paid-useful-jobs/bin/cli.mjs",
    note: "Optional --paid-wrapper-bin consumes that CLI. Default catalog path is the PR51 useful-jobs CLI the wrapper also runs. D01 may amend the wrapper; this binder does not claim a future sibling.",
  }),
});
