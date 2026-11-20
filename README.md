# Jobicy Remote Jobs MCP

The official public Jobicy MCP service is hosted at **https://jobicy.com/mcp**. It provides read-only tools for finding remote jobs, reading vacancies, exploring companies and career roles, and browsing public filter taxonomies.

This repository is a connector and documentation for the hosted MCP service. It does **not** host a second Jobicy API, query the Jobicy database, or call separate Jobicy REST endpoints.

## Connect directly (recommended)

Add the following Streamable HTTP endpoint to an MCP-compatible client:

```text
https://jobicy.com/mcp
```

Clients that accept a JSON MCP configuration can use:

```json
{
  "mcpServers": {
    "jobicy": {
      "url": "https://jobicy.com/mcp"
    }
  }
}
```

No Jobicy account or access token is needed to use public, read-only tools. The hosted server determines the available tools and schemas dynamically.

## Local STDIO bridge

If your MCP client supports only local STDIO commands, this repository can forward requests to the same hosted endpoint. It does not implement its own job search or store data.

Requires Node.js 20 or newer:

```bash
pnpm install --frozen-lockfile
node server.js
```

Configure your MCP client with the absolute path to `server.js`:

```json
{
  "mcpServers": {
    "jobicy": {
      "command": "node",
      "args": ["/absolute/path/to/remote-jobs-mcp-server/server.js"]
    }
  }
}
```

For Glama environments that require a process command, use `mcp-proxy -- node server.js` after installing dependencies. The bridge connects only to `https://jobicy.com/mcp`, so outbound HTTPS access to that host is required.

## Available features

Ask the client to list tools after connecting. The hosted service provides job search, job details, similar vacancies, company searches, company jobs, career roles, taxonomy resolution and public resource templates. The exact list, input schemas, pagination and visibility rules are maintained by the hosted MCP service, not by this repository.

The public endpoint is read-only. Streamable HTTP clients should connect to the URL above.

## Testing

```bash
pnpm test
```

The test suite uses a mocked MCP service and does not contact production.

## Help and security

Open a [GitHub issue](https://github.com/Jobicy/remote-jobs-mcp-server/issues) for connection or documentation problems. Report security concerns privately as described in [SECURITY.md](SECURITY.md).

## License

This documentation is available under the [MIT License](LICENSE).

[![Jobicy MCP server](https://glama.ai/mcp/servers/Jobicy/remote-jobs-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/Jobicy/remote-jobs-mcp-server)
