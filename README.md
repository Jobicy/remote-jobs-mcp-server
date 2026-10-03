# Jobicy Remote Jobs MCP

Connect an AI assistant to [Jobicy](https://jobicy.com) to find public remote jobs, read individual vacancies, discover companies and career roles, and resolve Jobicy filter names. This repository documents the **hosted** MCP service. You do not need to install or run a server.

## Connect your MCP client

**Streamable HTTP URL:** `https://jobicy.com/mcp`

In an MCP client that accepts a remote server URL, add a server named `jobicy` and paste that URL. If the client asks for a transport, select **Streamable HTTP**. No Jobicy account or access token is required for these public, read-only tools.

Clients that use a JSON MCP configuration can use this example:

```json
{
  "mcpServers": {
    "jobicy": {
      "url": "https://jobicy.com/mcp"
    }
  }
}
```

Older clients that support only SSE can connect to `https://jobicy.com/mcp/sse` with transport type `sse`. The client handles the associated `/messages` route. The [MCP discovery document](https://jobicy.com/.well-known/mcp.json) is also available.

After connecting, ask your assistant to list available MCP tools. You should see `search_jobs`, `get_job`, and the other tools below. If your client does not support remote MCP servers, use a client or connector that supports Streamable HTTP or SSE; this repository does not provide a local stdio server.

## Find jobs

Use `search_jobs` for most searches. It returns compact vacancies without the full job description. For example, ask your assistant:

> Find up to 10 remote backend engineering jobs open to candidates in the UK. Show the title, company, salary if available, and Jobicy link.

An equivalent tool call is:

```json
{
  "name": "search_jobs",
  "arguments": {
    "query": "backend engineer",
    "geo": "uk",
    "limit": 10
  }
}
```

The response contains `jobs`, `jobCount`, `nextCursor`, `hasMore`, and `appliedFilters`. `jobCount` counts **only jobs in that response**, not all matching jobs. To request another page, pass `nextCursor` back as `cursor` with the same filters. Treat the cursor as an opaque value; changing filters invalidates it.

For one vacancy's complete description, call `get_job` with its numeric `id`. The `geo` filter describes candidate eligibility: a country search may also include jobs open to its broader region or to candidates anywhere. Salary and logo fields are included only when public data is available.

## Available tools

| Tool | When to use it | Inputs |
| --- | --- | --- |
| `search_jobs` | Search compact public job results with cursor pagination. | Optional `query`, `geo`, `industry`, `jobType`, `jobLevel`, `company`, `postedAfter`, `salaryMin`, `salaryMax`, `currency`, `limit`, `cursor`. |
| `get_job` | Read one full public vacancy. | Required `id`. |
| `get_similar_jobs` | Find a short list of related vacancies. | Required `jobId`; optional `limit`. |
| `search_companies` | Find a specific public company or a small relevant set. This is a search, not a company directory. | At least one of `query`, `industry`, or `geo`; optional `limit` (up to 10). |
| `get_company` | Read one public company profile. | Required `id` (numeric ID or slug). |
| `get_company_jobs` | Find public jobs linked to one company. | Required `companyId`; optional `limit`, `cursor`. |
| `get_role` | Read a Jobicy career role guide. | Required `role` slug. |
| `get_related_roles` | Explore roles related to a career role. | Required `role`; optional `limit`. |
| `resolve_taxonomy` | Turn a location or industry name into a Jobicy filter slug. | Required `type` (`location` or `industry`) and `query`. |
| `list_taxonomies` | Browse available public filter slugs and labels. | Required `type`: `locations`, `industries`, `job_types`, or `job_levels`. |

If a filter is obvious, call `search_jobs` directly. When unsure, use `resolve_taxonomy`: for example, `United States` resolves to `usa`, and `Developer` can resolve to `engineering`. If a match is uncertain, the tool returns candidates instead of guessing. Location labels in the new tools are shown without display emoji.

### Legacy tools

Existing MCP clients can continue to use:

| Tool | Inputs | Compatibility |
| --- | --- | --- |
| `get_jobs` | `count`, `geo`, `industry`, `tag`; aliases `location`, `category`, `search`, `keyword`. | Keeps the original full jobs feed and JSON in `content.text`. |
| `get_taxonomies` | `type`: `locations` or `industries`. | Keeps the original JSON in `content.text`. |

New tools provide both `structuredContent` and readable JSON in `content`. All tools are read-only. Responses do not provide global job or company totals or Jobicy internal statistics.

## Resources

Clients that support MCP Resources can read individual public entities using `jobicy://jobs/{id}`, `jobicy://companies/{id}`, and `jobicy://roles/{slug}`. Public reference lists are available at `jobicy://taxonomies/locations` and `jobicy://taxonomies/industries`. Resources supplement the tools; they do not expose an all-jobs or all-companies feed.

## Help and security

Open a [GitHub issue](https://github.com/Jobicy/remote-jobs-mcp-server/issues) for connection or documentation problems. Report security concerns privately as described in [SECURITY.md](SECURITY.md).

## License

This documentation is available under the [MIT License](LICENSE).

[![Jobicy MCP server](https://glama.ai/mcp/servers/Jobicy/remote-jobs-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/Jobicy/remote-jobs-mcp-server)
