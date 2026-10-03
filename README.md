# Jobicy Remote Jobs MCP Server

Public, read-only [Model Context Protocol](https://modelcontextprotocol.io/) access to [Jobicy](https://jobicy.com) remote jobs, companies, career roles, and filter taxonomies.

**Hosted endpoint:** `https://jobicy.com/mcp` (Streamable HTTP). Existing SSE clients can continue using `https://jobicy.com/mcp/sse` and `/messages`.

## Connect

Use this configuration in an MCP client that accepts a remote server URL:

```json
{
  "mcpServers": {
    "jobicy-remote-jobs": {
      "url": "https://jobicy.com/mcp"
    }
  }
}
```

For an older SSE client, use `https://jobicy.com/mcp/sse` with transport type `sse`. The discovery document is at [`/.well-known/mcp.json`](https://jobicy.com/.well-known/mcp.json). A GET request to `/mcp` returns endpoint information; MCP requests use POST.

## Tools

All tools are public and read-only. New tools return both `structuredContent` and JSON text in `content`. The two legacy tools retain their existing JSON in `content.text`.

| Tool | Inputs | Result and intended use |
| --- | --- | --- |
| `get_jobs` | `count`, `geo`, `industry`, `tag`; aliases `location`, `category`, `search`, `keyword` | Legacy-compatible full jobs feed. Use `search_jobs` for compact results and additional filters. |
| `get_taxonomies` | `type`: `locations` or `industries` | Legacy-compatible filter lookup. |
| `search_jobs` | `query`, `geo`, `industry`, `jobType`, `jobLevel`, `company`, `postedAfter`, `salaryMin`, `salaryMax`, `currency`, `limit`, `cursor` | Compact public jobs, without a full description per result. `jobCount` is the size of this page only. |
| `get_job` | `id` | One full public vacancy, including its description. |
| `get_similar_jobs` | `jobId`, optional `limit` | A bounded list of related public vacancies. |
| `search_companies` | At least one of `query`, `industry`, `geo`; optional `limit` | Search for specific public companies. No empty directory query, cursor, or overall count. |
| `get_company` | `id` (numeric ID or slug) | One public company profile. |
| `get_company_jobs` | `companyId`, optional `limit`, `cursor` | Compact jobs linked to one public company. |
| `get_role` | `role` (career slug) | One public Jobicy career role guide. |
| `get_related_roles` | `role`, optional `limit` | Related role guides. |
| `resolve_taxonomy` | `type`: `location` or `industry`; `query` | Resolve a name or alias to a Jobicy slug. Low-confidence matches return candidates. |
| `list_taxonomies` | `type`: `locations`, `industries`, `job_types`, or `job_levels` | Public filter slugs and labels, without entity counts. |

Call `search_jobs` directly when a filter slug is clear. Use `resolve_taxonomy` when it is uncertain, for example `United States` → `usa` or `Developer` → `engineering`. Location labels returned by the new public API have display emoji removed; the saved WordPress taxonomy terms are unchanged.

`geo` represents candidate eligibility. A country search can include jobs eligible in a parent region or globally. A cursor is opaque: pass `nextCursor` unchanged with exactly the same filters to fetch the next page. Changing filters invalidates it. Results have no total-match or database-size count.

Example tool calls:

```json
{"name":"search_jobs","arguments":{"query":"backend engineer","geo":"uk","limit":10}}
{"name":"get_job","arguments":{"id":12345}}
{"name":"search_companies","arguments":{"query":"Acme","limit":5}}
{"name":"resolve_taxonomy","arguments":{"type":"location","query":"United States"}}
```

## Resources

The server also exposes read-only resource templates: `jobicy://jobs/{id}`, `jobicy://companies/{id}`, `jobicy://roles/{slug}`, `jobicy://taxonomies/locations`, and `jobicy://taxonomies/industries`. These retrieve individual public entities or public reference terms; they do not enumerate all jobs or companies.

## How it works

The Node MCP server calls Jobicy's public HTTP APIs. It does not connect to the WordPress database. `get_jobs` and `get_taxonomies` continue to call `/api/v2/remote-jobs`. The new tools use `/api/v2/jobicy-mcp-public`, served by [`jobicy-mcp-public.php`](jobicy-mcp-public.php). That PHP endpoint reads published WordPress entities, excludes unavailable jobs, uses filter-bound snapshot cursors for job pages, and returns no global totals. It does not call or change the Commercial Jobs API or its billing.

## Run your own server

Requirements: Node.js 18 or newer, and access to the Jobicy public APIs.

```bash
npm install
npm start
```

The entry point remains `server.js`. It listens on port `3001` by default. Set `PORT` in your process manager to change the port. Optional environment variables `JOBICY_LEGACY_API_URL` and `JOBICY_PUBLIC_API_URL` override the two upstream API URLs, for example for an isolated test environment. The project does not load `.env` files itself. The server uses Streamable HTTP and legacy SSE; it does not implement stdio transport.

For Jobicy's deployment, copy `server.js`, `src/`, `package.json`, and the installed dependencies to `/root/mcp-jobs/`. Place `jobicy-mcp-public.php` at the site's `/api/v2/jobicy-mcp-public.php`, where `../../wp-load.php` resolves to the WordPress root. Publish `.well-known/mcp.json` at the site's `/.well-known/mcp.json`. Restart the Node service and clear any CDN cache for the discovery document. Keep the existing reverse proxy routes for `/mcp`, `/mcp/sse`, and `/messages`; the public MCP URL remains `https://jobicy.com/mcp`.

## Verify

```bash
npm run check
npm test
php -l jobicy-mcp-public.php
```

The Node tests cover tool discovery, legacy `content.text`, structured results, cursor forwarding, resources, and input errors. The PHP fixture tests cover cursor filter binding, compact and full jobs, excluded entities, company search safeguards, taxonomies, and roles. Install PHP or set `PHP_BIN` to run the PHP tests; without it, Node's test runner skips those cases. Production API and reverse proxy behavior should also be checked after deployment.

## License

MIT. See [LICENSE](LICENSE).

[![remote-jobs-mcp-server MCP server](https://glama.ai/mcp/servers/Jobicy/remote-jobs-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/Jobicy/remote-jobs-mcp-server)
