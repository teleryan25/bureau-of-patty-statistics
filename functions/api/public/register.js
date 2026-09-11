/* =============================================================
   Bureau of Patty Statistics — GET /api/public/register

   The only unauthenticated data source for pattybureau.com.

   READ-ONLY BY CONSTRUCTION
     * answers GET and HEAD only; every other method is refused (405)
     * issues only GET requests to Supabase
     * selects explicit, non-private columns — never email, role,
       invitation state, updated_by or created_by
     * returns public-register.js's projection: certified
       establishments, day-level dates, file numbers instead of row ids

   Supabase RLS is untouched: the anon role still cannot read or write
   a single Bureau table. This function reads with the service-role key,
   which exists only in the Pages environment and never in a response.

   Rows are assembled by data.js registerFromRows(), the same mapping the
   auditor app's Supabase adapter uses, and ranked in the browser by the
   same scoring.js / analytics.js modules.
   ============================================================= */
import D from '../../../data.js';
import PR from '../../../public-register.js';

const CACHE_SECONDS = 60;

const COLUMNS = {
  establishments: 'id,file_number,name,name_key,category,created_at',
  /* auditor_id maps each audit to an examiner key, then is dropped. */
  audits: 'id,establishment_id,auditor_id,burger,location_id,schema_version,created_at,' +
    'patty,overall_flavor,bun,fries,value,condiments,service_speed,service_friendliness',
  locations: 'id,name,name_key,location_group,is_preset',
  profiles: 'id,auditor_key,display_name,active'
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers }
  });
}

async function select(env, table, query) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error(`Supabase ${table} returned ${response.status}`);
  return response.json();
}

/* Only the COUNT of Records Office entries is published. */
async function recordsOnFile(env) {
  try { return (await select(env, 'bureau_records', 'select=record_id')).length; }
  catch (error) { return null; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return json({ error: 'The public register is read-only.' }, 405, { allow: 'GET, HEAD', 'cache-control': 'no-store' });
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'The public register is not configured.' }, 503, { 'cache-control': 'no-store' });
  }

  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const cacheKey = new Request(new URL('/api/public/register', request.url).toString());
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return method === 'HEAD' ? new Response(null, cached) : cached;

  try {
    const [establishments, audits, locations, profiles, records] = await Promise.all([
      select(env, 'establishments', `select=${COLUMNS.establishments}&archived_at=is.null&order=created_at.asc`),
      select(env, 'audits', `select=${COLUMNS.audits}&order=created_at.asc`),
      select(env, 'locations', `select=${COLUMNS.locations}&order=name.asc`),
      select(env, 'profiles', `select=${COLUMNS.profiles}`),
      recordsOnFile(env)
    ]);
    const register = D.registerFromRows({ establishments, audits, locations, profiles });
    const payload = PR.buildPublicRegister(register, { recordsOnFile: records });
    const response = json(payload, 200, { 'cache-control': `public, max-age=${CACHE_SECONDS}` });
    if (cache && context.waitUntil) context.waitUntil(cache.put(cacheKey, response.clone()));
    return method === 'HEAD' ? new Response(null, response) : response;
  } catch (error) {
    return json({ error: 'The public register is temporarily unavailable.' }, 502, { 'cache-control': 'no-store' });
  }
}
