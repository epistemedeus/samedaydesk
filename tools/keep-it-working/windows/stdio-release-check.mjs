#!/usr/bin/env node
// Keep it working: the release check for an npm MCP server, run as a user runs it. It writes the
// client configuration Claude Desktop and VS Code read, runs the package's own self-check, starts
// the server over stdio exactly as each configuration says, lists its tools and calls one
// read-only tool on a sample folder. It writes a plain-words report: what passed, the exact step
// that failed, and the commands to reproduce. Node 20 or newer; no dependencies.
//
//   node stdio-release-check.mjs --package sentinel-ir-mcp@stable-0.5 \
//     --self-check "doctor --client claude-desktop" \
//     --tool analyze_directory --tool-args '{"path":"{folder}","max_files":10}' \
//     --out report
//
// It reads and runs; it never publishes, opens an issue or sends anything. Exit 0 when every step
// passed, 1 when one failed, 2 for a wrong invocation.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir, release, arch } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values: opt } = parseArgs({
  options: {
    package: { type: "string" },
    name: { type: "string" },
    "self-check": { type: "string" },
    tool: { type: "string" },
    "tool-args": { type: "string", default: "{}" },
    folder: { type: "string" },
    out: { type: "string", default: "report" },
    "first-answer-seconds": { type: "string", default: "180" },
  },
});
if (!/^(?:@[a-z\d][a-z\d._-]*\/)?[a-z\d][a-z\d._-]*@\d+\.\d+\.\d+(?:-[a-zA-Z\d.]+)?$/.test(opt.package ?? "")
    || !/^[a-zA-Z][a-zA-Z\d_.-]{0,100}$/.test(opt.tool ?? "")
    || !/^[a-zA-Z\d. _-]*$/.test(opt["self-check"] ?? "")) {
  console.error("Usage: stdio-release-check.mjs --package <npm spec> --tool <read-only tool> [--tool-args <json>] [--self-check <args>] [--folder <dir>] [--out <dir>]");
  process.exit(2);
}

const WINDOWS = process.platform === "win32";
const spec = opt.package;
const serverName = opt.name ?? spec.replace(/^@[^/]+\//, "").replace(/@.*$/, "").replace(/-mcp$/, "");
const out = resolve(opt.out);
mkdirSync(out, { recursive: true });
const firstAnswerMs = Number(opt["first-answer-seconds"]) * 1000;
const steps = [];
let failed = null;

function record(name, ok, said, detail = {}) {
  steps.push({ name, ok, said, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${said}`);
  if (!ok && !failed) failed = name;
  return ok;
}
// What a person types in a terminal: on Windows npx is npx.cmd, so it goes through cmd.
const terminal = (args) => (WINDOWS ? ["cmd", ["/d", "/s", "/c", ["npx", ...args].join(" ")]] : ["npx", args]);
const shown = (command, args) => [command, ...args.map((a) => (/[\s"{}]/.test(a) ? JSON.stringify(a) : a))].join(" ");

// ---- 1. The machine, and what npm resolves the package to ------------------------------------------
const node = process.version;
const npmVersion = spawnSync(WINDOWS ? "cmd" : "npm", WINDOWS ? ["/d", "/c", "npm --version"] : ["--version"], { encoding: "utf8" }).stdout.trim();
const viewed = spawnSync(WINDOWS ? "cmd" : "npm", WINDOWS ? ["/d", "/c", `npm view ${spec} version --json`] : ["view", spec, "version", "--json"], { encoding: "utf8" });
let resolved = null;
try { const v = JSON.parse(viewed.stdout || "null"); resolved = Array.isArray(v) ? v.at(-1) : v; } catch { /* below */ }
record("Resolve the release on npm", !!resolved, resolved ? `${spec} is ${resolved} on the public registry.` : `npm could not resolve ${spec}: ${(viewed.stderr || "").trim().split("\n").at(-1)}`, { command: `npm view ${spec} version` });

// ---- 2. A sample folder for the read-only call --------------------------------------------------------
const folder = resolve(opt.folder ?? join(tmpdir(), "keep-it-working-sample"));
mkdirSync(folder, { recursive: true });
if (!opt.folder) {
  writeFileSync(join(folder, "app.js"), 'import { readFile } from "node:fs/promises";\nexport async function load(path) {\n  return JSON.parse(await readFile(path, "utf8"));\n}\n');
  writeFileSync(join(folder, "deploy.js"), 'const cp = require("child_process");\nmodule.exports = (cmd) => cp.exec(cmd);\n');
  writeFileSync(join(folder, "report.py"), "import json\n\ndef summary(rows):\n    return json.dumps({'count': len(rows)})\n");
}

// ---- 3. The client configurations, as each client stores them -------------------------------------------
// Claude Desktop starts the command in its config; on Windows the package's own setup writes cmd /c npx.
const claudeEntry = WINDOWS
  ? { command: "cmd", args: ["/c", "npx", "-y", spec, folder] }
  : { command: "npx", args: ["-y", spec, folder] };
// Generate the client file but never overwrite an installed desktop client's settings.
const claudeConfigPath = join(out, "claude_desktop_config.json");
// VS Code reads .vscode/mcp.json in the workspace: a stdio server with command "npx".
const vscodeEntry = { type: "stdio", command: "npx", args: ["-y", spec, folder] };
const vscodeConfigPath = join(folder, ".vscode", "mcp.json");
try {
  mkdirSync(join(claudeConfigPath, ".."), { recursive: true });
  writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { [serverName]: claudeEntry } }, null, 2) + "\n");
  mkdirSync(join(vscodeConfigPath, ".."), { recursive: true });
  writeFileSync(vscodeConfigPath, JSON.stringify({ servers: { [serverName]: vscodeEntry } }, null, 2) + "\n");
  record("Write the client configurations", true, `Claude Desktop: ${claudeConfigPath}. VS Code: ${vscodeConfigPath}.`, { claudeEntry, vscodeEntry });
} catch (e) {
  record("Write the client configurations", false, `Could not write a configuration file: ${e.message}`);
}

// ---- 4. The package's own self-check, run the way its README says --------------------------------------
if (opt["self-check"]) {
  const args = ["-y", spec, ...opt["self-check"].split(/\s+/).filter(Boolean)];
  const [command, commandArgs] = terminal(args);
  const t0 = Date.now();
  const run = spawnSync(command, commandArgs, { cwd: folder, encoding: "utf8", timeout: firstAnswerMs * 2, env: { ...process.env, NO_COLOR: "1" } });
  const text = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  writeFileSync(join(out, "self-check.txt"), text + "\n");
  const lastLine = text.split("\n").filter(Boolean).at(-1) ?? "(no output)";
  record("Run the package's own self-check", run.status === 0,
    run.status === 0 ? `It passed in ${Math.round((Date.now() - t0) / 1000)} s. Its last line: "${lastLine}".`
      : run.error ? `It did not finish: ${run.error.code ?? run.error.message}.` : `It exited with ${run.status}. Its last line: "${lastLine}". The full output is in self-check.txt.`,
    { command: `npx ${args.join(" ")}` });
}

// ---- 5. Start each configuration over stdio and talk MCP to it -------------------------------------------
function startAs(label, entry, shell) {
  return new Promise((done) => {
    const t0 = Date.now();
    const transcript = [];
    let stderr = "";
    let child;
    try {
      child = spawn(entry.command, entry.args, { cwd: folder, shell, detached: !WINDOWS, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      return done({ ok: false, said: `${label} could not be started: ${e.code ?? e.message}.`, stage: "start" });
    }
    let buffer = "";
    const waiting = new Map();
    let ended = false;
    const stop = () => {
      if (ended) return;
      ended = true;
      try {
        if (WINDOWS) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else process.kill(-child.pid, "SIGTERM");
      } catch { /* already gone */ }
    };
    child.on("error", (e) => { for (const [, w] of waiting) w.reject(new Error(`the process failed to start: ${e.code ?? e.message}`)); waiting.clear(); });
    child.on("exit", (code) => { for (const [, w] of waiting) w.reject(new Error(`the process exited with ${code} before answering`)); waiting.clear(); });
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-4000); });
    child.stdout.on("data", (d) => {
      buffer += d;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { transcript.push({ notJson: line.slice(0, 200) }); continue; }
        transcript.push({ in: msg });
        if (msg.id !== undefined && waiting.has(msg.id)) { const w = waiting.get(msg.id); waiting.delete(msg.id); w.resolve(msg); }
      }
    });
    const send = (msg) => { transcript.push({ out: msg }); child.stdin.write(JSON.stringify(msg) + "\n"); };
    const ask = (id, method, params, ms) => new Promise((ok, no) => {
      const timer = setTimeout(() => { waiting.delete(id); no(new Error(`no answer to ${method} within ${Math.round(ms / 1000)} s`)); }, ms);
      waiting.set(id, { resolve: (m) => { clearTimeout(timer); ok(m); }, reject: (e) => { clearTimeout(timer); no(e); } });
      send({ jsonrpc: "2.0", id, method, params });
    });
    (async () => {
      let stage = "initialize";
      try {
        const init = await ask(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "keep-it-working-release-check", version: "1.0.0" } }, firstAnswerMs);
        if (init.error) throw new Error(`initialize was refused: ${init.error.message}`);
        const server = init.result?.serverInfo ?? {};
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        stage = "tools/list";
        const listed = await ask(2, "tools/list", {}, 60_000);
        if (listed.error) throw new Error(`tools/list was refused: ${listed.error.message}`);
        const tools = listed.result?.tools ?? [];
        const tool = tools.find((x) => x.name === opt.tool);
        if (!tool) throw new Error(`the server lists ${tools.length} tools (${tools.map((x) => x.name).join(", ")}) but not ${opt.tool}`);
        const readOnly = tool.annotations?.readOnlyHint === true;
        stage = `tools/call ${opt.tool}`;
        const toolArgs = JSON.parse(opt["tool-args"].replaceAll("{folder}", folder.replaceAll("\\", "\\\\")));
        const called = await ask(3, "tools/call", { name: opt.tool, arguments: toolArgs }, 120_000);
        if (called.error) throw new Error(`the call was refused: ${called.error.message}`);
        if (called.result?.isError) throw new Error(`the tool answered with an error: ${JSON.stringify(called.result.content?.[0]?.text ?? "").slice(0, 300)}`);
        stop();
        done({
          ok: true, stage: "done", seconds: Math.round((Date.now() - t0) / 1000),
          protocol: init.result?.protocolVersion, server, tools: tools.map((x) => ({ name: x.name, readOnly: x.annotations?.readOnlyHint === true })),
          toolReadOnly: readOnly, result: called.result, transcript, stderr,
        });
      } catch (e) {
        stop();
        done({ ok: false, stage, said: e.message, transcript, stderr, seconds: Math.round((Date.now() - t0) / 1000) });
      }
    })();
  });
}

function summarize(result) {
  const structured = result?.structuredContent;
  if (structured?.riskCounts) {
    const files = (structured.files ?? structured.entries ?? []).map((f) => `${f.path} (${f.risk})`);
    return `risk counts ${JSON.stringify(structured.riskCounts)}${files.length ? `; files: ${files.slice(0, 6).join(", ")}` : ""}`;
  }
  const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
  return text ? `${text.replace(/\s+/g, " ").slice(0, 240)}${text.length > 240 ? "..." : ""}` : "an answer with no text";
}

const runs = [];
for (const [label, entry, shell, how] of [
  ["Claude Desktop", claudeEntry, false, WINDOWS ? "started as configured: cmd /c npx, without a shell around it" : "started as configured, without a shell"],
  // VS Code's entry names plain "npx". On Windows that is npx.cmd, which Node starts only through cmd.
  ["VS Code", vscodeEntry, WINDOWS, WINDOWS ? "npx resolved on PATH (npx.cmd) and run through cmd" : "started as configured, without a shell"],
]) {
  const run = await startAs(label, entry, shell);
  run.label = label;
  run.how = how;
  run.command = shown(entry.command, entry.args);
  runs.push(run);
  writeFileSync(join(out, `${label.toLowerCase().replace(/\s+/g, "-")}-transcript.json`), JSON.stringify({ entry, how, ...run, result: run.result }, null, 2) + "\n");
  if (run.ok) {
    record(`Start it as ${label} does, list its tools, call ${opt.tool}`, true,
      `${how}. It answered in ${run.seconds} s as ${run.server.name ?? "a server"} ${run.server.version ?? ""} (protocol ${run.protocol}), listed ${run.tools.length} tools (${run.tools.map((t) => t.name).join(", ")}), and ${opt.tool}${run.toolReadOnly ? ", marked read-only," : ""} returned ${summarize(run.result)}.`,
      { command: run.command });
  } else {
    record(`Start it as ${label} does, list its tools, call ${opt.tool}`, false,
      `${how}. It failed at ${run.stage}: ${run.said}.${run.stderr ? ` The server's last words: "${run.stderr.trim().split("\n").at(-1).slice(0, 300)}".` : ""}`,
      { command: run.command });
  }
}

// ---- 6. The report ------------------------------------------------------------------------------------------
const passed = !failed;
const machine = `${WINDOWS ? "Windows" : process.platform} ${release()} (${arch()}), Node ${node}, npm ${npmVersion}`;
const runner = process.env.GITHUB_ACTIONS ? `GitHub Actions ${process.env.RUNNER_OS ?? ""} runner (${process.env.ImageOS ?? "image"} ${process.env.ImageVersion ?? ""}), run ${process.env.GITHUB_SERVER_URL ?? ""}/${process.env.GITHUB_REPOSITORY ?? ""}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}` : "a local run";
const md = [
  `# Release check: ${spec}${resolved ? ` (${resolved})` : ""}`,
  "",
  passed ? `**Passed.** Every step below worked on ${machine}.` : `**Failed at: ${failed}.** The steps before it passed; the ones after it ran anyway and are listed as they went.`,
  "",
  `Where: ${runner}. When: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
  "",
  "| | Step | What happened |",
  "| --- | --- | --- |",
  ...steps.map((s, i) => `| ${s.ok ? "Passed" : "**Failed**"} | ${i + 1}. ${s.name} | ${s.said.replaceAll("|", "\\|")} |`),
  "",
  "## The configurations used",
  "",
  `Claude Desktop (\`${claudeConfigPath}\`):`,
  "",
  "```json",
  JSON.stringify({ mcpServers: { [serverName]: claudeEntry } }, null, 2),
  "```",
  "",
  `VS Code (\`.vscode/mcp.json\` in the workspace):`,
  "",
  "```json",
  JSON.stringify({ servers: { [serverName]: vscodeEntry } }, null, 2),
  "```",
  "",
  "## To reproduce",
  "",
  "On the tested operating system with Node 20 or newer, from a copy of the SameDayDesk repository:",
  "",
  "```bat",
  `node tools\\keep-it-working\\windows\\stdio-release-check.mjs --package ${spec}${opt["self-check"] ? ` --self-check "${opt["self-check"]}"` : ""} --tool ${opt.tool} --tool-args "${opt["tool-args"].replaceAll('"', '\\"')}" --out report`,
  "```",
  "",
  "Or each step by hand:",
  "",
  "```bat",
  ...steps.filter((s) => s.command).map((s) => s.command),
  "```",
  "",
  "Each server's full exchange is in the `*-transcript.json` files beside this report" + (opt["self-check"] ? ", and the self-check's output in `self-check.txt`." : "."),
  "",
].join("\n");
writeFileSync(join(out, "REPORT.md"), md);
writeFileSync(join(out, "report.json"), JSON.stringify({ package: spec, resolved, machine, runner, passed, failed, steps, runs: runs.map(({ transcript, ...r }) => r) }, null, 2) + "\n");
console.log(`\n${passed ? "Passed" : `Failed at: ${failed}`}. Report: ${join(out, "REPORT.md")}`);
process.exit(passed ? 0 : 1);
