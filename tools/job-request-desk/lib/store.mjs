import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { REQUEST_ID_RE } from "./pins.mjs";
import { refuse } from "./refuse.mjs";

function resolveStoreRoot(storeDir) {
  if (storeDir == null || storeDir === false || storeDir === "") {
    throw refuse("missing-store", "--store directory is required");
  }
  const raw = String(storeDir);
  if (raw.includes("\0")) {
    throw refuse("store-path-escape", "store path contains a NUL byte");
  }
  return resolve(raw);
}

export function assertInside(root, candidate, { label = "path" } = {}) {
  const rootAbs = resolve(root);
  const candAbs = resolve(candidate);
  const rel = relative(rootAbs, candAbs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw refuse("store-path-escape", `${label} escapes the store directory`, {
      root: rootAbs,
      path: candAbs,
    });
  }
  if (rel.split(sep).includes("..")) {
    throw refuse("store-path-escape", `${label} escapes the store directory`, {
      root: rootAbs,
      path: candAbs,
    });
  }
  return candAbs;
}

export function assertRequestId(requestId) {
  const id = String(requestId || "");
  if (!REQUEST_ID_RE.test(id)) {
    throw refuse("store-path-escape", "requestId is not a stable 64-hex digest (path escape refused)", {
      requestId,
    });
  }
  return id;
}

export function createJsonStore(storeDir) {
  const root = resolveStoreRoot(storeDir);
  mkdirSync(root, { recursive: true });
  const ticketsDir = join(root, "tickets");
  const resultsDir = join(root, "results");
  const indexPath = join(root, "index.json");
  mkdirSync(ticketsDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  function ticketPath(requestId) {
    const id = assertRequestId(requestId);
    return assertInside(root, join(ticketsDir, `${id}.json`), { label: "ticket" });
  }

  function resultDir(requestId) {
    const id = assertRequestId(requestId);
    const dir = join(resultsDir, id);
    return assertInside(root, dir, { label: "resultUri" });
  }

  function readIndex() {
    if (!existsSync(indexPath)) return { orders: {} };
    try {
      return JSON.parse(readFileSync(indexPath, "utf8"));
    } catch {
      return { orders: {} };
    }
  }

  function writeIndex(index) {
    assertInside(root, indexPath, { label: "index" });
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  }

  return {
    kind: "json-file",
    root,
    ticketPath,
    resultDir,
    resultUri(requestId) {
      const dir = resultDir(requestId);
      mkdirSync(dir, { recursive: true });
      return `file://${dir}`;
    },
    read(requestId) {
      const path = ticketPath(requestId);
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, "utf8"));
    },
    write(ticket) {
      const path = ticketPath(ticket.requestId);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(ticket, null, 2)}\n`);
      if (ticket.orderId && ticket.orderId !== ticket.requestId) {
        const index = readIndex();
        index.orders = index.orders || {};
        index.orders[ticket.orderId] = ticket.requestId;
        writeIndex(index);
      }
      return ticket;
    },
    findByOrderId(orderId) {
      if (!orderId) return null;
      const index = readIndex();
      const requestId = index.orders?.[orderId];
      if (requestId) return this.read(requestId);
      for (const ticket of this.list()) {
        if (ticket.orderId === orderId) return ticket;
      }
      return null;
    },
    list() {
      if (!existsSync(ticketsDir)) return [];
      const out = [];
      for (const name of readdirSync(ticketsDir)) {
        if (!name.endsWith(".json")) continue;
        const id = name.slice(0, -".json".length);
        if (!REQUEST_ID_RE.test(id)) continue;
        const path = join(ticketsDir, name);
        try {
          assertInside(root, path, { label: "ticket" });
          out.push(JSON.parse(readFileSync(path, "utf8")));
        } catch {
          /* skip unreadable */
        }
      }
      out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.createdAt || "")));
      return out;
    },
  };
}
