import { readFile, writeFile } from "node:fs/promises";
import { configuredCareService } from "../lib/care-service.js";

const [requestId, termsFile, receiptFile] = process.argv.slice(2);
if (!requestId || !termsFile || !receiptFile) throw new Error("Usage: issue-task-quote.mjs <request-uuid> <terms-file> <private-output>");
const care = configuredCareService();
if (!care) throw new Error("The SameDayDesk quote store is unavailable.");
try {
  // No message is sent by this command. The file is the price and scope
  // receipt from which the operator can prepare the buyer's written quote.
  const terms = JSON.parse(await readFile(termsFile, "utf8"));
  const receipt = await care.issueQuote(requestId, terms);
  await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write("Recorded the fixed quote in the requested private file.\n");
} finally { await care.close(); }
