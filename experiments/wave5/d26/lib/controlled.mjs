import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MERCHANT_ROOT } from "./pins.mjs";

const TINY = {
  name: "d26-controlled",
  version: "1.0.0",
  lockfileVersion: 3,
  requires: true,
  packages: {
    "": { name: "d26-controlled", version: "1.0.0" },
    "node_modules/fixture-alpha": {
      version: "1.0.0",
      resolved: "https://example.invalid/fixture-alpha-1.0.0.tgz",
      integrity: "sha512-l/0QZeYH6WYJLVF9qn9Rymjnrjn7Oi0ExEDpGIQ337qIpPWJQhd5TSVlE2YOET42IWoCns7YnU02SuLR7aduBA==",
    },
  },
};

function withPad(doc, targetBytes) {
  const clone = JSON.parse(JSON.stringify(doc));
  clone._d26pad = "";
  const encoded = () => Buffer.from(JSON.stringify(clone), "utf8");
  let buf = encoded();
  if (buf.length >= targetBytes) return clone;
  clone._d26pad = "x".repeat(Math.max(0, targetBytes - buf.length));
  buf = encoded();
  while (buf.length < targetBytes) {
    clone._d26pad += "x";
    buf = encoded();
  }
  while (buf.length > targetBytes && clone._d26pad.length) {
    clone._d26pad = clone._d26pad.slice(0, -1);
    buf = encoded();
  }
  return clone;
}

export function htmlRefuseBody() {
  const html = `<!DOCTYPE html><html><head><title>not a lockfile</title></head><body><p>html</p></body></html>`;
  return { before: html, after: html };
}

export function pathRefuseBody() {
  return { before: "./package-lock.json", after: "../secrets/package-lock.json" };
}

export function nearLockfileLimitBody(maxLockfileBytes = 128 * 1024) {
  const target = maxLockfileBytes - 64;
  const before = withPad(TINY, target);
  const after = JSON.parse(JSON.stringify(TINY));
  after.packages["node_modules/fixture-beta"] = {
    version: "2.0.0",
    resolved: "https://example.invalid/fixture-beta-2.0.0.tgz",
    integrity: "sha512-0QtRlD/POcdQv6b4iFPabhFBByI/c9FaLvfssINXg0Tms8JIij5lcTGvIEJTQ5netWtguTSeYn7a+wH5XmwHXg==",
  };
  return { before, after, targetBytes: target };
}

export function oversizeLockfileBody(maxLockfileBytes = 128 * 1024) {
  const target = maxLockfileBytes + 2048;
  const before = withPad(TINY, target);
  return { before, after: before, targetBytes: target };
}

export function oversizeRequestBody(maxRequestBytes = 256 * 1024) {
  const half = Math.floor(maxRequestBytes / 2) + 4096;
  const before = withPad(TINY, half);
  const after = withPad(TINY, half);
  return { before, after };
}

export function merchantHtmlFixture(merchantRoot = DEFAULT_MERCHANT_ROOT) {
  try {
    return readFileSync(join(merchantRoot, "fixtures/lockfile-pin-delta/not-a-lock.html"), "utf8");
  } catch {
    return htmlRefuseBody().before;
  }
}

export function controlledCases() {
  const near = nearLockfileLimitBody();
  const overLock = oversizeLockfileBody();
  const overReq = oversizeRequestBody();
  return [
    {
      id: "controlled-near-admitted-lockfile",
      family: "controlled",
      kind: "near-128kiB-lockfile",
      expectClass: "successful",
      body: { before: near.before, after: near.after },
    },
    {
      id: "controlled-oversize-lockfile",
      family: "controlled",
      kind: "over-128kiB-lockfile",
      expectClass: "refused",
      body: { before: overLock.before, after: overLock.after },
    },
    {
      id: "controlled-oversize-request",
      family: "controlled",
      kind: "over-256kiB-request",
      expectClass: "refused",
      body: { before: overReq.before, after: overReq.after },
    },
    {
      id: "controlled-html-refuse",
      family: "controlled",
      kind: "html-input",
      expectClass: "refused",
      body: htmlRefuseBody(),
    },
    {
      id: "controlled-path-refuse",
      family: "controlled",
      kind: "filesystem-path",
      expectClass: "refused",
      body: pathRefuseBody(),
    },
  ];
}
