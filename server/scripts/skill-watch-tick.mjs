import assert from "node:assert/strict";
import { isAbsolute, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { openCareStore } from "../lib/care-store.js";
import { drainCareMail } from "../lib/care-mail.js";
import { FROM, ownSender, resend } from "../lib/resend.js";
import { fetchPublicBounded } from "../lib/agent-readiness/bounded-fetch.js";
import { githubRepository, gitShaPattern, readPinnedScanner, scanRelease, validTag, validateReleaseTree } from "./skill-watch-release.mjs";

const api = "https://api.github.com";
const repositoryLimit = 8;
const releaseLimit = 10;
const requestLimit = 45;
const metadataBytes = 1024 * 1024;
const mailKind = "skill_watch_alert";

class Deferred extends Error {}

export function githubReader({ exchange = fetchPublicBounded, signal = AbortSignal.timeout(120_000), lookup } = {}) {
  let requests = 0;
  return {
    get requests() { return requests; },
    async read(path, maxBytes = metadataBytes) {
      if (signal.aborted || requests >= requestLimit) throw new Deferred("request_budget");
      const url = new URL(api + path);
      assert(url.origin === api && url.pathname.startsWith("/repos/"));
      requests++;
      const result = await exchange(url, {
        allowedOrigin: api, maxRedirects: 0, maxBytes, timeoutMs: 12_000, signal, lookup,
        headers: { accept: "application/vnd.github+json" },
      });
      if (result.status === 403 || result.status === 429) throw new Deferred("upstream_refused_or_limited");
      assert(result.status === 200 && !result.oversize && !result.redirects.length, "release response unavailable");
      return JSON.parse(result.body);
    },
  };
}

async function releaseCommit(read, root, release) {
  const ref = await read(`${root}/git/ref/tags/${encodeURIComponent(release.tag_name)}`);
  assert(ref.ref === `refs/tags/${release.tag_name}`, "release tag differs");
  let object = ref.object;
  for (let depth = 0; object?.type === "tag" && depth < 3; depth++) {
    assert(gitShaPattern.test(object.sha), "invalid annotated tag");
    const tag = await read(`${root}/git/tags/${object.sha}`);
    assert(tag.sha === object.sha && (depth > 0 || tag.tag === release.tag_name), "annotated tag differs");
    object = tag.object;
  }
  assert(object?.type === "commit" && gitShaPattern.test(object.sha), "release must resolve to a commit");
  if (typeof release.target_commitish === "string" && gitShaPattern.test(release.target_commitish)) {
    assert(release.target_commitish === object.sha, "release and tag commit differ");
  }
  return object.sha;
}

async function staticReport(read, root, sha, source) {
  const commit = await read(`${root}/git/commits/${sha}`);
  assert(commit.sha === sha && gitShaPattern.test(commit.tree?.sha), "commit differs");
  const tree = await read(`${root}/git/trees/${commit.tree.sha}?recursive=1`);
  assert(tree.sha === commit.tree.sha && tree.truncated === false, "release tree unavailable");
  const entries = validateReleaseTree(tree.tree);
  return scanRelease({ source, entries, readBlob: async ({ sha, size }) => {
    const blob = await read(`${root}/git/blobs/${sha}`, 4 * Math.ceil(size / 3) * 2 + 1024);
    assert(blob.sha === sha && blob.size === size && blob.encoding === "base64" && typeof blob.content === "string", "blob metadata differs");
    return Buffer.from(blob.content, "base64");
  } });
}

// The clock and transport can be passed by a private test. The cron entry uses
// today's clock and the normal admitted public GitHub reader.
export async function runSkillWatchTick({ watch, source, at = new Date(), upstream = githubReader() }) {
  const counts = { repositories: 0, published: 0, scanned: 0, observed: 0, alertsQueued: 0, issues: [] };
  const rows = await watch.scheduledRepositories(at, repositoryLimit + 1);
  if (rows.length > repositoryLimit) counts.issues.push("repository_limit");
  for (const { repository, since } of rows.slice(0, repositoryLimit)) {
    const name = githubRepository(repository);
    if (!name) { counts.issues.push("unsupported_repository"); continue; }
    counts.repositories++;
    const root = `/repos/${name}`;
    try {
      const releases = await upstream.read(`${root}/releases?per_page=${releaseLimit}`);
      assert(Array.isArray(releases) && releases.length <= releaseLimit, "invalid release listing");
      const published = [];
      for (const release of releases) {
        if (release.draft !== false || release.published_at == null) continue;
        const date = new Date(release.published_at);
        assert(Number.isFinite(date.getTime()) && validTag(release.tag_name), "invalid published release");
        published.push({ release, date });
      }
      published.sort((a, b) => a.date - b.date || a.release.id - b.release.id);
      if (releases.length === releaseLimit && (!published.length || published[0].date >= since)) counts.issues.push("release_history_limit");
      for (const { release, date } of published) {
        if (date < since || date > at) continue;
        counts.published++;
        const commit = await releaseCommit(upstream.read, root, release);
        const facts = { repository, commit, publishedAt: date };
        if (!await watch.needsRelease(facts)) continue;
        const report = await staticReport(upstream.read, root, commit, source);
        counts.scanned++;
        const result = await watch.observeRelease({ ...facts, report });
        counts.observed += result.observed;
        counts.alertsQueued += result.alertsQueued;
      }
    } catch (error) {
      counts.issues.push(error instanceof Deferred ? error.message : "release_not_received");
      if (error instanceof Deferred) break;
    }
  }
  return { ...counts, requests: upstream.requests };
}

export async function runConfiguredSkillWatchTick({ at, upstream } = {}) {
  const { SKILLGUARD_SOURCE: scanner, SDS_CARE_ACCESS_SECRET: secret = "", SDS_CARE_CHECKOUT: checkout } = process.env;
  const replyTo = process.env.RESEND_REPLY_TO || "contact@samedaydesk.com";
  if (checkout !== "1" || !scanner || !isAbsolute(scanner) || Buffer.byteLength(secret) < 32 || !resend || !ownSender(replyTo)) {
    return { ok: false, stage: "configuration" };
  }
  let source;
  try { source = await readPinnedScanner(scanner); }
  catch { return { ok: false, stage: "scanner_pin" }; }
  const store = openCareStore();
  if (!store) return { ok: false, stage: "configuration" };
  try {
    let scan;
    try { scan = await runSkillWatchTick({ watch: store.watch, source, at, upstream }); }
    catch { scan = { issues: ["care_read_failed"] }; }
    let mail;
    try {
      mail = await drainCareMail({ store, secret, from: FROM, replyTo, kind: mailKind, send: (...args) => resend.emails.send(...args) });
    } catch { mail = { unknown: true }; }
    return { ok: !scan.issues.length && !mail.deferred && !mail.unknown, scan, mail };
  } finally { await store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href) {
  // The native cron command is finite even if the database or mail reply hangs.
  // Unknown mail effects remain covered by the existing claim/idempotency key.
  const timer = setTimeout(() => {
    process.stdout.write(JSON.stringify({ ok: false, stage: "deadline", effects: "receive_existing_claims" }) + "\n", () => process.exit(1));
  }, 240_000);
  try {
    const result = await runConfiguredSkillWatchTick();
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ ok: false, stage: "runtime", effects: "receive_existing_claims" }));
    process.exitCode = 1;
  } finally { clearTimeout(timer); }
}
