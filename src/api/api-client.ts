import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

export interface CallResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
  raw: string;
  ms: number;
  headers: Record<string, string>;
}

/**
 * Wrapper around Playwright's request context that always returns a parsed
 * result instead of throwing, so a test can assert on a 500 rather than dying.
 */
export class ApiClient {
  constructor(private readonly ctx: APIRequestContext) {}

  async call<T = unknown>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    options: { data?: unknown; params?: Record<string, string | number | boolean>; headers?: Record<string, string> } = {},
  ): Promise<CallResult<T>> {
    const started = Date.now();
    const res: APIResponse = await this.ctx[method](path, {
      data: options.data as never,
      params: options.params,
      headers: options.headers,
      failOnStatusCode: false,
    });
    const ms = Date.now() - started;
    const raw = await res.text();

    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      /* non-JSON response - keep the raw text, the test decides if that matters */
    }

    return {
      status: res.status(),
      ok: res.ok(),
      body: body as T,
      raw,
      ms,
      headers: res.headers(),
    };
  }

  get<T = unknown>(path: string, o?: Parameters<ApiClient['call']>[2]) { return this.call<T>('get', path, o); }
  post<T = unknown>(path: string, o?: Parameters<ApiClient['call']>[2]) { return this.call<T>('post', path, o); }
  put<T = unknown>(path: string, o?: Parameters<ApiClient['call']>[2]) { return this.call<T>('put', path, o); }
  patch<T = unknown>(path: string, o?: Parameters<ApiClient['call']>[2]) { return this.call<T>('patch', path, o); }
  delete<T = unknown>(path: string, o?: Parameters<ApiClient['call']>[2]) { return this.call<T>('delete', path, o); }

  /** Asserts status and surfaces the body in the failure message. */
  static expectStatus(result: CallResult, expected: number | number[]): void {
    const allowed = Array.isArray(expected) ? expected : [expected];
    expect(
      allowed,
      `Expected ${allowed.join(' or ')} but got ${result.status}. Body: ${result.raw.slice(0, 500)}`,
    ).toContain(result.status);
  }
}
