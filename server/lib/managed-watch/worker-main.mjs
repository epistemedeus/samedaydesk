import { open, readFile } from "node:fs/promises";
import { createManagedWatch } from "./service.mjs";
import { openFileWatchStore } from "./store-file.mjs";

const action = process.argv[2];
const store = await openFileWatchStore(process.env.MANAGED_WATCH_STORE_DIR);
const now = () => process.env.MANAGED_WATCH_NOW;
const hooks = {};
if (process.env.MANAGED_WATCH_WAIT_FILE) {
  const file = process.env.MANAGED_WATCH_WAIT_FILE;
  hooks.beforeRead = async () => {
    for (;;) {
      const text = await readFile(file, "utf8").catch(() => "");
      if (text.includes("go")) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
}
if (process.env.MANAGED_WATCH_CRASH_AFTER === "fetched") {
  hooks.afterFetched = () => process.kill(process.pid, "SIGKILL");
}

const service = createManagedWatch({
  store,
  now,
  hooks,
  readSource: async () => {
    if (process.env.MANAGED_WATCH_COUNTER) {
      const handle = await open(process.env.MANAGED_WATCH_COUNTER, "a");
      try {
        await handle.write(`${process.pid}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    if (process.env.MANAGED_WATCH_READ_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, Number(process.env.MANAGED_WATCH_READ_DELAY_MS)));
    }
    if (process.env.MANAGED_WATCH_CRASH_DURING_READ === "1") process.kill(process.pid, "SIGKILL");
    const document = JSON.parse(await readFile(process.env.MANAGED_WATCH_DOCUMENT, "utf8"));
    return { document, bytes: Buffer.byteLength(JSON.stringify(document)), calls: 1 };
  },
});

const token = process.env.MANAGED_WATCH_TOKEN;
let result;
if (action === "enroll") result = await service.enroll({ token, body: JSON.parse(process.env.MANAGED_WATCH_BODY) });
else if (action === "due") result = await service.runDueForGrant({ token, deliveryMode: process.env.MANAGED_WATCH_DELIVERY || "accepted" });
else if (action === "retrieve") result = await service.retrieve({ token, taskId: process.env.MANAGED_WATCH_TASK });
else if (action === "cancel") result = await service.cancel({ token, taskId: process.env.MANAGED_WATCH_TASK });
else if (action === "pause") result = await service.pause({ token, taskId: process.env.MANAGED_WATCH_TASK });
else throw new Error(`unknown action ${action}`);
process.stdout.write(`${JSON.stringify(result)}\n`);
await store.close();
