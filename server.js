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
    version: "1.0.0",
  });

  server.tool(
    "get_jobs",
    "Fetches a structured list of remote jobs from the Jobicy database. Safe GET request with zero side-effects. No authentication required. Returns a JSON object containing an array of job listings sorted by publication date, newest first. Each job object includes: id, url, jobTitle, companyName, companyLogo, jobIndustry, jobType, jobGeo, jobLevel, jobExcerpt, jobDescription, and pubDate. Always call 'get_taxonomies' first if you need to discover valid location or industry slugs to filter your search. Supports pagination via the 'count' parameter from 1 to 100. Rate limits: standard public web limits apply, avoid aggressive loop calls.",
    {
      count: z.number().min(1).max(100).optional().describe("Number of jobs to return, from 1 to 100. Default is 100."),
      geo: z.string().optional().describe("Location slug. Run get_taxonomies with type='locations' first to discover valid slugs."),
      industry: z.string().optional().describe("Industry slug. Run get_taxonomies with type='industries' first to discover valid slugs."),
      tag: z.string().min(3).max(50).optional().describe("Search keyword, from 3 to 50 characters."),
    },
    async (args) => {
      try {
        const url = new URL(API_BASE_URL);

        if (args.count) url.searchParams.set("count", String(args.count));
        if (args.geo) url.searchParams.set("geo", args.geo);
        if (args.industry) url.searchParams.set("industry", args.industry);
        if (args.tag) url.searchParams.set("tag", args.tag);

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`Jobicy API error: ${response.status}`);
        }

        const data = await response.json();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.jobs || data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_taxonomies",
    "Retrieves available filter slugs for locations or industries to prevent formatting errors. Read-only metadata request with no side-effects. No authentication required. Returns a JSON object containing valid slugs. Use this tool before get_jobs when you need to verify if a specific region or category slug exists.",
    {
      type: z.enum(["locations", "industries"]).describe("Taxonomy type to fetch."),
    },
    async ({ type }) => {
      try {
        const response = await fetch(`${API_BASE_URL}?get=${encodeURIComponent(type)}`);

        if (!response.ok) {
          throw new Error(`Jobicy API error: ${response.status}`);
        }

        const data = await response.json();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
      }
    }
  );

  return server;
}

if (process.argv.includes("--stdio")) {
  const serverInstance = createMcpServerInstance();
  const transport = new StdioServerTransport();

  await serverInstance.connect(transport);

  console.error("Jobicy MCP Server running via stdio");
} else {
  const app = express();

  app.use(cors());
  
  const activeSessions = new Map();

  app.get("/mcp", async (req, res) => {
    try {
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;

      if (!sessionId) {
        return res.status(500).send("Failed to create SSE session");
      }

      const serverInstance = createMcpServerInstance();

      activeSessions.set(sessionId, {
        server: serverInstance,
        transport,
      });

      req.on("close", () => {
        activeSessions.delete(sessionId);
      });

      await serverInstance.connect(transport);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).send(`MCP connection error: ${error.message}`);
      }
    }
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId;

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).send("Missing sessionId");
    }

    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(400).send("Invalid or expired sessionId");
    }

    try {
      await session.transport.handlePostMessage(req, res);
    } catch (error) {
      res.status(500).send(`MCP message error: ${error.message}`);
    }
  });

  app.listen(PORT, () => {
    console.log(`Jobicy MCP Server running on port ${PORT} in SSE mode`);
  });
}
