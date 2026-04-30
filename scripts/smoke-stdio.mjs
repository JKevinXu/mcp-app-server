import { spawn } from "node:child_process";
import { once } from "node:events";

const child = spawn(process.execPath, ["dist/src/index.js"], {
  env: { ...process.env, MCP_TRANSPORT: "stdio" },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke-test", version: "0.1.0" } } });
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

const deadline = Date.now() + 5000;
while (Date.now() < deadline && !stdout.includes('"tools"')) {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

child.kill("SIGTERM");
await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 500))]);

if (!stdout.includes('"echo"') || !stdout.includes('"weather_dashboard"') || !stdout.includes('"server_info"')) {
  console.error("Smoke test failed");
  console.error("stdout:", stdout);
  console.error("stderr:", stderr);
  process.exit(1);
}

console.log("stdio smoke test passed");
