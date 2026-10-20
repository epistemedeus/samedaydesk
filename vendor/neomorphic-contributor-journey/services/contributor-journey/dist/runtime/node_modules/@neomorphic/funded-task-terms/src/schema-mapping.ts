/**
 * F17 funded-task-terms is a disclosure schema.
 * F01 hashes `neomorphic.earned-work.terms.v1` with the same hashTermsVersion function.
 * Unlike schemas are not equal; do not force their hashes equal.
 */
import { SCHEMA_ID } from "./constants.js";

export const FUNDED_TASK_TERMS_SCHEMA = SCHEMA_ID;
export const EARNED_WORK_TERMS_SCHEMA = "neomorphic.earned-work.terms.v1" as const;
export const UNLIKE_TERMS_SCHEMAS_ARE_NOT_EQUAL = true;

/** F01 admits maxRevisions 0..1. This pack's maxCorrections ceiling is independent. */
export const EARNED_WORK_MAX_REVISIONS_CAP = 1 as const;
