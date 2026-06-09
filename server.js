import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import cors from "cors";
import { z } from "zod";

const API_BASE_URL = "https://jobicy.com/api/v2/remote-jobs.php"; 
const PORT = process.env.PORT || 3001;

function createMcpServerInstance() {
  const server = new McpServer({
    name: "Jobicy Remote Jobs",
    version: "1.0.0"
  });

  server.tool(
    "get_jobs",
    "Fetches a structured list of remote jobs from the Jobicy database. Safe GET request with zero side-effects. No authentication required. Returns a JSON object containing an array of job listings sorted by publication date (newest first). Each job object includes: id, url, jobTitle, companyName, companyLogo, jobIndustry, jobType, jobGeo, jobLevel, jobExcerpt, jobDescription, and pubDate. Always call 'get_taxonomies' first if you need to discover valid location or industry slugs to filter your search. Supports pagination via the 'count' parameter (1-100). Rate limits: standard public web limits apply, avoid aggressive loop calls.",
    {
      count: z.number().min(1).max(100).optional().describe("Number of jobs to return (default 100)"),
      geo: z.string().optional().describe("Location slug (e.g., 'europe', 'usa', 'uk')"),
      industry: z.string().optional().describe("Industry slug (e.g., 'dev', 'marketing')"),
      tag: z.string().optional().describe("Search keyword (3-50 chars)")
    },
    async (args) => {
      try {
        const url = new URL(API_BASE_URL);
        if (args.count) url.searchParams.append("count", args.count);
        if (args.geo) url.searchParams.append("geo", args.geo);
        if (args.industry) url.searchParams.append("industry", args.industry);
        if (args.tag) url.searchParams.append("tag", args.tag);

        const response = await fetch(url.toString());
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data.jobs || data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
    }
  );

  server.tool(
    "get_taxonomies",
    "Retrieves available filter slugs for locations or industries to prevent formatting errors. Read-only metadata request with no side-effects. No auth required. Returns a JSON object containing an array of strings representing valid slugs. Use this tool BEFORE 'get_jobs' when you need to verify if a specific region or category slug exists in our system.",
    { type: z.enum(["locations", "industries"]) },
    async ({ type }) => {
      try {
        const response = await fetch(`${API_BASE_URL}?get=${type}`);
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
    }
  );

  return server;
}

if (process.argv.includes("--stdio")) {
  const serverInstance = createMcpServerInstance();
  const transport = new StdioServerTransport();
  await serverInstance.connect(transport);
  console.error("Jobicy MCP Server running via Stdio");
} else {
  const app = express();
  app.use(cors());
  const activeSessions = new Map();

  app.get("/mcp", async (req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    const sessionId = transport.sessionId || Math.random().toString(36).substring(2, 15);
    const serverInstance = createMcpServerInstance();
    
    activeSessions.set(sessionId, { server: serverInstance, transport: transport });
    req.on("close", () => { activeSessions.delete(sessionId); });
    await serverInstance.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = activeSessions.get(sessionId) || Array.from(activeSessions.values())[0];

    if (session && session.transport) {
      try {
        await session.transport.handlePostMessage(req, res);
      } catch (err) {
        res.status(500).send("Error: " + err.message);
      }
    } else {
      res.status(400).send("No active SSE connection found");
    }
  });

  app.listen(PORT, () => {
    console.log(`Jobicy MCP Server running on port ${PORT} (SSE Mode)`);
  });
}
