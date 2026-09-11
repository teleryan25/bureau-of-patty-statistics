const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

async function supabase(env, path, init = {}) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json', ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.msg || body.message || body.error_description || 'Supabase request failed.'), { status: response.status });
  return body;
}

export async function onRequestPost({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Personnel service is not configured.' }, 503);
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Authentication required.' }, 401);
    const caller = await supabase(env, '/auth/v1/user', { headers: { Authorization: `Bearer ${token}` } });
    const profiles = await supabase(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}&select=id,display_name,role,active`);
    if (!profiles[0] || !profiles[0].active || profiles[0].role !== 'admin') return json({ error: 'Administrator credentials required.' }, 403);

    const input = await request.json();
    if (input.action === 'set-active') {
      if (input.id === caller.id && !input.active) return json({ error: 'You cannot deactivate your own active session.' }, 400);
      await supabase(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(input.id)}`, { method: 'PATCH',
        headers: { Prefer: 'return=representation' }, body: JSON.stringify({ active: !!input.active, invitation_status: input.active ? 'active' : 'deactivated' }) });
      return json({ ok: true });
    }

    if (input.action !== 'invite' && input.action !== 'resend') return json({ error: 'Unknown personnel action.' }, 400);
    let displayName = String(input.displayName || '').trim();
    let email = String(input.email || '').trim().toLowerCase();
    if (input.action === 'resend') {
      const rows = await supabase(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(input.id)}&select=display_name,email`);
      if (!rows[0]) return json({ error: 'Personnel record not found.' }, 404);
      displayName = rows[0].display_name; email = rows[0].email;
    }
    if (!displayName || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Display name and valid email are required.' }, 400);
    const auditorKey = displayName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const appBase = String(env.BPS_APP_URL || 'https://pattybureau.com/app/').replace(/\/?$/, '/');
    const redirect = encodeURIComponent(`${appBase}?auth=invite`);
    if (input.action === 'resend') {
      await supabase(env, `/auth/v1/resend?redirect_to=${redirect}`, { method: 'POST',
        body: JSON.stringify({ type: 'signup', email }) });
      return json({ ok: true, displayName, email });
    }
    await supabase(env, `/auth/v1/invite?redirect_to=${redirect}`, { method: 'POST', body: JSON.stringify({ email,
      data: { display_name: displayName, auditor_key: auditorKey, inviter_name: profiles[0].display_name },
    }) });
    return json({ ok: true, displayName, email });
  } catch (error) {
    return json({ error: error.message || 'Personnel action failed.' }, error.status || 500);
  }
}
