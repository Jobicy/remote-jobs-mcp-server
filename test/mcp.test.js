import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
process.env.JOBICY_MCP_NO_LISTEN = '1';
const { createMcpServerInstance } = await import('../server.js');

const requests = [];
const job = { id: 123, url: 'https://jobicy.com/job/123', jobTitle: 'Backend Engineer', companyName: 'Example',
  jobIndustry: ['Engineering'], jobType: ['Full-Time'], jobGeo: 'Europe', jobLevel: 'Senior',
  jobExcerpt: 'Build APIs', pubDate: '2026-10-01T00:00:00Z' };

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  requests.push({ url, options });
  let payload;
  if (url.pathname.endsWith('/remote-jobs')) {
    if (url.searchParams.get('get') === 'locations') payload = { locations: [{ geoID: 1, geoName: 'USA', geoSlug: 'usa' }], appliedFilters: { get: 'locations' } };
    else if (url.searchParams.get('get') === 'industries') payload = { industries: [{ industryID: 2, industryName: 'Engineering', industrySlug: 'engineering' }], appliedFilters: { get: 'industries' } };
    else payload = { jobs: [{ ...job, jobDescription: '<p>Full description</p>' }], jobCount: 1, nextCursor: 'legacy-cursor', hasMore: true };
  } else {
    const action = url.searchParams.get('action');
    if (action === 'list_taxonomies') payload = { type: url.searchParams.get('type'), terms: url.searchParams.get('type') === 'locations' ?
      [{ slug: 'uk', label: 'UK' }, { slug: 'usa', label: 'USA' }] : [{ slug: 'engineering', label: 'Engineering' }] };
    else if (action === 'search_jobs' || action === 'get_company_jobs') payload = { jobs: [job], jobCount: 1, nextCursor: 'opaque-next', hasMore: true, appliedFilters: {} };
    else if (action === 'get_job') payload = { job: { ...job, jobDescription: '<p>Full description</p>' } };
    else if (action === 'get_similar_jobs') payload = { jobs: [{ ...job, similarityScore: 5 }] };
    else if (action === 'search_companies') payload = { companies: [{ id: 8, slug: 'example', name: 'Example', url: 'https://jobicy.com/company/example', industry: [] }] };
    else if (action === 'get_company') payload = { company: { id: 8, slug: 'example', name: 'Example', url: 'https://jobicy.com/company/example', industry: [], description: 'Public company' } };
    else if (action === 'get_role') payload = { role: { slug: 'engineer', title: 'Engineer', url: 'https://jobicy.com/careers/engineer', description: '', responsibilities: [], skills: [], levels: [], category: '' } };
    else if (action === 'get_related_roles') payload = { roles: [] };
    else throw new Error(`Unmocked action ${action}`);
  }
  return { ok: true, status: 200, json: async () => payload };
};

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = createMcpServerInstance();
await server.connect(serverTransport);
const client = new Client({ name: 'contract-test', version: '1.0.0' }, { capabilities: {} });
await client.connect(clientTransport);

test('tools/list preserves legacy tools and exposes all public tools', async () => {
  const { tools } = await client.listTools();
  const names = tools.map(tool => tool.name);
  for (const name of ['get_jobs','get_taxonomies','search_jobs','get_job','get_similar_jobs','search_companies',
    'get_company','get_company_jobs','get_role','get_related_roles','resolve_taxonomy','list_taxonomies']) assert.ok(names.includes(name), name);
  for (const tool of tools.filter(tool => !['get_jobs','get_taxonomies'].includes(tool.name))) {
    assert.ok(tool.inputSchema, tool.name);
    assert.ok(tool.outputSchema, tool.name);
  }
});

test('get_jobs keeps JSON array in content.text and aliases', async () => {
  const response = await client.callTool({ name: 'get_jobs', arguments: { count: 1, location: 'usa', category: 'engineering', keyword: 'backend' } });
  assert.equal(response.isError, undefined);
  assert.ok(Array.isArray(JSON.parse(response.content[0].text)));
  assert.equal(JSON.parse(response.content[0].text)[0].jobDescription, '<p>Full description</p>');
  const url = requests.at(-1).url;
  assert.equal(url.searchParams.get('geo'), 'usa');
  assert.equal(url.searchParams.get('industry'), 'engineering');
  assert.equal(url.searchParams.get('tag'), 'backend');
});

test('both legacy taxonomy requests keep their JSON object', async () => {
  for (const type of ['locations','industries']) {
    const response = await client.callTool({ name: 'get_taxonomies', arguments: { type } });
    assert.ok(Array.isArray(JSON.parse(response.content[0].text)[type]));
  }
});

test('search_jobs returns compact structuredContent and forwards cursor with filters', async () => {
  const args = { query: 'backend', geo: 'usa', limit: 1, cursor: 'opaque-before' };
  const response = await client.callTool({ name: 'search_jobs', arguments: args });
  assert.equal(response.structuredContent.jobs.length, 1);
  assert.equal(response.structuredContent.jobCount, 1);
  assert.equal(response.structuredContent.nextCursor, 'opaque-next');
  assert.equal(response.structuredContent.jobs[0].jobDescription, undefined);
  assert.equal(requests.at(-1).url.searchParams.get('cursor'), args.cursor);
  assert.equal(requests.at(-1).url.searchParams.get('geo'), args.geo);
  assert.equal(requests.at(-1).options.headers.Authorization, undefined);
  assert.equal(response.structuredContent.totalResults, undefined);
});

test('one full job, similar jobs, companies, roles and company jobs use public API', async () => {
  const calls = [
    ['get_job', { id: 123 }, 'job'], ['get_similar_jobs', { jobId: 123 }, 'jobs'],
    ['search_companies', { query: 'Example' }, 'companies'], ['get_company', { id: 8 }, 'company'],
    ['get_company_jobs', { companyId: 8 }, 'jobs'], ['get_role', { role: 'engineer' }, 'role'],
    ['get_related_roles', { role: 'engineer' }, 'roles']
  ];
  for (const [name, args, field] of calls) {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError, undefined, name);
    assert.ok(response.structuredContent[field], name);
    assert.ok(requests.at(-1).url.pathname.endsWith('/jobicy-mcp-public'), name);
    assert.equal(requests.at(-1).options.headers.Authorization, undefined);
  }
});

test('empty company search fails before any upstream request', async () => {
  const before = requests.length;
  const response = await client.callTool({ name: 'search_companies', arguments: {} });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /INVALID_ARGUMENT/);
  assert.equal(requests.length, before);
});

test('taxonomy aliases resolve only to real returned slugs', async () => {
  for (const [type, query, slug] of [['location','United States','usa'], ['location','UK','uk'], ['industry','Dev','engineering']]) {
    const response = await client.callTool({ name: 'resolve_taxonomy', arguments: { type, query } });
    assert.equal(response.structuredContent.slug, slug);
    assert.equal(response.structuredContent.confidence, 1);
  }
});

test('new taxonomy list contains labels and no counts', async () => {
  const response = await client.callTool({ name: 'list_taxonomies', arguments: { type: 'locations' } });
  assert.ok(response.structuredContent.terms.length);
  assert.equal(response.structuredContent.terms[0].count, undefined);
});

test('read-only resource templates resolve individual public entities', async () => {
  const templates = await client.listResourceTemplates();
  assert.equal(templates.resourceTemplates.length, 5);
  const response = await client.readResource({ uri: 'jobicy://jobs/123' });
  assert.equal(JSON.parse(response.contents[0].text).job.jobDescription, '<p>Full description</p>');
});
