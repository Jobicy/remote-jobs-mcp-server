# Jobicy Remote Jobs MCP Server

Official MCP server for [Jobicy](https://jobicy.com), providing AI assistants with access to thousands of remote jobs from leading companies worldwide across 20+ professional industries.

AI clients such as Claude, Cursor, Cline, and other MCP-compatible tools can search, filter, and retrieve real-time remote jobs directly from the Jobicy database.

## Available Tools

- `get_jobs`: Fetches a structured list of remote jobs. Supports filtering by count, region (`geo`), category (`industry`), and keywords (`tag`).
- `get_taxonomies`: Retrieves valid filter slugs for regions (`locations`) or categories (`industries`).

---

## Usage

You can connect to this server in three ways: via our hosted public endpoint, via legacy SSE, or by running it locally using `stdio`.

### 1. Streamable HTTP (Recommended)

The default transport for all modern MCP clients (Claude.ai, Cursor, Cline, etc.).

Add this to your `claude_desktop_config.json` or equivalent:

```json
{
  "mcpServers": {
    "jobicy-jobs": {
      "url": "https://jobicy.com/mcp"
    }
  }
}
```

### 2. Legacy SSE Endpoint

For older MCP clients that require SSE transport:

```json
{
  "mcpServers": {
    "jobicy-jobs": {
      "url": "https://jobicy.com/mcp/sse",
      "type": "sse"
    }
  }
}
```

### 3. Local Installation (via Stdio)

If you prefer to run the server locally on your machine:

1. Clone this repository.
2. Install dependencies: `npm install`
3. Add the server to your configuration using `node` and the `--stdio` flag:

```json
{
  "mcpServers": {
    "jobicy-jobs-local": {
      "command": "node",
      "args": ["/path/to/your/cloned/folder/server.js", "--stdio"]
    }
  }
}
```

### License
MIT

---

[![remote-jobs-mcp-server MCP server](https://glama.ai/mcp/servers/Jobicy/remote-jobs-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/Jobicy/remote-jobs-mcp-server)
