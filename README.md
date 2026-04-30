# mcp-app-server

A small, deployable Model Context Protocol (MCP) server intended as a GitHub project that can be connected to MCP App-style hosting or any MCP client that supports stdio or Streamable HTTP.

## What it includes

- TypeScript MCP server using `@modelcontextprotocol/sdk`
- MCP Apps MVP using `@modelcontextprotocol/ext-apps`
- `stdio` transport for local MCP clients
- Streamable HTTP endpoint at `POST /mcp` for hosted deployment
- Health endpoint at `GET /health`
- Remote deployment metadata endpoint at `GET /`
- Optional bearer-token authorization for remote `/mcp` traffic
- Configurable CORS headers for browser-hosted MCP Apps clients
- Single-file bundled app resource served as `text/html;profile=mcp-app`
- Dockerfile for container hosting
- GitHub Actions CI
- Example MCP client config

## Tools

- `echo`: returns a supplied message
- `weather_dashboard`: opens an interactive MCP App weather dashboard and returns sample forecast data
- `server_info`: returns server metadata and runtime details

## MCP App resources

- `ui://weather-dashboard/mcp-app.html`: bundled Weather Dashboard app UI resource

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
npm run typecheck
npm run build
npm run smoke:stdio
npm run smoke:http
npm run smoke:apps
npm run smoke:remote
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

If `MCP_BEARER_TOKEN` is configured on the remote server, include the matching authorization header:

```json
{
  "mcpServers": {
    "mcp-app-server": {
      "url": "https://YOUR_HOST/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

Remote metadata endpoints:

- `GET /`: service metadata, MCP endpoint, health endpoint, app resource URI
- `GET /health`: health check plus remote MCP endpoint metadata
- `POST /mcp`: Streamable HTTP MCP endpoint

## Hermes Agent local test config

After starting the local HTTP server:

```bash
MCP_TRANSPORT=http PORT=3099 npm start
```

Add this to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  mcp_app_server:
    url: "http://127.0.0.1:3099/mcp"
    timeout: 120
    connect_timeout: 30
```

Then reload or restart Hermes Agent and test:

```bash
hermes mcp list
hermes mcp test mcp_app_server
```

Expected tools:

- `echo`
- `weather_dashboard`
- `server_info`

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
- Public URL: set `PUBLIC_URL=https://YOUR_HOST` so `/health` and `server_info` report the correct remote endpoint
- Optional auth: set `MCP_BEARER_TOKEN` and configure clients with `Authorization: Bearer ...`
- Optional CORS: set `MCP_CORS_ORIGIN=https://YOUR_CLIENT_ORIGIN` for browser-based hosts, or `*` for public demos

If the hosting platform asks for a transport, choose Streamable HTTP.

Example remote environment:

```bash
MCP_TRANSPORT=http
PORT=3000
PUBLIC_URL=https://YOUR_HOST
MCP_BEARER_TOKEN=replace-with-a-long-random-token
MCP_CORS_ORIGIN=*
```

After deployment:

```bash
curl https://YOUR_HOST/health
hermes mcp test YOUR_REMOTE_SERVER_NAME
```

## Environment variables

- `MCP_TRANSPORT`: `stdio` or `http`
- `PORT`: HTTP port, usually set automatically by hosting providers
- `PUBLIC_URL`: public HTTPS origin for the deployed remote MCP server, for example `https://YOUR_HOST`
- `MCP_BEARER_TOKEN`: optional bearer token required for `/mcp` requests
- `MCP_CORS_ORIGIN`: CORS allow-origin value for `/mcp`, defaults to `*`
- `MCP_SERVER_NAME`: optional server name override
- `MCP_SERVER_VERSION`: optional server version override

## License

MIT
