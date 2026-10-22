import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

export function resolveRoot(rootPath) {
  if (!rootPath) {
    const err = new Error("root is required");
    err.code = "missing-root";
    throw err;
  }
  const abs = resolve(String(rootPath));
  if (!existsSync(abs)) {
    const err = new Error(`root does not exist: ${abs}`);
    err.code = "missing-root";
    throw err;
  }
  const st = lstatSync(abs);
  if (!st.isDirectory()) {
    const err = new Error(`root is not a directory: ${abs}`);
    err.code = "root-not-directory";
    throw err;
  }
  return realpathSync(abs);
}

export function isInsideRoot(root, candidate) {
  const rel = relative(root, candidate);
  if (rel === "") return true;
  return !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

export function safeOutputName(name) {
  if (typeof name !== "string" || name.length === 0) return null;
  if (name.includes("\0")) return null;
  if (name !== basename(name)) return null;
  if (name === "." || name === "..") return null;
  return name;
}

/**
 * Relative declared paths that walk out of the selected root are rejected.
 * Absolute paths outside the root are stale producer locations (F08 stamps
 * outDir with resolve()); they are never read. Bind by basename under root.
 */
export function declaredRelativeEscapes(root, declared) {
  if (typeof declared !== "string" || declared.length === 0) return false;
  if (isAbsolute(declared)) return false;
  const resolved = resolve(root, declared);
  return !isInsideRoot(root, resolved);
}

export function bindUnderRoot(root, name) {
  const safe = safeOutputName(name);
  if (!safe) {
    const err = new Error(`output name is not a single basename: ${name}`);
    err.code = "unsafe-output-name";
    throw err;
  }
  const bound = resolve(root, safe);
  if (!isInsideRoot(root, bound)) {
    const err = new Error(`bound path escapes root: ${safe}`);
    err.code = "receipt-path-escapes-root";
    throw err;
  }
  return bound;
}

export function realpathInsideRoot(root, filePath) {
  if (!existsSync(filePath)) return { exists: false, real: null, inside: false };
  const real = realpathSync(filePath);
  return { exists: true, real, inside: isInsideRoot(root, real) };
}

export function joinReceipt(root, receiptName = "receipt.json") {
  return bindUnderRoot(root, receiptName);
}
