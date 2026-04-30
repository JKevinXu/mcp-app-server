import { spawn } from "node:child_process";

const port = Number(process.env.SMOKE_REMOTE_PORT ?? 3102);
const baseUrl = `http://127.0.0.1:${port}`;
const publicUrl = "https://mcp.example.test";
const bearerToken = "remote-smoke-token";

const child = spawn(process.execPath, ["dist/src/index.js"], {
  env: {
    ...process.env,
    MCP_TRANSPORT: "http",
    PORT: String(port),
    PUBLIC_URL: publicUrl,
    MCP_BEARER_TOKEN: bearerToken,
    MCP_CORS_ORIGIN: "https://client.example.test",
  },
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
      if (res.ok) return await res.json();
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become healthy. stdout=${stdout} stderr=${stderr}`);
}

async function mcpPost(message, sessionId, token = bearerToken) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Origin: "https://client.example.test",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(message),
  });

  const text = await res.text();
  return { res, text, body: text ? JSON.parse(text) : undefined };
}

try {
  const health = await waitForHealth();
  if (health.mcpEndpoint !== `${publicUrl}/mcp`) {
    throw new Error(`Expected health.mcpEndpoint=${publicUrl}/mcp, got ${JSON.stringify(health)}`);
  }

  const root = await fetch(baseUrl).then((res) => res.json());
  if (root.mcpEndpoint !== `${publicUrl}/mcp` || root.transport !== "http") {
    throw new Error(`Unexpected root metadata: ${JSON.stringify(root)}`);
  }

  const options = await fetch(`${baseUrl}/mcp`, {
    method: "OPTIONS",
    headers: { Origin: "https://client.example.test", "Access-Control-Request-Method": "POST" },
  });
  if (options.status !== 204) throw new Error(`Expected OPTIONS /mcp 204, got ${options.status}`);
  if (options.headers.get("access-control-allow-origin") !== "https://client.example.test") {
    throw new Error("Expected configured CORS origin on OPTIONS /mcp");
  }

  const unauth = await mcpPost({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }, undefined, null);
  if (unauth.res.status !== 401) {
    throw new Error(`Expected unauthorized MCP request to return 401, got ${unauth.res.status}: ${unauth.text}`);
  }

  const init = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-remote", version: "0.1.0" },
    },
  });
  if (!init.res.ok) throw new Error(`Authorized initialize failed: ${init.res.status} ${init.text}`);
  if (init.res.headers.get("access-control-allow-origin") !== "https://client.example.test") {
    throw new Error("Expected configured CORS origin on MCP response");
  }
  const sessionId = init.res.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("No mcp-session-id returned by initialize");

  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId);
  const infoCall = await mcpPost(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "server_info", arguments: {} } },
    sessionId,
  );
  const info = JSON.parse(infoCall.body?.result?.content?.[0]?.text ?? "{}");
  if (info.publicUrl !== publicUrl || info.mcpEndpoint !== `${publicUrl}/mcp`) {
    throw new Error(`Expected server_info to include remote URL metadata, got ${JSON.stringify(info)}`);
  }

  console.log("remote MCP Apps smoke test passed");
} finally {
  child.kill("SIGTERM");
}
