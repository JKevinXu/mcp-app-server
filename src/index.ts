#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

const SERVER_NAME = process.env.MCP_SERVER_NAME ?? "mcp-app-server";
const SERVER_VERSION = process.env.MCP_SERVER_VERSION ?? "0.1.0";
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, "");
const MCP_ENDPOINT = PUBLIC_URL ? `${PUBLIC_URL}/mcp` : undefined;
const MCP_BEARER_TOKEN = process.env.MCP_BEARER_TOKEN;
const MCP_CORS_ORIGIN = process.env.MCP_CORS_ORIGIN ?? "*";
const WEATHER_APP_URI = "ui://weather-dashboard/mcp-app.html";
const DEFAULT_CITY = "San Francisco";
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

type WeatherUnits = "fahrenheit" | "celsius";
type ForecastDay = { day: string; high: number; low: number; condition: string };
type WeatherPayload = {
  city: string;
  units: WeatherUnits;
  generatedAt: string;
  summary: string;
  forecast: ForecastDay[];
};

function convertTemperature(value: number, units: WeatherUnits) {
  return units === "celsius" ? Math.round(((value - 32) * 5) / 9) : value;
}

function buildWeatherPayload(city = DEFAULT_CITY, units: WeatherUnits = "fahrenheit"): WeatherPayload {
  const normalizedCity = city.trim() || DEFAULT_CITY;
  const fahrenheitForecast: ForecastDay[] = [
    { day: "Today", high: 68, low: 55, condition: "Partly cloudy" },
    { day: "Tomorrow", high: 71, low: 56, condition: "Sunny" },
    { day: "Day 3", high: 66, low: 54, condition: "Light breeze" },
  ];

  return {
    city: normalizedCity,
    units,
    generatedAt: new Date().toISOString(),
    summary: `Sample forecast for ${normalizedCity}`,
    forecast: fahrenheitForecast.map((day) => ({
      ...day,
      high: convertTemperature(day.high, units),
      low: convertTemperature(day.low, units),
    })),
  };
}

async function readWeatherAppHtml() {
  const candidates = [
    path.resolve(moduleDir, "../app/mcp-app.html"),
    path.resolve(process.cwd(), "dist/app/mcp-app.html"),
  ];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error("Built MCP app HTML was not found. Run `npm run build:app` first.");
}

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

  registerAppResource(
    server,
    "Weather Dashboard App",
    WEATHER_APP_URI,
    {
      title: "Weather Dashboard App",
      description: "Interactive MCP Apps MVP UI for viewing and refreshing sample weather data.",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: WEATHER_APP_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readWeatherAppHtml(),
          _meta: {
            ui: {
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "weather_dashboard",
    {
      title: "Weather Dashboard",
      description: "Show an interactive weather dashboard MCP App with sample forecast data.",
      inputSchema: {
        city: z.string().optional().describe("City to show in the sample forecast"),
        units: z.enum(["fahrenheit", "celsius"]).optional().describe("Temperature units"),
      },
      _meta: {
        ui: {
          resourceUri: WEATHER_APP_URI,
          invoked: "Opened weather dashboard",
        },
      },
    },
    async ({ city, units }) => {
      const payload = buildWeatherPayload(city, units);
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
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
              publicUrl: PUBLIC_URL,
              mcpEndpoint: MCP_ENDPOINT,
              authRequired: Boolean(MCP_BEARER_TOKEN),
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

function withOptionalFields(base: Record<string, unknown>) {
  if (MCP_ENDPOINT) base.mcpEndpoint = MCP_ENDPOINT;
  if (PUBLIC_URL) base.publicUrl = PUBLIC_URL;
  base.authRequired = Boolean(MCP_BEARER_TOKEN);
  return base;
}

function applyMcpCors(_req: Request, res: Response) {
  res.setHeader("Access-Control-Allow-Origin", MCP_CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Session-Id, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, mcp-session-id");
}

function isAuthorized(req: Request) {
  if (!MCP_BEARER_TOKEN) return true;
  return req.header("authorization") === `Bearer ${MCP_BEARER_TOKEN}`;
}

function rejectUnauthorized(req: Request, res: Response) {
  if (isAuthorized(req)) return false;
  applyMcpCors(req, res);
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized: missing or invalid bearer token" },
    id: req.body?.id ?? null,
  });
  return true;
}

async function startHttp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "2mb" }));

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.get("/", (_req: Request, res: Response) => {
    res.json(
      withOptionalFields({
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION,
        transport: "http",
        healthEndpoint: "/health",
        mcpEndpoint: MCP_ENDPOINT ?? "/mcp",
        appResource: WEATHER_APP_URI,
      }),
    );
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json(
      withOptionalFields({
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION,
        transport: "http",
        mcpEndpoint: MCP_ENDPOINT ?? "/mcp",
      }),
    );
  });

  app.options("/mcp", (req: Request, res: Response) => {
    applyMcpCors(req, res);
    res.status(204).end();
  });

  app.use("/mcp", (req: Request, res: Response, next) => {
    applyMcpCors(req, res);
    if (rejectUnauthorized(req, res)) return;
    next();
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      const isInitializeRequest = req.body?.method === "initialize";
      if (!isInitializeRequest) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: req.body?.id ?? null,
        });
        return;
      }

      const server = createServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport!);
        },
        enableJsonResponse: true,
      });

      transport.onclose = () => {
        if (transport?.sessionId) {
          transports.delete(transport.sessionId);
        }
      };

      await server.connect(transport);
    }

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal server error",
          },
          id: req.body?.id ?? null,
        });
      }
    }
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).json({ error: "No valid MCP session. Initialize with POST /mcp first." });
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).json({ error: "No valid MCP session." });
      return;
    }
    await transport.handleRequest(req, res);
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
