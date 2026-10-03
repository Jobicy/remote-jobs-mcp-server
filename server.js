import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { toolsList, callTool } from './src/tools.js';
import { resourceTemplates, readResource } from './src/resources.js';

const PORT = process.env.PORT || 3001;
const VERSION = '2.0.0';
const app = express();
const activeSessions = new Map();

app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
app.use(cors());
app.use(express.json());

const mcpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ jsonrpc: '2.0', error: { code: -32005, message: 'Too Many Requests. Rate limit exceeded for this IP.' }, id: null }) });

function createMcpServerInstance() {
  const server = new Server({ name: 'Jobicy Remote Jobs', version: VERSION }, { capabilities: { tools: {}, resources: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolsList }));
  server.setRequestHandler(CallToolRequestSchema, async request => callTool(request.params.name, request.params.arguments ?? {}));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates }));
  server.setRequestHandler(ReadResourceRequestSchema, async request => readResource(request.params.uri));
  return server;
}

app.post('/mcp', mcpLimiter, async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport();
    const server = createMcpServerInstance();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal MCP error' }, id: null });
  }
});

const discoveryLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many discovery requests' }) });

app.get('/mcp', discoveryLimiter, (_req, res) => {
  res.set({ 'Cache-Control': 'public, max-age=3600, s-maxage=3600' });
  res.json({ name: 'Jobicy Remote Jobs MCP Server', version: VERSION, protocol: 'MCP Streamable HTTP',
    endpoints: { mcp: 'POST https://jobicy.com/mcp', sse: 'GET https://jobicy.com/mcp/sse', discovery: 'GET https://jobicy.com/.well-known/mcp.json' },
    docs: 'https://github.com/Jobicy/remote-jobs-mcp-server' });
});

app.get('/mcp/sse', mcpLimiter, async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  const server = createMcpServerInstance();
  activeSessions.set(transport.sessionId, { server, transport });
  req.on('close', () => activeSessions.delete(transport.sessionId));
  await server.connect(transport);
});

app.post('/messages', mcpLimiter, async (req, res) => {
  const session = activeSessions.get(req.query.sessionId);
  if (!session) return res.status(400).send('Invalid or expired sessionId');
  await session.transport.handlePostMessage(req, res);
});

app.get('/.well-known/mcp.json', (_req, res) => res.json({ name: 'jobicy-remote-jobs', version: VERSION,
  serverInfo: { name: 'Jobicy Remote Jobs', version: VERSION, description: 'MCP server providing public Jobicy jobs, companies, roles and taxonomies' },
  transport: { type: 'streamable-http', endpoint: 'https://jobicy.com/mcp' },
  mcpServers: { 'jobicy-remote-jobs': { url: 'https://jobicy.com/mcp' } } }));

const agentCardData = { name: 'Jobicy Remote Jobs Agent', description: 'Official AI Agent designed to query, filter, and extract live remote job openings from the Jobicy database.', version: '1.0.0', protocolVersion: '0.3.0', url: 'https://jobicy.com/mcp' };
app.get('/.well-known/agent-card.json', (_req, res) => res.json(agentCardData));
app.get('/mcp/agent-card.json', (_req, res) => res.json(agentCardData));

app.use((err, _req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
});

if (process.env.JOBICY_MCP_NO_LISTEN !== '1') app.listen(PORT, () => console.log(`Jobicy MCP Server running on port ${PORT}`));

export { app, createMcpServerInstance };
