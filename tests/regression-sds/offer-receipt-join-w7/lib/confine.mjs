import { existsSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { PACK_ROOT } from "./root.mjs";

function packRealpath() {
  try {
    return realpathSync(PACK_ROOT);
  } catch {
    return PACK_ROOT;
  }
}

function escapesPack(abs, packReal) {
  const rel = relative(packReal, abs);
  return !rel || rel.startsWith("..");
}

/** Resolve a fixture path; reject anything outside this pack. */
export function confineFixture(spec, fromDir) {
  const abs = resolve(fromDir, spec);
  const packReal = packRealpath();
  if (escapesPack(abs, packReal)) {
    return { ok: false, code: "FIXTURE_OUTSIDE_PACK", abs, message: `fixture outside pack: ${spec}` };
  }
  if (!existsSync(abs)) {
    return { ok: false, code: "FIXTURE_MISSING", abs, message: `fixture missing: ${spec}` };
  }
  let st;
  try {
    st = statSync(abs);
  } catch (err) {
    return { ok: false, code: "FIXTURE_UNREADABLE", abs, message: String(err?.message || err) };
  }
  if (!st.isFile()) {
    return { ok: false, code: "FIXTURE_NOT_FILE", abs, message: `fixture is not a file: ${spec}` };
  }
  const real = realpathSync(abs);
  if (escapesPack(real, packReal)) {
    return { ok: false, code: "FIXTURE_OUTSIDE_PACK", abs: real, message: `fixture outside pack: ${spec}` };
  }
  return { ok: true, abs: real };
}
