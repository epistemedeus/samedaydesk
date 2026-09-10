import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, unusedPort } from "./lib.mjs";

export class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.addEventListener("message", (event) => this.#onMessage(event.data));
  }

  #onMessage(data) {
    const message = JSON.parse(data);
    if (message.id != null && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message || "cdp error"} (${JSON.stringify(message.error)})`));
      else resolve(message.result);
      return;
    }
    if (message.method) {
      const hooks = this.listeners.get(message.method);
      if (hooks) for (const hook of hooks) hook(message.params || {});
    }
  }

  on(method, hook) {
    const hooks = this.listeners.get(method) || [];
    hooks.push(hook);
    this.listeners.set(method, hooks);
    return () => {
      const next = (this.listeners.get(method) || []).filter((item) => item !== hook);
      this.listeners.set(method, next);
    };
  }

  send(method, params = {}) {
    const id = (this.nextId += 1);
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 20_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }
}

export async function connectCdp(wsUrl, timeoutMs = 15_000) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`websocket timeout ${wsUrl}`)), timeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return new CdpSession(ws);
}

async function waitJson(url, timeoutMs = 15_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      last = new Error(`${url} -> ${response.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw last || new Error(`timeout waiting ${url}`);
}

export async function launchChrome({ viewport, logPath } = {}) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      "Chrome/Chromium not found. Nearest supported local command is /opt/google/chrome/google-chrome --headless=new with an isolated --user-data-dir. Do not use /usr/local/bin/google-chrome; that wrapper pins the shared profile and port 9222.",
    );
  }
  const port = await unusedPort();
  const userDataDir = join(tmpdir(), `sds-browser-smoke-${process.pid}-${port}`);
  mkdirSync(userDataDir, { recursive: true });
  const width = viewport?.width || 1440;
  const height = viewport?.height || 900;
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-hang-monitor",
    "--disable-popup-blocking",
    "--disable-prompt-on-repost",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--mute-audio",
    "--hide-scrollbars",
    "--password-store=basic",
    "--use-mock-keychain",
    "--disable-component-update",
    "--disable-features=Translate,MediaRouter,OptimizationHints,PaintHolding",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "--ozone-platform=headless",
    `--ozone-override-screen-size=${width},${height}`,
    "about:blank",
  ];
  const child = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
  const logs = [];
  const collect = (chunk) => {
    logs.push(chunk.toString());
    if (logPath) writeFileSync(logPath, logs.join(""));
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const exitPromise = new Promise((resolve) => child.once("exit", resolve));
  try {
    const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
    const targets = await waitJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((item) => item.type === "page") || targets[0];
    if (!page?.webSocketDebuggerUrl) throw new Error("chrome started without a page websocket");
    const cdp = await connectCdp(page.webSocketDebuggerUrl);
    return {
      chrome,
      port,
      userDataDir,
      version,
      cdp,
      pid: child.pid,
      async close() {
        cdp.close();
        child.kill("SIGTERM");
        const exited = await Promise.race([
          exitPromise.then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
        ]);
        if (!exited) child.kill("SIGKILL");
      },
    };
  } catch (error) {
    child.kill("SIGKILL");
    error.message = `${error.message}\nchrome log:\n${logs.join("")}`;
    throw error;
  }
}

export async function setViewport(cdp, viewport) {
  try {
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { width: viewport.width, height: viewport.height, windowState: "normal" },
    });
  } catch {
    // Headless targets may not expose a window; device metrics still apply.
  }
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: Boolean(viewport.mobile),
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
}

export async function navigate(cdp, url) {
  await cdp.send("Page.enable");
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`load timeout ${url}`)), 15_000);
    const off = cdp.on("Page.loadEventFired", () => {
      clearTimeout(timer);
      off();
      resolve();
    });
  });
  await cdp.send("Page.navigate", { url });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

export async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text || result.exceptionDetails.exception?.description || "evaluate failed";
    throw new Error(text);
  }
  return result.result?.value;
}

export async function screenshotPng(cdp) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  return Buffer.from(data, "base64");
}
