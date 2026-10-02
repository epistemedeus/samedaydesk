/** SPDX-License-Identifier: MIT. One command budget includes stdin and discovery. */
import { ContinuationError, recovery } from "./errors.mjs";

export function commandBudget(env) {
  const raw = env.EIN_CONTINUATION_DEADLINE_MS ?? "15000";
  const ms = Number(raw);
  if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(ms) || ms < 50 || ms > 60000) {
    throw new ContinuationError({ code: "invalid_input", message: "command deadline is outside 50ms..60s",
      recovery: recovery("fix_input", "Set EIN_CONTINUATION_DEADLINE_MS between 50 and 60000.") });
  }
  const expires = performance.now() + ms;
  const controller = new AbortController();
  return {
    signal: controller.signal,
    async run(work, { stdin } = {}) {
      if (controller.signal.aborted || performance.now() >= expires) {
        throw new ContinuationError({ code: "deadline_exceeded", message: "Command deadline exhausted before dispatch",
          recovery: recovery("retry_same_command", "Keep this continuation and operation id. Run the same command again.") });
      }
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          stdin?.destroy?.();
          reject(new ContinuationError({ code: "timeout", message: "Command deadline exhausted",
            recovery: recovery("retry_same_command", "Keep this continuation and operation id. Run the same command again.") }));
        }, Math.max(1, expires - performance.now()));
      });
      try {
        return await Promise.race([deadline, Promise.resolve().then(work)]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
