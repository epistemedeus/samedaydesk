import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { KIT_SCHEMA } from "./pins.mjs";
import { loadPacket, packetPath, readbackPacket } from "./packet.mjs";

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function packetBytes(file) {
  try {
    return { path: file, bytes: readFileSync(file).length };
  } catch {
    return { path: file, bytes: null };
  }
}

export function createPacketServer({ packetDir }) {
  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (req.method === "GET" && url === "/health") {
      send(res, 200, { ok: true, kit: KIT_SCHEMA, liveSettlement: "out-of-scope", deployed: false });
      return;
    }
    if (req.method === "GET" && url === "/packet") {
      const loaded = loadPacket(packetDir);
      if (!loaded.ok) {
        send(res, 404, { ok: false, code: loaded.code, kit: KIT_SCHEMA });
        return;
      }
      send(res, 200, loaded.packet);
      return;
    }
    if (req.method === "GET" && url === "/readback") {
      const rb = readbackPacket(packetDir);
      send(res, rb.ok ? 200 : 409, rb);
      return;
    }
    if (req.method === "GET" && url === "/return") {
      const loaded = loadPacket(packetDir);
      if (!loaded.ok) {
        send(res, 404, { ok: false, code: loaded.code, kit: KIT_SCHEMA });
        return;
      }
      const comparison = loaded.packet.returnJob?.comparison;
      send(res, 200, {
        ok: true,
        returnSignal: comparison?.returnSignal || "absent",
        usefulSecondJob: comparison?.usefulSecondJob === true,
        liveReturn: loaded.packet.field?.liveReturn || "absent",
        deployedArtifact: loaded.packet.deploy?.artifact || "absent",
        label: loaded.packet.returnJob?.label || loaded.packet.label || "owner-qa",
      });
      return;
    }
    if (req.method === "GET" && url === "/deployed") {
      send(res, 200, {
        ok: true,
        deployed: false,
        artifact: "absent",
        kit: KIT_SCHEMA,
        packet: packetBytes(packetPath(packetDir)),
      });
      return;
    }
    send(res, 404, { ok: false, code: "not-found", kit: KIT_SCHEMA });
  });
  return { server };
}

export function listenPacketServer(server, { host = "127.0.0.1", port = 0 } = {}) {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ host, port: addr.port, origin: `http://${host}:${addr.port}` });
    });
  });
}
