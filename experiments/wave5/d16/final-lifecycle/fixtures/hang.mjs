#!/usr/bin/env node
import { writeFileSync } from "node:fs";

if (process.env.D16_FINAL_PIDFILE) {
  writeFileSync(process.env.D16_FINAL_PIDFILE, `${process.pid}\n`);
}
setInterval(() => {}, 1 << 30);
