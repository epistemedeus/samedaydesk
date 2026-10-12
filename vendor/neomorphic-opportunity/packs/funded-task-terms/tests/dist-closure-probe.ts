import { canonicalize } from "../dist/canonical.js";
import { isPlainObject } from "../dist/canonical.mjs";
import { TERMS_VERSION_PREFIX, hashTermsVersion } from "../dist/hash.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;

export const canonicalBody = canonicalize({ z: 1, a: "term" });
export const digest = hashTermsVersion({ b: 1, a: "term" });
export const prefix: "sha256:" = TERMS_VERSION_PREFIX;

export function narrowed(value: unknown): Record<string, unknown> | undefined {
  if (isPlainObject(value)) return value;
  return undefined;
}

type _emittedDeclarationsResolveRuntimeModules = [
  Assert<IsAny<Parameters<typeof canonicalize>[0]> extends false ? true : false>,
  Assert<IsAny<ReturnType<typeof canonicalize>> extends false ? true : false>,
  Assert<IsAny<ReturnType<typeof hashTermsVersion>> extends false ? true : false>,
  Assert<typeof TERMS_VERSION_PREFIX extends "sha256:" ? true : false>,
];
