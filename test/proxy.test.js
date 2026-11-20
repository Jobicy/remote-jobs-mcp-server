import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createMcpProxy } from '../server.js';

test('the stdio bridge forwards tools and resources from the remote MCP service', async () => {
  const source = new Server(
    { name: 'upstream-test', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );
  const calls = [];
  source.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{
    name: 'search_jobs', description: 'Search jobs', inputSchema: { type: 'object', properties: {} }
  }] }));
  source.setRequestHandler(CallToolRequestSchema, async request => {
    calls.push(request.params);
    return { content: [{ type: 'text', text: 'OK' }], structuredContent: { jobs: [] } };
  });
  source.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  source.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [{
    uriTemplate: 'jobicy://jobs/{id}', name: 'Jobicy job'
  }] }));
  source.setRequestHandler(ReadResourceRequestSchema, async request => ({ contents: [{
    uri: request.params.uri, text: '{"id":123}', mimeType: 'application/json'
  }] }));

  const [sourceTransport, upstreamTransport] = InMemoryTransport.createLinkedPair();
  const upstream = new Client({ name: 'bridge-test', version: '1.0.0' }, { capabilities: {} });
  await source.connect(sourceTransport);
  await upstream.connect(upstreamTransport);

  const bridge = createMcpProxy(upstream);
  const [bridgeTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'client-test', version: '1.0.0' }, { capabilities: {} });
  await bridge.connect(bridgeTransport);
  await client.connect(clientTransport);

  try {
    const list = await client.listTools();
    assert.equal(list.tools[0].name, 'search_jobs');
    const response = await client.callTool({ name: 'search_jobs', arguments: { query: 'designer' } });
    assert.deepEqual(response.structuredContent, { jobs: [] });
    assert.deepEqual(calls, [{ name: 'search_jobs', arguments: { query: 'designer' } }]);
    const resources = await client.listResourceTemplates();
    assert.equal(resources.resourceTemplates[0].uriTemplate, 'jobicy://jobs/{id}');
    const job = await client.readResource({ uri: 'jobicy://jobs/123' });
    assert.equal(job.contents[0].text, '{"id":123}');
  } finally {
    await client.close();
    await bridge.close();
    await upstream.close();
    await source.close();
  }
});
