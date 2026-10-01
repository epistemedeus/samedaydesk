import { readFileSync } from "node:fs";
import { hashTermsVersion } from "./hash.js";
import { parseTerms } from "./validate.js";

export type ValidateFileSuccess = {
  ok: true;
  termsVersion: string;
  canonicalHash: string;
  taskId: string;
  schema: string;
};

export function validateTermsFile(filePath: string): ValidateFileSuccess {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`failed to read terms JSON: ${message}`);
  }
  const parsed = parseTerms(raw);
  if (!parsed.ok) {
    const err = new Error(parsed.message) as Error & {
      code: string;
      path: Array<string | number>;
    };
    err.code = parsed.code;
    err.path = parsed.path;
    throw err;
  }
  const termsVersion = hashTermsVersion(parsed.value);
  return {
    ok: true,
    termsVersion,
    canonicalHash: termsVersion,
    taskId: parsed.value.taskId,
    schema: parsed.value.schema,
  };
}
