import type { GitHubClientOptions } from "./types";

export class GitHubApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly rateLimitReset: number | null;
  readonly responseBody: unknown;

  constructor(message: string, details: { status: number; requestId?: string | null; rateLimitReset?: number | null; responseBody?: unknown }) {
    super(message);
    this.name = "GitHubApiError";
    this.status = details.status;
    this.requestId = details.requestId ?? null;
    this.rateLimitReset = details.rateLimitReset ?? null;
    this.responseBody = details.responseBody;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GitHubClient {
  readonly owner: string;
  readonly repo: string;
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: GitHubClientOptions) {
    if (!options.owner?.trim() || !options.repo?.trim()) throw new Error("GitHub owner and repo are required");
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token ?? (typeof process !== "undefined" ? process.env.GITHUB_TOKEN : undefined);
    this.baseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs ?? 5000);
    this.sleep = options.sleep ?? defaultSleep;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(path, `${this.baseUrl}/`);
    if (url.origin !== new URL(this.baseUrl).origin || url.username || url.password) throw new Error("GitHub request origin does not match configuration");
    const readOnly = !init.method || ["GET", "HEAD"].includes(init.method.toUpperCase());
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { ...init, headers, redirect: "error", signal: init.signal ?? AbortSignal.timeout(15000) });
      } catch {
        if (!readOnly || attempt === this.maxAttempts || init.signal?.aborted) throw new Error("GitHub request failed or timed out; reconcile writes before retrying");
        await this.sleep(this.retryDelay(attempt));
        continue;
      }
      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return await response.json() as T;
      }

      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const retryable = response.status === 429 || response.status >= 500 ||
        (response.status === 403 && (response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0"));
      if (!readOnly || !retryable || attempt === this.maxAttempts) {
        throw new GitHubApiError(`GitHub API request failed (${response.status})`, { status: response.status, requestId: response.headers.get("x-github-request-id"), rateLimitReset: Number.isFinite(reset) && reset > 0 ? reset : null });
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const resetDelay = response.headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset) ? Math.max(0, reset * 1000 - Date.now()) : 0;
      const delay = retryAfter > 0 ? retryAfter * 1000 : resetDelay || this.retryDelay(attempt);
      if (delay > this.maxDelayMs) throw new Error("GitHub retry window exceeds the request budget; retry later");
      await this.sleep(delay);
    }
    throw new Error("GitHub request retry loop ended unexpectedly");
  }

  async paginate<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T[]> {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    url.searchParams.set("per_page", "100");
    const results: T[] = [];
    let next: string | null = url.toString();
    for (let count = 0; next && count < 20; count++) {
      const response = await this.request<unknown>(next);
      if (!Array.isArray(response)) throw new Error("Expected a GitHub API list response");
      results.push(...response as T[]);
      // GitHub's Link header is only available when making the request directly; use bounded page iteration instead.
      const page = Number(new URL(next).searchParams.get("page") ?? "1");
      if (response.length < 100) { next = null; break; }
      url.searchParams.set("page", String(page + 1));
      next = url.toString();
    }
    if (next) throw new Error("GitHub pagination limit exceeded; results are incomplete");
    return results;
  }

  pullRequests(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.paginate<import("./types").GitHubPullRequest>(`/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/pulls`, { state: "all", ...params });
  }

  async commitStatuses(sha: string) {
    return { statuses: await this.paginate<import("./types").GitHubCommitStatus>(`/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/commits/${encodeURIComponent(sha)}/statuses`) };
  }

  async checkRuns(sha: string) {
    const runs: import("./types").GitHubCheckRun[] = [];
    for (let page = 1; page <= 20; page++) {
      const result = await this.request<{ check_runs: import("./types").GitHubCheckRun[] }>(`/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/commits/${encodeURIComponent(sha)}/check-runs?filter=latest&per_page=100&page=${page}`);
      if (!Array.isArray(result.check_runs)) throw new Error("GitHub check response is malformed");
      runs.push(...result.check_runs);
      if (result.check_runs.length < 100) return { total_count: runs.length, check_runs: runs };
    }
    throw new Error("GitHub check pagination limit exceeded");
  }

  private retryDelay(attempt: number) {
    return Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
  }
}

export function createGitHubClient(options: GitHubClientOptions) { return new GitHubClient(options); }
