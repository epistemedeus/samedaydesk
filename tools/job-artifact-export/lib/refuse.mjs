import { MailboxError } from "../../result-mailbox/lib/errors.mjs";

export class ExportRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "ExportRefuse";
    this.code = code;
    this.detail = detail;
    this.exitCode = 2;
  }
}

export function refuse(code, message, detail) {
  return new ExportRefuse(code, message, detail);
}

/** Narrow mailbox refusal → exporter refusal. Programming faults stay unmapped. */
export function mapMailboxRefuse(err) {
  if (err instanceof ExportRefuse) return err;
  if (err instanceof MailboxError && typeof err.code === "string") {
    return refuse(err.code, err.message, err.detail || {});
  }
  return err;
}
