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

export function signMergeAuthorization(claims: MergeAuthorizationClaims, secret: string): string {
  if (!secret) throw new Error("Merge authorization secret is required");
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifyMergeAuthorization(
  token: string,
  expected: { pullRequest: number; headSha: string; baseBranch: string },
  options: MergeAuthorizationOptions,
): { valid: true; authorization: MergeAuthorizationClaims } | { valid: false; reason: string } {
  if (!options.secret) return { valid: false, reason: "Authorization secret is not configured" };
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return { valid: false, reason: "Malformed authorization token" };
  const expectedSignature = Buffer.from(signatureFor(payload, options.secret));
  const suppliedSignature = Buffer.from(signature);
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) return { valid: false, reason: "Invalid authorization signature" };
  let authorization: MergeAuthorizationClaims;
  try { authorization = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { return { valid: false, reason: "Invalid authorization payload" }; }
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (!authorization || typeof authorization.actor !== "string" || !Number.isInteger(authorization.pullRequest) || typeof authorization.headSha !== "string" || typeof authorization.baseBranch !== "string" || !Number.isFinite(authorization.issuedAt) || !Number.isFinite(authorization.expiresAt)) return { valid: false, reason: "Invalid authorization claims" };
  if (!options.authorizedActors.some((actor) => actor.toLowerCase() === authorization.actor.toLowerCase())) return { valid: false, reason: "Actor is not authorized to merge" };
  if (authorization.pullRequest !== expected.pullRequest || authorization.headSha !== expected.headSha || authorization.baseBranch !== expected.baseBranch) return { valid: false, reason: "Authorization does not match the pull request, commit, or target branch" };
  if (authorization.issuedAt > now || authorization.expiresAt <= now || authorization.expiresAt <= authorization.issuedAt) return { valid: false, reason: "Authorization is expired or has an invalid time window" };
  return { valid: true, authorization };
}

export function validateBranchProtection(protection: BranchProtectionStatus, input: { approvals: number; checks: GitHubCheckSummary; isUpToDate: boolean; isTreeClean: boolean; hasLinearHistory?: boolean }): MergeValidationResult {
  const reasons: string[] = [];
  if (!protection.protected) reasons.push("Target branch is not protected");
  const approvalsMissing = Math.max(0, protection.requiredApprovingReviews - input.approvals);
  if (approvalsMissing) reasons.push(`Missing ${approvalsMissing} required approval${approvalsMissing === 1 ? "" : "s"}`);
  const requiredChecksMissing = protection.requiredStatusChecks.filter((name) => !input.checks.successfulRequired.includes(name) || input.checks.missingRequired.includes(name));
  if (requiredChecksMissing.length) reasons.push(`Required checks missing or unsuccessful: ${requiredChecksMissing.join(", ")}`);
  if (input.checks.state !== "success") reasons.push(input.checks.state === "pending" ? "Checks are still pending" : "One or more checks have not passed");
  if (!input.isUpToDate) reasons.push("Pull request branch is not up to date with the target branch");
  if (!input.isTreeClean) reasons.push("Working tree is not clean");
  if (protection.requireLinearHistory && input.hasLinearHistory === false) reasons.push("Pull request contains non-linear history");
  return { ready: reasons.length === 0, reasons, requiredChecksMissing, approvalsMissing };
}

export type ControlledMergeAdapter<PR = { number: number; state: string; draft: boolean; head: { sha: string }; base: { ref: string } }> = {
  getPullRequest(number: number): Promise<PR>;
  getBranchProtection(branch: string): Promise<BranchProtectionStatus>;
  getApprovals(number: number): Promise<number>;
  getChecks(sha: string, requiredChecks: string[]): Promise<GitHubCheckSummary>;
  getGitValidation(number: number): Promise<{ isUpToDate: boolean; isTreeClean: boolean; hasLinearHistory: boolean }>;
  mergePullRequest(number: number, expectedHeadSha: string): Promise<{ merged: boolean; message?: string }>;
};

export async function coordinatePullRequestMerge<PR extends { number: number; state: string; draft: boolean; head: { sha: string }; base: { ref: string } }>(input: {
  pullRequest: number;
  authorizationToken: string;
  authorization: MergeAuthorizationOptions;
  adapter: ControlledMergeAdapter<PR>;
}): Promise<{ merged: true; pullRequest: number; headSha: string } | { merged: false; reasons: string[] }> {
  try {
    const pr = await input.adapter.getPullRequest(input.pullRequest);
    if (pr.state !== "open" || pr.draft) return { merged: false, reasons: [pr.draft ? "Draft pull requests cannot be merged" : "Pull request is not open"] };
    const signed = verifyMergeAuthorization(input.authorizationToken, { pullRequest: pr.number, headSha: pr.head.sha, baseBranch: pr.base.ref }, input.authorization);
    if (!signed.valid) return { merged: false, reasons: [signed.reason] };
    const [protection, approvals, git] = await Promise.all([input.adapter.getBranchProtection(pr.base.ref), input.adapter.getApprovals(pr.number), input.adapter.getGitValidation(pr.number)]);
    const checks = await input.adapter.getChecks(pr.head.sha, protection.requiredStatusChecks);
    const validation = validateBranchProtection(protection, { approvals, checks, isUpToDate: git.isUpToDate, isTreeClean: git.isTreeClean, hasLinearHistory: git.hasLinearHistory });
    if (!validation.ready) return { merged: false, reasons: validation.reasons };
    const result = await input.adapter.mergePullRequest(pr.number, pr.head.sha);
    return result.merged ? { merged: true, pullRequest: pr.number, headSha: pr.head.sha } : { merged: false, reasons: [result.message ?? "GitHub did not merge the pull request"] };
  } catch (error) {
    return { merged: false, reasons: [error instanceof Error ? `Merge validation failed: ${error.message}` : "Merge validation failed"] };
  }
}
