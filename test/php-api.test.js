import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [process.env.PHP_BIN, 'php'].filter(Boolean);
const php = candidates.find(candidate => spawnSync(candidate, ['-v'], { encoding: 'utf8' }).status === 0);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobicy-mcp-api-'));
const apiDir = path.join(root, 'api', 'v2');
const endpoint = path.join(apiDir, 'jobicy-mcp-public.php');
fs.mkdirSync(apiDir, { recursive: true });
fs.copyFileSync(path.join(source, 'jobicy-mcp-public.php'), endpoint);
fs.copyFileSync(path.join(source, 'test', 'wp-load-fixture.php'), path.join(root, 'wp-load.php'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function call(params, extraEnv = {}) {
  const query = new URLSearchParams(params).toString();
  const run = spawnSync(php, ['-r', 'parse_str(getenv("TEST_QUERY"), $_GET); $_SERVER["REQUEST_METHOD"]="GET"; if (getenv("TEST_AUTH")) $_SERVER["HTTP_AUTHORIZATION"]="Bearer example"; require getenv("TEST_ENDPOINT");'], {
    encoding: 'utf8', env: { ...process.env, TEST_QUERY: query, TEST_ENDPOINT: endpoint, ...extraEnv }
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('PHP search results are compact, paginated and filter-bound', { skip: !php }, () => {
  const first = call({ action: 'search_jobs', limit: 1 });
  assert.equal(first.jobs.length, 1);
  assert.equal(first.jobCount, 1);
  assert.equal(first.jobs[0].jobDescription, undefined);
  assert.equal(first.jobs[0].jobGeo, 'UK, EMEA');
  assert.equal(first.totalResults, undefined);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  const second = call({ action: 'search_jobs', limit: 1, cursor: first.nextCursor });
  assert.notEqual(second.jobs[0].id, first.jobs[0].id);
  const changed = call({ action: 'search_jobs', limit: 1, geo: 'uk', cursor: first.nextCursor });
  assert.equal(changed.error.code, 'INVALID_ARGUMENT');
  const forged = call({ action: 'search_jobs', cursor: first.nextCursor.slice(0, -1) + '0' });
  assert.equal(forged.error.code, 'INVALID_ARGUMENT');
});

test('PHP single-job endpoint returns full public job and hides excluded job', { skip: !php }, () => {
  const publicJob = call({ action: 'get_job', id: 101 });
  assert.match(publicJob.job.jobDescription, /Full public description/);
  assert.equal(publicJob.job.url, 'https://jobicy.com/backend-engineer');
  assert.equal(publicJob.job._commercial_application_url, undefined);
  assert.equal(call({ action: 'get_job', id: 103 }).error.code, 'NOT_FOUND');
});

test('PHP similar jobs and company relation return bounded public jobs', { skip: !php }, () => {
  const similar = call({ action: 'get_similar_jobs', jobId: 101, limit: 2 });
  assert.ok(similar.jobs.some(job => job.id === 102));
  assert.ok(similar.jobs.every(job => job.id !== 103));
  const companyJobs = call({ action: 'get_company_jobs', companyId: 201, limit: 2 });
  assert.ok(companyJobs.jobs.length > 0);
  assert.ok(companyJobs.jobs.every(job => job.companyId === 201));
  assert.equal(call({ action: 'get_company_jobs', companyId: 202 }).error.code, 'NOT_FOUND');
});

test('PHP company search requires a criterion, has no cursor and excludes private companies', { skip: !php }, () => {
  assert.equal(call({ action: 'search_companies' }).error.code, 'INVALID_ARGUMENT');
  const found = call({ action: 'search_companies', query: 'Example' });
  assert.equal(found.companies[0].id, 201);
  assert.equal(found.totalResults, undefined);
  assert.equal(call({ action: 'search_companies', query: 'Example', cursor: 'x' }).error.code, 'INVALID_ARGUMENT');
  assert.equal(call({ action: 'get_company', id: 202 }).error.code, 'NOT_FOUND');
  assert.equal(call({ action: 'get_company', id: 'example-labs' }).company.website, 'https://example.com');
});

test('PHP career roles and taxonomy data contain public reference fields only', { skip: !php }, () => {
  const role = call({ action: 'get_role', role: 'software-engineer' }).role;
  assert.deepEqual(role.levels, ['Junior', 'Senior']);
  assert.equal(role.relatedRoles[0].slug, 'backend-engineer');
  assert.equal(call({ action: 'get_related_roles', role: 'software-engineer' }).roles.length, 1);
  const tax = call({ action: 'list_taxonomies', type: 'locations' });
  assert.equal(tax.terms[0].slug, 'uk');
  assert.equal(tax.terms[0].label, 'UK');
  assert.equal(tax.terms[1].label, 'EMEA');
  assert.equal(tax.terms[0].count, undefined);
});

test('PHP public endpoint rejects authorization headers and unexpected parameters', { skip: !php }, () => {
  assert.equal(call({ action: 'get_job', id: 101 }, { TEST_AUTH: '1' }).error.code, 'INVALID_ARGUMENT');
  assert.equal(call({ action: 'get_job', id: 101, key: 'secret' }).error.code, 'INVALID_ARGUMENT');
});
