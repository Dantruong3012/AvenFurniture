import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { loadModule } from "./helpers/load-module.mjs";

const { normalizeDeploymentState, observeProductionDeployment } = loadModule("lib/vercel/deployment.ts");
const boundarySource = readFileSync(new URL("../components/ui/error-boundary.tsx", import.meta.url), "utf8");
const boundaryCode = ts.transpileModule(boundarySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
class TestComponent {}
const boundaryModule = { exports: {} };
new Function("require", "module", "exports", boundaryCode)(
  (name) => name === "react" ? { Component: TestComponent } : name === "react/jsx-runtime" ? { jsx: () => null, jsxs: () => null } : createRequire(import.meta.url)(name),
  boundaryModule,
  boundaryModule.exports,
);
const { ErrorBoundary } = boundaryModule.exports;

function response(deployments, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ deployments }) };
}

const baseOptions = {
  commitSha: "abcdef1234567890",
  token: "test-token",
  projectId: "prj_test",
  maxWaitMs: 0,
  now: () => 1_800_000_000_000,
};

test("resolves a deployment only when its commit SHA matches", async () => {
  let requestUrl;
  const result = await observeProductionDeployment({
    ...baseOptions,
    fetcher: async (url) => {
      requestUrl = new URL(url);
      return response([
        { uid: "wrong", readyState: "READY", gitSource: { sha: "1111111" } },
        { uid: "right", readyState: "BUILDING", gitSource: { sha: "ABCDEF1234567890", ref: "main" }, createdAt: 1 },
      ]);
    },
  });
  assert.equal(result.status, "BUILDING");
  assert.equal(result.deployment.uid, "right");
  assert.equal(requestUrl.searchParams.get("target"), "production");
  assert.equal(requestUrl.searchParams.get("projectId"), "prj_test");
});

test("reports terminal states and missing deployment", async () => {
  for (const state of ["READY", "ERROR", "CANCELED"]) {
    const result = await observeProductionDeployment({
      ...baseOptions,
      fetcher: async () => response([{ readyState: state, gitSource: { sha: baseOptions.commitSha } }]),
    });
    assert.equal(result.status, state);
  }
  const missing = await observeProductionDeployment({ ...baseOptions, fetcher: async () => response([]) });
  assert.equal(missing.status, "NOT_FOUND");
});

test("handles API and malformed-response failures as unavailable", async () => {
  const failed = await observeProductionDeployment({ ...baseOptions, fetcher: async () => response([], 403) });
  assert.equal(failed.status, "UNAVAILABLE");
  assert.match(failed.message, /403/);
  const malformed = await observeProductionDeployment({ ...baseOptions, fetcher: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  assert.equal(malformed.status, "UNAVAILABLE");
});

test("normalizes deployment states and error boundaries enter fallback state", () => {
  assert.equal(normalizeDeploymentState({ state: "BUILDING" }), "BUILDING");
  assert.equal(normalizeDeploymentState({ state: "something-new" }), "UNKNOWN");
  assert.deepEqual(ErrorBoundary.getDerivedStateFromError(new Error("render failed")), { hasError: true });
});

test("rejects invalid commit identifiers before making a request", async () => {
  let called = false;
  await assert.rejects(() => observeProductionDeployment({
    ...baseOptions,
    commitSha: "not a sha",
    fetcher: async () => { called = true; return response([]); },
  }), /valid target commit SHA/);
  assert.equal(called, false);
});
