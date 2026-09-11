/**
 * Injected engine adapter. Preflight must not run useful-jobs / F08 wrappers.
 * Later integration (Root) binds a real runner after ok:true.
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
  owner: "Root",
  publishedCli: ["node", "bin/useful-jobs.mjs", "run", "<job-id>"],
  f08Wrapper: "server/paid-useful-jobs/ (do not edit from this package)",
  note: "Call only after preflight ok:true. This package never claims spend, tool cost, or settlement.",
});
