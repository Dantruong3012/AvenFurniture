import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { loadModule, i18nModule } from "./helpers/load-module.mjs";

const { normalizeDeploymentState, observeProductionDeployment } = loadModule("lib/vercel/deployment.ts");
const boundarySource = readFileSync(new URL("../components/ui/error-boundary.tsx", import.meta.url), "utf8");
const boundaryCode = ts.transpileModule(boundarySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
class TestComponent {}
const boundaryModule = { exports: {} };
new Function("require", "module", "exports", boundaryCode)(
  (name) => name === "react" ? { Component: TestComponent } : name === "react/jsx-runtime" ? { jsx: () => null, jsxs: () => null } : i18nModule(name) ?? createRequire(import.meta.url)(name),
  boundaryModule,
  boundaryModule.exports,
);
const { ErrorBoundary } = boundaryModule.exports;

const sha = "a".repeat(40), older = "b".repeat(40);
const baseOptions = { commitSha: sha, token: "test-token", projectId: "prj_test", repository: "acme/shop", branch: "main", maxWaitMs: 0 };
const deployment = (fields = {}) => ({ id: "dpl_right", projectId: "prj_test", target: "production", readyState: "READY", meta: { githubCommitSha: sha, githubCommitRef: "main", githubCommitOrg: "acme", githubCommitRepo: "shop" }, ...fields });
function api({ items = [deployment()], detail = deployment(), serving = deployment(), denied = false } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const parsed = new URL(url); calls.push({ url: parsed, init });
    if (denied) return Response.json({}, { status: 403 });
    if (parsed.pathname.startsWith("/v9/projects")) return Response.json({ id: "prj_test", link: { type: "github", productionBranch: "main", org: "acme", repo: "shop" } });
    if (parsed.pathname === "/v7/deployments") return Response.json({ deployments: items });
    if (parsed.pathname.startsWith("/v4/aliases")) return Response.json({ projectId: "prj_test", alias: "shop.example.com", deploymentId: serving.id });
    if (parsed.pathname === "/v13/deployments/" + serving.id) return Response.json(serving);
    return Response.json(detail);
  };
  return { calls, fetcher };
}

test("observer verifies project, full merge SHA, target and actual Production alias", async () => {
  const mock = api();
  const observed = await observeProductionDeployment({ ...baseOptions, productionAlias: "shop.example.com", fetcher: mock.fetcher });
  assert.equal(observed.status, "READY");
  assert.equal(observed.serving, true);
  assert.equal(observed.servingCommitSha, sha);
  assert.equal(observed.servingDeploymentId, "dpl_right");
  assert.ok(mock.calls.every(c => c.init.method === "GET" && c.init.signal));
  const list = mock.calls.find(c => c.url.pathname === "/v7/deployments").url;
  assert.equal(list.searchParams.get("sha"), sha);
  assert.equal(list.searchParams.get("target"), "production");
  assert.equal(list.searchParams.get("branch"), "main");
});

test("READY without a matching live alias is not serving the release", async () => {
  const mock = api({ serving: deployment({ id: "dpl_old", meta: { githubCommitSha: older, githubCommitRef: "main", githubCommitOrg: "acme", githubCommitRepo: "shop" } }) });
  const observed = await observeProductionDeployment({ ...baseOptions, productionAlias: "shop.example.com", fetcher: mock.fetcher });
  assert.equal(observed.status, "READY");
  assert.equal(observed.serving, false);
  assert.equal(observed.servingCommitSha, older);
  assert.equal((await observeProductionDeployment({ ...baseOptions, fetcher: api().fetcher })).serving, false);
});

test("wrong project, Preview target, missing branch and mismatched detail fail closed", async () => {
  for (const fields of [{ projectId: "prj_other" }, { target: null }, { meta: { githubCommitSha: sha } }]) {
    const observed = await observeProductionDeployment({ ...baseOptions, fetcher: api({ items: [deployment(fields)] }).fetcher });
    assert.equal(observed.status, "NOT_FOUND");
  }
  const observed = await observeProductionDeployment({ ...baseOptions, fetcher: api({ serving: deployment({ id: "dpl_different" }), detail: deployment({ projectId: "prj_other" }) }).fetcher });
  assert.equal(observed.status, "UNAVAILABLE");
});

test("reports failed and pending deployment states and handles API errors safely", async () => {
  for (const readyState of ["ERROR", "CANCELED", "BUILDING"]) {
    const d = deployment({ readyState });
    assert.equal((await observeProductionDeployment({ ...baseOptions, fetcher: api({ items: [d], serving: d }).fetcher })).status, readyState);
  }
  assert.equal((await observeProductionDeployment({ ...baseOptions, fetcher: api({ items: [] }).fetcher })).status, "NOT_FOUND");
  const failed = await observeProductionDeployment({ ...baseOptions, fetcher: api({ denied: true }).fetcher });
  assert.equal(failed.status, "UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(failed), /test-token/);
});

test("normalizes deployment states and error boundaries enter fallback", () => {
  assert.equal(normalizeDeploymentState({ state: "BUILDING" }), "BUILDING");
  assert.equal(normalizeDeploymentState({ state: "new" }), "UNKNOWN");
  assert.deepEqual(ErrorBoundary.getDerivedStateFromError(new Error("render failed")), { hasError: true });
});
test("rejects partial or invalid SHA before any request", async () => {
  for (const commitSha of ["not a sha", "a".repeat(7)]) {
    let called = false;
    await assert.rejects(observeProductionDeployment({ ...baseOptions, commitSha, fetcher: async () => { called = true; } }), /valid target commit SHA/);
    assert.equal(called, false);
  }
});
