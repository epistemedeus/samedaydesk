import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PACK_ROOT } from "./paths.ts";

export const NEO_DEFECT_NOT_PATCHED_ON_SDS = "neo-defect-not-patched-on-sds" as const;

/** MONITOR Neo residuals that this pack must not claim as SDS patches. */
export const NEO_NOT_PATCHED_ON_SDS_IDS = Object.freeze([
  "M-termsVersion",
  "M-F07",
  "F01",
  "F07",
  "termsVersion",
] as const);

export type NeoNotPatchedOnSdsId = (typeof NEO_NOT_PATCHED_ON_SDS_IDS)[number];

export type NeoNotPatchedRejection = {
  ok: false;
  rejected: true;
  code: typeof NEO_DEFECT_NOT_PATCHED_ON_SDS;
};

const NEO_ID_SET = new Set<string>(NEO_NOT_PATCHED_ON_SDS_IDS);

/** Phrase built in parts so this file is not itself a positive pack claim. */
const PATCHED_ON_SDS_PHRASE = ["patched", "on", "SDS"].join(" ");

const SUBJECT_RE = /\b(F01|F07|termsVersion|M-termsVersion|M-F07)\b/i;

function isNeoNotPatchedId(id: string): boolean {
  return NEO_ID_SET.has(id);
}

/**
 * Guard for claims that a Neo F01/F07/termsVersion residual landed on SDS.
 * Always rejects for those ids.
 */
export function assertNotPatchedOnSds(id: string): NeoNotPatchedRejection {
  if (!isNeoNotPatchedId(id)) {
    throw new Error(`assertNotPatchedOnSds: ${id} is not a Neo F01/F07/termsVersion residual`);
  }
  return {
    ok: false,
    rejected: true,
    code: NEO_DEFECT_NOT_PATCHED_ON_SDS,
  };
}

function neutralizeNegativeClaims(text: string): string {
  const phrase = PATCHED_ON_SDS_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const drop = [
    new RegExp(`\\bnot[- ]${phrase}\\b`, "gi"),
    new RegExp(`\\bnever[- ]${phrase}\\b`, "gi"),
    new RegExp(`\\bcannot be ${phrase}\\b`, "gi"),
    new RegExp(`\\bmust not(?: be)? ${phrase}\\b`, "gi"),
    new RegExp(`\\bdo not (?:claim|write|say)[^\\n.]{0,120}${phrase}\\b`, "gi"),
    new RegExp(`\\bclaiming[^\\n.]{0,120}${phrase}\\b`, "gi"),
  ];
  let out = text;
  for (const re of drop) out = out.replace(re, " ");
  return out;
}

/** True when text claims F01/F07/termsVersion landed as an SDS patch. */
export function textClaimsNeoPatchedOnSds(text: string): boolean {
  if (!SUBJECT_RE.test(text)) return false;
  const rest = neutralizeNegativeClaims(text);
  return rest.toLowerCase().includes(PATCHED_ON_SDS_PHRASE.toLowerCase());
}

export type NeoPatchedClaimHit = {
  file: string;
  kind: "src" | "brief";
};

export type NeoPatchedScan =
  | { ok: true; rejected: false; hits: []; files: string[] }
  | {
      ok: false;
      rejected: true;
      code: typeof NEO_DEFECT_NOT_PATCHED_ON_SDS;
      hits: NeoPatchedClaimHit[];
      files: string[];
    };

function listPackTexts(): { rel: string; kind: "src" | "brief"; text: string }[] {
  const rows: { rel: string; kind: "src" | "brief"; text: string }[] = [];
  const srcDir = join(PACK_ROOT, "src");
  for (const name of readdirSync(srcDir).filter((n) => n.endsWith(".ts"))) {
    rows.push({
      rel: `src/${name}`,
      kind: "src",
      text: readFileSync(join(srcDir, name), "utf8"),
    });
  }
  const briefsDir = join(PACK_ROOT, "briefs");
  if (existsSync(briefsDir)) {
    for (const name of readdirSync(briefsDir).filter((n) => n.endsWith(".md"))) {
      rows.push({
        rel: `briefs/${name}`,
        kind: "brief",
        text: readFileSync(join(briefsDir, name), "utf8"),
      });
    }
  }
  return rows;
}

/**
 * Read pack src + briefs. Fail if a file claims F01/F07/termsVersion
 * residuals landed as SDS patches.
 */
export function scanPackClaimsNeoPatched(): NeoPatchedScan {
  const files: string[] = [];
  const hits: NeoPatchedClaimHit[] = [];
  for (const row of listPackTexts()) {
    files.push(row.rel);
    if (textClaimsNeoPatchedOnSds(row.text)) {
      hits.push({ file: row.rel, kind: row.kind });
    }
  }
  if (hits.length > 0) {
    return {
      ok: false,
      rejected: true,
      code: NEO_DEFECT_NOT_PATCHED_ON_SDS,
      hits,
      files,
    };
  }
  return { ok: true, rejected: false, hits: [], files };
}
