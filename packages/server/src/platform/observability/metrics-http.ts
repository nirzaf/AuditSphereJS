import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { OperationalMetrics, PoolSnapshot } from './metrics.js';

export function metricsAuthorized(header: string | string[] | undefined, token: string | undefined): boolean {
  if (!token || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

export function createMetricsServer(metrics: OperationalMetrics, token: string, pool: () => PoolSnapshot, identity: { host: string; port: number; service: string }): Server {
  if (token.length < 32) throw new TypeError('Metrics scrape token must contain at least 32 characters');
  return createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics') {
      response.writeHead(404).end();
      return;
    }
    if (!metricsAuthorized(request.headers.authorization, token)) {
      response.writeHead(401, { 'www-authenticate': 'Bearer realm="auditsphere-metrics"' }).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' });
    response.end(metrics.render(pool()));
  }).on('listening', () => {
    console.info(JSON.stringify({ event: 'metrics.listener_ready', service: identity.service, host: identity.host, port: identity.port }));
  }).on('error', error => {
    console.error(JSON.stringify({ event: 'metrics.listener_failed', service: identity.service, errorCode: safeErrorCode(error), action: 'Check the configured metrics host and port, then restart the process.' }));
  });
}

export function listenMetricsServer(server: Server, host: string, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(server); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function safeErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'METRICS_LISTENER_ERROR';
}
