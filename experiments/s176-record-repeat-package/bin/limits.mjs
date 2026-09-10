/** Documented capture/manifest limits for the S176 shared CLI. */
export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export const PARSER_TIMEOUT_MS = 30_000;
export const NEXT_RUN_SCHEMAS = Object.freeze([
  's176.next-run-manifest.v1',
  's163.next-run-manifest.v1',
]);
