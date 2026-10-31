import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, realpathSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { GitHubClient } from "../lib/github/client.ts";
import { summarizeStatusChecks } from "../lib/github/status-checks.ts";
import { verifyMergeAuthorization, validateBranchProtection } from "../lib/github/controlled-merge.ts";
import { independentApprovals, reconcileReleasePullRequest, releaseStage, REQUIRED_RELEASE_CHECKS } from "../lib/github/release-tracking.ts";
import type { PullRequestReview, ReleaseObservation } from "../lib/github/release-tracking.ts";
import type { GitHubPullRequest } from "../lib/github/types.ts";
import { observeProductionDeployment } from "../lib/vercel/deployment.ts";
import { acquireLock, releaseLock, atomicJSON } from "../.ai-collab/orchestrator-core.mjs";
import { containsCredential } from "./check-release-security.mjs";

const root = resolve(import.meta.dirname, "..");
const policy = JSON.parse(readFileSync(join(root, ".ai-collab/release.config.json"), "utf8"));
const repository = "Dantruong3012/AvenFurniture", source = "dev/aven-autonomous-backlog", target = "main";
const productionAlias = "aven-furniture.vercel.app";
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10000 }).trim();
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  pr: { type: "string" }, head: { type: "string" }, write: { type: "boolean" }, evidence: { type: "boolean" },
  title: { type: "string" }, "body-file": { type: "string" }, "authorization-file": { type: "string" }, "known-good-file": { type: "string" }, help: { type: "boolean" },
} });
const command = positionals[0];
let locked = false;
function tokenFromFile(path: string) {
  const absolute = realpathSync(resolve(path)), local = relative(root, absolute);
  if ((!local.startsWith("..") && !isAbsolute(local)) || (statSync(absolute).mode & 0o077)) throw Error("Authorization must be outside checkout and mode 600");
  return readFileSync(absolute, "utf8").trim();
}
try {
  if (values.help) {
    console.log("Release operator: status | pr | merge-check --head FULL_SHA [--pr NUMBER] [--evidence]. PR creation requires pr --write --title TITLE --body-file FILE. merge-check requires --authorization-file (outside checkout, mode 600). No merge/deploy command exists.");
  } else {
    if (!["status", "pr", "merge-check"].includes(command) || positionals.length !== 1) throw Error("Invalid command");
    if (values.write && command !== "pr") throw Error("Only PR creation supports --write");
    if (policy.repository !== repository || policy.developmentBranch !== source || policy.productionBranch !== target || policy.releaseMode !== "manual" || policy.enabled !== false) throw Error("Manual disabled release policy required");
    if (!["https://github.com/Dantruong3012/AvenFurniture.git", "git@github.com:Dantruong3012/AvenFurniture.git"].includes(git("remote", "get-url", "origin"))) throw Error("Unexpected origin");
    const head = values.head ?? git("rev-parse", "HEAD");
    if (!/^[a-f0-9]{40}$/.test(head)) throw Error("Full expected SHA required");
    if (values.write || values.evidence) { acquireLock(join(root, ".ai-collab/.lock")); locked = true; }
    const [owner, repo] = repository.split("/");
    const credential = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    if ((values.write || command === "merge-check") && !credential) throw Error("Supported GitHub API credential required");
    const client = new GitHubClient({ owner, repo, token: credential });
    const prefix = `/repos/${repository}`;
    let pr: GitHubPullRequest | null;
    if (values.pr) {
      if (!/^[1-9]\d*$/.test(values.pr)) throw Error("Invalid PR number");
      pr = await client.request<GitHubPullRequest>(`${prefix}/pulls/${values.pr}`);
    } else {
      const body = values["body-file"] ? readFileSync(values["body-file"], "utf8") : undefined;
      if (containsCredential((values.title ?? "") + "\n" + (body ?? ""))) throw Error("Potential credential in PR text; values withheld");
      const reconciled = await reconcileReleasePullRequest(client, { repository, headBranch: source, baseBranch: target, expectedHeadSha: head,
        create: values.write === true, title: values.title, body });
      pr = reconciled.pullRequest;
    }
    if (!pr) {
      console.log(JSON.stringify({ stage: "PR Pending", repository, headSha: head, automaticMerge: false, productionDeploymentRequested: false }));
      if (command === "merge-check") process.exitCode = 1;
    } else {
      if (pr.head.sha !== head || pr.head.ref !== source || pr.base.ref !== target || pr.head.repo?.full_name !== repository || pr.base.repo?.full_name !== repository) throw Error("PR identity mismatch");
      if (command === "pr") {
        console.log(JSON.stringify({ repository, pullRequest: pr.number, headSha: head, baseSha: pr.base.sha, url: pr.html_url, draft: pr.draft, automaticMerge: false }));
      } else {
        const [status, runs] = await Promise.all([client.commitStatuses(head), client.checkRuns(head)]);
        // Required contexts must come from one unambiguous GitHub Actions app.
        const actionRuns = runs.check_runs.filter(r => r.app?.slug === "github-actions");
        const checks = summarizeStatusChecks(status.statuses, actionRuns, [...REQUIRED_RELEASE_CHECKS]);
        const reasons: string[] = [];
        for (const name of REQUIRED_RELEASE_CHECKS) if (!actionRuns.some(r => r.name === name) || status.statuses.some(s => s.context === name)) reasons.push(`Required Actions context is missing or ambiguous: ${name}`);
        let mergeApproved = false;
        if (!pr.merged) {
          try {
            const repositoryPolicy = await client.request<{ allow_auto_merge: boolean; allow_merge_commit: boolean }>(prefix);
            if (repositoryPolicy.allow_auto_merge !== false || repositoryPolicy.allow_merge_commit !== true) reasons.push("Repository must disable auto-merge and allow merge commits");
            const protection = await client.request<{ enforce_admins?: { enabled: boolean }; allow_force_pushes?: { enabled: boolean }; allow_deletions?: { enabled: boolean }; required_status_checks?: { strict: boolean; contexts: string[]; checks?: { context: string; app_id: number }[] }; required_pull_request_reviews?: { required_approving_review_count: number; dismiss_stale_reviews: boolean; bypass_pull_request_allowances?: { users?: unknown[]; teams?: unknown[]; apps?: unknown[] } }; required_linear_history?: { enabled: boolean }; required_conversation_resolution?: { enabled: boolean } }>(`${prefix}/branches/main/protection`);
            const reviewPolicy = protection.required_pull_request_reviews;
            const protectedChecks = protection.required_status_checks;
            for (const name of REQUIRED_RELEASE_CHECKS) {
              const binding = protectedChecks?.checks?.find(c => c.context === name);
              const ids = new Set(actionRuns.filter(r => r.name === name).map(r => r.app?.id));
              if (!binding?.app_id || ids.size !== 1 || !ids.has(binding.app_id)) reasons.push(`Protection must bind ${name} to its Actions app`);
            }
            if (!protection.required_conversation_resolution?.enabled) reasons.push("Conversation resolution is not enforced");
            if (protection.required_linear_history?.enabled) reasons.push("Linear history conflicts with merge-commit policy");
            const reviews = await client.paginate<PullRequestReview>(`${prefix}/pulls/${pr.number}/reviews`);
            const approvals = independentApprovals(reviews, pr.user?.login ?? "", head);
            if (approvals.changesRequested) reasons.push("Independent reviewer requested changes");
            const detail = await client.request<{ mergeable: boolean | null; mergeable_state: string }>(`${prefix}/pulls/${pr.number}`);
            const compare = await client.request<{ behind_by: number; merge_base_commit: { sha: string } }>(`${prefix}/compare/${pr.base.sha}...${head}`);
            const validation = validateBranchProtection({ protected: true, requiredApprovingReviews: reviewPolicy?.required_approving_review_count ?? 0,
              requiredStatusChecks: [...new Set([...(protectedChecks?.contexts ?? []), ...(protectedChecks?.checks?.map(c => c.context) ?? [])])],
              requireLinearHistory: false, enforceAdmins: protection.enforce_admins?.enabled === true,
              dismissStaleReviews: reviewPolicy?.dismiss_stale_reviews === true, strictChecks: protectedChecks?.strict === true,
              allowForcePushes: protection.allow_force_pushes?.enabled !== false, allowDeletions: protection.allow_deletions?.enabled !== false,
              hasReviewBypass: Object.values(reviewPolicy?.bypass_pull_request_allowances ?? {}).some(entries => entries.length > 0) },
            { approvals: approvals.count, checks, isUpToDate: compare.behind_by === 0 && compare.merge_base_commit.sha === pr.base.sha, isTreeClean: detail.mergeable === true && detail.mergeable_state === "clean" && git("status", "--porcelain=v1") === "" });
            reasons.push(...validation.reasons);
            if (pr.draft || pr.state !== "open") reasons.push("PR must be open and ready for review");
            if (!values["authorization-file"]) reasons.push("Exact-SHA signed Production impact authorization is missing");
            else {
              const authorization = verifyMergeAuthorization(tokenFromFile(values["authorization-file"]), { repository, pullRequest: pr.number, headSha: head, baseSha: pr.base.sha, baseBranch: target },
                { secret: process.env.AVEN_MERGE_AUTHORIZATION_SECRET ?? "", authorizedActors: ["Dantruong3012"] });
              if (!authorization.valid) reasons.push(authorization.reason);
            }
            const current = await client.request<GitHubPullRequest>(`${prefix}/pulls/${pr.number}`);
            if (current.head.sha !== head || current.base.sha !== pr.base.sha) reasons.push("PR changed during preflight");
            mergeApproved = checks.ready && reasons.length === 0;
          } catch { reasons.push("Protection/review/authorization verification unavailable; merge is blocked"); }
        }
        let deployment;
        const health: { path: string; status: number | string }[] = [];
        if (pr.merged && /^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? "")) {
          deployment = await observeProductionDeployment({ commitSha: pr.merge_commit_sha!, branch: target, repository, projectId: policy.vercelProjectId, teamId: policy.vercelTeamId, productionAlias, maxWaitMs: 0 });
          for (const path of ["/", "/products", "/sitemap.xml"]) {
            try { const r = await fetch(`https://${productionAlias}${path}`, { redirect: "error", signal: AbortSignal.timeout(10000) }); const body = await r.text(); health.push({ path, status: r.status === 200 && !/NEXT_HTTP_ERROR_FALLBACK;500|\"digest\":\"[^\"]+\"/.test(body) ? 200 : r.status === 200 ? "RSC_ERROR" : r.status }); }
            catch { health.push({ path, status: "UNAVAILABLE" }); }
          }
        }
        const directory = join(root, ".ai-collab/.runtime/release-observations", `pr-${pr.number}-${head}`);
        const previous = existsSync(join(directory, "latest.json")) ? JSON.parse(readFileSync(join(directory, "latest.json"), "utf8")) : null;
        const samePrevious = previous?.repository === repository && previous?.headSha === head && previous?.mergedSha === pr.merge_commit_sha;
        const observation: ReleaseObservation = { repository, pullRequest: pr.number, headSha: head, baseSha: pr.base.sha, ciPassed: checks.ready && !reasons.some(r => r.startsWith("Required Actions")), ciFailed: checks.state === "failure", mergeApproved, merged: pr.merged === true, mergedSha: pr.merge_commit_sha, deployment,
          healthPassed: health.length ? health.every(h => h.status === 200) : undefined,
          knownGood: values["known-good-file"] ? JSON.parse(readFileSync(values["known-good-file"], "utf8")) : undefined,
          previouslyDeployed: !samePrevious ? undefined : previous?.stage === "Deployed" ? { deploymentId: previous.deployment?.servingDeploymentId, sha: previous.mergedSha } : previous?.previouslyDeployed };
        const output = { ...observation, stage: releaseStage(observation), checkedAt: new Date().toISOString(), blockers: reasons, checks: { ready: checks.ready, missing: checks.missingRequired }, health, automaticMerge: false, productionDeploymentRequested: false };
        if (values.evidence) {
          mkdirSync(directory, { recursive: true, mode: 0o700 });
          const receipt = `${Date.now()}-${randomUUID()}.json`;
          writeFileSync(join(directory, receipt), JSON.stringify(output, null, 2) + "\n", { mode: 0o600, flag: "wx" });
          writeFileSync(join(directory, "events.jsonl"), JSON.stringify({ stage: output.stage, checkedAt: output.checkedAt, receipt }) + "\n", { mode: 0o600, flag: "a" });
          atomicJSON(join(directory, "latest.json"), output);
        }
        console.log(JSON.stringify(output, null, 2));
        if (command === "merge-check" && !mergeApproved) process.exitCode = 1;
      }
    }
  }
} catch {
  console.error("Release inspection failed. Verify credentials, remote identity, full expected SHA and policy prerequisites. Details withheld; no merge/deploy was requested.");
  process.exitCode = 1;
} finally {
  if (locked) releaseLock(join(root, ".ai-collab/.lock"));
}
