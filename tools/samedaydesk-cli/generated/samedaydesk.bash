# bash completion for samedaydesk. Generated from the command manifest; do not edit.
_samedaydesk() {
  local cur="${COMP_WORDS[COMP_CWORD]}" words="" flags="" key
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "help version completion commands schema capabilities gateway market readiness batch result" -- "$cur") ); return
  fi
  if [ "$COMP_CWORD" -eq 2 ] && [[ "$cur" != -* ]]; then
    case "${COMP_WORDS[1]}" in
    help) words="" ;;
    version) words="" ;;
    completion) words="" ;;
    commands) words="" ;;
    schema) words="" ;;
    capabilities) words="" ;;
    gateway) words="routes schema test quote" ;;
    market) words="profile discover" ;;
    readiness) words="check" ;;
    batch) words="run" ;;
    result) words="show" ;;
    esac
    [ -n "$words" ] && { COMPREPLY=( $(compgen -W "$words" -- "$cur") ); return; }
  fi
  key="${COMP_WORDS[1]}"
  case "$key ${COMP_WORDS[2]}" in
    "gateway routes") key="gateway routes" ;;
    "gateway schema") key="gateway schema" ;;
    "gateway test") key="gateway test" ;;
    "gateway quote") key="gateway quote" ;;
    "market profile") key="market profile" ;;
    "market discover") key="market discover" ;;
    "readiness check") key="readiness check" ;;
    "batch run") key="batch run" ;;
    "result show") key="result show" ;;
  esac
  case "$key" in
    "help") flags="" ;;
    "version") flags="" ;;
    "completion") flags="" ;;
    "commands") flags="--group" ;;
    "schema") flags="" ;;
    "capabilities") flags="--origin --allow-loopback --dry-run" ;;
    "gateway routes") flags="--origin --allow-loopback --dry-run" ;;
    "gateway schema") flags="--route --kind --origin --allow-loopback --dry-run" ;;
    "gateway test") flags="--route --recovery-file --origin --allow-loopback --dry-run" ;;
    "gateway quote") flags="--route --input-file --recovery-file --origin --allow-loopback --dry-run" ;;
    "market profile") flags="--origin --allow-loopback --dry-run" ;;
    "market discover") flags="--limit --cursor --max-pages --stream --origin --allow-loopback --dry-run" ;;
    "readiness check") flags="--host --out --discovery --origin --allow-loopback --dry-run" ;;
    "batch run") flags="--input-file --state-dir --concurrency --max-items --max-line-bytes --timeout-ms --credential-file --credential-stdin --origin --allow-loopback --dry-run" ;;
    "result show") flags="--file" ;;
  esac
  COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
}
complete -F _samedaydesk samedaydesk
