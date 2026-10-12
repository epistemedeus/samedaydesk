import type { Server } from "node:http";

/** One wall-clock deadline covers the HTTP drain and the database pool drain. */
export async function drainRuntime(
  server: Pick<Server, "close">,
  store: { close(): Promise<void> },
  timeoutMs: number,
): Promise<{ forced: boolean; failed: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drained = (async () => {
    let failed = false;
    try {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } catch {
      failed = true;
    }
    try {
      await store.close();
    } catch {
      failed = true;
    }
    return { forced: false, failed };
  })();
  try {
    return await Promise.race([
      drained,
      new Promise<{ forced: boolean; failed: boolean }>((resolve) => {
        timer = setTimeout(() => resolve({ forced: true, failed: false }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
