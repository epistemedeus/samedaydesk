export class MonitorError extends Error {
  constructor(message, { code = "monitor_error" } = {}) {
    super(message);
    this.name = "MonitorError";
    this.code = code;
  }
}
