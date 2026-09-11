const fs = require("node:fs");
const path = require("node:path");

const target = process.env.D15_RACE_PATH && path.resolve(process.env.D15_RACE_PATH);
const overlay = process.env.D15_RACE_OVERWRITE && path.resolve(process.env.D15_RACE_OVERWRITE);
if (!target || !overlay) return;

let mutated = false;
function mutate() {
  if (mutated) return;
  mutated = true;
  fs.writeFileSync(target, fs.readFileSync(overlay));
}

const origRead = fs.readFileSync;
fs.readFileSync = function patchedRead(p) {
  const result = origRead.apply(this, arguments);
  try {
    if (path.resolve(String(p)) === target) mutate();
  } catch {
    /* ignore */
  }
  return result;
};

if (process.env.D15_RACE_FLAG) {
  process.once("exit", () => {
    try {
      fs.writeFileSync(process.env.D15_RACE_FLAG, `${JSON.stringify({ mutated, target, window: "after-inspect-read" })}\n`);
    } catch {
      /* ignore */
    }
  });
}
