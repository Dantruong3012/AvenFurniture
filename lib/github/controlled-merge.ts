import { createHmac, timingSafeEqual } from "node:crypto";
import type { BranchProtectionStatus, GitHubCheckSummary, MergeAuthorization, MergeValidationResult } from "./types";

export type MergeAuthorizationClaims = MergeAuthorization;
export type MergeAuthorizationOptions = {
  secret: string;
  authorizedActors: readonly string[];
  now?: number;
};

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const signatureFor = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");
const fullSha = /^[a-f0-9]{40}$/;

export function signMergeAuthorization(claims: MergeAuthorizationClaims, secret: string): string {
  if (secret.length < 32) throw new Error("Merge authorization secret requires at least 32 characters");
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifyMergeAuthorization(
  token: string,
  expected: { repository: string; pullRequest: number; headSha: string; baseSha: string; baseBranch: string },
  options: MergeAuthorizationOptions,
): { valid: true; authorization: MergeAuthorizationClaims } | { valid: false; reason: string } {
  if (options.secret.length < 32) return { valid: false, reason: "Authorization secret is not configured securely" };
  if (token.length > 4096) return { valid: false, reason: "Malformed authorization token" };
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return { valid: false, reason: "Malformed authorization token" };
  const expectedSignature = Buffer.from(signatureFor(payload, options.secret));
  const suppliedSignature = Buffer.from(signature);
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) return { valid: false, reason: "Invalid authorization signature" };
  let authorization: MergeAuthorizationClaims;
  try { authorization = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { return { valid: false, reason: "Invalid authorization payload" }; }
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(now) || now < 0) return { valid: false, reason: "Invalid authorization verification time" };
  if (!authorization || typeof authorization.actor !== "string" || !Number.isInteger(authorization.pullRequest) || authorization.pullRequest < 1 || !fullSha.test(authorization.headSha) || !fullSha.test(authorization.baseSha) || typeof authorization.repository !== "string" || typeof authorization.baseBranch !== "string" || !Number.isInteger(authorization.issuedAt) || !Number.isInteger(authorization.expiresAt)) return { valid: false, reason: "Invalid authorization claims" };
  if (!options.authorizedActors.some((actor) => actor.toLowerCase() === authorization.actor.toLowerCase())) return { valid: false, reason: "Actor is not authorized to merge" };
  if (authorization.repository !== expected.repository || authorization.pullRequest !== expected.pullRequest || authorization.headSha !== expected.headSha || authorization.baseSha !== expected.baseSha || authorization.baseBranch !== expected.baseBranch) return { valid: false, reason: "Authorization does not match the repository, pull request, commit, or target branch" };
  if (authorization.productionImpactApproved !== true) return { valid: false, reason: "Explicit Production impact approval is required before merging main" };
  if (authorization.issuedAt > now || authorization.expiresAt <= now || authorization.expiresAt <= authorization.issuedAt || authorization.expiresAt - authorization.issuedAt > 900) return { valid: false, reason: "Authorization is expired or has an invalid time window" };
  return { valid: true, authorization };
}

export function validateBranchProtection(protection: BranchProtectionStatus, input: { approvals: number; checks: GitHubCheckSummary; isUpToDate: boolean; isTreeClean: boolean; hasLinearHistory?: boolean }): MergeValidationResult {
  const reasons: string[] = [];
  if (!protection.protected) reasons.push("Target branch is not protected");
  if (!Number.isInteger(protection.requiredApprovingReviews) || protection.requiredApprovingReviews < 1) reasons.push("At least one independent approving review must be required");
  if (!protection.enforceAdmins || !protection.dismissStaleReviews || !protection.strictChecks) reasons.push("Admin enforcement, stale review dismissal and strict checks are required");
  if (protection.allowForcePushes !== false || protection.allowDeletions !== false || protection.hasReviewBypass !== false) reasons.push("Force pushes, deletion and review bypass must all be disabled");
  if (!protection.requiredStatusChecks.length) reasons.push("Required check policy is empty");
  const approvalsMissing = Math.max(0, Math.max(1, protection.requiredApprovingReviews) - input.approvals);
  if (approvalsMissing) reasons.push(`Missing ${approvalsMissing} required approval${approvalsMissing === 1 ? "" : "s"}`);
  const requiredChecksMissing = protection.requiredStatusChecks.filter((name) => !input.checks.successfulRequired.includes(name) || input.checks.missingRequired.includes(name));
  if (requiredChecksMissing.length) reasons.push(`Required checks missing or unsuccessful: ${requiredChecksMissing.join(", ")}`);
  if (input.checks.state !== "success" || !input.checks.ready) reasons.push(input.checks.state === "pending" ? "Checks are still pending" : "One or more checks have not passed");
  if (!input.isUpToDate) reasons.push("Pull request branch is not up to date with the target branch");
  if (!input.isTreeClean) reasons.push("Working tree is not clean");
  if (protection.requireLinearHistory && input.hasLinearHistory === false) reasons.push("Pull request contains non-linear history");
  return { ready: reasons.length === 0, reasons, requiredChecksMissing, approvalsMissing };
}

type MergePullRequest = { number: number; state: string; draft: boolean; head: { sha: string; ref: string; repo?: { full_name: string } | null }; base: { ref: string; sha: string; repo?: { full_name: string } | null } };
export type ControlledMergeAdapter<PR = MergePullRequest> = {
  getPullRequest(number: number): Promise<PR>;
  getBranchProtection(branch: string): Promise<BranchProtectionStatus>;
  getApprovals(number: number, headSha: string): Promise<number>;
  getChecks(sha: string, requiredChecks: string[]): Promise<GitHubCheckSummary>;
  getGitValidation(number: number): Promise<{ isUpToDate: boolean; isTreeClean: boolean; hasLinearHistory: boolean }>;
  mergePullRequest(number: number, expectedHeadSha: string, method: "merge"): Promise<{ merged: boolean; sha?: string }>;
};

export async function coordinatePullRequestMerge<PR extends MergePullRequest>(input: {
  repository: string;
  sourceBranch: string;
  targetBranch: string;
  requiredChecks: readonly string[];
  productionImpactApproved: boolean;
  pullRequest: number;
  authorizationToken: string;
  authorization: MergeAuthorizationOptions;
  adapter: ControlledMergeAdapter<PR>;
}): Promise<{ merged: true; pullRequest: number; headSha: string; mergeSha: string } | { merged: false | null; reasons: string[] }> {
  let attempted = false;
  try {
    if (input.productionImpactApproved !== true) return { merged: false, reasons: ["Explicit Production impact approval is required"] };
    const pr = await input.adapter.getPullRequest(input.pullRequest);
    if (pr.number !== input.pullRequest || pr.head.ref !== input.sourceBranch || pr.base.ref !== input.targetBranch || pr.head.repo?.full_name !== input.repository || pr.base.repo?.full_name !== input.repository) return { merged: false, reasons: ["Pull request repository or branches do not match release policy"] };
    if (pr.state !== "open" || pr.draft) return { merged: false, reasons: [pr.draft ? "Draft pull requests cannot be merged" : "Pull request is not open"] };
    const signed = verifyMergeAuthorization(input.authorizationToken, { repository: input.repository, pullRequest: pr.number, headSha: pr.head.sha, baseSha: pr.base.sha, baseBranch: pr.base.ref }, input.authorization);
    if (!signed.valid) return { merged: false, reasons: [signed.reason] };
    const [protection, approvals, git] = await Promise.all([input.adapter.getBranchProtection(pr.base.ref), input.adapter.getApprovals(pr.number, pr.head.sha), input.adapter.getGitValidation(pr.number)]);
    if (!input.requiredChecks.length || input.requiredChecks.some(name => !protection.requiredStatusChecks.includes(name))) return { merged: false, reasons: ["Live protection does not enforce every required release check"] };
    if (protection.requireLinearHistory) return { merged: false, reasons: ["Linear-history protection conflicts with the approved merge-commit strategy"] };
    const checks = await input.adapter.getChecks(pr.head.sha, protection.requiredStatusChecks);
    const validation = validateBranchProtection(protection, { approvals, checks, isUpToDate: git.isUpToDate, isTreeClean: git.isTreeClean, hasLinearHistory: git.hasLinearHistory });
    if (!validation.ready) return { merged: false, reasons: validation.reasons };
    const current = await input.adapter.getPullRequest(pr.number);
    if (current.state !== "open" || current.draft || current.head.sha !== pr.head.sha || current.base.sha !== pr.base.sha) return { merged: false, reasons: ["PR changed during preflight; new approval required"] };
    attempted = true;
    const result = await input.adapter.mergePullRequest(pr.number, pr.head.sha, "merge");
    if (!result.merged) return { merged: false, reasons: ["GitHub rejected the merge"] };
    return fullSha.test(result.sha ?? "") ? { merged: true, pullRequest: pr.number, headSha: pr.head.sha, mergeSha: result.sha! } : { merged: null, reasons: ["Merge outcome is unknown; reconcile PR merge SHA before retrying"] };
  } catch {
    return { merged: attempted ? null : false, reasons: [attempted ? "Merge outcome is unknown; inspect GitHub before retrying" : "Merge validation failed; credentials and response details withheld"] };
  }
}
