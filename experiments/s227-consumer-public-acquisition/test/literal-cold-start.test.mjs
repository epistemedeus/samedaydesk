/**
 * S239: execute decoded/served public cold-start text.
 * Uses a Python HTTP server because curl in this environment cannot complete
 * TCP to Node's createServer (verified separately); production paste still uses curl.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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
  CONSUMER_REPEAT_SHELL,
} from "../../../client/src/data/machineEntry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const ARCHIVE = join(ROOT, "client/public/kit/s178-consumer-repeat-kit.tgz");
const DISCOVERY = join(ROOT, "client/public/discovery/consumer-repeat.json");
const PAGE = join(ROOT, "client/src/pages/ConsumerRepeat.tsx");
const CLOCK = "2026-09-10T18:00:00.000Z";
const CRAWLER_H2 = "Cold start (verify before extract)";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function coldStartFromDiscovery() {
  const disc = JSON.parse(readFileSync(DISCOVERY, "utf8"));
  const cs = disc.coldStart;
  if (typeof cs === "string") return cs;
  if (Array.isArray(cs)) return cs.join("\n");
  throw new Error("discovery.coldStart must be a string or string[]");
}

function coldStartFromCrawler() {
  const html = CONSUMER_REPEAT_SHELL.crawlerHtml;
  const escaped = CRAWLER_H2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    "<h2>" + escaped + "<\\/h2>\\s*<pre><code>([\\s\\S]*?)<\\/code><\\/pre>",
  );
  const match = html.match(re);
  assert.ok(match, "crawler HTML missing cold-start pre/code block");
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function acquireFunctionOnly(script) {
  const stripped = script.replace(/\nkit=\$\(s178_consumer_repeat_acquire\) \|\| exit 1(?:\nprintf '%s\\n' \"\$kit\")?\s*$/, "");
  if (stripped === script) throw new Error("failed to strip trailing acquire invoke from cold-start");
  return stripped;
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

function runLiteral(script, { origin, cwd }) {
  return spawnSync("bash", ["-c", script], {
    cwd,
    env: {
      ...process.env,
      S178_CONSUMER_REPEAT_ORIGIN: origin,
      TMPDIR: cwd,
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      NO_PROXY: "*",
      no_proxy: "*",
    },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

/** Serve one path with fixed bytes/status via Python (curl-reachable here). */
function serveWithPython({ bodyPath = null, bodyBytes = null, status = 200, urlPath = "/kit/s178-consumer-repeat-kit.tgz" }) {
  const stub = mkdtempSync(join(tmpdir(), "s239-pyhttp-"));
  const script = join(stub, "serve.py");
  const payload = bodyPath ? null : join(stub, "payload.bin");
  if (bodyBytes) writeFileSync(payload, bodyBytes);
  writeFileSync(
    script,
    `from http.server import BaseHTTPRequestHandler, HTTPServer
import sys
STATUS = int(sys.argv[1])
PATH = sys.argv[2]
FILE = sys.argv[3] if len(sys.argv) > 3 else None
BODY = open(FILE, "rb").read() if FILE and FILE != "-" else b""
class H(BaseHTTPRequestHandler):
  def do_GET(self):
    if self.path.split("?",1)[0] != PATH:
      self.send_response(404); self.end_headers(); self.wfile.write(b"no"); return
    self.send_response(STATUS)
    self.send_header("content-type", "application/gzip")
    self.send_header("content-length", str(len(BODY) if STATUS == 200 else 0))
    self.end_headers()
    if STATUS == 200:
      self.wfile.write(BODY)
  def log_message(self, *args):
    pass
httpd = HTTPServer(("127.0.0.1", 0), H)
print(httpd.server_address[1], flush=True)
httpd.serve_forever()
`,
  );
  const args = ["python3", script, String(status), urlPath];
  if (status === 200) args.push(bodyPath || payload);
  else args.push("-");
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
    child.stderr.on("data", (c) => {
      // keep for debugging failures
      out += c.toString("utf8");
    });
  });
}

test("discovery JSON and machineEntry/crawler share one decoded cold-start script", () => {
  const fromDisc = coldStartFromDiscovery();
  const fromMe = CONSUMER_REPEAT_COLD_START;
  const fromCrawl = coldStartFromCrawler();
  assert.equal(fromDisc, fromMe);
  assert.equal(fromCrawl, fromMe);
  assert.equal(fromDisc.includes('\\"'), false);
  assert.match(fromDisc, /mktemp -d/);
  assert.match(fromDisc, /return 1/);
  assert.match(fromDisc, /S178_CONSUMER_REPEAT_ORIGIN/);
  assert.match(fromDisc, /--max-time 60/);
  assert.match(fromDisc, new RegExp(String(CONSUMER_REPEAT_ARCHIVE_BYTES)));
  assert.match(fromDisc, new RegExp(CONSUMER_REPEAT_ARCHIVE_SHA256));
  assert.match(readFileSync(PAGE, "utf8"), /CONSUMER_REPEAT_COLD_START/);
});

test("literal discovery cold-start: wrong HTTP status => no extract, no CLI", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "s239-status-"));
  const srv = await serveWithPython({ status: 503 });
  try {
    const r = runLiteral(coldStartFromDiscovery(), { origin: srv.origin, cwd });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.equal(findExtractedKits(cwd).length, 0);
  } finally {
    srv.stop();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("literal crawler cold-start: wrong size => no extract, no CLI", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "s239-size-"));
  const bad = Buffer.concat([readFileSync(ARCHIVE), Buffer.from("x")]);
  const srv = await serveWithPython({ bodyBytes: bad, status: 200 });
  try {
    const r = runLiteral(coldStartFromCrawler(), { origin: srv.origin, cwd });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.equal(findExtractedKits(cwd).length, 0);
  } finally {
    srv.stop();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("literal discovery cold-start: wrong digest => no extract, no CLI", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "s239-digest-"));
  const bad = Buffer.alloc(CONSUMER_REPEAT_ARCHIVE_BYTES, 0x5a);
  const srv = await serveWithPython({ bodyBytes: bad, status: 200 });
  try {
    const r = runLiteral(coldStartFromDiscovery(), { origin: srv.origin, cwd });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.equal(findExtractedKits(cwd).length, 0);
  } finally {
    srv.stop();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("literal cold-start under shell conditional: failure does not extract/execute", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "s239-cond-"));
  const srv = await serveWithPython({ status: 404 });
  try {
    const body = acquireFunctionOnly(coldStartFromDiscovery());
    const conditional = `
set +e
if s178_consumer_repeat_acquire; then
  echo ACQUIRE_OK > flag.txt
  exit 0
else
  echo ACQUIRE_REFUSED > flag.txt
  exit 7
fi
`;
    const r = spawnSync("bash", ["-c", `${body}\n${conditional}`], {
      cwd,
      env: {
        ...process.env,
        S178_CONSUMER_REPEAT_ORIGIN: srv.origin,
        TMPDIR: cwd,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        NO_PROXY: "*",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 7, r.stdout + r.stderr);
    assert.equal(readFileSync(join(cwd, "flag.txt"), "utf8").trim(), "ACQUIRE_REFUSED");
    assert.equal(findExtractedKits(cwd).length, 0);
  } finally {
    srv.stop();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("literal positive cold-start from discovery + crawler; two callers + changed repeat", async () => {
  const good = readFileSync(ARCHIVE);
  assert.equal(good.length, CONSUMER_REPEAT_ARCHIVE_BYTES);
  assert.equal(sha256(good), CONSUMER_REPEAT_ARCHIVE_SHA256);

  async function serveAndRun(script) {
    const cwd = mkdtempSync(join(tmpdir(), "s239-pos-"));
    const srv = await serveWithPython({ bodyPath: ARCHIVE, status: 200 });
    const r = runLiteral(script, { origin: srv.origin, cwd });
    if (r.status !== 0) {
      srv.stop();
      rmSync(cwd, { recursive: true, force: true });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
    const kit = String(r.stdout).trim();
    assert.equal(kit.includes("\n"), false, `stdout must be sole kit path, got: ${JSON.stringify(r.stdout)}`);
    assert.equal(kit.includes("{"), false, `stdout contaminated with JSON: ${kit.slice(0, 80)}`);
    assert.ok(kit && existsSync(join(kit, "bin/s178-cli.mjs")), `kit path missing: ${kit}\n${r.stdout}\n${r.stderr}`);
    return { cwd, kit, srv };
  }

  const a = await serveAndRun(coldStartFromDiscovery());
  const b = await serveAndRun(coldStartFromCrawler());
  try {
    assert.notEqual(a.kit, b.kit);

    const callerA = join(a.cwd, "caller-a.json");
    const callerB = join(a.cwd, "caller-b.json");
    const callerPartial = join(a.cwd, "caller-partial.json");
    const callerReconciled = join(a.cwd, "caller-reconciled.json");
    const repeatNote = join(a.cwd, "repeat-note.json");

    copyFileSync(join(a.kit, "vendor/consumer-jobs-07/fixtures/positive.json"), callerA);
    copyFileSync(
      join(
        a.kit,
        "vendor/s137-consumer-evidence-jobs/fixtures/synthetic/release-brief/cases/conflict-sha-mismatch.json",
      ),
      callerB,
    );
    copyFileSync(
      join(
        a.kit,
        "vendor/s137-consumer-evidence-jobs/fixtures/synthetic/release-brief/cases/partial-announced-only.json",
      ),
      callerPartial,
    );
    copyFileSync(
      join(
        a.kit,
        "vendor/s137-consumer-evidence-jobs/fixtures/synthetic/release-brief/cases/positive-aligned.json",
      ),
      callerReconciled,
    );

    const hashA = sha256(readFileSync(callerA));
    const hashB = sha256(readFileSync(callerB));
    const hashP = sha256(readFileSync(callerPartial));
    const hashR = sha256(readFileSync(callerReconciled));

    const run = (args) =>
      spawnSync(process.execPath, [join(a.kit, "bin/s178-cli.mjs"), ...args], {
        encoding: "utf8",
        cwd: a.cwd,
        maxBuffer: 20 * 1024 * 1024,
      });

    const r1 = run(["run", "07", "--in", callerA, "--clock", CLOCK]);
    assert.equal(r1.status, 0, r1.stderr || r1.stdout);
    const r2 = run(["run", "release-brief", "--in", callerB, "--clock", CLOCK]);
    assert.equal(r2.status, 0, r2.stderr || r2.stdout);

    const r3 = spawnSync(
      "bash",
      [
        "-c",
        'node "$1/bin/s178-cli.mjs" run release-brief --in "$2" --clock "$3" > "$4"',
        "_",
        a.kit,
        callerPartial,
        CLOCK,
        repeatNote,
      ],
      { encoding: "utf8", cwd: a.cwd },
    );
    assert.equal(r3.status, 0, r3.stderr || r3.stdout);
    assert.ok(statSync(repeatNote).size > 0);

    const r4 = run(["run", "release-brief", "--in", callerReconciled, "--clock", CLOCK]);
    assert.equal(r4.status, 0, r4.stderr || r4.stdout);

    assert.equal(sha256(readFileSync(callerA)), hashA);
    assert.equal(sha256(readFileSync(callerB)), hashB);
    assert.equal(sha256(readFileSync(callerPartial)), hashP);
    assert.equal(sha256(readFileSync(callerReconciled)), hashR);
  } finally {
    a.srv.stop();
    b.srv.stop();
    rmSync(a.cwd, { recursive: true, force: true });
    rmSync(b.cwd, { recursive: true, force: true });
  }
});
