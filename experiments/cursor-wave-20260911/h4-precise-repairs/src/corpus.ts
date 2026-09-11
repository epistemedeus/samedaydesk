import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { designCanary, invokeLiveSettle } from "./canary.ts";
import {
  CORPUS_DISPOSITIONS,
  REQUIRED_CORPUS_IDS,
  type CorpusDisposition,
  type CorpusFixture,
} from "./corpus-types.ts";
import { FIXTURE_BECOMES_SALE, LIVE_SETTLE_REFUSED } from "./failures.ts";
import { PACK_ROOT } from "./paths.ts";

export const DEFAULT_CORPUS_DIR = join(PACK_ROOT, "fixtures/corpus");

const CORPUS_KINDS = Object.freeze([
  "reproduction",
  "regression",
  "brief",
  "note",
] as const);

export type CorpusResultRow = {
  id: string;
  disposition: CorpusDisposition;
  notes: string;
};

export type InvalidCorpusFixture = {
  readonly code: "invalid-corpus-fixture";
  readonly rejected: true;
  readonly completed: false;
  readonly saleState: "not_a_sale";
  readonly reason: string;
};

export type CorpusFailure =
  | typeof FIXTURE_BECOMES_SALE
  | typeof LIVE_SETTLE_REFUSED
  | InvalidCorpusFixture;

export type CorpusRejection = {
  id: string | null;
  path?: string;
  failure: CorpusFailure;
};

export type CorpusEvaluation = {
  ok: boolean;
  results: CorpusResultRow[];
  rejected: CorpusRejection[];
  missingIds: string[];
  saleState: "not_a_sale";
  canarySettled: false;
};

export type CorpusCliPayload = {
  ok: boolean;
  command: "corpus";
  results: CorpusResultRow[];
  saleState: "not_a_sale";
  canarySettled: false;
  missingIds: string[];
  rejected: CorpusRejection[];
};

export class CorpusRejectedError extends Error {
  readonly rejected = true as const;
  readonly failure: CorpusFailure;
  readonly path?: string;

  constructor(failure: CorpusFailure, path?: string) {
    super(failure.code);
    this.name = "CorpusRejectedError";
    this.failure = failure;
    this.path = path;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidCorpusFixture(reason: string): InvalidCorpusFixture {
  return Object.freeze({
    code: "invalid-corpus-fixture",
    rejected: true,
    completed: false,
    saleState: "not_a_sale",
    reason,
  });
}

export function normalizeDisposition(value: unknown): CorpusDisposition | null {
  if (value === "notes") return "noted";
  if (typeof value === "string" && (CORPUS_DISPOSITIONS as readonly string[]).includes(value)) {
    return value as CorpusDisposition;
  }
  return null;
}

export function resolveCorpusDir(dir?: string | null): string {
  if (!dir || dir.trim() === "") return DEFAULT_CORPUS_DIR;
  const trimmed = dir.trim();
  if (isAbsolute(trimmed)) return trimmed;
  return resolve(process.cwd(), trimmed);
}

function listCorpusJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  if (!statSync(dir).isDirectory()) {
    throw new Error(`corpus fixtures path is not a directory: ${dir}`);
  }
  return readdirSync(dir)
    .filter((name) => {
      if (name.startsWith("_") || name.startsWith(".")) return false;
      return name.toLowerCase().endsWith(".json");
    })
    .sort()
    .map((name) => join(dir, name))
    .filter((filePath) => statSync(filePath).isFile());
}

type CorpusDocument =
  | { path: string; json: unknown }
  | { path: string; error: string };

function readCorpusDocuments(dir: string): CorpusDocument[] {
  const documents: CorpusDocument[] = [];
  for (const filePath of listCorpusJsonFiles(dir)) {
    try {
      documents.push({
        path: filePath,
        json: JSON.parse(readFileSync(filePath, "utf8")),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      documents.push({ path: filePath, error: message });
    }
  }
  return documents;
}

function schemaProblems(json: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (typeof json.id !== "string" || json.id.trim() === "") problems.push("id");
  if (typeof json.title !== "string") problems.push("title");
  if (normalizeDisposition(json.disposition) == null) problems.push("disposition");
  if (typeof json.inSdsScope !== "boolean") problems.push("inSdsScope");
  if (json.saleState !== "not_a_sale") problems.push("saleState");
  if (json.provenance !== "fixture") problems.push("provenance");
  if (json.authorized !== false) problems.push("authorized");
  if (!(CORPUS_KINDS as readonly string[]).includes(json.kind as string)) problems.push("kind");
  if (typeof json.evaluator !== "string") problems.push("evaluator");
  if (json.briefPath !== null && typeof json.briefPath !== "string") problems.push("briefPath");
  if (typeof json.notes !== "string") problems.push("notes");
  if (!isPlainObject(json.facts)) problems.push("facts");
  return problems;
}

function saleLike(json: Record<string, unknown>): boolean {
  if (json.provenance === "customer") return true;
  if (json.paid === true || json.settled === true) return true;
  return json.saleState !== "not_a_sale";
}

type Classified =
  | { status: "valid"; fixture: CorpusFixture }
  | { status: "rejected"; id: string | null; failures: CorpusFailure[] };

function classify(json: unknown): Classified {
  if (!isPlainObject(json)) {
    return {
      status: "rejected",
      id: null,
      failures: [invalidCorpusFixture("fixture is not a JSON object")],
    };
  }
  const id = typeof json.id === "string" && json.id.trim() !== "" ? json.id : null;
  const failures: CorpusFailure[] = [];
  if (saleLike(json)) failures.push(FIXTURE_BECOMES_SALE);
  if (json.authorized === true) failures.push(LIVE_SETTLE_REFUSED);
  if (failures.length > 0) {
    return { status: "rejected", id, failures };
  }
  const problems = schemaProblems(json);
  if (problems.length > 0) {
    return {
      status: "rejected",
      id,
      failures: [invalidCorpusFixture(`missing or invalid fields: ${problems.join(", ")}`)],
    };
  }
  const disposition = normalizeDisposition(json.disposition);
  if (!disposition) {
    return {
      status: "rejected",
      id,
      failures: [invalidCorpusFixture("invalid disposition")],
    };
  }
  return {
    status: "valid",
    fixture: {
      id: json.id as string,
      title: json.title as string,
      disposition,
      inSdsScope: json.inSdsScope as boolean,
      saleState: "not_a_sale",
      provenance: "fixture",
      authorized: false,
      kind: json.kind as CorpusFixture["kind"],
      evaluator: json.evaluator as string,
      briefPath: json.briefPath as string | null,
      notes: json.notes as string,
      facts: json.facts as Record<string, unknown>,
    },
  };
}

function missingRequiredIds(seen: Iterable<string>): string[] {
  const present = new Set(seen);
  return REQUIRED_CORPUS_IDS.filter((id) => !present.has(id));
}

function sortResults(results: CorpusResultRow[]): CorpusResultRow[] {
  const order = new Map(REQUIRED_CORPUS_IDS.map((id, index) => [id, index]));
  return [...results].sort((a, b) => {
    const ai = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.id.localeCompare(b.id);
  });
}

function assertCanaryUnsettled(rejected: CorpusRejection[]): false {
  const settle = invokeLiveSettle(designCanary());
  if (settle.ok !== false || settle.rejected !== true || settle.failure !== LIVE_SETTLE_REFUSED) {
    rejected.push({ id: "canary", failure: LIVE_SETTLE_REFUSED });
  }
  return false;
}

export function evaluateCorpus(fixtures: readonly unknown[]): CorpusEvaluation {
  const results: CorpusResultRow[] = [];
  const rejected: CorpusRejection[] = [];
  const seenIds: string[] = [];

  for (const json of fixtures) {
    const classified = classify(json);
    if (classified.status === "valid") {
      seenIds.push(classified.fixture.id);
      results.push({
        id: classified.fixture.id,
        disposition: classified.fixture.disposition,
        notes: classified.fixture.notes,
      });
      continue;
    }
    if (classified.id) seenIds.push(classified.id);
    for (const failure of classified.failures) {
      rejected.push({ id: classified.id, failure });
    }
  }

  const canarySettled = assertCanaryUnsettled(rejected);
  return {
    ok: rejected.length === 0,
    results: sortResults(results),
    rejected,
    missingIds: missingRequiredIds(seenIds),
    saleState: "not_a_sale",
    canarySettled,
  };
}

export function loadCorpus(dir = DEFAULT_CORPUS_DIR): CorpusFixture[] {
  const resolved = resolveCorpusDir(dir);
  const fixtures: CorpusFixture[] = [];
  for (const document of readCorpusDocuments(resolved)) {
    if ("error" in document) {
      throw new CorpusRejectedError(
        invalidCorpusFixture(`JSON parse failed: ${document.error}`),
        document.path,
      );
    }
    const classified = classify(document.json);
    if (classified.status === "valid") {
      fixtures.push(classified.fixture);
      continue;
    }
    throw new CorpusRejectedError(classified.failures[0], document.path);
  }
  return fixtures;
}

export function runCorpus(dir?: string | null): CorpusEvaluation {
  const resolved = resolveCorpusDir(dir);
  if (existsSync(resolved) && !statSync(resolved).isDirectory()) {
    const rejected: CorpusRejection[] = [
      {
        id: null,
        path: resolved,
        failure: invalidCorpusFixture(`corpus fixtures path is not a directory: ${resolved}`),
      },
    ];
    return {
      ok: false,
      results: [],
      rejected,
      missingIds: missingRequiredIds([]),
      saleState: "not_a_sale",
      canarySettled: assertCanaryUnsettled(rejected),
    };
  }

  const fixtures: unknown[] = [];
  const parseRejected: CorpusRejection[] = [];
  for (const document of readCorpusDocuments(resolved)) {
    if ("error" in document) {
      parseRejected.push({
        id: null,
        path: document.path,
        failure: invalidCorpusFixture(`JSON parse failed: ${document.error}`),
      });
      continue;
    }
    fixtures.push(document.json);
  }

  const evaluation = evaluateCorpus(fixtures);
  const rejected = [...parseRejected, ...evaluation.rejected];
  return {
    ...evaluation,
    rejected,
    ok: rejected.length === 0,
  };
}

export function corpusCommand(fixturesDir?: string | null): {
  payload: CorpusCliPayload;
  exitCode: number;
} {
  const evaluation = runCorpus(fixturesDir);
  return {
    payload: {
      ok: evaluation.ok,
      command: "corpus",
      results: evaluation.results,
      saleState: "not_a_sale",
      canarySettled: false,
      missingIds: evaluation.missingIds,
      rejected: evaluation.rejected,
    },
    exitCode: evaluation.ok ? 0 : 2,
  };
}

function print(value: unknown, code: number): number {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return code;
}

type RepairOpts = {
  command: string;
  fixtures: string | null;
};

export function parseRepairArgv(argv: string[]): RepairOpts {
  const args = argv[0] === "repair" ? argv.slice(1) : [...argv];
  const opts: RepairOpts = {
    command: "help",
    fixtures: null,
  };
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      opts.command = "help";
      return opts;
    }
    if (arg === "--fixtures" || arg === "--fixture") {
      opts.fixtures = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith("--fixtures=")) {
      opts.fixtures = arg.slice("--fixtures=".length);
      continue;
    }
    if (arg.startsWith("-")) continue;
    positionals.push(arg);
  }
  if (positionals[0]) opts.command = positionals[0];
  return opts;
}

export function main(argv: string[]): number {
  const opts = parseRepairArgv(argv);
  if (opts.command === "help" || opts.command === "--help" || opts.command === "-h") {
    return print(
      {
        ok: true,
        command: "help",
        usage: [
          "repair corpus --fixtures <dir>",
          "node --experimental-strip-types bin/repair.ts corpus --fixtures fixtures/corpus/",
        ],
        saleState: "not_a_sale",
        canarySettled: false,
      },
      0,
    );
  }
  if (opts.command === "corpus") {
    const ran = corpusCommand(opts.fixtures);
    return print(ran.payload, ran.exitCode);
  }
  return print(
    {
      ok: false,
      error: `unknown command ${opts.command}`,
      saleState: "not_a_sale",
      canarySettled: false,
    },
    1,
  );
}
