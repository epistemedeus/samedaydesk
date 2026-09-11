import { EXAMPLE_MISMATCH } from "./paths.ts";
import { SUBJECT_JOB_IDS } from "./constants.ts";
import { intakeFromFixture, acceptRepairIntake, completeRepair } from "./intake.ts";
import { diagnosePaymentPayload } from "./diagnostics.ts";
import { loadFixture } from "./load-fixture.ts";
import { designCanary, invokeLiveSettle } from "./canary.ts";
import { designExactRepairProposal } from "./proposal.ts";
import { listRepairSubjects, requireSubject } from "./subjects.ts";
import type { CanaryRoute, SubjectJobId } from "./types.ts";

type Opts = {
  command: string;
  fixture: string | null;
  subject: string | null;
  route: string;
  flags: string[];
  paid: boolean;
  settled: boolean;
  customer: boolean;
  example: boolean;
  settle: boolean;
};

function parseArgs(argv: string[]): Opts {
  const flags: string[] = [];
  const opts: Opts = {
    command: argv[0] || "help",
    fixture: null,
    subject: null,
    route: "extract",
    flags,
    paid: false,
    settled: false,
    customer: false,
    example: false,
    settle: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    flags.push(arg);
    if (arg === "--fixture" || arg === "--input") {
      opts.fixture = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--subject") {
      opts.subject = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--route") {
      opts.route = argv[i + 1] ?? "extract";
      i += 1;
      continue;
    }
    if (arg === "--example") opts.example = true;
    if (arg === "--paid") opts.paid = true;
    if (arg === "--settled") opts.settled = true;
    if (arg === "--customer") opts.customer = true;
    if (arg === "--settle" || arg === "--execute") opts.settle = true;
  }
  return opts;
}

function print(value: unknown, code: number): number {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return code;
}

export async function main(argv: string[]): Promise<number> {
  const opts = parseArgs(argv);
  if (opts.command === "help" || opts.command === "--help" || opts.command === "-h") {
    return print({
      usage: [
        "h4-precise-repairs intake --fixture <path> [--subject <job-id>]",
        "h4-precise-repairs diagnose --fixture <path>",
        "h4-precise-repairs canary [--route extract|seller-integrity-audit]",
        "h4-precise-repairs subjects",
        "h4-precise-repairs proposal [--subject <job-id>]",
      ],
      dryRun: true,
      saleState: "not_a_sale",
      subjects: SUBJECT_JOB_IDS,
    }, 0);
  }

  if (opts.command === "subjects") {
    return print({ subjects: listRepairSubjects(), paidWrapper: false }, 0);
  }

  if (opts.command === "proposal") {
    const proposal = designExactRepairProposal(opts.subject ?? "listing-repair-packet");
    return print(proposal, 0);
  }

  if (opts.command === "canary") {
    const route = opts.route as CanaryRoute;
    if (route !== "extract" && route !== "seller-integrity-audit") {
      return print({ ok: false, error: "unknown canary route" }, 1);
    }
    const plan = designCanary(route);
    if (opts.settle) {
      return print(invokeLiveSettle(plan.canary), 2);
    }
    return print(plan, 0);
  }

  if (opts.command === "diagnose") {
    const filePath = opts.fixture;
    if (!filePath) return print({ ok: false, error: "diagnose requires --fixture <path>" }, 1);
    const loaded = loadFixture(filePath);
    const result = diagnosePaymentPayload(loaded.paymentPayload, {
      declared: loaded.declared,
      requirements: loaded.requirements,
      siblingPaymentRequirements: loaded.json.paymentRequirements,
    });
    return print(result, 0);
  }

  if (opts.command === "intake") {
    const filePath = opts.example && !opts.fixture ? EXAMPLE_MISMATCH : opts.fixture;
    if (!filePath) {
      return print({ ok: false, error: "intake requires --fixture <path> or --example" }, 1);
    }
    const flags = [...opts.flags];
    if (opts.example) flags.push("--example");
    const subject = opts.subject ? requireSubject(opts.subject) : undefined;
    const provenance = opts.customer ? "customer" : "fixture";
    const result = intakeFromFixture(filePath, {
      subjectJobId: subject as SubjectJobId | undefined,
      flags,
      paid: opts.paid,
      settled: opts.settled,
      provenance,
    });
    return print(result, result.ok ? 0 : 2);
  }

  if (opts.command === "complete") {
    if (!opts.fixture) return print({ ok: false, error: "complete requires --fixture <path>" }, 1);
    const accepted = intakeFromFixture(opts.fixture);
    if (!accepted.ok) return print(accepted, 2);
    return print(completeRepair(accepted.intake), 0);
  }

  if (opts.command === "accept-draft") {
    if (!opts.fixture) return print({ ok: false, error: "accept-draft requires --fixture <path>" }, 1);
    const loaded = loadFixture(opts.fixture);
    return print(acceptRepairIntake(loaded.json), 2);
  }

  return print({ ok: false, error: `unknown command ${opts.command}` }, 1);
}
