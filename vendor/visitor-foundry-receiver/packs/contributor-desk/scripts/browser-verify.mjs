import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const pack = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(pack, "../..");
const out = path.join(root, "dist");
const server = createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  try {
    let route = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (route.endsWith("/")) route += "index.html";
    const file = path.resolve(out, `.${route}`);
    if (!file.startsWith(out + path.sep)) throw new Error("escape");
    const body = await readFile(file);
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    };
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = process.env.CHROME_BIN || "/usr/local/bin/google-chrome";
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${origin}/labs/contributor-desk/`, { waitUntil: "networkidle" });
assert.match(await page.title(), /Contributor desk/);
assert.equal(await page.locator("[data-contributor-desk]").count(), 1);
assert.match(await page.locator("[data-desk-browse]").innerText(), /tsk_open_alpha/);
await page.getByRole("button", { name: "Claim without a wallet" }).click();
const afterClaim = await page.locator("[data-desk-result]").textContent();
assert.match(afterClaim, /"lifecycle": "claimed"/);
assert.match(afterClaim, /ctr_walrus/);
await page.getByRole("button", { name: "Read status" }).click();
assert.match(await page.locator("[data-desk-result]").textContent(), /"lifecycle": "claimed"/);
await page.getByRole("button", { name: "File appeal" }).click();
assert.match(await page.locator("[data-desk-result]").textContent(), /"status": "filed"/);
await page.getByRole("button", { name: "Compare owed and paid" }).click();
const owed = await page.locator("[data-desk-result]").textContent();
assert.match(owed, /"owed": true/);
assert.match(owed, /"paid": false/);
assert.match(owed, /"settled": false/);
await page.locator("[data-desk-owner-token]").fill("dev-owner-token-s275");
await page.getByRole("button", { name: "Claim without a wallet" }).click();
assert.match(await page.locator("[data-desk-result]").textContent(), /desk_holds_earned_work_secret/);
await page.locator("[data-desk-owner-token]").fill("");
await page.locator("[data-desk-payout-key]").fill("a".repeat(64));
await page.getByRole("button", { name: "Read status" }).click();
assert.match(await page.locator("[data-desk-result]").textContent(), /contributor_holds_payout_key/);
assert.equal(await page.locator("[data-contributor-desk]").getAttribute("data-desk-killed"), "true");
const contract = await (await page.request.get(`${origin}/labs/contributor-desk.json`)).json();
assert.equal(contract.walletless, true);
assert.equal(contract.seededFailure.code, "desk_holds_earned_work_secret");
assert.deepEqual(errors, []);
await browser.close();
server.close();
console.log("BROWSER_OK browse/claim/status/appeal/owed + seeded secret refusal + payout-key kill");
