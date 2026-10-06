from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "src" / "build_manifest.json").read_text(encoding="utf-8"))["parts"]
imports = (ROOT / "src" / "runtime_imports.js").read_text(encoding="utf-8")
out = imports + "\n"

for rel in manifest:
    out += f"/* ===== {rel} ===== */\n"
    out += (ROOT / rel).read_text(encoding="utf-8")
    out += "\n"

output = ROOT / "dist" / "runtime.js"
output.write_text(out, encoding="utf-8")
print("built", output)
