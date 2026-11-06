// MCP stdio binding: one JSON-RPC message per line.
// Spec: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
// A Content-Length header is not this binding. HTTP length framing for the
// hosted wallet writer stays in vendor/hosted-wallet-market and is not MCP.

const MAX_LINE_BYTES = 1024 * 1024;

export function encodeMessage(value) {
  const body = JSON.stringify(value);
  if (body.includes("\n") || body.includes("\r")) {
    throw new Error("MCP stdio message must be one JSON line");
  }
  return `${body}\n`;
}

export function createLineDecoder() {
  let buffer = Buffer.alloc(0);
  function take(final) {
    const messages = [];
    while (buffer.length > 0) {
      const index = buffer.indexOf(0x0a);
      if (index === -1) break;
      const line = buffer.subarray(0, index).toString("utf8").replace(/\r$/, "");
      buffer = buffer.subarray(index + 1);
      if (line.trim() === "") continue;
      messages.push(parseLine(line));
    }
    if (buffer.length > MAX_LINE_BYTES) {
      throw new Error("MCP stdio line exceeds 1 MiB");
    }
    if (final && buffer.length > 0) {
      const tail = buffer.toString("utf8").replace(/\r$/, "");
      buffer = Buffer.alloc(0);
      if (tail.trim() !== "") messages.push(parseLine(tail));
    }
    return messages;
  }
  return {
    push(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
      buffer = Buffer.concat([buffer, bytes]);
      return take(false);
    },
    end() {
      return take(true);
    },
  };
}

export function decodeMessages(input) {
  const decoder = createLineDecoder();
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return decoder.push(bytes).concat(decoder.end());
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`MCP stdio message is not newline-delimited JSON: ${error.message}`);
  }
}
