#!/usr/bin/env python3
"""Official Hermes skill_utils drop-in for this recipe's portable skill.

Requires a fresh empty HERMES_HOME outside ~/.hermes. Does not install Hermes,
call a model, read wallets, or mutate the default profile.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path


def die(message: str, code: int = 2) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def main() -> int:
    home_raw = os.environ.get("HERMES_HOME", "").strip()
    src_raw = os.environ.get("HERMES_AGENT_SRC", "").strip()
    skill_raw = os.environ.get("SKILL_SRC", "").strip()
    if not home_raw or not src_raw or not skill_raw:
        die("HERMES_HOME, HERMES_AGENT_SRC, and SKILL_SRC are required")

    home = Path(home_raw)
    src = Path(src_raw)
    skill_src = Path(skill_raw)
    default = Path.home() / ".hermes"
    resolved = home.resolve()
    default_resolved = default.resolve()
    if resolved == default_resolved or default_resolved in resolved.parents:
        die("refusing default ~/.hermes; set HERMES_HOME to a throwaway directory")
    if home.is_symlink() or (home.exists() and (not home.is_dir() or any(home.iterdir()))):
        die("refusing nonempty or symlink HERMES_HOME")
    home.mkdir(parents=True, exist_ok=True)

    if not (src / "agent" / "skill_utils.py").is_file():
        die(f"HERMES_AGENT_SRC missing agent/skill_utils.py: {src}")
    if not (skill_src / "SKILL.md").is_file():
        die(f"missing SKILL.md under {skill_src}")

    os.environ["HERMES_HOME"] = str(home)
    sys.path.insert(0, str(src))
    from agent.skill_utils import (  # noqa: WPS433
        extract_skill_description,
        get_project_skills_dirs,
        is_skill_description_truncated_for_prompt,
        iter_skill_index_files,
        parse_frontmatter,
    )
    from hermes_constants import get_hermes_home, get_skills_dir
    from tools.skills_guard import scan_skill, should_allow_install

    if get_hermes_home().resolve() != home.resolve():
        die("official get_hermes_home did not honor HERMES_HOME")

    skills_dir = get_skills_dir()
    skills_dir.mkdir(parents=True, exist_ok=True)
    dest = skills_dir / "lockfile-pin-delta"
    shutil.copytree(skill_src, dest)

    found = {}
    for skill_md in iter_skill_index_files(skills_dir, "SKILL.md"):
        text = skill_md.read_text(encoding="utf-8")
        frontmatter, body = parse_frontmatter(text)
        name = str(frontmatter.get("name") or "")
        scan = scan_skill(skill_md.parent, source="community")
        allowed, reason = should_allow_install(scan, force=False)
        found[name] = {
            "path": str(skill_md),
            "description": str(frontmatter.get("description") or ""),
            "prompt_description": extract_skill_description(frontmatter),
            "prompt_truncated": is_skill_description_truncated_for_prompt(frontmatter),
            "body_bytes": len(body.encode("utf-8")),
            "scan_verdict": scan.verdict,
            "community_install_allowed_without_force": allowed,
            "community_install_reason": reason,
        }

    if "lockfile-pin-delta" not in found:
        die(f"official discovery missed lockfile-pin-delta under {skills_dir}")
    body = Path(found["lockfile-pin-delta"]["path"]).read_text(encoding="utf-8")
    if "lockfile-pin-delta" not in body:
        die("skill body lost lockfile route")
    if "customer-x402" not in body:
        die("skill body lost customer-x402 payer pointer")
    for token in ("PAYMENT-SIGNATURE", "X-PAYMENT", "Bearer ", "api_key", "Authorization"):
        if token in body:
            die(f"skill contains forbidden token {token}")

    receipt = {
        "ok": True,
        "mode": "drop_in",
        "hermes_home": str(get_hermes_home()),
        "skills_dir": str(skills_dir),
        "project_skills_dirs": [str(p) for p in get_project_skills_dirs()],
        "skills": found,
        "payment_executed": False,
        "model_execution": False,
        "native_payer": False,
    }
    json.dump(receipt, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
