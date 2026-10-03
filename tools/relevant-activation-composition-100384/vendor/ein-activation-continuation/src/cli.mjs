/** SPDX-License-Identifier: MIT */
import { ContinuationError } from "./errors.mjs";
import { executeCommand } from "./journey.mjs";

export const HELP = `ein-continuation — caller-owned continuation for the public EIN formation flow

The public HTTP client remains the formation transport. This command stores a
mode 0600 continuation file so a later process can resume the same task.
It does not claim, pay, attest, or invent a company.

Usage:
  node bin/ein-continuation.mjs help
  node bin/ein-continuation.mjs discover
  node bin/ein-continuation.mjs assess < task.json
  node bin/ein-continuation.mjs prepare [--show-claim-url]
  node bin/ein-continuation.mjs resume
  node bin/ein-continuation.mjs status
  node bin/ein-continuation.mjs show [--show-claim-url]
  node bin/ein-continuation.mjs cancel

Environment (not argv payloads):
  EIN_CONTINUATION_FILE            Owner-only continuation JSON path
  EIN_CONTINUATION_TASK_ID         Stable task id (8-80 URL-safe characters)
  EIN_CONTINUATION_CUSTOMER_KEY    Opaque caller key, 12-128 characters
  EIN_CONTINUATION_LANE            agent_assisted_human | disposable_owner_qa
  EIN_ACTIVATION_BASE_URL          Current API origin
  EIN_CONTINUATION_INTENDED_EMAIL  Human recipient, required for prepare
  EIN_CONTINUATION_REASSESS        Set to 1 to repeat a lost assess explicitly
  EIN_CONTINUATION_TIMEOUT_MS      Optional absolute response deadline (50-60000)
  EIN_CONTINUATION_DEADLINE_MS     Whole command deadline, including stdin and
                                   discovery (50-60000; default 15000)
  EIN_CONTINUATION_MAX_RESPONSE_BYTES
                                   Whole command raw response allowance, including
                                   setup (1-4194304; default 1048576)
  EIN_CONTINUATION_TRANSPORT       http (default), mcp, a2a, or a2a-rest
  EIN_CONTINUATION_CATALOG_TRANSPORT
                                   Only with A2A: set to http to read the current
                                   catalog over HTTP. Operations stay on A2A.
                                   Unset A2A discover stops. It does not pretend
                                   a stored offer is the current contract.
  EIN_AGENT_GRANT                  Human-issued status grant
  EIN_AGENT_GRANT_FILE             Owner-only grant file (mode 0600)
  EIN_AGENT_GRANT_ORIGIN           Exact origin that may receive the grant

A changed origin or catalog is recorded and checked. It is not a new login.
Autonomous machine purchase is refused. A claim link view is not payment.
`;

function writeJson(stream, value) {
  const body = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(body) > 64 * 1024) {
    stream.write(`${JSON.stringify({ ok: false, error: { code: "output_limit", message: "Result exceeds 64 KiB; continuation retained", recovery: { action: "show", instruction: "Run show on the same continuation." } } })}\n`);
    return false;
  }
  stream.write(body);
  return true;
}

export async function main(argv, io) {
  const args = [...argv];
  let showClaimUrl = false;
  const positional = [];
  for (const arg of args) {
    if (arg === "--show-claim-url") showClaimUrl = true;
    else if (arg === "--help" || arg === "-h") positional.push("help");
    else if (arg.startsWith("--")) {
      writeJson(io.stderr, {
        ok: false,
        error: {
          code: "invalid_input",
          message: `unsupported argument ${arg}`,
          recovery: {
            action: "fix_input",
            instruction: "Configuration is read from the environment. Run help.",
          },
        },
      });
      return 2;
    } else positional.push(arg);
  }
  const command = positional[0] || "help";
  if (positional.length > 1) {
    writeJson(io.stderr, {
      ok: false,
      error: {
        code: "invalid_input",
        message: "commands do not take positional payloads",
        recovery: {
          action: "fix_input",
          instruction: "Pipe assess JSON on stdin. Keep continuation state in EIN_CONTINUATION_FILE.",
        },
      },
    });
    return 2;
  }
  if (command === "help") {
    io.stdout.write(HELP);
    return 0;
  }
  try {
    const result = await executeCommand(command, {
      env: io.env,
      fetch: io.fetch,
      stdin: io.stdin,
      showClaimUrl,
    });
    if (result.help) {
      io.stdout.write(HELP);
      return 0;
    }
    if (!writeJson(io.stdout, result.view)) return 2;
    if (showClaimUrl && result.view?.claimUrl) {
      io.stderr.write("claimUrl printed for the human handoff. A view is not a claim, payment, or filing attestation.\n");
    }
    return result.exitCode ?? 0;
  } catch (error) {
    if (error instanceof ContinuationError) {
      writeJson(io.stdout, {
        ok: false,
        filingAuthorization: false,
        revenue: false,
        inferredFromClaimLink: false,
        error: error.toJSON(),
      });
      return 2;
    }
    const text = error instanceof Error ? error.message : "unexpected failure";
    writeJson(io.stderr, {
      ok: false,
      error: {
        code: "continuation_error",
        message: text.replace(/claim=[^&\s]+/g, "claim=[redacted]").slice(0, 400),
      },
    });
    return 1;
  }
}
