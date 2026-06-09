# Jobicy Remote Jobs MCP Server

An official Model Context Protocol (MCP) server for the [Jobicy](https://jobicy.com) remote jobs database. This server allows AI models (like Claude, Cursor, Cline) to interact directly with real-time remote job listings.

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
