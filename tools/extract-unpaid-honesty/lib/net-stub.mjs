import { inspectRequest } from "./inspect.mjs";
import { appendInterceptLog, honestyForbiddenError } from "./fetch-guard.mjs";

export function urlsFromArgv(argv) {
  const urls = [];
  for (const arg of argv) {
    if (/^https?:\/\//i.test(arg)) urls.push(arg);
  }
  return urls;
}

export async function runNetStub(tool, argv) {
  const urls = urlsFromArgv(argv);
  if (urls.length === 0) {
    const hit = {
      method: "GET",
      url: "",
      forbidden: false,
      reasons: [],
      tool,
      note: "no-url",
    };
    appendInterceptLog({ kind: "path-stub", tool, ...hit });
    process.stderr.write(`${JSON.stringify({ ok: false, refused: true, code: "honesty_net_stub_no_url", tool })}\n`);
    process.exit(2);
  }
  for (const url of urls) {
    const hit = inspectRequest({ url, method: "GET", headers: {} });
    appendInterceptLog({ kind: "path-stub", tool, ...hit });
    if (hit.forbidden) {
      const err = honestyForbiddenError(hit);
      process.stderr.write(
        `${JSON.stringify({ ok: false, refused: true, code: err.code, reasons: hit.reasons, url: hit.url, tool })}\n`,
      );
      process.exit(2);
    }
  }
  process.stderr.write(
    `${JSON.stringify({ ok: false, refused: true, code: "honesty_unexpected_network", tool, urls })}\n`,
  );
  process.exit(2);
}
