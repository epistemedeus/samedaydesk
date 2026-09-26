#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { CODE, EXIT, PACK_ID, PACK_VERSION } from "./constants.mjs";
import { DeskError } from "./errors.mjs";
import { createDesk, failureEnvelope, publicContract } from "./desk.mjs";

function usage() {
  return `Walletless public contributor desk (${PACK_ID} ${PACK_VERSION})

Usage:
  node bin/desk.mjs browse
  node bin/desk.mjs claim --task tsk_open_alpha --contributor-id ctr_walrus
  node bin/desk.mjs status --task tsk_open_alpha
  node bin/desk.mjs appeal --task tsk_rejected_gamma --contributor-id ctr_gamma --reason "..."
  node bin/desk.mjs owed-versus-paid --task tsk_owed_delta
  node bin/desk.mjs journey
  node bin/desk.mjs contract

Adapter: fixture (default). HTTP: --adapter http --origin URL [--contributor-token TOKEN]
The desk refuses to start if EARNED_WORK_OWNER_TOKEN (or a sibling secret) is set.
A contributor payout key kills the session.

No wallet. No settlement receipt. owed ≠ paid ≠ settled.`;
}

export function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.flags.help = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.flags[key] = next;
        i += 1;
      } else {
        out.flags[key] = true;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function exitFor(error) {
  if (!(error instanceof DeskError)) return EXIT.ERROR;
  if (error.killed) return EXIT.CONTRIBUTOR_HOLDS_PAYOUT_KEY;
  if (error.code === CODE.DESK_HOLDS_EARNED_WORK_SECRET) return EXIT.DESK_HOLDS_SECRET;
  if (error.code === CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY) return EXIT.CONTRIBUTOR_HOLDS_PAYOUT_KEY;
  if (error.code === CODE.USAGE) return EXIT.USAGE;
  return EXIT.ERROR;
}

function deskOptions(flags, env) {
  const kind = flags.adapter === "http" ? "http" : "fixture";
  return {
    kind,
    env,
    flags,
    origin: flags.origin,
    contributorToken: flags["contributor-token"] || flags.contributorToken || null,
    config: {
      ownerToken: flags["owner-token"] || flags.ownerToken,
      earnedWorkSecret: flags["earned-work-secret"],
      contributor: {
        payoutKey: flags["payout-key"] || flags["contributor-payout-key"] || flags.payoutKey,
        holdsPayoutKey: flags["holds-payout-key"] === true,
      },
    },
  };
}

export async function runCli(argv, { env = process.env, stdout = console.log, stderr = console.error } = {}) {
  const parsed = parseArgs(argv);
  const command = parsed._[0];
  if (!command || parsed.flags.help) {
    stderr(usage());
    return command ? EXIT.OK : EXIT.USAGE;
  }

  try {
    if (command === "contract") {
      stdout(JSON.stringify(publicContract(), null, 2));
      return EXIT.OK;
    }

    const settlementFields = ["paid", "settled", "transfer"].filter((key) => Object.hasOwn(parsed.flags, key));
    if (settlementFields.length > 0) {
      throw new DeskError({
        code: CODE.FORGED_SETTLEMENT_EVIDENCE,
        message:
          "Forged settlement evidence is rejected. paid=false, settled=false, and transfer=null are not normalized into a desk result.",
        status: 400,
        rejected: true,
        details: { fields: settlementFields, persisted: false },
      });
    }

    const desk = createDesk(deskOptions(parsed.flags, env));
    const contributorPublicId = parsed.flags["contributor-id"] || parsed.flags.contributor || "ctr_walrus";
    const taskId = parsed.flags.task || parsed.flags["task-id"];

    let result;
    switch (command) {
      case "browse":
        result = await desk.browse();
        break;
      case "claim":
        result = await desk.claim({
          taskId,
          contributorPublicId,
          termsVersion: parsed.flags["terms-version"],
          payoutDestination: parsed.flags["payout-destination"],
          wallet: parsed.flags.wallet,
        });
        break;
      case "status":
        result = await desk.status({ taskId });
        break;
      case "appeal":
        result = await desk.appeal({
          taskId,
          contributorPublicId,
          reason: parsed.flags.reason,
        });
        break;
      case "owed-versus-paid":
      case "owed":
        result = await desk.owedVersusPaid({ taskId });
        break;
      case "journey":
        result = await desk.journey({
          contributorPublicId,
          claimTaskId: parsed.flags.task || "tsk_open_alpha",
          appealTaskId: parsed.flags["appeal-task"] || "tsk_rejected_gamma",
          appealContributorId: parsed.flags["appeal-contributor"] || "ctr_gamma",
          owedTaskId: parsed.flags["owed-task"] || "tsk_owed_delta",
        });
        break;
      default:
        throw new DeskError({ code: CODE.USAGE, message: `unknown command: ${command}`, status: 400 });
    }
    stdout(JSON.stringify(result, null, 2));
    return EXIT.OK;
  } catch (error) {
    const payload = failureEnvelope(error);
    stdout(JSON.stringify(payload, null, 2));
    return exitFor(error instanceof DeskError ? error : new DeskError({ code: CODE.INVALID_INPUT, message: String(error) }));
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
