#!/usr/bin/env node
import http from "node:http";
import { readFileSync } from "node:fs";

const beforePath = process.argv[2];
const afterPath = process.argv[3];
if (!beforePath || !afterPath) {
  process.stderr.write("usage: loopback-server.mjs <before> <after>\n");
  process.exit(2);
}
const before = readFileSync(beforePath);
const after = readFileSync(afterPath);
const server = http.createServer((req, res) => {
  if (req.url === "/before.json") {
    res.setHeader("content-type", "application/json");
    res.end(before);
    return;
  }
  if (req.url === "/after.json") {
    res.setHeader("content-type", "application/json");
    res.end(after);
    return;
  }
  res.statusCode = 404;
  res.end("not found\n");
});
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`${server.address().port}\n`);
});
