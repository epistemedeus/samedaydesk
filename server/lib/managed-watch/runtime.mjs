import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WatchError } from "./errors.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const archivePath = path.join(here, "pins", "change-monitor-0.1.0.tgz");
// Synchronous so the SDS CJS entry can require this graph. The archive stays lazy.
const pins = JSON.parse(readFileSync(path.join(here, "pins", "PINS.json"), "utf8"));

let loaded;

async function sha256(file) {
  const bytes = await readFile(file);
  return { hex: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

function extract(archive, destination) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", archive, "-C", destination], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new WatchError("monitor_pin", `change-monitor extract failed: ${stderr.slice(0, 200)}`, 503));
    });
  });
}

export function digestMatchesPin(bytes) {
  const hex = createHash("sha256").update(bytes).digest("hex");
  const pin = pins.changeMonitor;
  if (hex !== pin.sha256 || bytes.length !== pin.bytes) {
    throw new WatchError("monitor_pin", "change-monitor archive does not match the hosted pin", 503);
  }
  return hex;
}

export async function loadPinnedMonitor() {
  if (loaded) return loaded;
  const digest = await sha256(archivePath);
  const pin = pins.changeMonitor;
  if (digest.hex !== pin.sha256 || digest.bytes !== pin.bytes) {
    throw new WatchError("monitor_pin", "change-monitor archive does not match the hosted pin", 503);
  }
  const root = path.join(tmpdir(), `sds-l12-monitor-${pin.sha256.slice(0, 16)}`);
  const stamp = path.join(root, "PINNED");
  let ready = false;
  try {
    ready = (await readFile(stamp, "utf8")).trim() === pin.sha256;
    await access(path.join(root, "package", "src", "index.mjs"));
  } catch {
    ready = false;
  }
  if (!ready) {
    await mkdir(root, { recursive: true });
    await extract(archivePath, root);
    await writeFile(stamp, `${pin.sha256}\n`);
  }
  const index = pathToFileURL(path.join(root, "package", "src", "index.mjs")).href;
  const projectionHref = pathToFileURL(path.join(root, "package", "vendor", "s12-observatory", "projection.js")).href;
  const monitor = await import(index);
  const projection = await import(projectionHref);
  loaded = { monitor, projection, root, pin, pins };
  return loaded;
}

export function pinnedUrls() {
  return pins;
}
