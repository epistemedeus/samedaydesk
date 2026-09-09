import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/for-agents-cold-read",
);

export const APEX_FOR_AGENTS_URL = "https://samedaydesk.com/for-agents";
export const AGENTS_LLMS_URL = "https://agents.samedaydesk.com/llms.txt";
export const AGENTS_SKILLS_URL =
  "https://agents.samedaydesk.com/.well-known/skills/index.json";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(name) {
  return sha256Bytes(readFileSync(join(FIXTURE_DIR, name)));
}

export function loadCaptureMeta() {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, "capture.json"), "utf8"));
}

/**
 * Resolve a free /for-agents cold-read surface.
 * Prefer apex when healthy; on TLS/connect failure, use agents-host alternates
 * or offline fixtures. Never pays. Never invents demand.
 *
 * @param {{ fetchApex?: () => Promise<{ok:boolean,status?:number|null,errorClass?:string|null}>, preferFixture?: boolean }} [opts]
 */
export async function resolveForAgentsColdRead(opts = {}) {
  const meta = loadCaptureMeta();
  const fetchApex =
    opts.fetchApex ||
    (async () => {
      try {
        const res = await fetch(APEX_FOR_AGENTS_URL, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });
        return { ok: res.ok, status: res.status, errorClass: null };
      } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        const errorClass = /eof|ECONNRESET|tls|SSL|closed/i.test(msg)
          ? "tls_or_connect_failure"
          : "fetch_failure";
        return { ok: false, status: null, errorClass, message: msg };
      }
    });

  if (!opts.preferFixture) {
    const apex = await fetchApex();
    if (apex.ok) {
      return {
        outcome: "apex_ok",
        surface: APEX_FOR_AGENTS_URL,
        paid: false,
        apex,
        alternatesUsed: [],
      };
    }
  }

  const llmsSha = sha256File("agents-llms.txt");
  const skillsSha = sha256File("skills-index.json");
  const expectedLlms = meta.freeAlternates.find((a) => a.id === "agents_llms");
  const expectedSkills = meta.freeAlternates.find(
    (a) => a.id === "agents_skills_index",
  );

  return {
    outcome: "fallback_agents_host_or_fixture",
    surface: AGENTS_LLMS_URL,
    paid: false,
    apex: opts.preferFixture
      ? meta.apexObserved
      : undefined,
    alternatesUsed: [
      {
        id: "agents_llms",
        url: AGENTS_LLMS_URL,
        fixtureSha256: llmsSha,
        matchesCapture: llmsSha === expectedLlms.sha256,
      },
      {
        id: "agents_skills_index",
        url: AGENTS_SKILLS_URL,
        fixtureSha256: skillsSha,
        matchesCapture: skillsSha === expectedSkills.sha256,
      },
    ],
    recovery:
      "Use agents.samedaydesk.com llms.txt + skills index (or offline fixtures) for unpaid Job 5 discovery when apex Hostinger TLS fails. No merchant charge.",
  };
}
