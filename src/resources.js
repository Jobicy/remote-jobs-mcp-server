import { publicApi } from './api.js';
import { ToolError } from './errors.js';

export const resourceTemplates = [
  { uriTemplate: 'jobicy://jobs/{id}', name: 'Jobicy job', description: 'Full public vacancy by ID.', mimeType: 'application/json' },
  { uriTemplate: 'jobicy://companies/{id}', name: 'Jobicy company', description: 'Public company by ID or slug.', mimeType: 'application/json' },
  { uriTemplate: 'jobicy://roles/{slug}', name: 'Jobicy role', description: 'Public career role guide.', mimeType: 'application/json' },
  { uriTemplate: 'jobicy://taxonomies/locations', name: 'Jobicy locations', description: 'Public location slugs and labels.', mimeType: 'application/json' },
  { uriTemplate: 'jobicy://taxonomies/industries', name: 'Jobicy industries', description: 'Public industry slugs and labels.', mimeType: 'application/json' }
];

export async function readResource(uri) {
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error('INVALID_ARGUMENT: Invalid resource URI.'); }
  if (parsed.protocol !== 'jobicy:' || parsed.search || parsed.hash) throw new Error('INVALID_ARGUMENT: Invalid resource URI.');
  let value;
  try { value = decodeURIComponent(parsed.pathname.slice(1)); } catch { throw new Error('INVALID_ARGUMENT: Invalid resource URI.'); }
  let action;
  let args;
  if (parsed.hostname === 'jobs' && /^[1-9][0-9]{0,15}$/.test(value)) { action = 'get_job'; args = { id: value }; }
  else if (parsed.hostname === 'companies' && (/^[1-9][0-9]{0,15}$/.test(value) || /^[a-z0-9-]{1,100}$/.test(value))) { action = 'get_company'; args = { id: value }; }
  else if (parsed.hostname === 'roles' && /^[a-z0-9-]{1,100}$/.test(value)) { action = 'get_role'; args = { role: value }; }
  else if (parsed.hostname === 'taxonomies' && ['locations','industries'].includes(value)) { action = 'list_taxonomies'; args = { type: value }; }
  else throw new Error('INVALID_ARGUMENT: Unknown resource.');
  try {
    const data = await publicApi(action, args);
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] };
  } catch (error) {
    if (error instanceof ToolError) throw new Error(`${error.code}: ${error.message}`);
    throw new Error('UPSTREAM_ERROR: Could not read Jobicy resource.');
  }
}
