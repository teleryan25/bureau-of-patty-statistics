export async function onRequest(context) {
  const host = new URL(context.request.url).hostname.toLowerCase();
  if (host === 'pattybureau.com' || host === 'www.pattybureau.com') {
    const landing = new URL('/public-site', context.request.url);
    return context.env.ASSETS.fetch(new Request(landing.toString()));
  }
  return context.next();
}
