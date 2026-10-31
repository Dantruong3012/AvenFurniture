import type { GitHubClient } from "./client";
import type { GitHubPullRequest } from "./types";
import type { DeploymentObservation } from "../vercel/types";

export const REQUIRED_RELEASE_CHECKS = ["lint", "typecheck", "unit-pglite-integration", "local-fixture-e2e", "build", "security"] as const;
const fullSha = /^[a-f0-9]{40}$/;
export type PullRequestReview = { id: number; user: { login: string; type?: string } | null; state: string; commit_id: string };

export function independentApprovals(reviews: PullRequestReview[], author: string, headSha: string) {
  const latest = new Map<string, PullRequestReview>();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    if (!review.user || review.state === "COMMENTED" || review.state === "PENDING") continue;
    latest.set(review.user.login.toLowerCase(), review);
  }
  const humans = [...latest.values()].filter(r => r.user?.type === "User" && r.user.login.toLowerCase() !== author.toLowerCase());
  return {
    count: humans.filter(r => r.state === "APPROVED" && r.commit_id === headSha).length,
    changesRequested: humans.some(r => r.state === "CHANGES_REQUESTED"),
  };
}

export async function reconcileReleasePullRequest(client: GitHubClient, input: {
  repository: string; headBranch: string; baseBranch: string; expectedHeadSha: string;
  create?: boolean; title?: string; body?: string;
}) {
  const { repository, headBranch, baseBranch, expectedHeadSha } = input;
  if (!fullSha.test(expectedHeadSha) || repository !== `${client.owner}/${client.repo}` || headBranch === baseBranch) throw new Error("Invalid release PR identity");
  const prefix = `/repos/${repository}`;
  const remote = await client.request<{ commit: { sha: string } }>(`${prefix}/branches/${encodeURIComponent(headBranch)}`);
  if (remote.commit.sha !== expectedHeadSha) throw new Error("Remote head differs from the expected release SHA");
  const find = async () => {
    const prs = await client.pullRequests({ state: "open", head: `${client.owner}:${headBranch}`, base: baseBranch });
    if (prs.length > 1) throw new Error("Multiple release PRs found; operator reconciliation required");
    const pr = prs[0];
    if (pr && (pr.head.sha !== expectedHeadSha || pr.head.ref !== headBranch || pr.base.ref !== baseBranch || pr.head.repo?.full_name !== repository || pr.base.repo?.full_name !== repository)) throw new Error("Existing PR does not match the exact release identity");
    return pr ?? null;
  };
  const existing = await find();
  if (existing || !input.create) return { pullRequest: existing, created: false };
  if (!input.title?.trim() || !input.body?.trim()) throw new Error("Explicit PR title and body are required");
  try {
    const created = await client.request<GitHubPullRequest>(`${prefix}/pulls`, { method: "POST", body: JSON.stringify({ title: input.title, body: input.body, head: headBranch, base: baseBranch, draft: true }) });
    const pr = await find();
    if (!pr || pr.number !== created.number) throw new Error("PR creation outcome could not be reconciled");
    return { pullRequest: pr, created: true };
  } catch {
    // A lost POST response may have created the PR. Never issue a second POST.
    const reconciled = await find();
    if (reconciled) return { pullRequest: reconciled, created: false };
    throw new Error("PR creation outcome is unknown; inspect GitHub before retrying");
  }
}

export type ReleaseStage = "CI Pending" | "CI Failed" | "CI Passed" | "Merge Approved" | "Merged" | "Deployment Pending" | "Deployed" | "Deployment Failed" | "Rolled Back" | "Unverified";
export type ReleaseObservation = {
  repository: string; pullRequest: number; headSha: string; baseSha: string;
  ciPassed: boolean; ciFailed?: boolean; mergeApproved: boolean; merged: boolean; mergedSha?: string | null;
  deployment?: DeploymentObservation; healthPassed?: boolean;
  knownGood?: { deploymentId: string; sha: string };
  previouslyDeployed?: { deploymentId: string; sha: string };
};

export function releaseStage(input: ReleaseObservation): ReleaseStage {
  if (!fullSha.test(input.headSha) || !fullSha.test(input.baseSha)) return "Unverified";
  if (!input.merged) return input.mergeApproved && input.ciPassed ? "Merge Approved" : input.ciPassed ? "CI Passed" : input.ciFailed ? "CI Failed" : "CI Pending";
  if (!fullSha.test(input.mergedSha ?? "")) return "Unverified";
  const observation = input.deployment;
  if (!observation) return "Merged";
  if (observation.status === "UNAVAILABLE" || observation.targetCommitSha !== input.mergedSha) return "Unverified";
  if (input.knownGood && input.previouslyDeployed?.sha === input.mergedSha && fullSha.test(input.knownGood.sha) &&
      input.knownGood.sha !== input.mergedSha && observation.servingDeploymentId === input.knownGood.deploymentId &&
      observation.servingCommitSha === input.knownGood.sha && observation.servingReady === true && input.healthPassed === true) return "Rolled Back";
  if (["ERROR", "CANCELED"].includes(observation.status)) return "Deployment Failed";
  if (observation.status === "READY" && observation.serving === true) return input.healthPassed === true ? "Deployed" : input.healthPassed === false ? "Deployment Failed" : "Unverified";
  return "Deployment Pending";
}
