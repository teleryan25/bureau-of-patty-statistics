export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const prefix = '/app/';
  let assetPath = requestUrl.pathname.startsWith(prefix)
    ? requestUrl.pathname.slice(prefix.length)
    : '';
  const assetUrl = new URL(assetPath ? '/' + assetPath : '/', requestUrl.origin);
  return context.env.ASSETS.fetch(new Request(assetUrl, context.request));
}
