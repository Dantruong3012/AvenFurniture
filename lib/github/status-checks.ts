import type { GitHubClient } from "./client";
import type { GitHubCheckRun, GitHubCheckSummary, GitHubCommitStatus } from "./types";

function statusConclusion(statuses: GitHubCommitStatus[], runs: GitHubCheckRun[]): GitHubCheckSummary["state"] {
  const statusFailed = statuses.some((status) => status.state === "failure" || status.state === "error");
  const runFailed = runs.some((run) => run.status === "completed" && run.conclusion !== "success" && run.conclusion !== "neutral" && run.conclusion !== "skipped");
  if (statusFailed || runFailed) return "failure";
  const pending = statuses.some((status) => status.state === "pending") || runs.some((run) => run.status !== "completed");
  if (pending) return "pending";
  const hasResult = statuses.length > 0 || runs.length > 0;
  const successes = statuses.some((status) => status.state === "success") || runs.some((run) => run.conclusion === "success");
  return successes || !hasResult ? (hasResult ? "success" : "neutral") : "neutral";
}

export function summarizeStatusChecks(statuses: GitHubCommitStatus[], checkRuns: GitHubCheckRun[], requiredChecks: string[] = []): GitHubCheckSummary {
  const succeeded = new Set<string>();
  for (const status of statuses) if (status.state === "success") succeeded.add(status.context);
  for (const run of checkRuns) if (run.status === "completed" && (run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped")) succeeded.add(run.name);
  const missingRequired = requiredChecks.filter((name) => !succeeded.has(name));
  const state = statusConclusion(statuses, checkRuns);
  return { state, statuses, checkRuns, missingRequired, successfulRequired: requiredChecks.filter((name) => succeeded.has(name)), ready: state === "success" && missingRequired.length === 0 };
}

export async function getCommitCheckSummary(client: GitHubClient, sha: string, requiredChecks: string[] = []) {
  const [statusResponse, runsResponse] = await Promise.all([client.commitStatuses(sha), client.checkRuns(sha)]);
  return summarizeStatusChecks(statusResponse.statuses, runsResponse.check_runs, requiredChecks);
}

export async function validateRequiredChecks(client: GitHubClient, sha: string, requiredChecks: string[] = []) {
  const summary = await getCommitCheckSummary(client, sha, requiredChecks);
  return { ...summary, ready: summary.ready, reason: summary.ready ? null : summary.state === "failure" ? "One or more checks failed" : summary.state === "pending" ? "Checks are still pending" : `Required checks missing or unsuccessful: ${summary.missingRequired.join(", ")}` };
}
