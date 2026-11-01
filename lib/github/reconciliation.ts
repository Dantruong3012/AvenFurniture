import type { GitHubClient } from "./client";
import type { GitHubPullRequest, LocalPullRequestState, PullRequestFilters, PullRequestReconciliation } from "./types";

export function filterPullRequests(pullRequests: GitHubPullRequest[], filters: PullRequestFilters = {}) {
  const labels = (filters.labels ?? []).map((label) => label.toLowerCase());
  return pullRequests.filter((pr) => {
    if (filters.state && filters.state !== "all" && pr.state !== filters.state) return false;
    if (filters.includeMerged === false && pr.merged) return false;
    if (filters.milestone !== undefined && String(pr.milestone?.number) !== String(filters.milestone) && pr.milestone?.title.toLowerCase() !== String(filters.milestone).toLowerCase()) return false;
    if (filters.targetBranch && pr.base.ref !== filters.targetBranch) return false;
    if (filters.author && pr.user?.login.toLowerCase() !== filters.author.toLowerCase()) return false;
    if (labels.length && !labels.every((wanted) => pr.labels.some((label) => label.name.toLowerCase() === wanted))) return false;
    return true;
  });
}

function taskIdFor(pr: GitHubPullRequest, local: LocalPullRequestState | null) {
  const metadataTaskId = local?.taskId ?? (typeof local?.metadata?.taskId === "string" ? local.metadata.taskId : null);
  if (metadataTaskId) return metadataTaskId;
  const text = `${pr.head.ref}\n${pr.title}\n${pr.body ?? ""}`;
  const match = text.match(/(?:task|issue|ticket)[\s:#-]*([a-z0-9]+(?:-[a-z0-9]+)*)/i);
  return match?.[1] ?? null;
}

export function reconcilePullRequests(pullRequests: GitHubPullRequest[], localStates: LocalPullRequestState[] = [], filters: PullRequestFilters = {}): PullRequestReconciliation[] {
  return filterPullRequests(pullRequests, filters).map((pr) => {
    const local = localStates.find((state) => state.number === pr.number) ?? localStates.find((state) => state.branch === pr.head.ref) ?? null;
    return {
      pullRequest: pr,
      matchedLocalState: local,
      taskId: taskIdFor(pr, local),
      branchMatches: local?.branch ? local.branch === pr.head.ref : true,
      state: pr.merged ? "merged" : pr.state === "open" ? "open" : "closed",
    };
  });
}

export async function queryPullRequests(client: GitHubClient, filters: PullRequestFilters = {}) {
  const pullRequests = await client.pullRequests({ state: filters.state ?? "all", ...(filters.targetBranch ? { base: filters.targetBranch } : {}) });
  return filterPullRequests(pullRequests, filters);
}

export async function reconcileRepositoryPullRequests(client: GitHubClient, localStates: LocalPullRequestState[] = [], filters: PullRequestFilters = {}) {
  return reconcilePullRequests(await queryPullRequests(client, filters), localStates, filters);
}
