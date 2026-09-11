#!/usr/bin/env node
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const before = readFileSync(process.argv[2]);
const after = readFileSync(process.argv[3]);
const server = createServer((req, res) => {
  const body = req.url?.startsWith("/after") ? after : before;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(body);
});
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`${server.address().port}\n`);
});
