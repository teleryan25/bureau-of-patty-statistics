/* pattybureau.com/ is the public Bureau website. Every other host (the
   patty-stats.pages.dev fallback included) keeps the auditor app at the
   root. The auditor app always lives at /app/ — see functions/app/. */
const PUBLIC_HOSTS = new Set(['pattybureau.com', 'www.pattybureau.com']);

/* Supabase invitation and recovery links carry these. Should one ever
   land on the public root, it belongs to the app, query intact; the
   browser carries any #access_token fragment across the redirect. */
const AUTH_PARAMS = ['auth', 'code', 'token_hash', 'error_code', 'error_description'];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return context.next();
  if (AUTH_PARAMS.some((name) => url.searchParams.has(name))) {
    return Response.redirect(new URL('/app/' + url.search, url.origin).toString(), 302);
  }
  const landing = new URL('/public-site', url.origin);
  return context.env.ASSETS.fetch(new Request(landing.toString()));
}
