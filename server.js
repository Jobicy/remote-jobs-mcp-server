import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";

const API_BASE_URL = "https://jobicy.com/api/v2/remote-jobs.php";
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const activeSessions = new Map();

function createMcpServerInstance() {
  const server = new Server(
    { name: "Jobicy Remote Jobs", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_jobs",
        description: "Fetches a structured list of remote jobs from the Jobicy database. Safe GET request with zero side-effects. No authentication required. Returns a JSON object containing an array of job listings sorted by publication date, newest first. Each job object includes: id, url, jobTitle, companyName, companyLogo, jobIndustry, jobType, jobGeo, jobLevel, jobExcerpt, jobDescription, and pubDate. Always call 'get_taxonomies' first if you need to discover valid location or industry slugs to filter your search. Supports pagination via the 'count' parameter from 1 to 100. Rate limits: standard public web limits apply, avoid aggressive loop calls.",
        inputSchema: {
          type: "object",
          properties: {
            count:    { type: "number", minimum: 1, maximum: 100, description: "Number of jobs to return, from 1 to 100. Default is 100." },
            geo:      { type: "string", description: "Location slug. Run get_taxonomies with type='locations' first to discover valid slugs." },
            industry: { type: "string", description: "Industry slug. Run get_taxonomies with type='industries' first to discover valid slugs." },
            tag:      { type: "string", minLength: 3, maxLength: 50, description: "Search keyword, from 3 to 50 characters." }
          }
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
      },
      {
        name: "get_taxonomies",
        description: "Retrieves available filter slugs for locations or industries to prevent formatting errors. Read-only metadata request with no side-effects. No authentication required. Returns a JSON object containing valid slugs. Use this tool before get_jobs when you need to verify if a specific region or category slug exists.",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["locations", "industries"], description: "Taxonomy type to fetch." }
          },
          required: ["type"]
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    if (name === "get_jobs") {
      try {
        const url = new URL(API_BASE_URL);
        if (args.count)    url.searchParams.set("count", String(args.count));
        if (args.geo)      url.searchParams.set("geo", args.geo);
        if (args.industry) url.searchParams.set("industry", args.industry);
        if (args.tag)      url.searchParams.set("tag", args.tag);

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Jobicy API error: ${response.status}`);
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data.jobs || data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
    }

    if (name === "get_taxonomies") {
      try {
        const response = await fetch(`${API_BASE_URL}?get=${encodeURIComponent(args.type)}`);
        if (!response.ok) throw new Error(`Jobicy API error: ${response.status}`);
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
    }

    throw new Error(`Tool not found: ${name}`);
  });

  return server;
}

app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport();
    const serverInstance = createMcpServerInstance();
    await serverInstance.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).send(`MCP error: ${error.message}`);
    }
  }
});

app.get("/mcp", (req, res) => {
  res.json({
    name: "Jobicy Remote Jobs MCP Server",
    version: "1.0.0",
    protocol: "MCP Streamable HTTP",
    endpoints: {
      mcp: "POST https://jobicy.com/mcp",
      sse: "GET https://jobicy.com/mcp/sse",
      discovery: "GET https://jobicy.com/.well-known/mcp.json"
    },
    docs: "https://github.com/Jobicy/remote-jobs-mcp-server"
  });
});

app.get("/mcp/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  const serverInstance = createMcpServerInstance();
  activeSessions.set(sessionId, { server: serverInstance, transport });
  req.on("close", () => activeSessions.delete(sessionId));
  await serverInstance.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = activeSessions.get(sessionId);
  if (!session) return res.status(400).send("Invalid or expired sessionId");
  await session.transport.handlePostMessage(req, res);
});

app.listen(PORT, () => console.log(`Jobicy MCP Server running on port ${PORT}`));
