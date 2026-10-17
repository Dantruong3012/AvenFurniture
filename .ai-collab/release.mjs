import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquireLock, atomicJSON, releaseLock } from './orchestrator-core.mjs';
import { archiveCompleted, gitRunner, pushCompleted, validateReleaseConfig } from './release-git.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
function configuration(root) { return validateReleaseConfig(read(join(root, '.ai-collab/release.config.json'))); }
function store(root) {
  const dir = join(root, '.ai-collab/.runtime/releases');
  return (state) => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!/^[a-f0-9]{40}$/.test(state.sha ?? '')) throw new Error('Release state lacks an exact SHA');
    writeFileSync(join(dir, `${state.sha}.events.jsonl`), `${JSON.stringify(state)}\n`, { flag: 'a', mode: 0o600 });
    atomicJSON(join(dir, `${state.sha}.json`), state);
  };
}
// Called by the coordinator only after its verified task and metadata commits, while holding the shared lock.
export async function afterCompleted(root, checkpoint, checks, options = {}) {
  try {
    const config = configuration(root);
    const evidence = archiveCompleted(root, checkpoint, checks, options.git);
    if (!config.enabled && !config.developmentPushEnabled) return { ok: true, sha: evidence.sha, pushed: false };
    const git = options.git ?? gitRunner(root, config.timeoutMs);
    const releasePath = join(root, '.ai-collab/.runtime/releases', `${evidence.sha}.json`);
    if (existsSync(releasePath)) {
      const release = JSON.parse(readFileSync(releasePath, 'utf8'));
      if (release.sha === evidence.sha) {
        const head = git('rev-parse', 'HEAD');
        if (git('merge-base', evidence.sha, head) === evidence.sha) {
          if (!config.enabled && release.stage === 'PUSHED') {
            return { ok: true, sha: evidence.sha, pushed: true, remoteBranch: release.remoteBranch, remoteSha: release.remoteSha, productionDeployment: false, automaticMerge: false };
          }
          if (config.enabled && release.stage === 'PREVIEW_READY') {
            return { ok: true, sha: evidence.sha, pushed: true, preview: release.stage, deploymentId: release.deploymentId };
          }
        }
      }
    }
    const save = options.save ?? store(root);
    if (!config.enabled) {
      const pushed = pushCompleted({ root, config, evidence, checks, git: options.git, save });
      return { ok: true, sha: evidence.sha, pushed: true, remoteBranch: pushed.remoteBranch, remoteSha: pushed.remoteSha, productionDeployment: false, automaticMerge: false };
    }
    const token = options.token ?? process.env.VERCEL_TOKEN;
    if (!token) throw new Error('Vercel credential unavailable for Preview verification');
    const { createVercelClient } = await import('./release-vercel.mjs');
    const client = options.client ?? createVercelClient({ token, projectId: config.vercelProjectId,
      teamId: config.vercelTeamId, timeoutMs: config.timeoutMs });
    const pushed = await preflightAndPush({ root, config, evidence, checks, git: options.git, save, client });
    const ready = await trackPreview({ config, pushed, token, save, client });
    return { ok: true, sha: evidence.sha, pushed: true, preview: ready.stage, deploymentId: ready.deploymentId };
  } catch (error) {
    // A release failure cannot turn a previously completed development task into BLOCKED.
    return { ok: false, error: error.message, nextAction: 'Inspect release-status; preserve development checkpoint' };
  }
}
export async function trackPreview({ config, pushed, token, save, client }) {
  const { createVercelClient, validateVercelConfig } = await import('./release-vercel.mjs');
  validateVercelConfig(config);
  if (pushed?.stage !== 'PUSHED' || pushed.remoteSha !== pushed.sha || !/^[a-f0-9]{40}$/.test(pushed.sha ?? '')) {
    throw new Error('Preview tracking requires an exact verified pushed SHA');
  }
  const branch = config.developmentBranch;
  const api = client ?? createVercelClient({ token, projectId: config.vercelProjectId,
    teamId: config.vercelTeamId, timeoutMs: config.timeoutMs });
  const deploying = { ...pushed, stage: 'PREVIEW_DEPLOYING', projectId: config.vercelProjectId,
    branch, timestamp: new Date().toISOString(), nextAction: 'Wait for exact Git-triggered Preview deployment' };
  save(deploying);
  try {
    const ready = await api.findAndWaitForPreview(pushed.sha, branch, {
      timeoutMs: config.previewTimeoutMs, pollIntervalMs: config.previewPollIntervalMs });
    if (ready.stage !== 'PREVIEW_READY' || ready.sha !== pushed.sha || ready.projectId !== config.vercelProjectId || ready.branch !== branch) {
      throw new Error('Preview verification did not match the release identity');
    }
    const result = { ...deploying, stage: 'PREVIEW_READY', deploymentId: ready.deploymentId,
      deploymentUrl: ready.url, timestamp: new Date().toISOString(), nextAction: 'M3 read-only Preview E2E is required' };
    save(result);
    return result;
  } catch {
    save({ ...deploying, stage: 'DEPLOY_FAILED', error: 'Preview verification failed; inspect Vercel deployment by exact SHA',
      timestamp: new Date().toISOString(), nextAction: 'Inspect deployment and retry after resolving the cause' });
    throw new Error('Preview verification failed; inspect Vercel deployment by exact SHA');
  }
}
export async function preflightAndPush({ root, config, evidence, checks, git, save, client }) {
  const { validateVercelConfig } = await import('./release-vercel.mjs');
  validateVercelConfig(config);
  await client.verifyProjectConfiguration(config.productionBranch);
  return pushCompleted({ root, config, evidence, checks, git, save });
}
export async function releaseCommand(root, action) {
  const config = configuration(root);
  const git = gitRunner(root, config.timeoutMs);
  const sha = git('rev-parse', 'HEAD');
  const path = join(root, '.ai-collab/.runtime/releases', `${sha}.json`);
  const evidencePath = join(root, '.ai-collab/.runtime/completed', `${sha}.json`);
  if (action === 'release-status') {
    console.log(JSON.stringify({ enabled: config.enabled, developmentPushEnabled: config.developmentPushEnabled === true, releaseMode: config.releaseMode, localSha: sha, evidenceAvailable: existsSync(evidencePath), release: existsSync(path) ? read(path) : null, nextAction: !config.enabled && !config.developmentPushEnabled ? 'Disabled; complete milestone review and activation gates' : 'release-push requires completed evidence at HEAD' }, null, 2));
    return;
  }
  if (action === 'doctor') {
    console.log(JSON.stringify({ branch: git('branch', '--show-current'), expectedBranch: config.developmentBranch, repository: config.repository, clean: !git('status', '--porcelain=v1'), enabled: config.enabled, developmentPushEnabled: config.developmentPushEnabled === true, releaseMode: config.releaseMode, completionEvidence: existsSync(evidencePath), githubApiCredentialAvailable: Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN), vercelCredentialAvailable: Boolean(process.env.VERCEL_TOKEN), branchProtection: 'requires live API verification in M4', productionBranchTracking: 'requires live Vercel verification in M2', productionReleaseImplemented: false }, null, 2));
    return;
  }
  if (action !== 'release-push') throw new Error('Unknown release command');
  if (!config.enabled && !config.developmentPushEnabled) throw new Error('Development push is disabled');
  const lock = join(root, '.ai-collab/.lock');
  acquireLock(lock, true);
  try {
    if (!existsSync(evidencePath)) throw new Error('No durable completed receipt at HEAD; legacy Markdown approval is insufficient');
    const checks = read(join(root, '.ai-collab/orchestrator.config.json')).checks;
    const save = store(root);
    if (!config.enabled) {
      console.log(JSON.stringify(pushCompleted({ root, config, evidence: read(evidencePath), checks, git, save })));
      return;
    }
    if (!process.env.VERCEL_TOKEN) throw new Error('Vercel credential unavailable for Preview verification');
    const { createVercelClient } = await import('./release-vercel.mjs');
    const client = createVercelClient({ token: process.env.VERCEL_TOKEN, projectId: config.vercelProjectId,
      teamId: config.vercelTeamId, timeoutMs: config.timeoutMs });
    const result = await preflightAndPush({ root, config, evidence: read(evidencePath), checks, git, save, client });
    console.log(JSON.stringify(await trackPreview({ config, pushed: result, token: process.env.VERCEL_TOKEN, save, client })));
  } finally { releaseLock(lock); }
}
