#!/usr/bin/env node
import { parseArgs, helpText } from "../lib/args.mjs";
import { bindMain } from "../lib/bind.mjs";
import { BinderRefuse, emitRefuse } from "../lib/refuse.mjs";

const args = parseArgs(process.argv.slice(2));
const bare = !args.ticket && (args.help || args.h || args._[0] === "help" || args._.length === 0);
if (bare && !args.ticket) {
  process.stdout.write(helpText());
  process.exit(args.help || args.h || args._[0] === "help" || args._.length === 0 ? 0 : 2);
}

bindMain(args).catch((err) => {
  if (err instanceof BinderRefuse) emitRefuse(err);
  emitRefuse(err);
});
