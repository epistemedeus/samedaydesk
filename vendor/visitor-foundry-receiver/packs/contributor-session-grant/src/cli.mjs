import { join } from "node:path";
import { createEarnedWorkHttpAdapter } from "./adapters/earned-work.mjs";
import { createLedgerHttpAdapter } from "./adapters/ledger.mjs";
import {
  CONTRIBUTOR_COMMANDS,
  ERROR_CODE,
  GRANT_BACKENDS,
  OWNER_COMMANDS,
  PACK_ID,
  PACK_VERSION,
  PINS,
  ROLES,
  SCHEMA,
  WAVE_ID,
  WAVE5_ID,
} from "./constants.mjs";
import { fail, printError } from "./errors.mjs";
import { claimWithSessionFile, reconcileClaimWithSessionFile } from "./contributor.mjs";
import { ensureDir, ensureEmptyDir } from "./fs-grant.mjs";
import {
  issueContributorSession,
  issueLedgerContributorGrant,
  loadFixtureTask,
  prepareReservedTask,
  readOwnerToken,
  reconcileGrantFromDir,
} from "./owner.mjs";
import { collectEnvSecrets, collectSecrets, assertSecretFree } from "./redact.mjs";

function flagMap(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

export function helpRecord() {
  return {
    ok: true,
    schema: SCHEMA.help,
    pack: PACK_ID,
    version: PACK_VERSION,
    wave: WAVE_ID,
    wave5: WAVE5_ID,
    usage: [
      "node bin/contributor-session-grant.mjs --role owner prepare-and-issue --base-url http://127.0.0.1:PORT --owner-token-file PATH --out-dir EMPTY_DIR [--task-file PATH]",
      "node bin/contributor-session-grant.mjs --role owner reconcile --out-dir DIR",
      "node bin/contributor-session-grant.mjs --role contributor claim --base-url URL --token-file DIR/contributor.token --task-id ID --terms-version sha256:... --state-dir DIR",
      "node bin/contributor-session-grant.mjs --role contributor reconcile --base-url URL --token-file PATH --state-dir DIR",
    ],
    roles: ROLES,
    ownerCommands: OWNER_COMMANDS,
    contributorCommands: CONTRIBUTOR_COMMANDS,
    grantRules: [
      "Owner process calls POST /v1/contributor-tokens once against the compiled in-tree kernel.",
      "Contributor process receives only the scoped bearer file.",
      "Grant creation has no idempotency key; never automatically retry an unknown grant.",
      "HTTP 201 with an empty body is unknown, not success.",
      "Reconcile a non-idempotent grant from the attempt directory without posting again and without owner credentials.",
      "--out-dir must be empty before a fresh attempt.",
      "Contributor must not start with EARNED_WORK_OWNER_TOKEN set.",
      "State JSON stores token SHA-256, not plaintext.",
      "Optional --task-file supplies the create-task body (including e18.specDigest-bound summaries).",
    ],
    authoritativeRuntime: PINS.inTree,
    nonsettling: true,
  };
}

export function parseCli(argv) {
  const { flags, positionals } = flagMap(argv);
  if (flags.help || positionals[0] === "help" || flags.h) {
    return { command: "help", flags, positionals };
  }
  if (flags["auto-retry-unknown-grant"]) {
    fail(
      ERROR_CODE.UNKNOWN_GRANT_NO_AUTO_RETRY,
      "grant issuance is owner-only and has no automatic retry for an unknown grant",
    );
  }
  const role = flags.role || positionals[0];
  const command = flags.command || (flags.role ? positionals[0] : positionals[1]);
  const ownerGrantCommands = new Set(["issue", "prepare-and-issue", "issue-ledger-grant"]);
  if (role === "owner" && ownerGrantCommands.has(command) && flags["idempotency-key"]) {
    fail(
      ERROR_CODE.GRANT_IDEMPOTENCY_HEADER_FORBIDDEN,
      "grant creation has no idempotency key; do not send Idempotency-Key",
    );
  }
  if (!ROLES.includes(role)) {
    fail(ERROR_CODE.INVALID_ROLE, "--role must be owner or contributor");
  }
  return { role, command, flags, positionals };
}

function adapterFromFlags(flags, roleCommand) {
  if (roleCommand === "issue-ledger-grant" || flags.backend === GRANT_BACKENDS.LEDGER) {
    return createLedgerHttpAdapter({ baseUrl: flags["base-url"] });
  }
  return createEarnedWorkHttpAdapter({ baseUrl: flags["base-url"] });
}

export async function executeCli(parsed, { env = process.env } = {}) {
  if (parsed.command === "help") return helpRecord();
  const { role, command, flags } = parsed;

  if (role === "contributor") {
    const ownerGrantCommands = new Set(["issue", "prepare-reserved-task", "prepare-and-issue", "issue-ledger-grant"]);
    if (ownerGrantCommands.has(command)) {
      fail(
        ERROR_CODE.OWNER_ONLY_GRANT,
        "grant issuance is owner-only; contributor process cannot issue or auto-retry a grant",
      );
    }
  }

  if (role === "owner") {
    if (command === "reconcile") {
      if (!flags["out-dir"]) fail(ERROR_CODE.INVALID_INPUT, "--out-dir is required");
      return reconcileGrantFromDir({ outDir: flags["out-dir"], env });
    }
    const ownerToken = readOwnerToken({ ownerTokenFile: flags["owner-token-file"], env });
    const adapter = adapterFromFlags(flags, command);
    if (command === "prepare-reserved-task") {
      const dir = flags["out-dir"];
      if (!dir) fail(ERROR_CODE.INVALID_INPUT, "--out-dir is required");
      const outDir = ensureDir(dir);
      return prepareReservedTask({
        adapter,
        ownerToken,
        outDir,
        taskBody: loadFixtureTask(flags["task-file"]),
        secrets: collectSecrets(ownerToken, ...collectEnvSecrets(env)),
      });
    }
    if (command === "issue") {
      if (!flags["out-dir"]) fail(ERROR_CODE.INVALID_INPUT, "--out-dir is required");
      return issueContributorSession({
        adapter,
        ownerToken,
        outDir: flags["out-dir"],
        contributorPublicId: flags["contributor-public-id"],
        taskId: flags["task-id"],
        provenance: flags.provenance || "fixture",
      });
    }
    if (command === "prepare-and-issue") {
      if (!flags["out-dir"]) fail(ERROR_CODE.INVALID_INPUT, "--out-dir is required");
      const outDir = ensureEmptyDir(flags["out-dir"]);
      const prepared = await prepareReservedTask({
        adapter,
        ownerToken,
        outDir,
        taskBody: loadFixtureTask(flags["task-file"]),
        secrets: collectSecrets(ownerToken),
      });
      const grantDir = join(outDir, "grant");
      const issued = await issueContributorSession({
        adapter,
        ownerToken,
        outDir: grantDir,
        contributorPublicId: flags["contributor-public-id"],
        taskId: prepared.taskId,
        provenance: flags.provenance || "fixture",
      });
      return {
        ok: true,
        command: "prepare-and-issue",
        taskId: prepared.taskId,
        termsVersion: prepared.termsVersion,
        fundingState: prepared.fundingState,
        tokenFile: issued.tokenFile,
        tokenHash: issued.tokenHash,
        tokenFingerprint: issued.tokenFingerprint,
        contributorPublicId: issued.contributorPublicId,
        ownerStateFile: issued.stateFile,
        taskPath: prepared.taskPath,
        plaintextInState: false,
      };
    }
    if (command === "issue-ledger-grant") {
      if (!flags["out-dir"]) fail(ERROR_CODE.INVALID_INPUT, "--out-dir is required");
      return issueLedgerContributorGrant({
        adapter,
        adminToken: ownerToken,
        outDir: flags["out-dir"],
        contributorPublicId: flags["contributor-public-id"],
      });
    }
    fail(ERROR_CODE.UNKNOWN_COMMAND, `unknown owner command: ${command}`);
  }

  if (role === "contributor") {
    if (command !== "claim" && command !== "reconcile") {
      fail(ERROR_CODE.UNKNOWN_COMMAND, "contributor command must be claim or reconcile");
    }
    if (!flags["state-dir"] && !flags["out-dir"]) {
      fail(ERROR_CODE.INVALID_INPUT, "--state-dir is required for contributor claim");
    }
    if (!flags["token-file"]) fail(ERROR_CODE.MISSING_TOKEN_FILE, "--token-file is required");
    const adapter = createEarnedWorkHttpAdapter({ baseUrl: flags["base-url"] });
    const args = {
      adapter,
      tokenFile: flags["token-file"],
      stateDir: flags["state-dir"] || flags["out-dir"],
      taskId: flags["task-id"],
      termsVersion: flags["terms-version"],
      env,
      claimKey: flags["idempotency-key"],
    };
    if (command === "reconcile") return reconcileClaimWithSessionFile(args);
    return claimWithSessionFile(args);
  }

  fail(ERROR_CODE.INVALID_ROLE, "--role must be owner or contributor");
}

export async function runCli(argv, { env = process.env, stdout = process.stdout } = {}) {
  try {
    const parsed = parseCli(argv);
    const result = await executeCli(parsed, { env });
    assertSecretFree(result, collectEnvSecrets(env), "cli stdout");
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    printError(error, stdout.write.bind(stdout));
    return 1;
  }
}
