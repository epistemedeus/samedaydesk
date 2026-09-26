import { CODE } from "./constants.mjs";
import { createMachine } from "./machine.mjs";
import { inspectDeskAuthority, inspectContributorPayoutKey, inspectFieldText } from "./authority.mjs";
import { owedVersusPaid } from "./owed-versus-paid.mjs";

function setStatus(root, message, tone) {
  const node = root.querySelector("[data-desk-status]");
  if (!node) return;
  node.hidden = false;
  node.dataset.tone = tone || "ok";
  node.textContent = message;
}

function td(text, { code = false } = {}) {
  const cell = document.createElement("td");
  if (code) {
    const el = document.createElement("code");
    el.textContent = text;
    cell.append(el);
  } else {
    cell.textContent = text;
  }
  return cell;
}

function renderTasks(root, machine) {
  const body = root.querySelector("[data-desk-browse]");
  if (!body) return;
  const browse = machine.browse();
  body.replaceChildren();
  for (const task of browse.tasks) {
    const row = document.createElement("tr");
    row.append(
      td(task.id, { code: true }),
      td(task.title),
      td(task.lifecycle),
      td(task.fundingState),
      td(task.claimable ? "claimable" : "closed"),
      td(`${task.termsVersion.slice(0, 18)}…`, { code: true }),
    );
    body.append(row);
  }
}

function showJson(root, selector, value) {
  const node = root.querySelector(selector);
  if (!node) return;
  node.hidden = false;
  node.textContent = JSON.stringify(value, null, 2);
}

function scanForms(root) {
  const env = {};
  const owner = root.querySelector("[data-desk-owner-token]")?.value;
  if (owner) env.EARNED_WORK_OWNER_TOKEN = owner;
  const desk = inspectDeskAuthority({ env, config: {}, flags: {} });
  if (!desk.ok) return desk.error;
  const payout = root.querySelector("[data-desk-payout-key]")?.value;
  const contributor = inspectContributorPayoutKey({
    contributor: payout ? { payoutKey: payout } : {},
  });
  if (!contributor.ok) return contributor.error;
  for (const field of root.querySelectorAll("input, textarea")) {
    const text = inspectFieldText(field.value);
    if (!text.ok) return text.error;
  }
  return null;
}

export function bootContributorDesk(root, seed) {
  if (!root) return null;
  const machine = createMachine({
    seed,
    now: () => seed.clock,
    randomId: () =>
      globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2, 10)}`,
  });

  renderTasks(root, machine);
  showJson(root, "[data-desk-owed]", owedVersusPaid(seed.tasks.find((task) => task.id === "tsk_owed_delta"), { now: seed.clock }));

  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const action = form.getAttribute("data-desk-action");
    const halt = scanForms(root);
    if (halt) {
      setStatus(root, halt.message, "danger");
      showJson(root, "[data-desk-result]", halt.toJSON());
      if (halt.killed) {
        root.setAttribute("data-desk-killed", "true");
        for (const control of root.querySelectorAll("button[type='submit']")) control.disabled = true;
      }
      return;
    }

    const data = new FormData(form);
    const input = Object.fromEntries(data.entries());
    try {
      let result;
      if (action === "claim") {
        result = machine.claim({
          taskId: input.taskId,
          contributorPublicId: input.contributorPublicId,
          termsVersion: input.termsVersion || undefined,
          payoutDestination: input.payoutDestination || undefined,
          wallet: input.wallet || undefined,
        });
      } else if (action === "status") {
        result = machine.status({ taskId: input.taskId });
      } else if (action === "appeal") {
        result = machine.appeal({
          taskId: input.taskId,
          contributorPublicId: input.contributorPublicId,
          reason: input.reason,
        });
      } else if (action === "owed") {
        result = machine.owedVersusPaid({ taskId: input.taskId });
      } else {
        result = machine.browse();
      }
      renderTasks(root, machine);
      showJson(root, "[data-desk-result]", result);
      setStatus(root, `${action} recorded. Walletless. Not settled.`, "ok");
    } catch (error) {
      const payload = error.toJSON?.() ?? { ok: false, code: CODE.INVALID_INPUT, message: String(error) };
      showJson(root, "[data-desk-result]", payload);
      setStatus(root, payload.message, "danger");
      if (payload.killed) {
        root.setAttribute("data-desk-killed", "true");
        for (const control of root.querySelectorAll("button[type='submit']")) control.disabled = true;
      }
    }
  });

  return machine;
}
