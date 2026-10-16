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
export function afterCompleted(root, checkpoint, checks) {
  try {
    const config = configuration(root);
    const evidence = archiveCompleted(root, checkpoint, checks);
    if (config.enabled) pushCompleted({ root, config, evidence, checks, save: store(root) });
    return { ok: true, sha: evidence.sha, pushed: config.enabled };
  } catch (error) {
    // A release failure cannot turn a previously completed development task into BLOCKED.
    return { ok: false, error: error.message, nextAction: 'Inspect release-status; preserve development checkpoint' };
  }
}
export function releaseCommand(root, action) {
  const config = configuration(root);
  const git = gitRunner(root, config.timeoutMs);
  const sha = git('rev-parse', 'HEAD');
  const path = join(root, '.ai-collab/.runtime/releases', `${sha}.json`);
  const evidencePath = join(root, '.ai-collab/.runtime/completed', `${sha}.json`);
  if (action === 'release-status') {
    console.log(JSON.stringify({ enabled: config.enabled, releaseMode: config.releaseMode, localSha: sha, evidenceAvailable: existsSync(evidencePath), release: existsSync(path) ? read(path) : null, nextAction: !config.enabled ? 'Disabled; complete milestone review and activation gates' : 'release-push requires completed evidence at HEAD' }, null, 2));
    return;
  }
  if (action === 'doctor') {
    console.log(JSON.stringify({ branch: git('branch', '--show-current'), expectedBranch: config.developmentBranch, repository: config.repository, clean: !git('status', '--porcelain=v1'), enabled: config.enabled, releaseMode: config.releaseMode, completionEvidence: existsSync(evidencePath), githubApiCredentialAvailable: Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN), vercelCredentialAvailable: Boolean(process.env.VERCEL_TOKEN), branchProtection: 'requires live API verification in M4', productionBranchTracking: 'requires live Vercel verification in M2', productionReleaseImplemented: false }, null, 2));
    return;
  }
  if (action !== 'release-push') throw new Error('Unknown release command');
  if (!config.enabled) throw new Error('Release automation is disabled');
  const lock = join(root, '.ai-collab/.lock');
  acquireLock(lock, true);
  try {
    if (!existsSync(evidencePath)) throw new Error('No durable completed receipt at HEAD; legacy Markdown approval is insufficient');
    const checks = read(join(root, '.ai-collab/orchestrator.config.json')).checks;
    const result = pushCompleted({ root, config, evidence: read(evidencePath), checks, git, save: store(root) });
    console.log(JSON.stringify(result));
  } finally { releaseLock(lock); }
}
