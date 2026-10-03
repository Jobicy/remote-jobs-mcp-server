import { legacyApi, publicApi } from './api.js';
import { ToolError, errorResult } from './errors.js';

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, min, max) => ({ type: 'integer', minimum: min, maximum: max, description });
const array = items => ({ type: 'array', items });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const text = str('Public text.');
const compactJob = object({ id: int('Job ID.', 1), url: str('Canonical Jobicy URL.'), jobTitle: text,
  companyName: text, companyLogo: str('Public logo URL.'), companyId: int('Company ID.', 1),
  jobIndustry: array(text), jobType: array(text), jobGeo: text, jobLevel: text, jobExcerpt: text,
  salaryMin: { type: 'number' }, salaryMax: { type: 'number' }, salaryCurrency: text, salaryPeriod: text,
  pubDate: text, similarityScore: { type: 'integer', minimum: 0 } },
  ['id','url','jobTitle','companyName','jobIndustry','jobType','jobGeo','jobLevel','jobExcerpt','pubDate']);
const fullJob = object({ ...compactJob.properties, jobDescription: str('Full public job description.') }, [...compactJob.required, 'jobDescription']);
const company = object({ id: int('Company ID.', 1), slug: text, name: text, url: text, industry: array(text),
  logo: text, location: text, excerpt: text, description: text, website: text }, ['id','slug','name','url','industry']);
const role = object({ slug: text, title: text, url: text, description: text, responsibilities: array(text),
  skills: array(text), levels: array(text), category: text,
  relatedRoles: array(object({ slug: text, title: text, url: text }, ['slug','title','url'])) },
  ['slug','title','url','description','responsibilities','skills','levels','category']);
const paging = { jobs: array(compactJob), jobCount: int('Only the count in this response.', 0),
  nextCursor: { type: ['string','null'] }, hasMore: { type: 'boolean' }, appliedFilters: { type: 'object' } };
const annotations = { readOnlyHint: true, openWorldHint: false, destructiveHint: false };

export const toolsList = [
  { name: 'get_jobs', description: 'Legacy-compatible public jobs feed. Keeps the original full job objects and JSON array in content.text. Use search_jobs for compact results and more filters. Geo means candidate eligibility: country, parent region, or globally available jobs may match. No authentication.',
    inputSchema: object({ count: { type: 'number', minimum: 1, maximum: 200 }, geo: text, industry: text,
      tag: str('Search keyword.', { minLength: 3, maxLength: 50 }), location: text, category: text,
      search: text, keyword: text }),
    outputSchema: { type: 'object', properties: { jobs: { type: 'array', items: { type: 'object' } } } }, annotations },
  { name: 'get_taxonomies', description: 'Legacy-compatible location or industry lookup. Returns the original JSON in content.text. Call when a filter slug is uncertain; obvious values can go directly to search_jobs.',
    inputSchema: object({ type: { type: 'string', enum: ['locations','industries'] } }, ['type']),
    outputSchema: { type: 'object', additionalProperties: true }, annotations },
  { name: 'search_jobs', description: 'Search public remote jobs with compact results, without full descriptions. Geo uses candidate eligibility, including eligible parent regions and global jobs. Call directly when filters are clear; use resolve_taxonomy for uncertain slugs. Cursor is opaque: pass nextCursor unchanged with identical filters. jobCount counts this page only.',
    inputSchema: object({ query: str('Search terms, at least 3 characters.'), geo: str('Location slug.'), industry: str('Job industry slug.'),
      jobType: str('Employment type slug.'), jobLevel: str('Level slug.'), company: int('Public company ID.', 1),
      postedAfter: str('UTC date YYYY-MM-DD.'), salaryMin: int('Minimum salary; match jobs with salaryMax at least this.', 0),
      salaryMax: int('Maximum salary; match jobs with salaryMin at most this.', 0), currency: str('ISO 4217 currency.'),
      limit: int('Page size, up to 50.', 1, 50), cursor: str('Opaque continuation cursor.') }),
    outputSchema: object(paging, ['jobs','jobCount','nextCursor','hasMore','appliedFilters']), annotations },
  { name: 'get_job', description: 'Fetch the full public description and details of one visible job by ID. Use after search_jobs when the complete vacancy is needed.',
    inputSchema: object({ id: int('Job ID.', 1) }, ['id']), outputSchema: object({ job: fullJob }, ['job']), annotations },
  { name: 'get_similar_jobs', description: 'Recommend a small set of public jobs related to one job. Deterministic score weights shared industry 3, type 2, level 2, location 1, title word 2. Scores are relevance weights, not probabilities.',
    inputSchema: object({ jobId: int('Source job ID.', 1), limit: int('Maximum recommendations.', 1, 10) }, ['jobId']),
    outputSchema: object({ jobs: array(compactJob) }, ['jobs']), annotations },
  { name: 'search_companies', description: 'Find specific public companies by name, company industry, or headquarters text. A search criterion is required. Returns at most 10 companies, with no cursor or overall count; this is not a company directory export.',
    inputSchema: object({ query: str('Company name search, at least 3 characters.'), industry: str('Company category slug.'),
      geo: str('Headquarters text, at least 3 characters.'), limit: int('Maximum 10 companies.', 1, 10) }),
    outputSchema: object({ companies: array(company) }, ['companies']), annotations },
  { name: 'get_company', description: 'Get public details of one company by stable ID or slug, including its description, website, categories and headquarters when available.',
    inputSchema: object({ id: { oneOf: [int('Company ID.', 1), str('Company slug.')] } }, ['id']),
    outputSchema: object({ company }, ['company']), annotations },
  { name: 'get_company_jobs', description: 'Get compact public jobs connected to one published company through the Jobicy company ID relation. Cursor is opaque; pass it unchanged with the same companyId.',
    inputSchema: object({ companyId: int('Public company ID.', 1), limit: int('Page size, up to 50.', 1, 50), cursor: str('Opaque continuation cursor.') }, ['companyId']),
    outputSchema: object(paging, ['jobs','jobCount','nextCursor','hasMore','appliedFilters']), annotations },
  { name: 'get_role', description: 'Get a public Jobicy career role guide by its /careers/ slug, including existing overview, skills, responsibilities and levels.',
    inputSchema: object({ role: str('Career role slug.') }, ['role']), outputSchema: object({ role }, ['role']), annotations },
  { name: 'get_related_roles', description: 'Get a small deterministic set of roles sharing the same Jobicy career category as the requested role.',
    inputSchema: object({ role: str('Career role slug.'), limit: int('Maximum related roles.', 1, 10) }, ['role']),
    outputSchema: object({ roles: array(role) }, ['roles']), annotations },
  { name: 'resolve_taxonomy', description: 'Resolve an ordinary location or industry name to a real Jobicy slug. Use when unsure of a slug; low-confidence matches return candidates without selecting one.',
    inputSchema: object({ type: { type: 'string', enum: ['location','industry'] }, query: str('Name, abbreviation or alias.') }, ['type','query']),
    outputSchema: object({ type: text, query: text, slug: { type: ['string','null'] }, label: { type: ['string','null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 }, matchedBy: text,
      candidates: array(object({ slug: text, label: text, confidence: { type: 'number' } }, ['slug','label','confidence'])) },
      ['type','query','slug','label','confidence','matchedBy','candidates']), annotations },
  { name: 'list_taxonomies', description: 'List public filter slugs and labels for locations, industries, job types or job levels. No job or company counts are included.',
    inputSchema: object({ type: { type: 'string', enum: ['locations','industries','job_types','job_levels'] } }, ['type']),
    outputSchema: object({ type: text, terms: array(object({ slug: text, label: text }, ['slug','label'])) }, ['type','terms']), annotations }
];

const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim();
const aliases = { location: { 'us': 'usa', 'u s': 'usa', 'united states': 'usa', 'united states of america': 'usa',
  'uk': 'uk', 'u k': 'uk', 'united kingdom': 'uk', 'great britain': 'uk', 'uae': 'united-arab-emirates' },
  industry: { 'dev': 'engineering', 'developer': 'engineering', 'software development': 'engineering',
    'smm': 'marketing', 'e commerce': 'management' } };

function ensureObject(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new ToolError('INVALID_ARGUMENT', 'Arguments must be an object.');
}

function validate(name, args) {
  const schema = toolsList.find(tool => tool.name === name)?.inputSchema;
  if (!schema) throw new ToolError('INVALID_ARGUMENT', 'Unknown tool.');
  for (const key of schema.required || []) if (args[key] === undefined || args[key] === null || args[key] === '') throw new ToolError('INVALID_ARGUMENT', `${key} is required.`);
  if (name === 'get_jobs' || name === 'get_taxonomies') return;
  for (const [key, value] of Object.entries(args)) {
    const spec = schema.properties[key];
    if (!spec) throw new ToolError('INVALID_ARGUMENT', `Unexpected parameter ${key}.`);
    if (spec.oneOf) {
      if (!(typeof value === 'string' && value.length > 0) && !(Number.isSafeInteger(value) && value > 0)) throw new ToolError('INVALID_ARGUMENT', `Invalid ${key}.`);
      continue;
    }
    if (spec.type === 'integer' && (!Number.isSafeInteger(value) || value < spec.minimum || (spec.maximum !== undefined && value > spec.maximum))) throw new ToolError('INVALID_ARGUMENT', `Invalid ${key}.`);
    if (spec.type === 'string' && (typeof value !== 'string' || value.length > 500 || (spec.enum && !spec.enum.includes(value)))) throw new ToolError('INVALID_ARGUMENT', `Invalid ${key}.`);
  }
}

function result(data) { return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }; }

async function resolveTaxonomy(type, query) {
  const taxonomy = type === 'location' ? 'locations' : 'industries';
  const data = await publicApi('list_taxonomies', { type: taxonomy });
  const items = data.terms;
  const normalized = normalize(query);
  if (normalized.length < 2) throw new ToolError('INVALID_ARGUMENT', 'query must have at least 2 characters.');
  let found = items.find(item => normalize(item.slug) === normalized);
  if (found) return { type, query, slug: found.slug, label: found.label, confidence: 1, matchedBy: 'slug', candidates: [] };
  found = items.find(item => normalize(item.label) === normalized);
  if (found) return { type, query, slug: found.slug, label: found.label, confidence: 1, matchedBy: 'label', candidates: [] };
  const alias = aliases[type][normalized];
  found = items.find(item => item.slug === alias);
  if (found) return { type, query, slug: found.slug, label: found.label, confidence: 1, matchedBy: 'alias', candidates: [] };
  const candidates = items.filter(item => normalize(item.slug).includes(normalized) || normalize(item.label).includes(normalized))
    .slice(0, 5).map(item => ({ slug: item.slug, label: item.label, confidence: 0.65 }));
  return { type, query, slug: null, label: null, confidence: 0, matchedBy: 'candidates', candidates };
}

export async function callTool(name, args = {}) {
  try {
    ensureObject(args);
    validate(name, args);
    if (name === 'get_jobs') {
      const params = { count: args.count || undefined, geo: (args.geo ?? args.location) || undefined,
        industry: (args.industry ?? args.category) || undefined, tag: (args.tag ?? args.search ?? args.keyword) || undefined };
      const data = await legacyApi(params, name);
      const jobs = data.jobs || data;
      return { structuredContent: { jobs }, content: [{ type: 'text', text: JSON.stringify(jobs, null, 2) }] };
    }
    if (name === 'get_taxonomies') {
      const data = await legacyApi({ get: args.type }, name);
      return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    if (name === 'resolve_taxonomy') return result(await resolveTaxonomy(args.type, args.query));
    if (name === 'search_companies' && ![args.query, args.industry, args.geo].some(value => typeof value === 'string' && value.trim()))
      throw new ToolError('INVALID_ARGUMENT', 'Specify query, industry, or geo.');
    return result(await publicApi(name, args));
  } catch (error) { return errorResult(error); }
}
