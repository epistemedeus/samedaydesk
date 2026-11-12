#!/usr/bin/env node
import { main } from "../src/cli.mjs";

// SIGINT aborts in-flight requests through an AbortSignal (honored by client-io
// versions that accept one) and exits 130. A second SIGINT uses the default
// handler. Remote work that was already sent is not cancelled by this.
const controller = new AbortController();
const onSigint = () => controller.abort(Object.assign(new Error("interrupted"), { name: "AbortError" }));
process.once("SIGINT", onSigint);
const code = await main(process.argv.slice(2), { signal: controller.signal });
process.off("SIGINT", onSigint);
if (code === 130) process.exit(130);
process.exitCode = code;
