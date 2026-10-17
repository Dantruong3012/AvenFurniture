export type GitHubLabel = { id?: number; name: string; color?: string; description?: string };

export type GitHubPullRequest = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  user: { login: string } | null;
  head: { ref: string; sha: string; repo?: { full_name: string } | null };
  base: { ref: string; sha: string; repo?: { full_name: string } | null };
  labels: GitHubLabel[];
  milestone?: { number: number; title: string } | null;
};

export type GitHubCommitStatus = {
  state: "error" | "failure" | "pending" | "success";
  context: string;
  description: string | null;
  target_url: string | null;
  created_at: string;
  updated_at: string;
};

export type GitHubCheckRun = {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required" | "stale" | null;
  html_url: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type GitHubCheckSummary = {
  state: "success" | "pending" | "failure" | "neutral";
  statuses: GitHubCommitStatus[];
  checkRuns: GitHubCheckRun[];
  missingRequired: string[];
  successfulRequired: string[];
  ready: boolean;
};

export type GitHubClientOptions = {
  owner: string;
  repo: string;
  token?: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type PullRequestFilters = {
  state?: "open" | "closed" | "all";
  milestone?: string | number;
  labels?: string[];
  targetBranch?: string;
  author?: string;
  includeMerged?: boolean;
};

export type LocalPullRequestState = {
  number?: number;
  branch?: string;
  taskId?: string;
  state?: string;
  merged?: boolean;
  metadata?: Record<string, unknown>;
};

export type PullRequestReconciliation = {
  pullRequest: GitHubPullRequest;
  matchedLocalState: LocalPullRequestState | null;
  taskId: string | null;
  branchMatches: boolean;
  state: "open" | "merged" | "closed";
};

export type MergeAuthorization = {
  actor: string;
  pullRequest: number;
  headSha: string;
  baseBranch: string;
  issuedAt: number;
  expiresAt: number;
};

export type BranchProtectionStatus = {
  protected: boolean;
  requiredApprovingReviews: number;
  requiredStatusChecks: string[];
  requireLinearHistory: boolean;
};

export type MergeValidationResult = {
  ready: boolean;
  reasons: string[];
  requiredChecksMissing: string[];
  approvalsMissing: number;
};
