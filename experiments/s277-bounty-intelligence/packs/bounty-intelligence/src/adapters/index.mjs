import * as moltjobs from "./moltjobs.mjs";
import * as frantic from "./frantic.mjs";
import * as githubIssues from "./github-issues.mjs";
import * as neomorphic from "./neomorphic-schedule.mjs";
import * as moltbook from "./moltbook-inaccessible.mjs";

export const adapters = {
  [moltjobs.name]: moltjobs,
  [frantic.name]: frantic,
  [githubIssues.name]: githubIssues,
  [neomorphic.name]: neomorphic,
  [moltbook.name]: moltbook,
};

export const PRIMARY_ADAPTERS = [moltjobs, frantic, githubIssues, neomorphic];
export const ALL_ADAPTERS = [...PRIMARY_ADAPTERS, moltbook];

export function listAdapters() {
  return ALL_ADAPTERS.map((a) => ({
    name: a.name,
    vendorAdapter: a.vendorAdapter,
    liveUrl: a.liveUrl,
    inaccessible: a.name === "moltbook",
    labSchedule: a.name === "neomorphic-schedule",
  }));
}
