import { LEGACY_API, PUBLIC_API, TTL } from './config.js';
import { cache } from './cache.js';
import { ToolError } from './errors.js';

async function request(base, params, ttl) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  return cache.getOrLoad(url.toString(), ttl, async () => {
    let response;
    try { response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }); }
    catch { throw new ToolError('TEMPORARILY_UNAVAILABLE', 'Jobicy API is temporarily unavailable.'); }
    let data;
    try { data = await response.json(); } catch { throw new ToolError('UPSTREAM_ERROR', 'Invalid response from Jobicy API.'); }
    if (!response.ok || data?.error) {
      const code = data?.error?.code || (response.status === 404 ? 'NOT_FOUND' : response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'TEMPORARILY_UNAVAILABLE' : 'INVALID_ARGUMENT');
      throw new ToolError(code, data?.error?.message || data?.error || `Jobicy API returned ${response.status}.`);
    }
    return data;
  });
}

export const legacyApi = (params, type) => request(LEGACY_API, params, TTL[type]);
export const publicApi = (action, params) => request(PUBLIC_API, { action, ...params }, TTL[action]);
