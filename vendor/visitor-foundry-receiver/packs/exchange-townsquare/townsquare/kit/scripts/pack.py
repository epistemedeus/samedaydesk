import zipfile
from pathlib import Path
kit = Path(__file__).resolve().parents[1]
out = kit / "dist" / "townsquare-first-conversation-task-kit.zip"
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in kit.rglob("*"):
        if p.is_file() and "dist" not in p.relative_to(kit).parts:
            z.write(p, Path("kit") / p.relative_to(kit))
print(out)
