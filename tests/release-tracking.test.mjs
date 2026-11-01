import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/load-module.mjs";
const { independentApprovals, reconcileReleasePullRequest, releaseStage } = loadModule("lib/github/release-tracking.ts");
const sha = "a".repeat(40), base = "b".repeat(40), merged = "c".repeat(40);

test("human reviews exclude author, bots, stale and superseded approvals", () => {
  const review = (id, login, state = "APPROVED", commit_id = sha, type = "User") => ({ id, user: { login, type }, state, commit_id });
  assert.deepEqual(independentApprovals([review(1, "owner"), review(2, "bot", "APPROVED", sha, "Bot"), review(3, "old", "APPROVED", base), review(4, "human"), review(5, "human", "DISMISSED")], "owner", sha), { count: 0, changesRequested: false });
  assert.deepEqual(independentApprovals([review(1, "human"), review(2, "human", "COMMENTED"), review(3, "other", "CHANGES_REQUESTED")], "owner", sha), { count: 1, changesRequested: true });
});

test("PR creation reconciles a lost response once and rejects stale remote head", async () => {
  let posts = 0, created = false;
  const pr = { number: 9, head: { sha, ref: "dev", repo: { full_name: "owner/repo" } }, base: { ref: "main", repo: { full_name: "owner/repo" } } };
  const api = { owner: "owner", repo: "repo", request: async (path, init) => { if (init?.method === "POST") { posts++; created = true; throw Error("lost response"); } return { commit: { sha } }; }, pullRequests: async () => created ? [pr] : [] };
  const input = { repository: "owner/repo", headBranch: "dev", baseBranch: "main", expectedHeadSha: sha, create: true, title: "Release", body: "Evidence" };
  assert.equal((await reconcileReleasePullRequest(api, input)).pullRequest.number, 9);
  assert.equal(posts, 1);
  await reconcileReleasePullRequest(api, input);
  assert.equal(posts, 1);
  await assert.rejects(reconcileReleasePullRequest(api, { ...input, expectedHeadSha: base }), /Remote head/);
  api.pullRequests = async () => [pr, pr];
  await assert.rejects(reconcileReleasePullRequest(api, input), /Multiple/);
});

const identity = { repository: "owner/repo", pullRequest: 1, headSha: sha, baseSha: base, mergedSha: merged, ciPassed: false, mergeApproved: false, merged: false };
test("release stages keep CI, approval, merge, alias and health independent", () => {
  assert.equal(releaseStage(identity), "CI Pending");
  assert.equal(releaseStage({ ...identity, ciPassed: true }), "CI Passed");
  assert.equal(releaseStage({ ...identity, ciPassed: true, mergeApproved: true }), "Merge Approved");
  assert.equal(releaseStage({ ...identity, merged: true }), "Merged");
  const input = { ...identity, merged: true, deployment: { status: "READY", targetCommitSha: merged, serving: false } };
  assert.equal(releaseStage(input), "Deployment Pending");
  assert.equal(releaseStage({ ...input, deployment: { ...input.deployment, serving: true } }), "Unverified");
  assert.equal(releaseStage({ ...input, deployment: { ...input.deployment, serving: true }, healthPassed: true }), "Deployed");
  assert.equal(releaseStage({ ...input, deployment: { ...input.deployment, serving: true }, healthPassed: false }), "Deployment Failed");
  assert.equal(releaseStage({ ...input, deployment: { ...input.deployment, status: "ERROR" } }), "Deployment Failed");
  assert.equal(releaseStage({ ...input, deployment: { ...input.deployment, targetCommitSha: sha } }), "Unverified");
});

test("rollback needs prior release deployment, recorded known-good identity and health", () => {
  const input = { ...identity, merged: true, healthPassed: true, deployment: { status: "READY", targetCommitSha: merged, servingReady: true, servingCommitSha: base, servingDeploymentId: "dpl_old" }, knownGood: { deploymentId: "dpl_old", sha: base } };
  assert.equal(releaseStage(input), "Deployment Pending");
  assert.equal(releaseStage({ ...input, previouslyDeployed: { deploymentId: "dpl_new", sha: merged } }), "Rolled Back");
  assert.equal(releaseStage({ ...input, previouslyDeployed: { deploymentId: "dpl_new", sha: merged }, healthPassed: false }), "Deployment Pending");
});
