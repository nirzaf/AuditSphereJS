import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

const durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;
const methodNames = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export type QueueName = 'tb-import' | 'scheduled-deadlines';
export type ProviderName = 'graph' | 'local-s3' | 'clamav' | 'redis' | 'postgres';
export type DependencyState = 'up' | 'down' | 'unknown';
export type QueueSnapshot = { waiting: number; active: number; delayed: number; failed: number; oldestWaitingAgeSeconds: number };
export type PoolSnapshot = { total: number; idle: number; waiting: number; max: number };

type HttpSeries = { method: string; route: string; status: number; count: number };
type DurationSeries = { method: string; route: string; count: number; sum: number; buckets: number[] };
type ProviderSeries = { provider: ProviderName; operation: string; outcome: 'success' | 'failure'; count: number };
type QueueSeries = { queue: QueueName; outcome: 'completed' | 'failed' | 'stalled' | 'error'; count: number };

const seriesKey = (...parts: (string | number)[]) => JSON.stringify(parts);
const safeRoute = (route: unknown): string => {
  if (typeof route !== 'string' || !route.startsWith('/') || route.length > 512 || route.includes('?')) return 'unmatched';
  const segments = route.split('/').map(segment => {
    if (!segment || /^:[A-Za-z][A-Za-z0-9_]{0,47}$/.test(segment) || /^\{[A-Za-z][A-Za-z0-9_]{0,47}\}$/.test(segment)) return segment;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || /^\d+$/.test(segment) || segment.length > 32 || !/^[a-z][a-z0-9-]{0,31}$/.test(segment)) return ':id';
    return segment;
  });
  const normalized = segments.join('/');
  return normalized.length <= 128 ? normalized : 'unmatched';
};
const safeMethod = (method: string): string => methodNames.has(method.toUpperCase()) ? method.toUpperCase() : 'OTHER';
const escapeLabel = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
const labels = (entries: Record<string, string | number>) => `{${Object.entries(entries).map(([key, value]) => `${key}="${escapeLabel(String(value))}"`).join(',')}}`;

/** Bounded, allow-listed in-process metrics. No caller, tenant, document, or resource IDs are labels. */
export class OperationalMetrics {
  private readonly httpRequests = new Map<string, HttpSeries>();
  private readonly httpDurations = new Map<string, DurationSeries>();
  private readonly providerRequests = new Map<string, ProviderSeries>();
  private readonly queueJobs = new Map<string, QueueSeries>();
  private readonly queueSnapshots = new Map<QueueName, QueueSnapshot>();
  private readonly dependencies = new Map<ProviderName, DependencyState>();
  private readonly eventLoop: IntervalHistogram;
  private readonly timer?: NodeJS.Timeout;
  private eventLoopLagSeconds = 0;

  constructor(sampleEventLoop = true) {
    this.eventLoop = monitorEventLoopDelay({ resolution: 20 });
    if (sampleEventLoop) {
      this.eventLoop.enable();
      this.timer = setInterval(() => {
        this.eventLoopLagSeconds = this.eventLoop.percentile(99) / 1_000_000_000;
        this.eventLoop.reset();
      }, 10_000);
      this.timer.unref();
    }
    for (const dependency of ['postgres', 'redis', 'graph', 'local-s3', 'clamav'] as const) this.dependencies.set(dependency, 'unknown');
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.eventLoop.disable();
  }

  recordHttp(method: string, route: unknown, status: number, durationMs: number): void {
    const normalizedMethod = safeMethod(method);
    const normalizedRoute = safeRoute(route);
    const normalizedStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
    const httpKey = seriesKey(normalizedMethod, normalizedRoute, normalizedStatus);
    const request = this.httpRequests.get(httpKey) ?? { method: normalizedMethod, route: normalizedRoute, status: normalizedStatus, count: 0 };
    request.count++;
    this.httpRequests.set(httpKey, request);

    const durationKey = seriesKey(normalizedMethod, normalizedRoute);
    const duration = this.httpDurations.get(durationKey) ?? { method: normalizedMethod, route: normalizedRoute, count: 0, sum: 0, buckets: durationBuckets.map(() => 0) };
    const seconds = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs / 1_000 : 0;
    duration.count++;
    duration.sum += seconds;
    durationBuckets.forEach((bound, index) => { if (seconds <= bound) duration.buckets[index]++; });
    this.httpDurations.set(durationKey, duration);
  }

  recordProvider(provider: ProviderName, operation: string, success: boolean): void {
    const safeOperation = /^[a-z][a-z0-9_-]{0,31}$/.test(operation) ? operation : 'other';
    const outcome = success ? 'success' : 'failure';
    const key = seriesKey(provider, safeOperation, outcome);
    const series = this.providerRequests.get(key) ?? { provider, operation: safeOperation, outcome, count: 0 };
    series.count++;
    this.providerRequests.set(key, series);
    this.setDependency(provider, success ? 'up' : 'down');
  }

  recordQueueOutcome(queue: QueueName, outcome: QueueSeries['outcome']): void {
    const key = seriesKey(queue, outcome);
    const series = this.queueJobs.get(key) ?? { queue, outcome, count: 0 };
    series.count++;
    this.queueJobs.set(key, series);
  }

  setQueueSnapshot(queue: QueueName, snapshot: QueueSnapshot): void {
    this.queueSnapshots.set(queue, {
      waiting: this.count(snapshot.waiting), active: this.count(snapshot.active), delayed: this.count(snapshot.delayed),
      failed: this.count(snapshot.failed), oldestWaitingAgeSeconds: this.gauge(snapshot.oldestWaitingAgeSeconds),
    });
  }

  setDependency(provider: ProviderName, state: DependencyState): void {
    this.dependencies.set(provider, state);
  }

  dependencyState(provider: ProviderName): DependencyState {
    return this.dependencies.get(provider) ?? 'unknown';
  }

  render(pool?: PoolSnapshot): string {
    const lines = [
      '# HELP auditsphere_http_requests_total Completed HTTP requests.',
      '# TYPE auditsphere_http_requests_total counter',
      ...[...this.httpRequests.values()].sort((a, b) => seriesKey(a.method, a.route, a.status).localeCompare(seriesKey(b.method, b.route, b.status)))
        .map(item => `auditsphere_http_requests_total${labels({ method: item.method, route: item.route, status: item.status })} ${item.count}`),
      '# HELP auditsphere_http_request_duration_seconds HTTP handler latency.',
      '# TYPE auditsphere_http_request_duration_seconds histogram',
    ];
    for (const item of this.httpDurations.values()) {
      durationBuckets.forEach((bound, index) => lines.push(`auditsphere_http_request_duration_seconds_bucket${labels({ method: item.method, route: item.route, le: bound })} ${item.buckets[index]}`));
      lines.push(`auditsphere_http_request_duration_seconds_bucket${labels({ method: item.method, route: item.route, le: '+Inf' })} ${item.count}`);
      lines.push(`auditsphere_http_request_duration_seconds_sum${labels({ method: item.method, route: item.route })} ${item.sum}`);
      lines.push(`auditsphere_http_request_duration_seconds_count${labels({ method: item.method, route: item.route })} ${item.count}`);
    }
    lines.push('# HELP auditsphere_queue_jobs_total Worker job outcomes.', '# TYPE auditsphere_queue_jobs_total counter');
    for (const item of this.queueJobs.values()) lines.push(`auditsphere_queue_jobs_total${labels({ queue: item.queue, outcome: item.outcome })} ${item.count}`);
    lines.push('# HELP auditsphere_queue_jobs Queue snapshot by state.', '# TYPE auditsphere_queue_jobs gauge');
    for (const [queue, snapshot] of this.queueSnapshots) {
      for (const state of ['waiting', 'active', 'delayed', 'failed'] as const) lines.push(`auditsphere_queue_jobs${labels({ queue, state })} ${snapshot[state]}`);
    }
    lines.push('# HELP auditsphere_queue_oldest_waiting_age_seconds Oldest sampled BullMQ waiting job age.', '# TYPE auditsphere_queue_oldest_waiting_age_seconds gauge');
    for (const [queue, snapshot] of this.queueSnapshots) lines.push(`auditsphere_queue_oldest_waiting_age_seconds${labels({ queue })} ${snapshot.oldestWaitingAgeSeconds}`);
    lines.push('# HELP auditsphere_provider_requests_total Provider call outcomes.', '# TYPE auditsphere_provider_requests_total counter');
    for (const item of this.providerRequests.values()) lines.push(`auditsphere_provider_requests_total${labels({ provider: item.provider, operation: item.operation, outcome: item.outcome })} ${item.count}`);
    lines.push('# HELP auditsphere_dependency_up Last observed dependency state (1=up, 0=down, -1=unknown).', '# TYPE auditsphere_dependency_up gauge');
    for (const [dependency, state] of this.dependencies) lines.push(`auditsphere_dependency_up${labels({ dependency })} ${state === 'up' ? 1 : state === 'down' ? 0 : -1}`);
    lines.push('# HELP auditsphere_event_loop_lag_seconds P99 event-loop delay from the previous sampling window.', '# TYPE auditsphere_event_loop_lag_seconds gauge', `auditsphere_event_loop_lag_seconds ${this.eventLoopLagSeconds}`);
    lines.push('# HELP auditsphere_process_uptime_seconds Process uptime.', '# TYPE auditsphere_process_uptime_seconds gauge', `auditsphere_process_uptime_seconds ${process.uptime()}`);
    lines.push('# HELP auditsphere_database_pool_connections PostgreSQL pool connections by state.', '# TYPE auditsphere_database_pool_connections gauge');
    if (pool) for (const [state, value] of Object.entries({ total: pool.total, idle: pool.idle, waiting: pool.waiting, max: pool.max })) {
      lines.push(`auditsphere_database_pool_connections${labels({ state })} ${this.gauge(value)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private count(value: number): number { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
  private gauge(value: number): number { return Number.isFinite(value) && value >= 0 ? value : 0; }
}

export const operationalMetrics = new OperationalMetrics();
