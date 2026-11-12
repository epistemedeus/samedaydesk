// Every human or shell facing reference is a pure function of the one
// manifest (src/manifest.mjs). scripts/generate.mjs writes them to generated/
// and test/generate.test.mjs fails when a checked-in file drifts.
import { COMMANDS, GROUPS, ERROR_SCHEMA, RESULT_SCHEMA, STREAM_SCHEMA } from "./manifest.mjs";
import { EXIT, ERROR_CODES } from "./errors.mjs";

const BIN = "samedaydesk";
const words = command => command.argv.join(" ");
const flagNames = command => Object.keys(command.flags);
const firstWords = () => [...new Set(COMMANDS.map(command => command.argv[0]))];
const secondWords = first => COMMANDS.filter(command => command.argv[0] === first && command.argv[1]).map(command => command.argv[1]);
const flagUsage = ([name, spec]) => {
  const value = spec.type === "boolean" ? "" : spec.enum ? ` <${spec.enum.join("|")}>` : ` <${spec.type}>`;
  return spec.required ? `--${name}${value}` : `[--${name}${value}]`;
};
export const usageLine = command => [BIN, words(command), command.positional ? (command.positional.required === false ? `[<${command.positional.name}>]` : `<${command.positional.name}>`) : null,
  ...Object.entries(command.flags).map(flagUsage)].filter(Boolean).join(" ");

/** Progressive help: level 0 lists groups, level 1 one group's commands, then `schema <id>`. */
export function helpFor(group = null) {
  const level0 = { level: 0, usage: `${BIN} <command> [--flag value]. Then: ${BIN} help <group>, ${BIN} schema <command-id>.`,
    groups: GROUPS.map(item => ({ ...item, commands: COMMANDS.filter(command => command.group === item.id).map(command => command.id) })) };
  if (group === null) return level0;
  const found = GROUPS.find(item => item.id === group);
  if (!found) return null;
  return { level: 1, group: found.id, summary: found.summary, next: `${BIN} schema <command-id>`,
    commands: COMMANDS.filter(command => command.group === found.id).map(command => ({ id: command.id, usage: usageLine(command), summary: command.summary, effect: command.effect, auth: command.auth })) };
}

export function bashCompletion() {
  const cases = firstWords().map(first => {
    const subs = secondWords(first);
    return `    ${first}) words="${subs.join(" ")}" ;;`;
  }).join("\n");
  const flagCases = COMMANDS.map(command => `    "${words(command)}") flags="${flagNames(command).map(name => `--${name}`).join(" ")}" ;;`).join("\n");
  return `# bash completion for ${BIN}. Generated from the command manifest; do not edit.
_${BIN}() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" words="" flags="" key
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${firstWords().join(" ")}" -- "$cur") ); return
  fi
  if [ "$COMP_CWORD" -eq 2 ] && [[ "$cur" != -* ]]; then
    case "\${COMP_WORDS[1]}" in
${cases}
    esac
    [ -n "$words" ] && { COMPREPLY=( $(compgen -W "$words" -- "$cur") ); return; }
  fi
  key="\${COMP_WORDS[1]}"
  case "$key \${COMP_WORDS[2]}" in
${COMMANDS.filter(command => command.argv.length === 2).map(command => `    "${words(command)}") key="${words(command)}" ;;`).join("\n")}
  esac
  case "$key" in
${flagCases}
  esac
  COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
}
complete -F _${BIN} ${BIN}
`;
}

export function zshCompletion() {
  const lines = COMMANDS.map(command => `    '${words(command)}') flags=(${flagNames(command).map(name => `'--${name}[${command.flags[name].description.replace(/'/g, "")}]'`).join(" ")}) ;;`).join("\n");
  return `#compdef ${BIN}
# zsh completion for ${BIN}. Generated from the command manifest; do not edit.
_${BIN}() {
  local -a flags
  if (( CURRENT == 2 )); then
    compadd -- ${firstWords().join(" ")}; return
  fi
  if (( CURRENT == 3 )) && [[ \${words[CURRENT]} != -* ]]; then
    case \${words[2]} in
${firstWords().filter(first => secondWords(first).length).map(first => `      ${first}) compadd -- ${secondWords(first).join(" ")}; return ;;`).join("\n")}
    esac
  fi
  local key="\${words[2]}"
  [[ -n "\${words[3]}" && "\${words[3]}" != -* ]] && key="\${words[2]} \${words[3]}"
  case $key in
${lines}
  esac
  _arguments -s $flags
}
_${BIN} "$@"
`;
}

export function fishCompletion() {
  const out = [`# fish completion for ${BIN}. Generated from the command manifest; do not edit.`, `complete -c ${BIN} -f`];
  for (const first of firstWords()) {
    const owner = COMMANDS.find(command => command.argv[0] === first);
    const group = GROUPS.find(item => item.id === owner.group);
    out.push(`complete -c ${BIN} -n '__fish_use_subcommand' -a '${first}' -d '${(secondWords(first).length ? group.summary : owner.summary).replace(/'/g, "")}'`);
    for (const second of secondWords(first)) {
      const command = COMMANDS.find(item => item.argv[0] === first && item.argv[1] === second);
      out.push(`complete -c ${BIN} -n '__fish_seen_subcommand_from ${first}; and not __fish_seen_subcommand_from ${secondWords(first).join(" ")}' -a '${second}' -d '${command.summary.replace(/'/g, "")}'`);
    }
  }
  for (const command of COMMANDS) {
    const condition = command.argv.length === 1 ? `__fish_seen_subcommand_from ${command.argv[0]}` : `__fish_seen_subcommand_from ${command.argv[0]}; and __fish_seen_subcommand_from ${command.argv[1]}`;
    for (const [name, spec] of Object.entries(command.flags)) {
      const takes = spec.type === "boolean" ? "" : spec.enum ? ` -r -a '${spec.enum.join(" ")}'` : " -r";
      out.push(`complete -c ${BIN} -n '${condition}' -l ${name}${takes} -d '${spec.description.replace(/'/g, "")}'`);
    }
  }
  return `${out.join("\n")}\n`;
}

const roff = text => String(text).replace(/\\/g, "\\\\").replace(/-/g, "\\-").replace(/^\./gm, "\\&.");

export function manPage(version) {
  const out = [`.TH SAMEDAYDESK 1 "" "samedaydesk ${version}" "User Commands"`, ".\\\" Generated from the command manifest; do not edit.",
    ".SH NAME", `${BIN} \\- SameDayDesk agent CLI`, ".SH SYNOPSIS", `.B ${BIN}`, "\\fIcommand\\fR [\\fI\\-\\-flag value\\fR]",
    ".SH DESCRIPTION",
    roff(`Noninteractive CLI for agents. One JSON envelope on stdout (${RESULT_SCHEMA} or ${ERROR_SCHEMA}), JSONL (${STREAM_SCHEMA}) when streaming, one diagnostic line on stderr on failure. No prompts. Secret-named flags are refused. A tenant credential is read only from an existing 0600 --credential-file or the first line of stdin (--credential-stdin), is bound to the run's origin and the gateway path, and is never printed or forwarded across origins or redirects.`),
    ".SH COMMANDS"];
  for (const group of GROUPS) {
    out.push(`.SS ${roff(group.id)}`, roff(group.summary));
    for (const command of COMMANDS.filter(item => item.group === group.id)) {
      out.push(".TP", `.B ${roff(usageLine(command))}`, roff(`${command.summary} Effect: ${command.effect}. Auth: ${command.auth}. Retry: ${command.retry}. Recovery: ${command.recovery}.`));
      for (const [name, spec] of Object.entries(command.flags)) out.push(".RS", ".TP", `.B \\-\\-${roff(name)}`, roff(`${spec.description}${spec.required ? " Required." : ""}`), ".RE");
    }
  }
  out.push(".SH EXIT STATUS");
  for (const [category, code] of Object.entries(EXIT)) out.push(".TP", `.B ${code}`, roff(category));
  out.push(".SH SIGNALS", roff("SIGINT aborts an in-flight request where client-io supports AbortSignal, prints a cancelled error envelope (or, in batch run, cancelled item records and a summary) and exits 130. Remote work already sent is not cancelled. A closed stdout (EPIPE) in batch run stops dispatch, persists state and exits 14."));
  out.push(".SH ERROR CODES", roff([...ERROR_CODES].sort().join(", ")), ".SH SEE ALSO", roff(`${BIN} schema <command-id>, ${BIN} commands`));
  return `${out.join("\n")}\n`;
}

export function skillMd(version) {
  const rows = COMMANDS.map(command => `| \`${command.id}\` | \`${usageLine(command)}\` | ${command.effect} | ${command.auth} | ${command.summary} |`).join("\n");
  return `---
name: samedaydesk-cli
description: Use when an agent needs SameDayDesk capability facts, gateway route schemas, a server quote, a configured tenant's free-route execution with recovery, public market listings, a free agent-readiness report, or a bounded batch of those reads, through the samedaydesk CLI ${version}.
---

# samedaydesk CLI ${version}

Generated from the command manifest; do not edit. Source of truth: \`${BIN} commands\`.

## Rules

- Run commands noninteractively and parse stdout as JSON. Check \`ok\`, then \`schema\`.
- On failure read \`error.code\`, \`error.exit\`, \`error.retryable\` and \`error.nextAction\`. Do not parse stderr for data.
- Never pass a credential on the command line; secret-named flags are refused. When a command needs the tenant credential, name an existing 0600 file with \`--credential-file\` or pipe it with \`--credential-stdin\`. It is bound to the run's origin and never printed.
- Use \`--dry-run\` to see the exact request, effect and required authority before sending.
- Do not retry a POST. GET retries are already bounded inside the CLI. After a lost tenant execution, run \`gateway resume --state-file\`: it reads back by receipt id or resends the identical request with the same key.
- On \`cursor_refused\`, \`cursor_malformed\` or \`cursor_unrecognized\`, restart \`market discover\` without \`--cursor\`. \`error.evidence.server.code\` holds the server's own code.
- Read \`error.evidence.recovery\` (not_sent, sent_unconfirmed, remote_refused, remote_committed, remote_cancelled) before deciding to resend anything.
- SIGINT exits 130 with \`error.code\` \`cancelled\`. It does not cancel remote work that was already sent.
- \`batch run\` prints JSONL: one \`start\`, one \`item\` per input line, one \`summary\`. Exit 0 all ok, 12 partial, 13 all failed, 130 cancelled, 14 stdout closed. Rerun with the same \`--state-dir\` to resume; completed items are skipped.

## Start

1. \`${BIN} help\`, then \`${BIN} help <group>\`, then \`${BIN} schema <command-id>\`.
2. \`${BIN} capabilities\` for current hosted facts.
3. \`${BIN} readiness check --host example.com --out /abs/path/result.json\`, then \`${BIN} result show --file /abs/path/result.json\` to recover after a lost process.

## Commands

| Id | Usage | Effect | Auth | Summary |
| --- | --- | --- | --- | --- |
${rows}

## Exit codes

${Object.entries(EXIT).map(([category, code]) => `- ${code}: ${category}`).join("\n")}
`;
}

export const GENERATED = Object.freeze({
  "generated/samedaydesk.bash": () => bashCompletion(),
  "generated/_samedaydesk": () => zshCompletion(),
  "generated/samedaydesk.fish": () => fishCompletion(),
  "generated/samedaydesk.1": version => manPage(version),
  "generated/SKILL.md": version => skillMd(version),
});
