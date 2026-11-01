import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/load-module.mjs";

const { GitHubClient, GitHubApiError } = loadModule("lib/github/client.ts");
const { filterPullRequests, reconcilePullRequests } = loadModule("lib/github/reconciliation.ts");
const { summarizeStatusChecks } = loadModule("lib/github/status-checks.ts");
const { generateChangelog, parseConventionalTitle } = loadModule("lib/github/changelog.ts");

function pr(overrides = {}) {
  return {
    number: 12, title: "feat(catalog): add filters", body: "Task release-m4-github-ci", state: "closed", draft: false,
    merged: true, merged_at: "2026-10-01T12:00:00Z", created_at: "2026-09-30T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
    closed_at: "2026-10-01T12:00:00Z", html_url: "https://github.com/acme/shop/pull/12", user: { login: "dan" },
    head: { ref: "feature/catalog", sha: "abc" }, base: { ref: "main", sha: "def" }, labels: [{ name: "release" }], milestone: { number: 4, title: "M4" }, ...overrides,
  };
}

test("GitHub client adds auth, parses structured errors, and retries rate limits", async () => {
  const delays = [];
  const calls = [];
  const client = new GitHubClient({ owner: "acme", repo: "shop", token: "test-token", apiBaseUrl: "https://api.test", maxAttempts: 2, sleep: async (ms) => delays.push(ms), baseDelayMs: 1, fetch: async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1
      ? new Response(JSON.stringify({ message: "slow down" }), { status: 429, headers: { "retry-after": "1" } })
      : Response.json({ ok: true });
  } });
  assert.deepEqual(await client.request("/repos/acme/shop", { headers: { "X-Test": "yes" } }), { ok: true });
  assert.equal(calls[0].init.headers.get("Authorization"), "Bearer test-token");
  assert.equal(calls[0].init.headers.get("X-Test"), "yes");
  assert.equal(delays[0], 1000);

  const denied = new GitHubClient({ owner: "acme", repo: "shop", fetch: async () => new Response(JSON.stringify({ message: "bad credentials" }), { status: 401 }) });
  await assert.rejects(denied.request("/private"), (error) => error instanceof GitHubApiError && error.status === 401 && error.message === "GitHub API request failed (401)" && error.responseBody === undefined);
});

test("pull request reconciliation filters metadata and matches local refs", () => {
  const matching = pr();
  const unrelated = pr({ number: 13, labels: [{ name: "docs" }] });
  assert.deepEqual(filterPullRequests([matching, unrelated], { milestone: "M4", labels: ["release"], targetBranch: "main", author: "DAN" }), [matching]);
  const result = reconcilePullRequests([matching], [{ branch: "feature/catalog", taskId: "catalog-filters" }])[0];
  assert.equal(result.taskId, "catalog-filters");
  assert.equal(result.branchMatches, true);
  assert.equal(result.state, "merged");
  assert.equal(reconcilePullRequests([matching], [])[0].taskId, "release-m4-github-ci");
});

test("check summary distinguishes success, pending, failures, and missing prerequisites", () => {
  const run = (name, status, conclusion = null) => ({ id: 1, name, status, conclusion, html_url: null, started_at: null, completed_at: null });
  const success = summarizeStatusChecks([{ state: "success", context: "lint", description: null, target_url: null, created_at: "", updated_at: "" }], [run("build", "completed", "success")], ["lint", "build"]);
  assert.equal(success.state, "success");
  assert.equal(success.ready, true);
  assert.deepEqual(success.missingRequired, []);
  assert.equal(summarizeStatusChecks([], [run("build", "in_progress")], ["build"]).state, "pending");
  assert.equal(summarizeStatusChecks([], [run("build", "completed", "failure")]).state, "failure");
  const missing = summarizeStatusChecks([], [run("lint", "completed", "success")], ["build"]);
  assert.equal(missing.ready, false);
  assert.deepEqual(missing.missingRequired, ["build"]);
});

test("changelog groups merged conventional PRs and marks breaking changes", () => {
  assert.equal(parseConventionalTitle("feat(api)!: replace endpoint").category, "Breaking Changes");
  const text = generateChangelog([pr(), pr({ number: 14, title: "fix: handle empty result", user: { login: "sam" } }), pr({ number: 15, merged: false })], { from: "2026-09-01", to: "2026-10-31", includeAuthors: true });
  assert.match(text, /## Features/);
  assert.match(text, /\*\*catalog:\*\* add filters \(@dan\)/);
  assert.match(text, /## Bug Fixes/);
  assert.doesNotMatch(text, /#15/);
});

test("latest CI attempts replace old outcomes and required skipped checks fail closed", () => {
  const run = (id, status, conclusion) => ({ id, name: "build", status, conclusion });
  assert.equal(summarizeStatusChecks([], [run(1, "completed", "failure"), run(2, "completed", "success")], ["build"]).ready, true);
  assert.equal(summarizeStatusChecks([], [run(1, "completed", "success"), run(2, "in_progress", null)], ["build"]).ready, false);
  for (const conclusion of ["neutral", "skipped", "cancelled", "timed_out"]) assert.equal(summarizeStatusChecks([], [run(1, "completed", conclusion)], ["build"]).ready, false);
  const statuses = [{ context: "lint", state: "success", updated_at: "2026-01-01" }, { context: "lint", state: "pending", updated_at: "2026-01-02" }];
  assert.equal(summarizeStatusChecks(statuses, [], ["lint"]).ready, false);
});

test("API client blocks credential forwarding and does not retry uncertain writes", async () => {
  let called = 0;
  const client = new GitHubClient({ owner: "acme", repo: "shop", token: "private-fixture", fetch: async () => { called++; throw Error("private-fixture"); } });
  await assert.rejects(client.request("https://outside.invalid/steal"), /origin/);
  assert.equal(called, 0);
  await assert.rejects(client.request("/pulls", { method: "POST", body: "{}" }), error => !error.message.includes("private-fixture") && /reconcile/.test(error.message));
  assert.equal(called, 1);
});

test("GitHub pagination reaches later pages and refuses incomplete infinite responses", async () => {
  const pages = [];
  const client = new GitHubClient({ owner: "acme", repo: "shop", fetch: async url => { const page = new URL(url).searchParams.get("page") || "1"; pages.push(page); return Response.json(page === "1" ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 101 }]); } });
  assert.equal((await client.pullRequests()).length, 101);
  assert.deepEqual(pages, ["1", "2"]);
  const unbounded = new GitHubClient({ owner: "acme", repo: "shop", fetch: async () => Response.json(Array(100).fill({})) });
  await assert.rejects(unbounded.pullRequests(), /pagination limit/);
});
