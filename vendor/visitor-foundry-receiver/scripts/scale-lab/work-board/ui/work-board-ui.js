/**
 * Browser UI binder for the isolated /lab/work-board page.
 * Renders untrusted text via textContent only.
 */

import {
  createWorkBoard,
  FUNDING_CLASS,
} from "../src/index.mjs";

function setText(node, value) {
  if (!node) return;
  node.textContent = value == null ? "" : String(value);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function bindWorkBoard(root, { createBoard = createWorkBoard } = {}) {
  let board = createBoard();
  let selectedJobId = null;
  let generation = 0;

  const status = root.querySelector("[data-board-status]");
  const jobList = root.querySelector("[data-job-list]");
  const dossier = root.querySelector("[data-job-dossier]");
  const eventList = root.querySelector("[data-event-list]");
  const exportOut = root.querySelector("[data-export-out]");
  const disclaimer = root.querySelector("[data-demo-disclaimer]");
  const fundingFilter = root.querySelector("[data-funding-filter]");
  const handoffNote = root.querySelector("[data-handoff-note]");
  const fundingLegend = root.querySelector("[data-funding-legend]");

  function syncChrome() {
    if (disclaimer) setText(disclaimer, board.getDisclaimer());
    if (handoffNote) setText(handoffNote, board.getHandoff().note);
    if (fundingLegend) {
      setText(
        fundingLegend,
        `Funding classes: ${FUNDING_CLASS.demonstration} (unfunded demos), ${FUNDING_CLASS.sponsored} (labelled), ${FUNDING_CLASS.external} (link only). No custody or escrow.`,
      );
    }
  }

  function flash(message) {
    if (!status) return;
    status.hidden = false;
    setText(status, message);
  }

  function renderJobs() {
    if (!jobList) return;
    const fundingClass = fundingFilter?.value || "";
    const jobs = board.listJobs(fundingClass ? { fundingClass } : {});
    jobList.replaceChildren();
    for (const job of jobs) {
      const li = el("li", "square-item");
      const btn = el("button", "office-submit office-submit--quiet square-select");
      btn.type = "button";
      btn.dataset.jobId = job.id;
      btn.setAttribute("aria-pressed", job.id === selectedJobId ? "true" : "false");
      const title = el("p", "square-item__title", job.id);
      const summary = el("p", "square-item__summary", job.title);
      const meta = el("p", "square-item__meta", `${job.fundingClass} · ${job.status} · v${job.version}`);
      btn.append(title, summary, meta);
      btn.addEventListener("click", () => {
        selectedJobId = job.id;
        renderJobs();
        renderDossier();
      });
      li.append(btn);
      jobList.append(li);
    }
    if (!jobs.length) {
      jobList.append(el("li", "square-item", "No jobs in this filter."));
    }
  }

  function renderDossier() {
    const gen = ++generation;
    if (!dossier) return;
    dossier.replaceChildren();
    if (!selectedJobId) {
      dossier.append(el("p", "office-prose", "Select a job to inspect its brief, contract, and ledger."));
      if (eventList) eventList.replaceChildren();
      return;
    }
    const pack = board.getJobDossier(selectedJobId);
    if (gen !== generation) return;
    const { job } = pack;
    dossier.append(
      el("p", "square-item__title", job.title),
      el("p", "square-item__meta", pack.fundingHonesty),
      el("h3", null, "Brief"),
      el("p", "office-prose", job.brief),
      el("h3", null, "Deliverable contract"),
      el("p", "office-prose", job.deliverableContract),
    );
    const accept = el("ul");
    for (const item of job.acceptanceEvidence) {
      accept.append(el("li", null, item));
    }
    dossier.append(el("h3", null, "Acceptance evidence"), accept);

    if (job.externalLink) {
      const link = el("a", null, job.externalLink);
      link.href = job.externalLink;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      dossier.append(el("h3", null, "External link"), link);
    }

    const proposalsText = pack.proposals.length
      ? pack.proposals.map((p) => `${p.id} · ${p.agentId} · ${p.status}`).join(" | ")
      : "None yet (demo seed starts empty).";
    const completionsText = pack.completions.length
      ? pack.completions.map((c) => `${c.id} · ${c.agentId} · ${c.status}`).join(" | ")
      : "None yet.";
    const correctionsText = pack.corrections.length
      ? pack.corrections.map((c) => `${c.id} · corrects ${c.correctsCompletionId}`).join(" | ")
      : "None yet.";

    dossier.append(
      el("h3", null, "Proposals"),
      el("p", "office-prose", proposalsText),
      el("h3", null, "Completions"),
      el("p", "office-prose", completionsText),
      el("h3", null, "Corrections"),
      el("p", "office-prose", correctionsText),
    );

    if (eventList) {
      eventList.replaceChildren();
      for (const event of pack.events) {
        const li = el("li", "square-item");
        li.append(
          el("p", "square-item__title", `${event.kind} · seq ${event.sequence}`),
          el("p", "square-item__summary", event.text || event.artifact?.url || ""),
        );
        eventList.append(li);
      }
      if (!pack.events.length) {
        eventList.append(
          el("li", "square-item", "No ledger events yet. Run the demonstration journey on this page or via the CLI."),
        );
      }
    }
  }

  function runSeededJourney() {
    board = createBoard();
    syncChrome();
    const jobId = "job_demo_page_diff";
    const job = board.getJob(jobId);
    const proposal = board.submitProposal({
      jobId,
      agentId: "agent_alpha",
      summary: "UI demo proposal for the demonstration job.",
      expectedVersion: job.version,
      idempotencyKey: "ui-propose-1",
    });
    const completion = board.submitCompletion({
      jobId,
      agentId: "agent_alpha",
      proposalId: proposal.proposal.id,
      artifact: {
        url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
        label: "UI demo artifact",
      },
      evidenceNotes: ["demonstration only"],
      expectedVersion: proposal.job.version,
      idempotencyKey: "ui-complete-1",
    });
    board.submitCorrection({
      jobId,
      agentId: "agent_alpha",
      correctsCompletionId: completion.completion.id,
      text: "UI demo correction: prior completion remains visible and superseded.",
      expectedVersion: completion.job.version,
      idempotencyKey: "ui-correct-1",
    });
    selectedJobId = jobId;
    if (exportOut) {
      exportOut.hidden = true;
      setText(exportOut, "");
    }
    renderJobs();
    renderDossier();
    flash("Ran demonstration proposal → completion → correction on job_demo_page_diff.");
  }

  function restoreSeed() {
    board = createBoard();
    selectedJobId = null;
    if (exportOut) {
      exportOut.hidden = true;
      setText(exportOut, "");
    }
    syncChrome();
    renderJobs();
    renderDossier();
    flash("Restored fictional demonstration seed.");
  }

  root.querySelector("[data-run-journey]")?.addEventListener("click", runSeededJourney);
  root.querySelector("[data-restore-demo]")?.addEventListener("click", restoreSeed);
  root.querySelector("[data-export-snapshot]")?.addEventListener("click", () => {
    if (!exportOut) return;
    exportOut.hidden = false;
    setText(exportOut, JSON.stringify(board.exportSnapshot(), null, 2));
    flash("Exported current board snapshot (local only).");
  });
  fundingFilter?.addEventListener("change", () => {
    renderJobs();
  });

  syncChrome();
  renderJobs();
  renderDossier();

  return {
    getBoard: () => board,
    renderJobs,
    renderDossier,
    selectJob(id) {
      selectedJobId = id;
      renderJobs();
      renderDossier();
    },
    runSeededJourney,
    restoreSeed,
  };
}

function boot() {
  const root = document.querySelector("[data-work-board]");
  if (!root) return;
  bindWorkBoard(root);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
