import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { deliverFirstUseReport, firstUseReportMaxBytes, firstUseWorkQueue } from "../lib/first-use-delivery.js";

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    output: { type: "string" }, order: { type: "string" }, report: { type: "string" },
    links: { type: "string" },
  } });
  function protectedInput(path, maxBytes) {
    if (!path || !isAbsolute(path)) throw new Error();
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > maxBytes) throw new Error();
    return readFileSync(path);
  }
  if (positionals.length === 1 && positionals[0] === "queue" && values.output &&
      isAbsolute(values.output) && Object.keys(values).length === 1) {
    const queue = await firstUseWorkQueue();
    writeFileSync(values.output, JSON.stringify(queue, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ received: queue.length }));
  } else if (positionals.length === 1 && positionals[0] === "deliver" && Object.keys(values).length === 3 &&
      values.order && values.report && values.links) {
    const links = JSON.parse(protectedInput(values.links, 4096));
    const { recordingUrl, recordingAccessConfirmed, fixPrUrl } = links;
    const pdf = protectedInput(values.report, firstUseReportMaxBytes);
    console.log(JSON.stringify(await deliverFirstUseReport({ id: values.order, pdf, recordingUrl, recordingAccessConfirmed, fixPrUrl })));
  } else {
    throw new Error();
  }
} catch {
  console.error("First-use operation not received. Verify the protected inputs and read the existing order before retrying.");
  process.exitCode = 1;
}
