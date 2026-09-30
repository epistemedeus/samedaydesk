import { describe, expect, it } from "./expect-shim.js";
import { descriptionSimilarity, mcpUsabilityChecks, openapiUsabilityChecks } from "../../lib/agent-readiness/usability.js";
const GOOD_DESC = "Look up a support ticket by id. Use it before replying so you see the latest state.";
function mcpBundle(tools, version = "2025-11-25") {
  return {
    schema: "agent-readiness.probe.v1",
    host: "t.example",
    probedAt: "2026-09-24T09:00:00Z",
    responses: {},
    mcp: {
      url: "https://t.example/mcp",
      offeredVersion: "2025-11-25",
      initialize: { result: { protocolVersion: version } },
      toolsList: { result: { tools } }
    }
  };
}
function goodTool(name, desc = GOOD_DESC) {
  return {
    name,
    description: desc,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Ticket id." },
        status: { type: "string", description: "Filter.", enum: ["open", "closed"] }
      },
      required: ["id"]
    },
    outputSchema: { type: "object" }
  };
}
function oaBundle(doc) {
  return {
    schema: "agent-readiness.probe.v1",
    host: "t.example",
    probedAt: "2026-09-24T09:00:00Z",
    responses: { "/openapi.json": { status: 200, contentType: "application/json", body: JSON.stringify(doc) } }
  };
}
const mcpStatus = (b, id) => mcpUsabilityChecks(b).find((c) => c.id === `usability.mcp.${id}`).status;
const oaStatus = (b, id) => openapiUsabilityChecks(b).find((c) => c.id === `usability.openapi.${id}`).status;
const oaReason = (b, id) => openapiUsabilityChecks(b).find((c) => c.id === `usability.openapi.${id}`).reason;
const GOOD_B = mcpBundle([
  goodTool("getTicket"),
  goodTool("closeTicket", "Close a ticket once the customer confirms the fix. Irreversible for agents.")
]);
describe("MCP usability lint", () => {
  it("passes every rule for well-described tools", () => {
    for (const id of ["desc", "props", "required", "enums", "output", "dupes"])
      expect(mcpStatus(GOOD_B, id)).toBe("pass");
  });
  it("warns on short and overlong descriptions and names the tool", () => {
    const b = mcpBundle([goodTool("a", "Get it."), goodTool("b", "x".repeat(1001))]);
    expect(mcpStatus(b, "desc")).toBe("warn");
    expect(mcpUsabilityChecks(b)[0].reason).toContain("a (7 chars)");
  });
  it("warns when a property lacks type or description", () => {
    const t = goodTool("getTicket");
    t.inputSchema.properties["q"] = { type: "string" };
    const b = mcpBundle([t]);
    expect(mcpStatus(b, "props")).toBe("warn");
    expect(mcpUsabilityChecks(b).find((c) => c.id === "usability.mcp.props").reason).toContain("getTicket.q");
  });
  it("warns when required is not declared", () => {
    const t = goodTool("getTicket");
    delete t.inputSchema.required;
    expect(mcpStatus(mcpBundle([t]), "required")).toBe("warn");
  });
  it("warns when a closed-set property has no enum", () => {
    const t = goodTool("getTicket");
    delete t.inputSchema.properties.status.enum;
    expect(mcpStatus(mcpBundle([t]), "enums")).toBe("warn");
  });
  it("requires outputSchema on 2025-06-18+ and is n/a on older servers", () => {
    const t = goodTool("getTicket");
    delete t.outputSchema;
    expect(mcpStatus(mcpBundle([t]), "output")).toBe("warn");
    expect(mcpStatus(mcpBundle([t], "2025-06-18"), "output")).toBe("warn");
    expect(mcpStatus(mcpBundle([t], "2024-11-05"), "output")).toBe("na");
  });
  it("flags near-duplicate descriptions", () => {
    const b = mcpBundle([goodTool("getTicket"), goodTool("fetchTicket", GOOD_DESC + " ")]);
    expect(mcpStatus(b, "dupes")).toBe("warn");
    expect(descriptionSimilarity("list open tickets", "close one invoice")).toBe(0);
  });
  it("is n/a when there is no MCP server", () => {
    expect(mcpUsabilityChecks(oaBundle({})).every((c) => c.status === "na")).toBe(true);
  });
});
const ERR = { "400": { description: "bad", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } };
const GOOD_DOC = {
  openapi: "3.1.0",
  components: {
    schemas: { Error: { type: "object", properties: { code: { type: "string" } } } },
    parameters: { Idem: { name: "Idempotency-Key", in: "header", schema: { type: "string" } } }
  },
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        parameters: [{ name: "cursor", in: "query" }],
        responses: {
          "200": { content: { "application/json": { schema: { type: "array" }, example: [] } } },
          ...ERR
        }
      },
      post: {
        operationId: "createItem",
        parameters: [{ $ref: "#/components/parameters/Idem" }],
        requestBody: { content: { "application/json": { example: { name: "a" } } } },
        responses: { "201": { content: { "application/json": { example: { id: "1" } } } }, ...ERR }
      }
    }
  }
};
function mutate(fn) {
  const d = structuredClone(GOOD_DOC);
  fn(d);
  return oaBundle(d);
}
describe("OpenAPI usability lint", () => {
  it("passes every rule for a well-documented API", () => {
    for (const id of ["examples", "errors", "idempotency", "pagination"])
      expect(oaStatus(oaBundle(GOOD_DOC), id)).toBe("pass");
  });
  it("warns when an example is missing and names the operation", () => {
    const b = mutate((d) => delete d.paths["/items"].post.requestBody.content["application/json"].example);
    expect(oaStatus(b, "examples")).toBe("warn");
    expect(oaReason(b, "examples")).toContain("createItem");
  });
  it("warns when 4xx responses are missing or schemaless", () => {
    expect(oaStatus(mutate((d) => delete d.paths["/items"].get.responses["400"]), "errors")).toBe("warn");
    const all = mutate((d) => {
      d.paths["/items"].get.responses["400"] = { description: "bad" };
      d.paths["/items"].post.responses["400"] = { description: "bad" };
    });
    expect(oaStatus(all, "errors")).toBe("warn");
  });
  it("warns when a mutating operation has no Idempotency-Key and no explanation", () => {
    const b = mutate((d) => delete d.paths["/items"].post.parameters);
    expect(oaStatus(b, "idempotency")).toBe("warn");
    const explained = mutate((d) => {
      delete d.paths["/items"].post.parameters;
      d.paths["/items"].post.description = "Idempotent on name, safe to retry.";
    });
    expect(oaStatus(explained, "idempotency")).toBe("pass");
  });
  it("warns when an array response has no pagination", () => {
    const b = mutate((d) => delete d.paths["/items"].get.parameters);
    expect(oaStatus(b, "pagination")).toBe("warn");
    expect(oaReason(b, "pagination")).toContain("listItems");
  });
  it("is n/a without OpenAPI or without applicable operations", () => {
    expect(openapiUsabilityChecks(mcpBundle([])).every((c) => c.status === "na")).toBe(true);
    const readOnly = mutate((d) => delete d.paths["/items"].post);
    expect(oaStatus(readOnly, "idempotency")).toBe("na");
  });
});
