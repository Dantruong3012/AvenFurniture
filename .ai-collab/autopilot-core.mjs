import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function loadManagementCredentials(env = process.env, loader = process.loadEnvFile) {
  const target = env.AVEN_MANAGEMENT_ENV || join(homedir(), '.config/avenfurniture/management.env');
  if (existsSync(target) && typeof loader === 'function') {
    try {
      loader(target);
      return { loaded: true, path: target };
    } catch (err) {
      return { loaded: false, path: target, error: err.message };
    }
  }
  return { loaded: false, path: target };
}

const sha = /^[a-f0-9]{40}$/;
export function gitRead(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (result.error || result.status !== 0) throw new Error(`Git ${args[0]} inspection failed`);
  return result.stdout.trimEnd();
}
export function assessQueue({ checkpoint, tasks, blockedArtifacts = [], branch, expectedBranch, remoteMatches = true, credentialFileRisk = false, dirty, locked, roadmapApproved, quotaReady = false }) {
  if (!roadmapApproved) return { status: 'BLOCKED', reason: 'Roadmap approval is missing' };
  if (locked) return { status: 'BLOCKED', reason: 'Coordinator lock exists; inspect before starting another process' };
  if (checkpoint?.status === 'BLOCKED') return { status: 'BLOCKED', task: checkpoint.task?.id, reason: 'Architectural checkpoint requires an approved plan and supported recovery' };
  if (credentialFileRisk) return { status: 'BLOCKED', reason: 'Privileged credentials are readable inside the agent workspace; move management tokens outside this checkout' };
  if (!remoteMatches) return { status: 'BLOCKED', reason: 'Origin does not match the configured GitHub repository' };
  if (branch !== expectedBranch) return { status: 'BLOCKED', reason: 'Checkout is not the configured development branch' };
  if (checkpoint?.task && !['DONE', 'IDLE'].includes(checkpoint.status) && tasks.find((task) => task.id === checkpoint.task.id)?.scopeApproval !== 'APPROVED') return { status: 'BLOCKED', task: checkpoint.task.id, reason: 'Task scope approval is missing or withdrawn' };
  if (checkpoint?.status === 'PAUSED_QUOTA') {
    const retryAt = checkpoint.quota?.retryAt;
    if (quotaReady) return { status: 'RESUME', task: checkpoint.task?.id };
    if (!retryAt || !Number.isFinite(Date.parse(retryAt)) || Date.now() < Date.parse(retryAt)) return { status: 'PAUSED_QUOTA', task: checkpoint.task?.id, retryAt: retryAt ?? null };
    return { status: 'RESUME', task: checkpoint.task?.id };
  }
  if (blockedArtifacts.length) return { status: 'BLOCKED', task: blockedArtifacts[0], reason: 'Blocked task artifact requires explicit independent-task safety review' };
  // The coordinator validates every dirty path against the saved checkpoint
  // baseline and exact task ownership. A stopped implementation is normally dirty.
  if (checkpoint && ['STOPPED', 'RUNNING'].includes(checkpoint.status)) return { status: 'RESUME', task: checkpoint.task?.id };
  if (checkpoint && !['DONE', 'IDLE'].includes(checkpoint.status)) return { status: 'BLOCKED', task: checkpoint.task?.id, reason: 'Unknown checkpoint status; inspect before resuming' };
  if (dirty) return { status: 'BLOCKED', reason: 'Working tree or index is dirty; preserve existing work' };
  const eligible = tasks.filter((task) => task.scopeApproval === 'APPROVED' && ['READY', 'BACKLOG'].includes(task.status) && task.dependencies.every((id) => tasks.some((dep) => dep.id === id && dep.status === 'DONE')))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.lineNumber - b.lineNumber);
  if (eligible.length) return { status: 'RUN', task: eligible[0].id };
  if (tasks.every((task) => task.status === 'DONE')) return { status: 'COMPLETE' };
  return { status: 'BLOCKED', reason: 'No eligible task; inspect dependencies and approvals' };
}
export function inspectLocal(root, queue, config, quotaReady = false) {
  const branch = gitRead(root, 'branch', '--show-current');
  const origin = gitRead(root, 'remote', 'get-url', 'origin');
  const remoteMatches = [`https://github.com/${config.repository}.git`, `git@github.com:${config.repository}.git`].includes(origin);
  const head = gitRead(root, 'rev-parse', 'HEAD');
  if (!sha.test(head)) throw new Error('Unexpected Git HEAD');
  const dirty = Boolean(gitRead(root, 'status', '--porcelain=v1'));
  const worktrees = gitRead(root, 'worktree', 'list', '--porcelain').split('\n').filter((line) => line.startsWith('worktree ')).length;
  const environmentFile = join(root, '.env.local');
  const credentialFileRisk = existsSync(environmentFile) && readFileSync(environmentFile, 'utf8').split(/\r?\n/).some((line) => {
    const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    return name && name !== 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' && /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|ACCESS_KEY|PRIVATE_KEY|API_KEY|DATABASE_URL|CLOUDINARY_URL)/i.test(name);
  });
  const checkpointPath = join(root, '.ai-collab/.runtime/checkpoint.json');
  const checkpoint = existsSync(checkpointPath) ? JSON.parse(readFileSync(checkpointPath, 'utf8')) : null;
  const blockedArtifacts = queue.tasks.filter((task) => task.status === 'BLOCKED' || ['PLAN.md', 'IMPLEMENTATION.md', 'REVIEW.md'].some((name) => {
    const path = join(root, '.ai-collab/tasks', task.id, name);
    return existsSync(path) && /^Status: (?:BLOCKED|REVISED)$/m.test(readFileSync(path, 'utf8'));
  })).map((task) => task.id);
  const assessment = assessQueue({ checkpoint, tasks: queue.tasks, blockedArtifacts, branch, expectedBranch: config.developmentBranch, remoteMatches, credentialFileRisk, dirty, locked: existsSync(join(root, '.ai-collab/.lock')), roadmapApproved: /^Roadmap approval: APPROVED$/m.test(queue.content), quotaReady });
  return { branch, head, remoteMatches, credentialFileRisk, dirty, worktrees, checkpoint: checkpoint ? { task: checkpoint.task?.id ?? null, status: checkpoint.status, phase: checkpoint.phase } : null, ...assessment };
}
export function orchestratorArgs(local, quotaReady = false) {
  if (local.status === 'RESUME') return local.checkpoint?.status === 'PAUSED_QUOTA' && quotaReady ? ['resume', '--quota-ready'] : ['resume'];
  if (local.status === 'RUN' || local.status === 'COMPLETE') return ['run'];
  throw new Error('Coordinator invocation requires RUN or RESUME preflight');
}
export function assessAgentQuota(receipt, quotaReady = false, now = Date.now(), smokeProof = null, runnerDigest = null) {
  if (!receipt || receipt.kind !== 'RESOURCE_EXHAUSTED') return null;
  const reset = receipt.retryAt ? Date.parse(receipt.retryAt) : NaN;
  if (quotaReady || Number.isFinite(reset) && now >= reset) return null;
  const observed = receipt.observedAt ? Date.parse(receipt.observedAt) : NaN;
  const verified = smokeProof?.verifiedAt ? Date.parse(smokeProof.verifiedAt) : NaN;
  if (smokeProof?.realCliFixture === true && smokeProof.runnerDigest === runnerDigest &&
    typeof runnerDigest === 'string' && runnerDigest.length > 0 &&
    Number.isFinite(observed) && Number.isFinite(verified) &&
    verified > observed && verified <= now) return null;
  return { status: 'PAUSED_QUOTA', retryAt: Number.isFinite(reset) ? receipt.retryAt : null };
}
async function getJson(url, token, fetcher, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(url, { headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'User-Agent': 'AvenFurniture-autopilot-readonly' }, signal: AbortSignal.timeout(8000) });
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        const seconds = Number(response.headers?.get?.('retry-after'));
        if (response.status === 429 && Number.isFinite(seconds) && seconds > 2) return { status: 429, body: null };
        const delay = response.status === 429 && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return { status: response.status, body: response.ok ? await response.json() : null };
    } catch {
      if (attempt + 1 === attempts) return { status: 'NETWORK_ERROR', body: null };
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  return { status: 'NETWORK_ERROR', body: null };
}
export async function inspectRights(config, env = process.env, fetcher = fetch) {
  const vercel = env.VERCEL_TOKEN ? await getJson(`https://api.vercel.com/v9/projects/${config.vercelProjectId}?teamId=${config.vercelTeamId}`, env.VERCEL_TOKEN, fetcher) : { status: 'MISSING_TOKEN' };
  const supabase = env.SUPABASE_ACCESS_TOKEN
    ? await getJson(`https://api.supabase.com/v1/projects/${encodeURIComponent(config.supabaseProjectRef)}`, env.SUPABASE_ACCESS_TOKEN, fetcher)
    : { status: 'MISSING_TOKEN' };
  const github = await getJson(`https://api.github.com/repos/${config.repository}/branches/${config.productionBranch}`, env.GH_TOKEN || env.GITHUB_TOKEN, fetcher);
  const supabaseDiagnostic = supabase.status === 401
    ? 'Supabase rejected the token; verify that it is valid and not expired.'
    : supabase.status === 403
      ? 'Supabase denied access to this project. The project-specific endpoint was reached; check the token permissions and whether its resource scope includes the configured project.'
      : supabase.status === 404
        ? 'Supabase did not find this project for the token; verify the configured project ref and token resource scope.'
        : supabase.status === 'NETWORK_ERROR'
          ? 'Supabase could not be reached after retries; check network connectivity and try again.'
          : null;
  return {
    vercel: { readStatus: vercel.status, projectMatch: vercel.body?.id === config.vercelProjectId, productionBranchMatch: vercel.body?.link?.productionBranch === config.productionBranch },
    supabase: { readStatus: supabase.status, projectMatch: supabase.body?.id === config.supabaseProjectRef, ...(supabaseDiagnostic ? { diagnostic: supabaseDiagnostic } : {}) },
    github: { readStatus: github.status, authenticated: github.status === 200 && Boolean(env.GH_TOKEN || env.GITHUB_TOKEN), mainProtected: github.body?.protected === true },
  };
}
export function releasePrerequisites(rights) {
  return rights.vercel.readStatus === 200 && rights.vercel.projectMatch && rights.vercel.productionBranchMatch &&
    rights.supabase.readStatus === 200 && rights.supabase.projectMatch &&
    rights.github.readStatus === 200 && rights.github.authenticated && rights.github.mainProtected;
}
