import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/load-module.mjs";

const { signMergeAuthorization, verifyMergeAuthorization, validateBranchProtection, coordinatePullRequestMerge } = loadModule("lib/github/controlled-merge.ts");
const secret = "test-only-signing-secret-with-32-characters";
const head = "a".repeat(40), base = "b".repeat(40), merged = "c".repeat(40);
const claims = { actor: "release-operator", repository: "acme/shop", pullRequest: 42, headSha: head, baseSha: base, baseBranch: "main", productionImpactApproved: true, issuedAt: 100, expiresAt: 200 };
const expected = { repository: "acme/shop", pullRequest: 42, headSha: head, baseSha: base, baseBranch: "main" };
const authOptions = { secret, authorizedActors: ["release-operator"], now: 150 };
const checks = { state: "success", statuses: [], checkRuns: [], missingRequired: [], successfulRequired: ["lint", "build"], ready: true };
const protection = { protected: true, requiredApprovingReviews: 2, requiredStatusChecks: ["lint", "build"], requireLinearHistory: false, enforceAdmins: true, dismissStaleReviews: true, strictChecks: true, allowForcePushes: false, allowDeletions: false, hasReviewBypass: false };

test("signed merge authorization validates signature, actor, target and time window", () => {
  const token = signMergeAuthorization(claims, secret);
  assert.deepEqual(verifyMergeAuthorization(token, expected, authOptions), { valid: true, authorization: claims });
  const [payload, signature] = token.split(".");
  const alteredPayload = Buffer.from(JSON.stringify({ ...claims, actor: "intruder" })).toString("base64url");
  assert.equal(verifyMergeAuthorization(`${alteredPayload}.${signature}`, expected, authOptions).valid, false);
  assert.equal(verifyMergeAuthorization(`${payload}.${"A".repeat(signature.length)}`, expected, authOptions).valid, false);
  assert.match(verifyMergeAuthorization(token, { ...expected, pullRequest: 43 }, authOptions).reason, /does not match/);
  assert.match(verifyMergeAuthorization(token, expected, { ...authOptions, authorizedActors: ["someone-else"] }).reason, /not authorized/);
  const expired = signMergeAuthorization({ ...claims, expiresAt: 149 }, secret);
  assert.match(verifyMergeAuthorization(expired, expected, authOptions).reason, /expired/);
  for (const mutation of [{ repository: "other/repo" }, { baseSha: merged }]) assert.equal(verifyMergeAuthorization(token, { ...expected, ...mutation }, authOptions).valid, false);
  assert.equal(verifyMergeAuthorization(signMergeAuthorization({ ...claims, expiresAt: 1100 }, secret), expected, authOptions).valid, false);
  assert.equal(verifyMergeAuthorization(signMergeAuthorization({ ...claims, productionImpactApproved: false }, secret), expected, authOptions).valid, false);
});

test("branch protection rejects insufficient approvals, checks and invalid git state", () => {
  const result = validateBranchProtection({ ...protection, requireLinearHistory: true }, { approvals: 1, checks: { ...checks, successfulRequired: ["lint"], missingRequired: ["build"] }, isUpToDate: false, isTreeClean: false, hasLinearHistory: false });
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
    getPullRequest: async (number) => ({ number, state: "open", draft: false, head: { sha: head, ref: "dev", repo: { full_name: "acme/shop" } }, base: { ref: "main", sha: base, repo: { full_name: "acme/shop" } } }),
    getBranchProtection: async () => protection,
    getApprovals: async () => 2,
    getChecks: async () => checks,
    getGitValidation: async () => ({ isUpToDate: true, isTreeClean: true, hasLinearHistory: true }),
    mergePullRequest: async (...args) => { calls.push(args); return { merged: true, sha: merged }; },
    ...overrides,
  };
}
const policy = { repository: "acme/shop", sourceBranch: "dev", targetBranch: "main", requiredChecks: ["lint", "build"], productionImpactApproved: true };

test("controlled merge validates first and merges the authorized head", async () => {
  const api = adapter();
  const result = await coordinatePullRequestMerge({ ...policy, pullRequest: 42, authorizationToken: signMergeAuthorization(claims, secret), authorization: authOptions, adapter: api });
  assert.deepEqual(result, { merged: true, pullRequest: 42, headSha: head, mergeSha: merged });
  assert.deepEqual(api.calls, [[42, head, "merge"]]);
});

test("controlled merge rejects failed validation without calling the merge endpoint", async () => {
  const api = adapter({ getApprovals: async () => 0 });
  const result = await coordinatePullRequestMerge({ ...policy, pullRequest: 42, authorizationToken: signMergeAuthorization(claims, secret), authorization: authOptions, adapter: api });
  assert.equal(result.merged, false);
  assert.match(result.reasons.join("; "), /approvals/);
  assert.deepEqual(api.calls, []);
});

test("controlled merge refuses missing Production approval and handles uncertain writes safely", async () => {
  const api = adapter();
  const input = { ...policy, pullRequest: 42, authorizationToken: signMergeAuthorization(claims, secret), authorization: authOptions, adapter: api };
  assert.equal((await coordinatePullRequestMerge({ ...input, productionImpactApproved: false })).merged, false);
  assert.deepEqual(api.calls, []);
  api.mergePullRequest = async () => { throw Error("private credential in transport error"); };
  const result = await coordinatePullRequestMerge(input);
  assert.equal(result.merged, null);
  assert.doesNotMatch(JSON.stringify(result), /private credential/);
  api.mergePullRequest = async () => ({ merged: true });
  assert.equal((await coordinatePullRequestMerge(input)).merged, null);
});
