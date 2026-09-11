#!/usr/bin/env node
import { writeFileSync } from "node:fs";

if (process.env.D16_PIDFILE) {
  writeFileSync(process.env.D16_PIDFILE, `${process.pid}\n`);
}
setInterval(() => {}, 1 << 30);
