#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const SERVER_NAME = process.env.MCP_SERVER_NAME ?? "mcp-app-server";
const SERVER_VERSION = process.env.MCP_SERVER_VERSION ?? "0.1.0";

export function createServer() {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Return the supplied message. Useful for testing MCP connectivity.",
      inputSchema: {
        message: z.string().describe("Message to echo back"),
      },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: message }],
    }),
  );

  server.registerTool(
    "server_info",
    {
      title: "Server info",
      description: "Return metadata and runtime details for this MCP server.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              name: SERVER_NAME,
              version: SERVER_VERSION,
              node: process.version,
              transport: process.env.MCP_TRANSPORT ?? "stdio",
              time: new Date().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerResource(
    "health",
    "health://status",
    {
      title: "Health status",
      description: "Basic health and version information.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ ok: true, name: SERVER_NAME, version: SERVER_VERSION }),
        },
      ],
    }),
  );

  return server;
}

async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "Use POST /mcp for stateless Streamable HTTP MCP requests." });
  });

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`${SERVER_NAME} listening on http://0.0.0.0:${port}`);
    console.log(`MCP endpoint: http://0.0.0.0:${port}/mcp`);
  });
}

const transport = process.env.MCP_TRANSPORT ?? (process.env.PORT ? "http" : "stdio");

if (transport === "http") {
  await startHttp();
} else if (transport === "stdio") {
  await startStdio();
} else {
  throw new Error(`Unsupported MCP_TRANSPORT=${transport}. Use "stdio" or "http".`);
}
