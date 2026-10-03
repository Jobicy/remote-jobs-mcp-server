export const LEGACY_API = 'https://jobicy.com/api/v2/remote-jobs';
export const PUBLIC_API = 'https://jobicy.com/api/v2/jobicy-mcp-public';
export const TTL = Object.freeze({ search_jobs: 90_000, get_company_jobs: 90_000, get_job: 300_000,
  get_similar_jobs: 300_000, search_companies: 300_000, get_company: 2_700_000,
  get_role: 43_200_000, get_related_roles: 43_200_000, list_taxonomies: 43_200_000,
  get_taxonomies: 43_200_000, get_jobs: 300_000 });
