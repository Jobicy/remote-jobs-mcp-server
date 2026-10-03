import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('the repository entry point serves tools over stdio', async () => {
  const client = new Client({ name: 'stdio-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../server.js', import.meta.url))] });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 12);
    assert.ok(tools.some(tool => tool.name === 'get_jobs'));
    assert.ok(tools.some(tool => tool.name === 'get_taxonomies'));
    assert.ok(tools.some(tool => tool.name === 'search_jobs'));
    const result = await client.callTool({ name: 'search_companies', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /INVALID_ARGUMENT/);
  } finally {
    await client.close();
  }
});
