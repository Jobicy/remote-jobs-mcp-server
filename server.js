import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const MCP_URL = 'https://jobicy.com/mcp';

export function createMcpProxy(upstream) {
  const server = new Server(
    { name: 'Jobicy Remote Jobs', version: '2.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, request => upstream.listTools(request.params));
  server.setRequestHandler(CallToolRequestSchema, request => upstream.callTool(request.params));
  server.setRequestHandler(ListResourcesRequestSchema, request => upstream.listResources(request.params));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, request => upstream.listResourceTemplates(request.params));
  server.setRequestHandler(ReadResourceRequestSchema, request => upstream.readResource(request.params));

  return server;
}

async function main() {
  const upstream = new Client(
    { name: 'Jobicy STDIO Bridge', version: '2.0.0' },
    { capabilities: {} }
  );
  await upstream.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));
  const server = createMcpProxy(upstream);
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('Could not connect to Jobicy MCP:', error.message);
    process.exitCode = 1;
  });
}
