import { apiProblemSchema } from '@auditsphere/contracts';
import type { z } from 'zod';

/** A typed HTTP failure that keeps status and server message handling at one boundary. */
export class ApiContractError extends Error {
  constructor(readonly status: number, message: string, readonly correlationId?: string) {
    super(message);
    this.name = 'ApiContractError';
  }
}

export type AccessTokenProvider = (forceRefresh: boolean) => Promise<string>;

/** Runtime-validate an unknown value at any browser HTTP boundary. */
export function parseContractValue<TSchema extends z.ZodType>(
  schema: TSchema,
  payload: unknown,
  status = 502,
): z.output<TSchema> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiContractError(status, 'The API returned a response that did not match its contract.');
  return parsed.data;
}

function errorMessage(value: unknown, status: number): string {
  const parsed = apiProblemSchema.safeParse(value);
  if (!parsed.success) return `The API request failed (HTTP ${status}).`;
  const message = parsed.data.error.message;
  const detail = typeof message === 'string' ? message : Array.isArray(message)
    ? (message.find((item): item is { message: string } =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
      && typeof (item as Record<string, unknown>)['message'] === 'string')?.message ?? `The API request failed (HTTP ${status}).`)
    : typeof message['message'] === 'string' ? message['message'] : `The API request failed (HTTP ${status}).`;
  return parsed.data.error.correlationId ? `${detail} (reference: ${parsed.data.error.correlationId})` : detail;
}

/**
 * Fetch and runtime-validate one API response against its canonical Zod contract.
 * HttpClient/fetch generic annotations alone do not validate the JSON received at runtime.
 */
export async function requestContractJson<TSchema extends z.ZodType>(
  input: RequestInfo | URL,
  schema: TSchema,
  init?: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<z.output<TSchema>> {
  const response = await fetcher(input, init);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = apiProblemSchema.safeParse(payload);
    throw new ApiContractError(response.status, errorMessage(payload, response.status), problem.success ? problem.data.error.correlationId : undefined);
  }
  return parseContractValue(schema, payload, response.status);
}

/** Retry one authenticated request with a freshly acquired token after an authorization failure.
 * The API authenticates before dispatching any business command, so a 401 has no command side effect.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  getAccessToken: AccessTokenProvider,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${await getAccessToken(attempt === 1)}`);
    const response = await fetch(input, { ...init, headers });
    if (response.status !== 401 || attempt === 1) return response;
  }
  throw new Error('Authenticated request retry was exhausted.');
}

/** Runtime-validate a contract response while allowing one silent access-token refresh on 401. */
export function requestAuthenticatedContractJson<TSchema extends z.ZodType>(
  input: RequestInfo | URL,
  schema: TSchema,
  init: RequestInit | undefined,
  getAccessToken: AccessTokenProvider,
): Promise<z.output<TSchema>> {
  return requestContractJson(input, schema, init, (request, options) => authenticatedFetch(request, options, getAccessToken));
}
