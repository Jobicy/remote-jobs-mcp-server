import { pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toolsList, callTool } from './src/tools.js';
import { resourceTemplates, readResource } from './src/resources.js';

export function createMcpServerInstance() {
  const server = new Server(
    { name: 'Jobicy Remote Jobs', version: '2.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolsList }));
  server.setRequestHandler(CallToolRequestSchema, async request => callTool(request.params.name, request.params.arguments ?? {}));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates }));
  server.setRequestHandler(ReadResourceRequestSchema, async request => readResource(request.params.uri));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createMcpServerInstance();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
