import { constants, openSync, closeSync, fstatSync, lstatSync, readSync } from "node:fs";
import path from "node:path";

export function coded(code) { return Object.assign(new Error(code), { code }); }

export function assertPrivateLocation(file, repoRoot) {
  const resolved = path.resolve(file);
  if (resolved.split(path.sep).includes("public_html")) throw coded("private_path_refused");
  if (repoRoot) {
    const root = path.resolve(repoRoot);
    if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) throw coded("private_path_refused");
  }
  return resolved;
}

// Walk each directory without following links, anchored to an already opened fd.
// Linux /proc is already a requirement of the sealed execution profile.
export function openPrivateParent(file, repoRoot) {
  const absolute = assertPrivateLocation(file, repoRoot);
  let fd = openSync("/", constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    for (const component of path.dirname(absolute).split(path.sep).filter(Boolean)) {
      const next = openSync(`/proc/self/fd/${fd}/${component}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      closeSync(fd); fd = next;
    }
    return { fd, entry: `/proc/self/fd/${fd}/${path.basename(absolute)}`, absolute };
  } catch { closeSync(fd); throw coded("private_path_refused"); }
}

export function readPrivateBytes(file, { repoRoot, limit = 65536 } = {}) {
  const parent = openPrivateParent(file, repoRoot);
  let fd;
  try {
    fd = openSync(parent.entry, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd), entry = lstatSync(parent.entry);
    if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== entry.dev || stat.ino !== entry.ino) throw coded("private_input_not_file");
    if ((stat.mode & 0o777) !== 0o600) throw coded("private_input_mode");
    if (stat.size < 1 || stat.size > limit) throw coded("private_input_size");
    const bytes = Buffer.alloc(stat.size + 1);
    const size = readSync(fd, bytes, 0, bytes.length, 0);
    if (size !== stat.size) throw coded("private_input_size");
    return bytes.subarray(0, size);
  } catch (error) {
    throw coded(error.code?.startsWith("private_") ? error.code : "private_input_unreadable");
  } finally { if (fd !== undefined) closeSync(fd); closeSync(parent.fd); }
}
