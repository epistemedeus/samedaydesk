import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { OWNED_DIR } from "./pins.mjs";
import { FeedRefuse, ok } from "./refuse.mjs";
import { ingestObservation, listAllResult, listCurrentResult } from "./ingest.mjs";
import { readJsonFile, runJourney } from "./journey.mjs";
import { writeLiveCatalogFile } from "./store.mjs";

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      flags._ = flags._ || [];
      flags._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { cmd: cmd || "help", flags };
}

export function resolveExisting(p) {
  if (!p || p === true) return null;
  if (isAbsolute(p)) return p;
  const fromCwd = resolve(process.cwd(), p);
  if (existsSync(fromCwd)) return fromCwd;
  const fromOwned = join(OWNED_DIR, p);
  if (existsSync(fromOwned)) return fromOwned;
  return fromCwd;
}

function helpText() {
  return [
    "vendor-price-feed — W3-13 H02 PR51 vendor-budget price facts as observations",
    "",
    "Usage:",
    "  node bin/vendor-price-feed.mjs journey --fixture fixtures/ok.json",
    "  node bin/vendor-price-feed.mjs ingest --file fixtures/ok.json --store /tmp/vpf",
    "  node bin/vendor-price-feed.mjs list-current --store /tmp/vpf",
    "",
    "SAMPLE cannot be provenance upstream. Live SDS prices are not writable.",
    "",
  ].join("\n");
}

export function runCli(argv, { storeDir } = {}) {
  const { cmd, flags } = parseArgs(argv);
  const dir = storeDir || flags.store || null;

  if (flags["write-live"] || flags["apply-live"]) {
    try {
      writeLiveCatalogFile();
    } catch (err) {
      if (err instanceof FeedRefuse) return err.toJSON();
      throw err;
    }
  }

  try {
    if (!cmd || cmd === "help" || flags.help) {
      return ok({ command: "help", help: helpText() });
    }

    if (cmd === "journey") {
      const fixturePath = resolveExisting(flags.fixture);
      if (!fixturePath) {
        throw new FeedRefuse("missing-fixture", "journey requires --fixture <path>");
      }
      return runJourney({ fixturePath, storeDir: dir, flags });
    }

    if (cmd === "ingest") {
      const file = resolveExisting(flags.file || flags.fixture);
      if (!file) throw new FeedRefuse("missing-fixture", "ingest requires --file <path>");
      if (!dir) throw new FeedRefuse("missing-store", "ingest requires --store <dir>");
      const input = readJsonFile(file);
      return ingestObservation(input, { storeDir: dir, flags });
    }

    if (cmd === "list-current") {
      if (!dir) throw new FeedRefuse("missing-store", "list-current requires --store <dir>");
      return listCurrentResult(dir);
    }

    if (cmd === "list") {
      if (!dir) throw new FeedRefuse("missing-store", "list requires --store <dir>");
      return listAllResult(dir);
    }

    throw new FeedRefuse("unknown-command", `unknown command ${cmd}`);
  } catch (err) {
    if (err instanceof FeedRefuse) return err.toJSON();
    throw err;
  }
}
