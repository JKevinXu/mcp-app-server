import { spawn } from "node:child_process";

const port = 3099;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["dist/src/index.js"], {
  env: { ...process.env, MCP_TRANSPORT: "http", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

async function waitForHealth() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become healthy. stdout=${stdout} stderr=${stderr}`);
}

async function mcpPost(message, sessionId) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(message),
  });

  const text = await res.text();
  if (!res.ok && res.status !== 202) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return { res, body: text ? JSON.parse(text) : undefined };
}

try {
  await waitForHealth();

  const init = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-http", version: "0.1.0" },
    },
  });

  const sessionId = init.res.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("No mcp-session-id returned by initialize");

  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId);

  const tools = await mcpPost({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId);
  const toolNames = tools.body?.result?.tools?.map((tool) => tool.name) ?? [];
  if (!toolNames.includes("echo") || !toolNames.includes("server_info")) {
    throw new Error(`Expected echo and server_info tools, got: ${toolNames.join(", ")}`);
  }

  const echo = await mcpPost(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "echo", arguments: { message: "hello mcp" } },
    },
    sessionId,
  );
  const text = echo.body?.result?.content?.[0]?.text;
  if (text !== "hello mcp") throw new Error(`Unexpected echo response: ${text}`);

  console.log("http smoke test passed");
} finally {
  child.kill("SIGTERM");
}
