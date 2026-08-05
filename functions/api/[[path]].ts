interface PagesEnv {
  WORKER_ORIGIN?: string;
}

interface PagesContext {
  request: Request;
  env: PagesEnv;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  data: Record<string, unknown>;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url);
  const workerOrigin = context.env.WORKER_ORIGIN || 'https://redolve-api.50313tjx06.workers.dev';
  const targetUrl = `${workerOrigin}${url.pathname}${url.search}`;

  // Proxy the incoming request (including method, headers, and body) to the Worker backend
  const proxyRequest = new Request(targetUrl, context.request);

  return fetch(proxyRequest);
};

