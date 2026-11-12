// Origin- and scope-bound tenant credential for the machine gateway.
//
// Sources, in the order a caller can name them (exactly one per run):
// - --credential-file ABS: an existing 0600 regular file, read through
//   client-io privateText (O_NOFOLLOW, nlink 1, no group or other bits). This
//   is the same file the existing direct client takes as --token-file
//   (server/vendor/machine-gateway/bin/caller.mjs) and that bin/enroll.mjs
//   writes.
// - --credential-stdin: the first line of stdin.
// No environment variable is read: the existing gateway client contract names
// none. A secret is never accepted in argv (cli.mjs refuses secret-named flags
// and this module never reads a value from a flag).
//
// The credential is bound to one origin and one scope (the gateway mount
// path). headerFor(url) returns the bearer only for that exact origin and
// path prefix. client-io sends with redirect: "manual" and the CLI treats any
// 3xx as origin_refused, so a redirect never carries the credential anywhere.
// toJSON and inspect expose only a short digest of the value.
import { createHash } from "node:crypto";
import { privateText } from "../../../server/vendor/machine-gateway/bin/client-io.mjs";
import { CliError } from "./errors.mjs";

export const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
export const CREDENTIAL_SCOPE = "machine-gateway.tenantBearer";
export const CREDENTIAL_SOURCES = Object.freeze([
  Object.freeze({ id: "file", flag: "credential-file", description: "Absolute path to an existing 0600 file holding the tenant bearer (same file as the direct client's --token-file, written by the operator's enroll step)." }),
  Object.freeze({ id: "stdin", flag: "credential-stdin", description: "First line of stdin. Cannot be combined with --input-file -." }),
]);
export const CREDENTIAL_FLAGS = Object.freeze({
  "credential-file": { type: "string", required: false, description: "Absolute path to an existing 0600 tenant credential file. The value is never printed." },
  "credential-stdin": { type: "boolean", required: false, description: "Read the tenant credential from the first line of stdin. The value is never printed." },
});
const STDIN_CREDENTIAL_LIMIT = 1024;

const VALUE = Symbol("credential-value");

export class BoundCredential {
  constructor(value, { origin, scopePath, source }) {
    Object.defineProperty(this, VALUE, { value, enumerable: false });
    this.origin = origin;
    this.scope = CREDENTIAL_SCOPE;
    this.scopePath = scopePath;
    this.source = source;
    this.binding = createHash("sha256").update(value).digest("hex");
    Object.freeze(this);
  }
  // Bearer for this exact origin and gateway path, otherwise null.
  tokenFor(url) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.origin !== this.origin) return null;
    if (!(parsed.pathname === this.scopePath || parsed.pathname.startsWith(`${this.scopePath}/`))) return null;
    return this[VALUE];
  }
  toJSON() { return { scope: this.scope, origin: this.origin, scopePath: this.scopePath, source: this.source, bindingSha256Prefix: this.binding.slice(0, 12), value: "[redacted]" }; }
  [Symbol.for("nodejs.util.inspect.custom")]() { return this.toJSON(); }
}

async function firstStdinLine(stdin) {
  if (!stdin || stdin.isTTY) throw new CliError("credential_unavailable", { source: "stdin" });
  let text = "";
  for await (const chunk of stdin) {
    text += Buffer.from(chunk).toString("utf8");
    if (text.includes("\n")) break;
    if (text.length > STDIN_CREDENTIAL_LIMIT) throw new CliError("credential_invalid", { source: "stdin" });
  }
  return text.split("\n")[0].replace(/\r$/, "");
}

// Returns null when no source was named. Throws typed errors otherwise; the
// evidence never contains the value or file contents.
export async function loadCredential(flags, { origin, scopePath, stdin }) {
  const named = ["credential-file", "credential-stdin"].filter(name => flags[name] !== undefined);
  if (named.length === 0) return null;
  if (named.length > 1) throw new CliError("invalid_arguments", { reason: "one credential source only" });
  let value;
  if (flags["credential-file"] !== undefined) {
    try { value = privateText(flags["credential-file"], 512).trim(); }
    catch (error) {
      if (error?.message === "absolute_private_file_required") throw new CliError("absolute_private_file_required", { flag: "credential-file" });
      throw new CliError("credential_unavailable", { source: "file", reason: error?.code === "ENOENT" ? "missing" : "not_private_regular_file" });
    }
  } else {
    if (flags["input-file"] === "-") throw new CliError("invalid_arguments", { reason: "--credential-stdin cannot be combined with --input-file -" });
    value = (await firstStdinLine(stdin)).trim();
  }
  if (!CREDENTIAL_PATTERN.test(value)) throw new CliError("credential_invalid", { source: named[0] === "credential-file" ? "file" : "stdin" });
  return new BoundCredential(value, { origin, scopePath, source: named[0] === "credential-file" ? "file" : "stdin" });
}
