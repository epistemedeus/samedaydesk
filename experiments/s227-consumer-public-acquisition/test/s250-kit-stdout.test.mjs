/**
 * S250: kit=$(acquire) must capture solely the absolute kit directory.
 * Regression runs literal served public cold-start AND the next documented
 * "$kit"/bin call in the SAME shell (no last-line split, no injected root).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CONSUMER_REPEAT_ARCHIVE_BYTES,
  CONSUMER_REPEAT_ARCHIVE_SHA256,
  CONSUMER_REPEAT_COLD_START,
  CONSUMER_REPEAT_FIRST_USE,
} from "../../../client/src/data/machineEntry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const ARCHIVE = join(ROOT, "client/public/kit/s178-consumer-repeat-kit.tgz");
const DISCOVERY = join(ROOT, "client/public/discovery/consumer-repeat.json");
const EXPECT_SHA = "04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d";
const EXPECT_BYTES = 718948;
const NEXT_LIST = CONSUMER_REPEAT_FIRST_USE.split("\n")[0];

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function coldStartFromDiscovery() {
  const disc = JSON.parse(readFileSync(DISCOVERY, "utf8"));
  const cs = disc.coldStart;
  return typeof cs === "string" ? cs : cs.join("\n");
}

function findExtractedKits(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const p = join(cur, ent.name);
      if (existsSync(join(p, "bin", "s178-cli.mjs"))) out.push(p);
      stack.push(p);
    }
  }
  return out;
}

function serveWithPython({ bodyPath = null, bodyBytes = null, status = 200 }) {
  const stub = mkdtempSync(join(tmpdir(), "s250-pyhttp-"));
  const script = join(stub, "serve.py");
  const payload = bodyPath ? null : join(stub, "payload.bin");
  if (bodyBytes) writeFileSync(payload, bodyBytes);
  writeFileSync(
    script,
    `from http.server import BaseHTTPRequestHandler, HTTPServer
import sys
STATUS=int(sys.argv[1]); PATH=sys.argv[2]; FILE=sys.argv[3]
BODY=open(FILE,"rb").read() if FILE!="-" else b""
class H(BaseHTTPRequestHandler):
  def do_GET(self):
    if self.path.split("?",1)[0]!=PATH:
      self.send_response(404); self.end_headers(); self.wfile.write(b"no"); return
    self.send_response(STATUS)
    self.send_header("content-type","application/gzip")
    self.send_header("content-length", str(len(BODY) if STATUS==200 else 0))
    self.end_headers()
    if STATUS==200: self.wfile.write(BODY)
  def log_message(self,*a): pass
httpd=HTTPServer(("127.0.0.1",0),H)
print(httpd.server_address[1], flush=True)
httpd.serve_forever()
`,
  );
  const args = ["python3", script, String(status), "/kit/s178-consumer-repeat-kit.tgz"];
  args.push(status === 200 ? bodyPath || payload : "-");
  const child = spawn(args[0], args.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("python server start timeout"));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
      const line = out.trim().split("\n")[0];
      if (/^\d+$/.test(line)) {
        clearTimeout(timer);
        resolve({
          origin: `http://127.0.0.1:${line}`,
          stop: () => {
            child.kill("SIGTERM");
            rmSync(stub, { recursive: true, force: true });
          },
        });
      }
    });
    child.on("error", reject);
  });
}

function baseEnv(origin, cwd, extra = {}) {
  return {
    ...process.env,
    ...extra,
    S178_CONSUMER_REPEAT_ORIGIN: origin,
    TMPDIR: cwd,
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    NO_PROXY: "*",
    no_proxy: "*",
  };
}

/** Same-shell: literal discovery cold-start + next documented "$kit"/bin call. */
function sameShellScript() {
  assert.equal(NEXT_LIST, 'node "$kit/bin/s178-cli.mjs" list');
  return `${coldStartFromDiscovery()}
test -f "$kit/bin/s178-cli.mjs" || { echo "KIT_UNUSABLE:$kit" >&2; exit 9; }
${NEXT_LIST}
printf 'LIST_OK\\n'
`;
}

test("discovery coldStart equals authoritative buildConsumerRepeatColdStart", () => {
  assert.equal(coldStartFromDiscovery(), CONSUMER_REPEAT_COLD_START);
  assert.match(CONSUMER_REPEAT_COLD_START, /list >&2/);
  assert.equal(/assert /.test(CONSUMER_REPEAT_COLD_START), false);
  assert.match(CONSUMER_REPEAT_COLD_START, /sys\.exit/);
  assert.equal(sha256(readFileSync(ARCHIVE)), EXPECT_SHA);
  assert.equal(readFileSync(ARCHIVE).length, EXPECT_BYTES);
  assert.equal(CONSUMER_REPEAT_ARCHIVE_SHA256, EXPECT_SHA);
  assert.equal(CONSUMER_REPEAT_ARCHIVE_BYTES, EXPECT_BYTES);
});

for (const shell of ["bash", "sh"]) {
  test(`S250 ${shell}: literal public command + next "$kit"/bin list in same shell`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "s250-same-"));
    const srv = await serveWithPython({ bodyPath: ARCHIVE, status: 200 });
    try {
      const r = spawnSync(shell, ["-c", sameShellScript()], {
        cwd,
        env: baseEnv(srv.origin, cwd),
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      });
      assert.equal(r.status, 0, r.stdout + "\n" + r.stderr);
      assert.match(r.stdout, /LIST_OK/);
      assert.match(r.stdout, /s178\.consumer-repeat\.catalog/);
      assert.equal(r.stderr.includes("KIT_UNUSABLE"), false);
      assert.equal(findExtractedKits(cwd).length, 1);
    } finally {
      srv.stop();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}

test("S250 bash: TMPDIR with whitespace; $kit usable for next bin call", async () => {
  const parent = mkdtempSync(join(tmpdir(), "s250-space-parent-"));
  const cwd = join(parent, "kit dir with spaces");
  mkdirSync(cwd);
  const srv = await serveWithPython({ bodyPath: ARCHIVE, status: 200 });
  try {
    const r = spawnSync("bash", ["-c", sameShellScript()], {
      cwd,
      env: baseEnv(srv.origin, cwd),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    assert.equal(r.status, 0, r.stdout + "\n" + r.stderr);
    assert.match(r.stdout, /LIST_OK/);
    const kits = findExtractedKits(cwd);
    assert.equal(kits.length, 1);
    assert.match(kits[0], /kit dir with spaces/);
  } finally {
    srv.stop();
    rmSync(parent, { recursive: true, force: true });
  }
});

test("S250 parallel acquisitions: unique mktemp + same-shell next list each", async () => {
  const srv = await serveWithPython({ bodyPath: ARCHIVE, status: 200 });
  const a = mkdtempSync(join(tmpdir(), "s250-par-a-"));
  const b = mkdtempSync(join(tmpdir(), "s250-par-b-"));
  try {
    const run = (cwd) =>
      spawnSync("bash", ["-c", sameShellScript()], {
        cwd,
        env: baseEnv(srv.origin, cwd),
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      });
    const [ra, rb] = await Promise.all([
      Promise.resolve(run(a)),
      Promise.resolve(run(b)),
    ]);
    assert.equal(ra.status, 0, ra.stdout + ra.stderr);
    assert.equal(rb.status, 0, rb.stdout + rb.stderr);
    const kitsA = findExtractedKits(a);
    const kitsB = findExtractedKits(b);
    assert.equal(kitsA.length, 1);
    assert.equal(kitsB.length, 1);
    assert.notEqual(kitsA[0], kitsB[0]);
  } finally {
    srv.stop();
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test("S250 failing list: non-zero, work cleaned, next bin not reachable via $kit", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "s250-faillist-"));
  const binDir = join(cwd, "fake-bin");
  mkdirSync(binDir);
  const realNode = process.execPath;
  const wrapper = join(binDir, "node");
  writeFileSync(
    wrapper,
    `#!/bin/sh
for a in "$@"; do
  case "$a" in
    list)
      echo "s250 intentional list failure" >&2
      exit 42
      ;;
  esac
done
exec "${realNode}" "$@"
`,
  );
  chmodSync(wrapper, 0o755);
  const srv = await serveWithPython({ bodyPath: ARCHIVE, status: 200 });
  try {
    const script = `${coldStartFromDiscovery()}
echo SHOULD_NOT_REACH
${NEXT_LIST}
`;
    const r = spawnSync("bash", ["-c", script], {
      cwd,
      env: baseEnv(srv.origin, cwd, { PATH: `${binDir}:${process.env.PATH || "/usr/bin"}` }),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stderr, /s250 intentional list failure/);
    assert.equal(r.stdout.includes("SHOULD_NOT_REACH"), false);
    assert.equal(findExtractedKits(cwd).length, 0);
  } finally {
    srv.stop();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("S250 PYTHONOPTIMIZE=1 wrong size/digest never reach tar or package executable", async () => {
  for (const kind of ["size", "digest"]) {
    const cwd = mkdtempSync(join(tmpdir(), `s250-pyopt-${kind}-`));
    const markerDir = join(cwd, "markers");
    mkdirSync(markerDir);
    const binDir = join(cwd, "wrap-bin");
    mkdirSync(binDir);
    for (const name of ["tar", "node"]) {
      writeFileSync(
        join(binDir, name),
        `#!/bin/sh\necho reached-${name} >> "${markerDir}/hit.txt"\nexit 99\n`,
      );
      chmodSync(join(binDir, name), 0o755);
    }
    // Keep real python3/curl on PATH after wrappers.
    const body =
      kind === "size"
        ? Buffer.concat([readFileSync(ARCHIVE), Buffer.from("x")])
        : Buffer.alloc(EXPECT_BYTES, 0x5a);
    const srv = await serveWithPython({ bodyBytes: body, status: 200 });
    try {
      const r = spawnSync("bash", ["-c", coldStartFromDiscovery()], {
        cwd,
        env: baseEnv(srv.origin, cwd, {
          PYTHONOPTIMIZE: "1",
          PATH: `${binDir}:/usr/bin:/bin:${process.env.PATH || ""}`,
        }),
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      });
      assert.notEqual(r.status, 0, r.stdout + r.stderr);
      assert.equal(existsSync(join(markerDir, "hit.txt")), false, "tar/node must not run");
      assert.equal(findExtractedKits(cwd).length, 0);
      assert.match(r.stderr, kind === "size" ? /size / : /sha256 /);
    } finally {
      srv.stop();
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});
