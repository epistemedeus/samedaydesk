"""Call the pinned Dify table checker. Does not start a reader or Dify."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "assets" / "dify"))

from table_csv import evaluate  # noqa: E402


def main(argv):
    if len(argv) != 4:
        print("usage: table_check.py RECORD FIELDS PAGE OUT", file=sys.stderr)
        return 2
    record_path, fields_path, page_text, out_path = argv
    record = json.loads(Path(record_path).read_text(encoding="utf-8"))
    fields = json.loads(Path(fields_path).read_text(encoding="utf-8"))
    page = int(page_text)
    if not isinstance(record, dict):
        result = evaluate("", 0, "", fields, 40000, page)
    elif page != 1:
        result = evaluate("", 0, record.get("url") if isinstance(record.get("url"), str) else "", fields, 40000, page)
    else:
        url = record.get("url") if isinstance(record.get("url"), str) else ""
        result = evaluate(record, 200, url, fields, 40000, page)
    Path(out_path).write_text(json.dumps(result), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
