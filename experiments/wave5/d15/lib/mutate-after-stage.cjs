const fs = require("node:fs");
const path = require("node:path");

const target = process.env.D15_RACE_PATH && path.resolve(process.env.D15_RACE_PATH);
const overlay = process.env.D15_RACE_OVERWRITE && path.resolve(process.env.D15_RACE_OVERWRITE);
if (!target || !overlay) return;

const targetBase = path.basename(target);
let mutated = false;
function mutate() {
  if (mutated) return;
  mutated = true;
  fs.writeFileSync(target, fs.readFileSync(overlay));
}

function isStagedInputDest(abs) {
  if (abs === target) return false;
  if (path.basename(abs) !== targetBase) return false;
  return abs.includes(`${path.sep}inputs${path.sep}`) || abs.includes(`${path.sep}inputs/`);
}

const origCopy = fs.copyFileSync;
fs.copyFileSync = function patchedCopy(src) {
  const result = origCopy.apply(this, arguments);
  try {
    if (path.resolve(String(src)) === target) mutate();
  } catch {
    /* ignore */
  }
  return result;
};

const origWrite = fs.writeFileSync;
fs.writeFileSync = function patchedWrite(p) {
  const result = origWrite.apply(this, arguments);
  try {
    if (isStagedInputDest(path.resolve(String(p)))) mutate();
  } catch {
    /* ignore */
  }
  return result;
};

if (process.env.D15_RACE_FLAG) {
  process.once("exit", () => {
    try {
      fs.writeFileSync(
        process.env.D15_RACE_FLAG,
        `${JSON.stringify({ mutated, target, window: "after-materialize-stage" })}\n`,
      );
    } catch {
      /* ignore */
    }
  });
}
