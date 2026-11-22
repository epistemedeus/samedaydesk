// N12 only, AFTER the existing full batch, under that batch's SAME existing
// advisory lock. Adapted from EIN ae68a81e diagnostic; installed packet and
// original gzip server, or explicit production mount. One
// diagnostic per failed page retains the evidence its aggregate runner drops;
// these are not five-run B4 results. This script is never run on the builder.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const requireValue = flag => {
  const v = args.includes(flag) && value(flag);
  if (!v || v.startsWith("--")) throw Error(`required ${flag}`);
  return v;
};
try {
  if (args.includes("--help")) {
    console.log("--packet ABS --preview ABS --source SHA40 --lock-file EXISTING_BATCH_LOCK --expected-boot N12_BOOT --out ABS; after batch only, not B4");
    process.exit(0);
  }
  const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  if (requireValue("--expected-boot") !== boot || boot !== "8f6e9268-3637-4e23-b3d2-b2d36b57c4dd") throw Error("dedicated-host-unreceived");
  const lock = requireValue("--lock-file");
  if (lock !== "/tmp/pilot-grand-phase-lighthouse.lock" || !existsSync(lock)) throw Error("existing-batch-lock-required");
  if (!args.includes("--locked")) {
    const child = spawnSync("flock", ["--nonblock", "--exclusive", lock, process.execPath, fileURLToPath(import.meta.url), ...args, "--locked"], { stdio: "inherit" });
    if (child.error) throw child.error;
    process.exit(child.status ?? 2);
  }
  const packet = resolve(requireValue("--packet")), root = resolve(requireValue("--preview")), out = resolve(requireValue("--out"));
  const source = requireValue("--source");
  if (!/^[a-f0-9]{40}$/.test(source)) throw Error("exact-source-required");
  if (!existsSync(join(root,"route-shells/.public-first-render/home.html"))) throw Error("production-preview-required");
  const req = createRequire(join(packet,"package.json"));
  const puppeteer = req("puppeteer-core");
  const { default: lighthouse } = await import(pathToFileURL(req.resolve("lighthouse")).href);
  const mount = args.includes("--production-mount") ? resolve(requireValue("--production-mount")) : join(packet,"serve.mjs");
  const { serve } = await import(pathToFileURL(mount).href);
  const manifest = JSON.parse(readFileSync(join(packet,"manifest.json"),"utf8"));
  mkdirSync(out); // New directory only: preserve every prior diagnostic.
  const server = serve(root, manifest.sites.sds.preview.serve);
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const rows=[];
  try {
    for (const path of ["/","/x402","/for-agents","/receipts","/for-agents/useful-jobs"]) {
      const load=os.loadavg();
      if (load[0] >= 1) throw Error("dedicated-host-not-idle; no diagnostic started");
      const browser=await puppeteer.launch({executablePath:process.env.RELEASE_CHROME||"/usr/bin/google-chrome",headless:true,args:["--disable-dev-shm-usage","--no-first-run"]});
      try {
        const r=await lighthouse(`http://127.0.0.1:${server.address().port}${path}`,{port:Number(new URL(browser.wsEndpoint()).port),output:"json",logLevel:"error",onlyCategories:["performance"],formFactor:"mobile",throttlingMethod:"simulate",blockedUrlPatterns:manifest.blockedUrlPatterns});
        if (r.lhr.runtimeError || !r.artifacts?.Trace?.traceEvents?.length || !r.artifacts.DevtoolsLog) throw Error("diagnostic-no-valid-trace");
        const stem=join(out,path.slice(1).replaceAll("/","__") || "home");
        writeFileSync(stem+".lhr.json",JSON.stringify(r.lhr));
        writeFileSync(stem+".trace.json",JSON.stringify(r.artifacts.Trace));
        writeFileSync(stem+".network.json",JSON.stringify(r.artifacts.DevtoolsLog));
        rows.push({path,source,load,scope:"one diagnostic, NOT a B4 budget pass",files:[stem+".lhr.json",stem+".trace.json",stem+".network.json"]});
      } finally {await browser.close();}
    }
  } finally { await new Promise(r=>server.close(r)); writeFileSync(join(out,"diagnostic.json"),JSON.stringify({source,boot,lock,mountProfile:args.includes("--production-mount")?"production-static-mount":"original-packet-static-CSR",rows},null,2)+"\n"); }
} catch (error) { console.error(error.message); process.exitCode=2; }
