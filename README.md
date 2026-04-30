# mcp-app-server

A small, deployable Model Context Protocol (MCP) server intended as a GitHub project that can be connected to MCP App-style hosting or any MCP client that supports stdio or Streamable HTTP.

## What it includes

- TypeScript MCP server using `@modelcontextprotocol/sdk`
- `stdio` transport for local MCP clients
- Streamable HTTP endpoint at `POST /mcp` for hosted deployment
- Health endpoint at `GET /health`
- Dockerfile for container hosting
- GitHub Actions CI
- Example MCP client config

## Tools

- `echo`: returns a supplied message
- `server_info`: returns server metadata and runtime details

## Local development

```bash
npm install
npm run dev
```

By default, without `PORT`, the server starts in stdio mode. For HTTP mode:

```bash
MCP_TRANSPORT=http PORT=3000 npm run dev
curl http://localhost:3000/health
```

## Build and run

```bash
npm run build
npm start
```

Run HTTP mode after building:

```bash
MCP_TRANSPORT=http PORT=3000 npm start
```

## MCP client config, stdio

```json
{
  "mcpServers": {
    "mcp-app-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-app-server/dist/src/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## MCP client config, hosted HTTP

Use your deployed URL as the MCP endpoint:

```json
{
  "mcpServers": {
    "mcp-app-server": {
      "url": "https://YOUR_HOST/mcp"
    }
  }
}
```

## Docker

```bash
docker build -t mcp-app-server .
docker run --rm -p 3000:3000 -e MCP_TRANSPORT=http -e PORT=3000 mcp-app-server
```

## Deploying with MCP App / hosted MCP platforms

This repository is ready for platforms that deploy from GitHub using a Dockerfile or Node build command.

Typical settings:

- Build command: `npm ci && npm run build`
- Start command: `MCP_TRANSPORT=http node dist/src/index.js`
- Port: read from `$PORT`, defaults to `3000`
- MCP endpoint path: `/mcp`
- Health check path: `/health`

If the hosting platform asks for a transport, choose Streamable HTTP.

## Environment variables

- `MCP_TRANSPORT`: `stdio` or `http`
- `PORT`: HTTP port, usually set automatically by hosting providers
- `MCP_SERVER_NAME`: optional server name override
- `MCP_SERVER_VERSION`: optional server version override

## License

MIT
