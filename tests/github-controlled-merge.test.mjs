import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/load-module.mjs";

const { signMergeAuthorization, verifyMergeAuthorization, validateBranchProtection, coordinatePullRequestMerge } = loadModule("lib/github/controlled-merge.ts");
const secret = "test-only-signing-secret";
const claims = { actor: "release-bot", pullRequest: 42, headSha: "abc123", baseBranch: "main", issuedAt: 100, expiresAt: 200 };
const authOptions = { secret, authorizedActors: ["release-bot"], now: 150 };
const checks = { state: "success", statuses: [], checkRuns: [], missingRequired: [], successfulRequired: ["lint", "build"], ready: true };
const protection = { protected: true, requiredApprovingReviews: 2, requiredStatusChecks: ["lint", "build"], requireLinearHistory: true };

test("signed merge authorization validates signature, actor, target and time window", () => {
  const token = signMergeAuthorization(claims, secret);
  assert.deepEqual(verifyMergeAuthorization(token, { pullRequest: 42, headSha: "abc123", baseBranch: "main" }, authOptions), { valid: true, authorization: claims });
  const [payload, signature] = token.split(".");
  const alteredPayload = Buffer.from(JSON.stringify({ ...claims, actor: "intruder" })).toString("base64url");
  assert.equal(verifyMergeAuthorization(`${alteredPayload}.${signature}`, { pullRequest: 42, headSha: "abc123", baseBranch: "main" }, authOptions).valid, false);
  assert.equal(verifyMergeAuthorization(`${payload}.${"A".repeat(signature.length)}`, { pullRequest: 42, headSha: "abc123", baseBranch: "main" }, authOptions).valid, false);
  assert.match(verifyMergeAuthorization(token, { pullRequest: 43, headSha: "abc123", baseBranch: "main" }, authOptions).reason, /does not match/);
  assert.match(verifyMergeAuthorization(token, { pullRequest: 42, headSha: "abc123", baseBranch: "main" }, { ...authOptions, authorizedActors: ["someone-else"] }).reason, /not authorized/);
  const expired = signMergeAuthorization({ ...claims, expiresAt: 149 }, secret);
  assert.match(verifyMergeAuthorization(expired, { pullRequest: 42, headSha: "abc123", baseBranch: "main" }, authOptions).reason, /expired/);
});

test("branch protection rejects insufficient approvals, checks and invalid git state", () => {
  const result = validateBranchProtection(protection, { approvals: 1, checks: { ...checks, successfulRequired: ["lint"], missingRequired: ["build"] }, isUpToDate: false, isTreeClean: false, hasLinearHistory: false });
  assert.equal(result.ready, false);
  assert.equal(result.approvalsMissing, 1);
  assert.deepEqual(result.requiredChecksMissing, ["build"]);
  assert.match(result.reasons.join("; "), /approval/);
  assert.match(result.reasons.join("; "), /build/);
  assert.match(result.reasons.join("; "), /up to date/);
  assert.match(result.reasons.join("; "), /clean/);
  assert.match(result.reasons.join("; "), /non-linear/);
});

function adapter(overrides = {}) {
  const calls = [];
  return {
    calls,
    getPullRequest: async (number) => ({ number, state: "open", draft: false, head: { sha: "abc123" }, base: { ref: "main" } }),
    getBranchProtection: async () => protection,
    getApprovals: async () => 2,
    getChecks: async () => checks,
    getGitValidation: async () => ({ isUpToDate: true, isTreeClean: true, hasLinearHistory: true }),
    mergePullRequest: async (...args) => { calls.push(args); return { merged: true }; },
    ...overrides,
  };
}

test("controlled merge validates first and merges the authorized head", async () => {
  const api = adapter();
  const result = await coordinatePullRequestMerge({ pullRequest: 42, authorizationToken: signMergeAuthorization(claims, secret), authorization: authOptions, adapter: api });
  assert.deepEqual(result, { merged: true, pullRequest: 42, headSha: "abc123" });
  assert.deepEqual(api.calls, [[42, "abc123"]]);
});

test("controlled merge rejects failed validation without calling the merge endpoint", async () => {
  const api = adapter({ getApprovals: async () => 0 });
  const result = await coordinatePullRequestMerge({ pullRequest: 42, authorizationToken: signMergeAuthorization(claims, secret), authorization: authOptions, adapter: api });
  assert.equal(result.merged, false);
  assert.match(result.reasons.join("; "), /approvals/);
  assert.deepEqual(api.calls, []);
});
