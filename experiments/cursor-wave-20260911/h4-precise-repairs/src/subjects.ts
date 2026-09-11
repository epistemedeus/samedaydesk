import { readFileSync } from "node:fs";
import { SUBJECT_JOB_IDS } from "./constants.ts";
import { SDS_CATALOG } from "./paths.ts";
import type { SubjectJobId } from "./types.ts";

export type RepairSubject = {
  id: SubjectJobId;
  title: string;
  paidWrapper: false;
  purchaseAuthority: false;
  role: "repair-subject";
};

export function readUsefulJobsCatalog(): {
  jobs: Array<{ id: string; title: string }>;
  runtime?: { purchaseAuthority?: boolean };
} {
  return JSON.parse(readFileSync(SDS_CATALOG, "utf8"));
}

export function listRepairSubjects(): RepairSubject[] {
  const catalog = readUsefulJobsCatalog();
  const byId = new Map(catalog.jobs.map((job) => [job.id, job]));
  return SUBJECT_JOB_IDS.map((id) => {
    const row = byId.get(id);
    if (!row) {
      throw new Error(`catalog missing repair subject ${id}`);
    }
    return {
      id,
      title: row.title,
      paidWrapper: false,
      purchaseAuthority: false,
      role: "repair-subject",
    };
  });
}

export function requireSubject(id: unknown): SubjectJobId {
  if (typeof id === "string" && (SUBJECT_JOB_IDS as readonly string[]).includes(id)) {
    return id as SubjectJobId;
  }
  throw new Error(
    `unknown repair subject ${String(id)}; expected one of ${SUBJECT_JOB_IDS.join(", ")}`,
  );
}
