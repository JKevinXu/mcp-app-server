import { spawn } from "node:child_process";

const port = Number(process.env.SMOKE_APPS_PORT ?? 3100);
const baseUrl = `http://127.0.0.1:${port}`;
const expectedResourceUri = "ui://weather-dashboard/mcp-app.html";

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
      clientInfo: { name: "smoke-apps", version: "0.1.0" },
    },
  });

  const sessionId = init.res.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("No mcp-session-id returned by initialize");

  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId);

  const tools = await mcpPost({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId);
  const dashboardTool = tools.body?.result?.tools?.find((tool) => tool.name === "weather_dashboard");
  if (!dashboardTool) throw new Error("Expected weather_dashboard MCP App tool");
  if (dashboardTool._meta?.ui?.resourceUri !== expectedResourceUri) {
    throw new Error(`Expected tool _meta.ui.resourceUri=${expectedResourceUri}, got ${JSON.stringify(dashboardTool._meta)}`);
  }

  const resource = await mcpPost(
    { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: expectedResourceUri } },
    sessionId,
  );
  const content = resource.body?.result?.contents?.[0];
  if (content?.mimeType !== "text/html;profile=mcp-app") {
    throw new Error(`Expected MCP App resource mimeType text/html;profile=mcp-app, got ${content?.mimeType}`);
  }
  if (!content?.text?.includes("Weather Dashboard") || !content.text.includes("Refresh forecast")) {
    throw new Error("Expected bundled MCP App HTML for Weather Dashboard");
  }

  const call = await mcpPost(
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "weather_dashboard", arguments: { city: "San Francisco", units: "fahrenheit" } },
    },
    sessionId,
  );
  const payload = JSON.parse(call.body?.result?.content?.[0]?.text ?? "{}");
  if (payload.city !== "San Francisco" || !Array.isArray(payload.forecast) || payload.forecast.length < 3) {
    throw new Error(`Unexpected weather_dashboard payload: ${JSON.stringify(payload)}`);
  }

  console.log("mcp apps smoke test passed");
} finally {
  child.kill("SIGTERM");
}
