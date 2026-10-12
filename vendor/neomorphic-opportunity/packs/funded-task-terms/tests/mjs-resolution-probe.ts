import { canonicalize, isPlainObject } from "../src/canonical.mjs";
import {
  TERMS_VERSION_PREFIX,
  hashTermsIgnoringIntegerKey,
  hashTermsVersion,
  isTermsVersionHash,
} from "../src/hash.mjs";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;

export const canonicalBody = canonicalize({ z: 1, a: "term" });
export const digest = hashTermsVersion({ b: 1, a: "term" });
export const ignored = hashTermsIgnoringIntegerKey({ termsVersion: 7, a: "term" });
export const prefix: "sha256:" = TERMS_VERSION_PREFIX;
export const hashed: boolean = isTermsVersionHash(digest);

export function narrowed(value: unknown): Record<string, unknown> | undefined {
  if (isPlainObject(value)) return value;
  return undefined;
}

type _resolutionIsTyped = [
  Assert<IsAny<Parameters<typeof canonicalize>[0]> extends false ? true : false>,
  Assert<IsAny<ReturnType<typeof canonicalize>> extends false ? true : false>,
  Assert<IsAny<Parameters<typeof hashTermsVersion>[0]> extends false ? true : false>,
  Assert<IsAny<ReturnType<typeof hashTermsVersion>> extends false ? true : false>,
  Assert<IsAny<ReturnType<typeof hashTermsIgnoringIntegerKey>> extends false ? true : false>,
  Assert<typeof TERMS_VERSION_PREFIX extends "sha256:" ? true : false>,
  Assert<ReturnType<typeof canonicalize> extends string ? true : false>,
  Assert<ReturnType<typeof hashTermsVersion> extends string ? true : false>,
];
