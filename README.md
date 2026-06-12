# Jobicy Remote Jobs MCP Server

Official MCP server for [Jobicy](https://jobicy.com), providing AI assistants with access to over 150,000 remote job opportunities from companies worldwide across 20+ professional industries.

AI clients such as Claude, Cursor, Cline, and other MCP-compatible tools can search, filter, and retrieve real-time remote jobs directly from the Jobicy database.

## Available Tools

- `get_jobs`: Fetches a structured list of remote jobs. Supports filtering by count, region (`geo`), category (`industry`), and keywords (`tag`).
- `get_taxonomies`: Retrieves valid filter slugs for regions (`locations`) or categories (`industries`).

---

## Usage

You can connect to this server in two ways: via our hosted public SSE endpoint, or by running it locally using `stdio`.

### 1. Public SSE Endpoint (Recommended)
You can connect your AI clients directly to our cloud-hosted server. Add this to your `claude_desktop_config.json` or Cursor settings:

```json
{
  "mcpServers": {
    "jobicy-jobs": {
      "url": "https://jobicy.com/mcp"
    }
  }
}
```

### 2. Local Installation (via Stdio)
If you prefer to run the server locally on your machine:

1. Clone this repository.
2. Install dependencies: npm install
3. Add the server to your configuration using node and the --stdio flag:

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
