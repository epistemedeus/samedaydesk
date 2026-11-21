import { isOrderId } from "./care-contract.js";

const REPOSITORY = "epistemedeus/samedaydesk";
const WORKFLOW = "keep-it-working-windows.yml";
const SYSTEMS = {
  "windows-latest": "Windows", "macos-latest": "macOS", "ubuntu-24.04": "Linux",
};
export const isSentinelSpec = (spec) => typeof spec === "string" && /^sentinel-ir-mcp@[0-9]+\.[0-9]+\.[0-9]+$/.test(spec);
const titleOf = (period) => `Keep it working ${period.task_ref}`;
const runId = (run) => Number.isSafeInteger(run?.id) && run.id > 0 ? run.id : null;
const knownRun = (run, period, branch) => runId(run) && run.event === "workflow_dispatch" &&
  run.head_branch === branch && run.display_title === titleOf(period) &&
  Date.parse(run.created_at) >= new Date(period.dispatch_at).getTime() - 60_000;

export function sentinelReportingChecks(jobs) {
  if (!Array.isArray(jobs) || jobs.length !== 3) return null;
  const rows = [];
  for (const [runner, os] of Object.entries(SYSTEMS)) {
    const job = jobs.find((entry) => entry.name === `release-check (${runner})`);
    const check = job?.steps?.find((step) => step.name === "Release check");
    if (job?.status !== "completed" || !check || !["success", "failure"].includes(check.conclusion)) return null;
    rows.push({ os, passed: check.conclusion === "success",
      note: check.conclusion === "success" ? "Installed the package and ran the sample through both client configurations."
        : "The scripted package or client check did not complete successfully." });
  }
  return rows;
}

export function sentinelReportArtifacts(artifacts, run) {
  if (!Array.isArray(artifacts) || !runId(run) || !Number.isSafeInteger(run.run_attempt)) return false;
  return Object.keys(SYSTEMS).every((runner) => {
    const name = `release-check-report-${runner}-attempt-${run.run_attempt}`;
    const matches = artifacts.filter((entry) => entry.name === name);
    return matches.length === 1 && matches[0].expired === false && matches[0].size_in_bytes > 0 &&
      matches[0].workflow_run?.id === run.id && matches[0].workflow_run.head_sha === run.head_sha &&
      typeof run.head_sha === "string" && /^[0-9a-f]{40}$/.test(run.head_sha);
  });
}

export function githubSentinel({ token, branch = "main", fetcher = fetch }) {
  async function request(path, opts = {}) {
    const response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/actions/${path}`, {
      ...opts, redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10",
        Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`GitHub release check HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  return {
    branch,
    async dispatch(period) {
      if (!isSentinelSpec(period.package_spec) || !isOrderId(period.task_ref)) throw new Error("Invalid approved Sentinel check");
      const result = await request(`workflows/${WORKFLOW}/dispatches`, { method: "POST", body: JSON.stringify({
        ref: branch, inputs: { package: period.package_spec, receipt: period.task_ref },
      }) });
      return Number.isSafeInteger(result?.workflow_run_id) ? result.workflow_run_id : null;
    },
    async runs(period) {
      const params = new URLSearchParams({ branch, event: "workflow_dispatch", per_page: "100",
        created: `>=${new Date(new Date(period.dispatch_at).getTime() - 60_000).toISOString()}` });
      return (await request(`workflows/${WORKFLOW}/runs?${params}`)).workflow_runs;
    },
    run: (id) => request(`runs/${id}`),
    async jobs(id, attempt) { return (await request(`runs/${id}/attempts/${attempt}/jobs?per_page=10`)).jobs; },
    async artifacts(id) { return (await request(`runs/${id}/artifacts?per_page=100`)).artifacts; },
  };
}

export async function tickSentinel({ store, github, orderId, spec, now = () => new Date() }) {
  if (!isOrderId(orderId) || !isSentinelSpec(spec)) throw new Error("Use a paid order and an exact approved Sentinel version");
  const period = await store.admitSentinel(orderId, { spec, at: now() });
  if (!period) return "nothing_due";
  if (!period.dispatch_at) {
    const marked = await store.markSentinelDispatch(orderId, period.lease, now());
    if (!marked) return "owned_elsewhere";
    // Record the attempt before the provider call. On an ambiguous response a
    // later tick may recover the exact run, but it must not POST again.
    try {
      const id = await github.dispatch(marked);
      if (id) await store.recordSentinelRun(orderId, period.lease, id);
      return "submitted";
    } catch { return "dispatch_needs_readback"; }
  }
  let run;
  if (period.run_id) {
    run = await github.run(Number(period.run_id));
    if (!knownRun(run, period, github.branch)) return "run_mismatch";
  } else {
    const matches = (await github.runs(period)).filter((entry) => knownRun(entry, period, github.branch));
    if (matches.length !== 1) {
      if (matches.length > 1 || now().getTime() - new Date(period.dispatch_at).getTime() > 45 * 60_000) return "dispatch_needs_review";
      return "awaiting_run";
    }
    [run] = matches;
    await store.recordSentinelRun(orderId, period.lease, run.id);
  }
  if (run.status !== "completed") return "running";
  if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) return "report_needs_review";
  const checks = sentinelReportingChecks(await github.jobs(run.id, run.run_attempt));
  if (!checks) return "report_needs_review";
  if (!sentinelReportArtifacts(await github.artifacts(run.id), run)) return "report_needs_review";
  return await store.reportSentinel(orderId, period.lease, run.id, checks) ? "reported" : "owned_elsewhere";
}
