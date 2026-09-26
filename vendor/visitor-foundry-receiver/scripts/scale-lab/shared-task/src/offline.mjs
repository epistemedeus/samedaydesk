/**
 * Offline / unconfigured shared-task journey.
 * Reuses the local work-board engine; never claims shared mode.
 */

import { createWorkBoard } from "../../work-board/src/index.mjs";
import { MODE_LOCAL, SCHEMA } from "./constants.mjs";
import {
  offlineExportPacket,
  packetHistoryHonesty,
  publishEventBody,
  replayBodiesFromPacket,
} from "./map.mjs";

export function createOfflineWorkspace({ clock } = {}) {
  const board = createWorkBoard({ clock });
  let sequence = 0;
  const localEvents = [];

  function append(kind, text, artifact = null) {
    sequence += 1;
    const event = {
      id: `local_ev_${sequence}`,
      projectId: "local-demo",
      sequence,
      kind,
      text,
      ...(artifact ? { artifact } : {}),
      createdAt: new Date().toISOString(),
      source: "offline-work-board",
    };
    localEvents.push(event);
    return event;
  }

  return {
    mode: MODE_LOCAL,
    schema: SCHEMA,
    configured: false,
    projectId: null,
    async createTaskBrief({ title, brief, fundingClass = "demonstration" } = {}) {
      const job = board.listJobs().find((j) => j.fundingClass === "demonstration") || board.listJobs()[0];
      const text = `Shared-task brief: ${title || job?.title || "demo"}\nfundingClass=${fundingClass}\n${brief || job?.brief || ""}`;
      return { event: append("request", text), project: null, mode: MODE_LOCAL };
    },
    async proposeArtifact({ summary, artifactUrl, artifactLabel } = {}) {
      return {
        event: append("artifact", summary || "Proposed artifact", {
          url: artifactUrl || "https://example.invalid/demo/s20-unhosted-receipt.json",
          label: artifactLabel || "local demo artifact",
        }),
        mode: MODE_LOCAL,
      };
    },
    async acceptArtifact({ proposalEventId, note } = {}) {
      return {
        event: append("reply", `${note || "Accepted"}\nacceptsEventId=${proposalEventId || ""}`),
        mode: MODE_LOCAL,
      };
    },
    async correctEvidence({ correctsEventId, statement } = {}) {
      return {
        event: append(
          "correction",
          `${statement || "Correction"}\ncorrectsEventId=${correctsEventId || ""}`,
        ),
        mode: MODE_LOCAL,
      };
    },
    async publishEvent(input = {}) {
      const body = publishEventBody(input);
      return {
        event: append(body.kind, body.text, body.artifact || null),
        mode: MODE_LOCAL,
        kind: body.kind,
      };
    },
    async listChanges({ after = null, limit = 25 } = {}) {
      const afterSeq = after ? Number(String(after).split(":").pop()) || 0 : 0;
      const events = localEvents.filter((e) => e.sequence > afterSeq).slice(0, limit);
      const nextCursor = events.length ? `local:${events[events.length - 1].sequence}` : null;
      return { events, nextCursor, mode: MODE_LOCAL };
    },
    exportSnapshot() {
      const packet = offlineExportPacket({
        events: localEvents,
        project: { id: "local-demo", title: "Local shared-task demo" },
        mode: MODE_LOCAL,
      });
      packet.history = packetHistoryHonesty(packet);
      return packet;
    },
    async exportAll() {
      return this.exportSnapshot();
    },
    async importPacket(packet) {
      const { honesty, bodies } = replayBodiesFromPacket(packet);
      const mapping = [];
      for (const item of bodies) {
        const text = item.body.text
          ? `${item.body.text}\nimportedFromEventId=${item.originalId}`
          : `importedFromEventId=${item.originalId}`;
        const event = append(item.body.kind, text, item.body.artifact || null);
        mapping.push({ originalId: item.originalId, newId: event.id, kind: event.kind });
      }
      return {
        imported: mapping.length,
        mapping,
        history: honesty,
        projectId: "local-demo",
        mode: MODE_LOCAL,
        note: honesty.complete
          ? "Imported event bodies into the local demo. Identifiers are not preserved."
          : `${honesty.note} Imported only the supplied event bodies.`,
      };
    },
    getHandoff() {
      return board.getHandoff();
    },
  };
}
