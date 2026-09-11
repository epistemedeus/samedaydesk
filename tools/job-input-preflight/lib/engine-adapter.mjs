/**
 * Injected engine adapter. Preflight must not run useful-jobs / F08 wrappers.
 * W5-D01 binds runPaidOffer after ok:true. Tested pin is SDS52 aeef964f.
 */
export function createNullEngineAdapter() {
  const calls = [];
  return {
    name: "null-not-invoked",
    calls,
    invoke(request) {
      calls.push(request);
      throw new Error("job-input-preflight must not invoke the useful-jobs engine");
    },
  };
}

export const LATER_ENGINE_BINDING = Object.freeze({
  owner: "W5-D01",
  testedImplementation: {
    repo: "epistemedeus/samedaydesk",
    sha: "aeef964fa188443078958d9d6d393afae1d542ee",
    ref: "fable/f08-paid-wrappers",
    pr: 52,
    entry: "server/paid-useful-jobs/lib/wrapper.mjs#runPaidOffer",
  },
  publishedCli: ["node", "bin/useful-jobs.mjs", "run", "<job-id>"],
  f08Wrapper: "server/paid-useful-jobs/ (do not edit from this package)",
  remaining:
    "D01 Wave5 export was not published at test time. Pass toWrapperRequest(preflight) into runPaidOffer at the tested pin. That pin's inspectSample misses inline JSON strings; this adapter refuses them. D01 1 MiB cap still applies after bind. This package never claims spend, tool cost, or settlement.",
});
