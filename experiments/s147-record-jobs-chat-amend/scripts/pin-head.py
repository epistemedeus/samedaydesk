#!/usr/bin/env python3
"""Pin amendedHead / GitHub tip in RESULT + dispositions to argv[1] or HEAD file."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
head = sys.argv[1].strip()
if not re.fullmatch(r"[0-9a-f]{7,40}", head):
    raise SystemExit(f"bad head: {head!r}")

result = root / "RESULT.md"
text = result.read_text()
text = re.sub(
    r"\| \*\*amendedHead\*\* \| `[0-9a-f]+` \|",
    f"| **amendedHead** | `{head}` |",
    text,
)
if re.search(r"\| GitHub tip \| `[0-9a-f]+` \|", text):
    text = re.sub(
        r"\| GitHub tip \| `[0-9a-f]+` \|",
        f"| GitHub tip | `{head}` |",
        text,
    )
else:
    text = text.replace(
        f"| **amendedHead** | `{head}` |",
        f"| **amendedHead** | `{head}` |\n| GitHub tip | `{head}` |",
    )
result.write_text(text)

disp_path = root / "docs" / "finding-dispositions.json"
data = json.loads(disp_path.read_text())
data["amendedHead"] = head
data.setdefault("ownerResponse", {})
data["ownerResponse"]["amendedHead"] = head
data["ownerResponse"]["executionReceipt"] = "experiments/s147-record-jobs-chat-amend/RESULT.md"
disp_path.write_text(json.dumps(data, indent=2) + "\n")
print(head)
