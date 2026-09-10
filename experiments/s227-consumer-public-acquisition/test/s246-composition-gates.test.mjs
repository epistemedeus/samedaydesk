/**
 * S246 composition gates: sh+bash, if/&&, fail-before-tar, caller safety,
 * concurrent unique mktemp, outside-checkout dirs.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
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
  CONSUMER_REPEAT_SOURCE_COMMIT,
} from "../../../client/src/data/machineEntry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const ARCHIVE = join(ROOT, "client/public/kit/s178-consumer-repeat-kit.tgz");
const DISCOVERY = join(ROOT, "client/public/discovery/consumer-repeat.json");
const RECEIPT = join(ROOT, "client/public/kit/s178-consumer-repeat-archive.sha256.json");
const KIT_JSON = join(ROOT, "client/src/data/consumerRepeatKit.json");
const PAGE = join(ROOT, "client/src/pages/ConsumerRepeat.tsx");
const CLOCK = "2026-09-10T18:00:00.000Z";
const EXPECT_SHA = "04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d";
const EXPECT_BYTES = 718948;
const EXPECT_COMMIT = "e7a53c48a2db5393e1e340e5d43143547f79dbd7";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function coldStartText() {
  const disc = JSON.parse(readFileSync(DISCOVERY, "utf8"));
  const cs = disc.coldStart;
  return typeof cs === "string" ? cs : cs.join("\n");
}

function acquireFunctionOnly(script) {
  const stripped = script.replace(
    /\nkit=\$\(s178_consumer_repeat_acquire\) \|\| exit 1(?:\nprintf '%s\\n' \"\$kit\")?\s*$/,
    "",
  );
  if (stripped === script) throw new Error("failed to strip trailing acquire invoke");
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

function serveWithPython({ bodyPath = null, bodyBytes = null, status = 200 }) {
  const stub = mkdtempSync(join(tmpdir(), "s246-pyhttp-"));
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
  const args = [
    "python3",
    script,
    String(status),
    "/kit/s178-consumer-repeat-kit.tgz",
    status === 200 ? bodyPath || payload : "-",
  ];
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

function installFakeTar(binDir, markerPath) {
  mkdirSync(binDir, { recursive: true });
  const tarPath = join(binDir, "tar");
  writeFileSync(
    tarPath,
    `#!/bin/sh
echo TAR_RAN >> "${markerPath}"
exit 97
`,
  );
  chmodSync(tarPath, 0o755);
}

function runShell(shell, script, { origin, cwd, pathPrefix = null }) {
  return spawnSync(shell, ["-c", script], {
    cwd,
    env: {
      ...process.env,
      S178_CONSUMER_REPEAT_ORIGIN: origin,
      TMPDIR: cwd,
      PATH: pathPrefix ? `${pathPrefix}:${process.env.PATH}` : process.env.PATH,
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      NO_PROXY: "*",
    },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

test("S246: archive and pins stay aligned across kit/receipt/discovery/machineEntry", () => {
  const buf = readFileSync(ARCHIVE);
  assert.equal(buf.length, EXPECT_BYTES);
  assert.equal(sha256(buf), EXPECT_SHA);
  assert.equal(buf.length, CONSUMER_REPEAT_ARCHIVE_BYTES);
  assert.equal(sha256(buf), CONSUMER_REPEAT_ARCHIVE_SHA256);
  const disc = JSON.parse(readFileSync(DISCOVERY, "utf8"));
  const receipt = JSON.parse(readFileSync(RECEIPT, "utf8"));
  const kit = JSON.parse(readFileSync(KIT_JSON, "utf8"));
  for (const obj of [disc.archive, receipt, kit]) {
    assert.equal(Number(obj.bytes), EXPECT_BYTES);
    assert.equal(obj.sha256, EXPECT_SHA);
  }
  assert.equal(CONSUMER_REPEAT_SOURCE_COMMIT, EXPECT_COMMIT);
  assert.equal(disc.pins.sourceCommit, EXPECT_COMMIT);
  assert.equal(receipt.sourceCommit, EXPECT_COMMIT);
  assert.equal(kit.sourceCommit, EXPECT_COMMIT);
  const cold = coldStartText();
  assert.equal(cold, CONSUMER_REPEAT_COLD_START);
  assert.equal(CONSUMER_REPEAT_SHELL.crawlerHtml.includes(cold), true);
  assert.match(readFileSync(PAGE, "utf8"), /CONSUMER_REPEAT_COLD_START/);
});

for (const shell of ["bash", "sh"]) {
  test(`S246: ${shell} if-context refusal does not extract or run tar`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), `s246-${shell}-if-`));
    const caller = join(cwd, "caller-keep.json");
    writeFileSync(caller, JSON.stringify({ keep: true, shell }));
    const callerHash = sha256(readFileSync(caller));
    const binDir = join(cwd, "bin");
    const tarMarker = join(cwd, "tar-marker.txt");
    installFakeTar(binDir, tarMarker);
    const srv = await serveWithPython({ status: 503 });
    try {
      const body = acquireFunctionOnly(coldStartText());
      const script = `${body}
set +e
if s178_consumer_repeat_acquire; then
  echo OK > out.txt
  exit 0
else
  echo REFUSED > out.txt
  exit 7
fi
`;
      const r = runShell(shell, script, { origin: srv.origin, cwd, pathPrefix: binDir });
      assert.equal(r.status, 7, r.stdout + r.stderr);
      assert.equal(readFileSync(join(cwd, "out.txt"), "utf8").trim(), "REFUSED");
      assert.equal(existsSync(tarMarker), false, "tar must not run on HTTP failure");
      assert.equal(findExtractedKits(cwd).length, 0);
      assert.equal(sha256(readFileSync(caller)), callerHash);
    } finally {
      srv.stop();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test(`S246: ${shell} &&-context wrong digest stops before tar; caller untouched`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), `s246-${shell}-and-`));
    const caller = join(cwd, "caller-keep.json");
    writeFileSync(caller, JSON.stringify({ keep: true, mode: "&&" }));
    const callerHash = sha256(readFileSync(caller));
    const binDir = join(cwd, "bin");
    const tarMarker = join(cwd, "tar-marker.txt");
    installFakeTar(binDir, tarMarker);
    const bad = Buffer.alloc(EXPECT_BYTES, 0x11);
    const srv = await serveWithPython({ bodyBytes: bad, status: 200 });
    try {
      const body = acquireFunctionOnly(coldStartText());
      const script = `${body}
set +e
s178_consumer_repeat_acquire && echo REACHED_OK > reached.txt
echo AFTER=$? > after.txt
`;
      const r = runShell(shell, script, { origin: srv.origin, cwd, pathPrefix: binDir });
      // With set +e the final echo may make the shell exit 0; judge refusal by side effects.
      assert.equal(existsSync(join(cwd, "reached.txt")), false, r.stdout + r.stderr);
      const after = readFileSync(join(cwd, "after.txt"), "utf8").trim();
      assert.match(after, /^AFTER=[1-9]/, after);
      assert.equal(existsSync(tarMarker), false, "tar must not run on digest failure");
      assert.equal(findExtractedKits(cwd).length, 0);
      assert.equal(sha256(readFileSync(caller)), callerHash);
    } finally {
      srv.stop();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}

test("S246: concurrent positive acquisitions use distinct mktemp kits + two callers + changed repeat", async () => {
  const good = readFileSync(ARCHIVE);
  assert.equal(good.length, EXPECT_BYTES);
  assert.equal(sha256(good), EXPECT_SHA);

  async function oneAcquire(shell) {
    const cwd = mkdtempSync(join(tmpdir(), "s246-out-"));
    const srv = await serveWithPython({ bodyPath: ARCHIVE, status: 200 });
    const r = runShell(shell, coldStartText(), { origin: srv.origin, cwd });
    if (r.status !== 0) {
      srv.stop();
      rmSync(cwd, { recursive: true, force: true });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
    const kit = String(r.stdout)
      .trim()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1);
    assert.ok(kit && existsSync(join(kit, "bin/s178-cli.mjs")), `kit missing: ${kit}\n${r.stdout}`);
    return { cwd, kit, srv, shell };
  }

  const [a, b] = await Promise.all([oneAcquire("bash"), oneAcquire("sh")]);
  try {
    assert.notEqual(a.kit, b.kit);
    assert.notEqual(a.cwd, b.cwd);

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

    const listB = spawnSync(process.execPath, [join(b.kit, "bin/s178-cli.mjs"), "list"], {
      encoding: "utf8",
      cwd: b.cwd,
    });
    assert.equal(listB.status, 0, listB.stderr || listB.stdout);
  } finally {
    a.srv.stop();
    b.srv.stop();
    rmSync(a.cwd, { recursive: true, force: true });
    rmSync(b.cwd, { recursive: true, force: true });
  }
});
