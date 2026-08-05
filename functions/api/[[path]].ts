export const onRequest: PagesFunction<{ WORKER_ORIGIN?: string }> = async (context) => {
  const url = new URL(context.request.url);
  const workerOrigin = context.env.WORKER_ORIGIN || 'https://redolve-api.50313tjx06.workers.dev';
  const targetUrl = `${workerOrigin}${url.pathname}${url.search}`;

  // Proxy the incoming request (including method, headers, and body) to the Worker backend
  const proxyRequest = new Request(targetUrl, context.request);

  return fetch(proxyRequest);
};
