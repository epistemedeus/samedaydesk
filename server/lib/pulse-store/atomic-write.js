import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function atomicWriteJson(filePath, data) {
  const payload = JSON.stringify(data);
  if (filePath === "/dev/null") {
    fs.writeFileSync(filePath, payload);
    return true;
  }
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );
  let fd = null;
  try {
    fd = fs.openSync(tmp, "w", 0o600);
    fs.writeSync(fd, payload);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, filePath);
    try {
      const dirFd = fs.openSync(dir, "r");
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      /* directory fsync optional */
    }
    return true;
  } catch {
    if (fd != null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore close failure */
      }
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore missing temp file */
    }
    return false;
  }
}
