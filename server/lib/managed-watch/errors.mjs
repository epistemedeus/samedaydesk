export class WatchError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "WatchError";
    this.code = code;
    this.status = status;
  }
}

export function asWatchError(error) {
  if (error instanceof WatchError) return error;
  if (error?.name === "MonitorError") {
    const status = error.code === "terminal" || error.code === "not_paused" ? 409 : 400;
    return new WatchError(error.code || "monitor_error", error.message, status);
  }
  return new WatchError("store_unavailable", "managed watch store failed", 503);
}
