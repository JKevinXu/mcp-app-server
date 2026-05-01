import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHttpApp } from "../src/index.js";

process.env.MCP_TRANSPORT = "http";

const app = createHttpApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
