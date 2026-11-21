import { useState } from "react";
import { track } from "../lib/posthog";
import { journey } from "../lib/journey";
import styles from "./TaskForm.module.css";

// "A harder problem? Tell us the task": an on-page form. The request is stored, confirmed here
// with its reference and by email, and answered with a written scope and a fixed price.
type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; reference: string } | { kind: "error"; field: string };

const MESSAGES: Record<string, string> = {
  email: "Check the email address; the scope and price go there.",
  task: "Tell us a little more about the task (at least a sentence).",
  website: "That website address is too long.",
  server: "We could not take it just now. Please try again in a minute.",
};

export default function TaskForm() {
  const [state, setState] = useState<State>({ kind: "idle" });

  if (state.kind === "sent") {
    return (
      <div className={styles.sent} role="status">
        <p className={styles.sentHead}>We have your task.</p>
        <p>A written scope and a fixed price are on their way to your inbox, with a link to pay when you are happy with it. Your reference is <span className="mono">{state.reference}</span>.</p>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        setState({ kind: "sending" });
        try {
          const res = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.reference) {
            track("task_request_sent", {});
            journey("form_sent", { state: "task" });
            setState({ kind: "sent", reference: body.reference });
          } else {
            journey("form_failed", { state: "task" });
            setState({ kind: "error", field: body?.error?.field || "server" });
          }
        } catch {
          journey("form_failed", { state: "task" });
          setState({ kind: "error", field: "server" });
        }
      }}
    >
      <label className={styles.field}>
        <span>What must work?</span>
        <textarea name="task" required minLength={10} maxLength={4000} rows={3}
          placeholder="Our booking system should take reservations from ChatGPT, and agents should pay per lookup." />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Your email</span>
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label className={styles.field}>
          <span>Your website <em>(optional)</em></span>
          <input name="website" type="text" inputMode="url" autoComplete="url" />
        </label>
      </div>
      <input className={styles.trap} name="company_fax" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className={styles.actions}>
        <button type="submit" className={styles.send} disabled={state.kind === "sending"}>
          {state.kind === "sending" ? "Sending…" : "Send the task"} <span aria-hidden="true">→</span>
        </button>
        <p className={styles.note}>You get a written scope and a fixed price by email. Nothing is charged before you accept it.</p>
      </div>
      {state.kind === "error" && <p className={styles.error} role="alert">{MESSAGES[state.field] || MESSAGES.server}</p>}
    </form>
  );
}
