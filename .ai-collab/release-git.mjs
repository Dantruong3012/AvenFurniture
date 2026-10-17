import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicJSON, assertNoSecrets, changes, digest, snapshot } from './orchestrator-core.mjs';

const shaPattern = /^[a-f0-9]{40}$/;
export function validateReleaseConfig(config) {
  if (typeof config.enabled !== 'boolean' || config.releaseMode !== 'manual' || config.remote !== 'origin' ||
    (config.developmentPushEnabled !== undefined && typeof config.developmentPushEnabled !== 'boolean') ||
    (config.developmentPushEnabled === true && config.developmentBranch !== 'dev/aven-autonomous-backlog') ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository) ||
    !/^dev\/[A-Za-z0-9_/-]+$/.test(config.developmentBranch) || config.productionBranch !== 'main' ||
    config.developmentBranch.includes('..') || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 300000 ||
    !Number.isInteger(config.maxOutgoingCommits) || config.maxOutgoingCommits < 1 || config.maxOutgoingCommits > 1000) throw new Error('Invalid or unsupported release policy');
  return config;
}
export function gitRunner(root, timeoutMs = 60000) {
  return (...args) => {
    const ownerPath = join(root, '.ai-collab/.lock/owner.json');
    const owner = existsSync(ownerPath) ? JSON.parse(readFileSync(ownerPath, 'utf8')) : null;
    const networkOperation = ['fetch', 'push', 'ls-remote'].includes(args[0]);
    if (networkOperation && owner?.pid === process.pid) atomicJSON(ownerPath, { ...owner, externalOperation: args[0] });
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    if (networkOperation && owner?.pid === process.pid && !result.error && !result.signal) atomicJSON(ownerPath, owner);
    // Never persist Git stderr: authentication helpers may include credential-bearing URLs.
    if (result.error || result.status !== 0) throw new Error(`Git ${args[0]} failed or timed out; inspect authentication and remote state`);
    return result.stdout.trimEnd();
  };
}
export function verifyCompleted(root, completed, checks, git = gitRunner(root)) {
  const c = completed;
  if (!c?.task?.id || !/^[a-z0-9][a-z0-9-]*$/.test(c.task.id) || c.status !== 'DONE' || c.phase !== 'COMMITTED' ||
    ![c.baseHead, c.commit, c.commitTree, c.metadataTree].every((value) => shaPattern.test(value ?? ''))) throw new Error('No verified completed task checkpoint');
  if (c.reviewReceipt?.agent !== 'antigravity' || c.reviewReceipt?.operation !== 'review' || c.reviewReceipt?.exitCode !== 0 || c.reviewReceipt?.result?.status !== 'APPROVED' ||
    !['codex', 'orchestrator'].includes(c.commitRequest?.agent) || c.commitRequest?.operation !== 'commit' || c.commitRequest?.exitCode !== 0 || c.commitRequest?.result?.status !== 'COMMIT_REQUESTED') throw new Error('Missing genuine coordinator review/commit receipts');
  if (!Array.isArray(c.checks) || !checks.length || c.checks.length !== checks.length || c.checks.some((check, index) => check.exitCode !== 0 || digest(check.command) !== digest(checks[index]))) throw new Error('Required independent checks did not pass');
  const request = JSON.parse(c.commitRequest.result.details);
  if (request.parent !== c.baseHead || request.tree !== c.commitTree || request.message !== c.title) throw new Error('Commit request does not match reviewed tree');
  if (!c.committedSnapshot || c.approvedDigest !== digest(c.committedSnapshot)) throw new Error('Reviewed snapshot is missing or stale');
  if (git('status', '--porcelain=v1')) throw new Error('Completed commit, metadata tree, or working tree changed');
  const head = git('rev-parse', 'HEAD');
  if (git('rev-parse', `${c.commit}^`) !== c.baseHead || git('rev-parse', `${c.commit}^{tree}`) !== c.commitTree) throw new Error('Completed commit, metadata tree, or working tree changed');
  let metaSha;
  try {
    if (git('rev-parse', `${head}^`) === c.commit && git('rev-parse', `${head}^{tree}`) === c.metadataTree) {
      metaSha = head;
    }
  } catch {}
  if (!metaSha) {
    try {
      if (git('merge-base', c.commit, head) !== c.commit) throw new Error();
      const children = git('rev-list', '--ancestry-path', '--reverse', `${c.commit}..${head}`).split('\n').filter(Boolean);
      const candidate = children[0];
      if (!candidate || git('rev-parse', `${candidate}^`) !== c.commit || git('rev-parse', `${candidate}^{tree}`) !== c.metadataTree) throw new Error();
      metaSha = candidate;
    } catch {
      throw new Error('Completed commit, metadata tree, or working tree changed');
    }
  }
  const metadata = ['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', `.ai-collab/tasks/${c.task.id}/IMPLEMENTATION.md`];
  if (git('diff', '--name-only', c.commit, metaSha).split('\n').filter(Boolean).some((path) => !metadata.includes(path))) throw new Error('Unreviewed source in metadata commit');
  if (metaSha === head && changes(c.committedSnapshot, snapshot(root)).some((path) => !metadata.includes(path))) throw new Error('Unreviewed source in metadata commit');
  const review = git('show', `${c.commit}:.ai-collab/tasks/${c.task.id}/REVIEW.md`);
  if (!/^Status: APPROVED$/m.test(review) || !/^Reviewer: Antigravity\b/m.test(review)) throw new Error('Committed Antigravity approval missing');
  return metaSha;
}
export function archiveCompleted(root, checkpoint, checks, git = gitRunner(root)) {
  const sha = verifyCompleted(root, checkpoint, checks, git);
  const directory = join(root, '.ai-collab/.runtime/completed');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${sha}.json`);
  const evidence = { version: 1, sha, checkpoint, checks };
  if (existsSync(path)) {
    if (digest(JSON.parse(readFileSync(path, 'utf8'))) !== digest(evidence)) throw new Error('Conflicting completed receipt; preserve both histories');
  } else atomicJSON(path, evidence);
  return evidence;
}
export function inspectGit(config, sha, git) {
  validateReleaseConfig(config);
  if (!shaPattern.test(sha) || git('rev-parse', 'HEAD') !== sha || git('branch', '--show-current') !== config.developmentBranch) throw new Error('Unexpected branch or release SHA');
  if (git('status', '--porcelain=v1') || git('diff', '--cached', '--name-only')) throw new Error('Release requires a clean working tree and index');
  const urls = [`https://github.com/${config.repository}.git`, `git@github.com:${config.repository}.git`];
  if (!urls.includes(git('remote', 'get-url', 'origin')) || !urls.includes(git('remote', 'get-url', '--push', '--all', 'origin'))) throw new Error('Incorrect origin repository or extra push URL');
  const settings = git('config', '--local', '--list');
  if (/^remote\.origin\.mirror=true$/m.test(settings)) throw new Error('Mirror remotes are forbidden');
}
export function scanOutgoing(base, sha, config, git) {
  const commits = git('rev-list', `${base}..${sha}`).split('\n').filter(Boolean);
  if (commits.length > config.maxOutgoingCommits) throw new Error('Outgoing history exceeds scan limit');
  const scanned = new Set();
  for (const commit of commits) {
    for (const entry of git('ls-tree', '-rz', commit).split('\0').filter(Boolean)) {
      const match = entry.match(/^\d+ (\w+) ([a-f0-9]{40})\t(.+)$/s);
      if (!match || match[1] !== 'blob') throw new Error('Unsupported outgoing Git object');
      const [, , oid, path] = match;
      if (/(^|\/)(\.env(?:\.|$)|credentials?(?:\.|\/|$)|\.runtime\/)|\.(pem|key|p12|pfx)$/i.test(path) && path !== '.env.example') throw new Error(`Sensitive outgoing path: ${path}`);
      const key = `${path}:${oid}`;
      if (scanned.has(key)) continue;
      scanned.add(key);
      if (Number(git('cat-file', '-s', oid)) > 5 * 1024 * 1024) throw new Error(`Outgoing blob exceeds scan limit: ${path}`);
      let content = git('cat-file', '-p', oid);
      // The sole existing non-secret test literal is explicitly scoped; arbitrary fixture labels are not exempted.
      if (path === 'tests/supabase-config.test.mjs') content = content.replaceAll('sb_secret_' + 'fixture_only', 'TEST_FIXTURE');
      assertNoSecrets(content, path);
      if (/github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s@]+@|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(content)) throw new Error(`Potential credential in ${path}; value withheld`);
    }
  }
  return { commits: commits.length, blobs: scanned.size };
}
function remoteSha(config, git, branch = config.developmentBranch) {
  const line = git('ls-remote', '--heads', 'origin', `refs/heads/${branch}`);
  if (!line) return null;
  const parts = line.split(/\s+/);
  if (parts.length !== 2 || !shaPattern.test(parts[0]) || parts[1] !== `refs/heads/${branch}`) throw new Error('Ambiguous remote branch response');
  return parts[0];
}
export function pushCompleted({ root, config, evidence, checks, git = gitRunner(root, config.timeoutMs), save, now = () => new Date().toISOString() }) {
  validateReleaseConfig(config);
  if (!config.enabled && !config.developmentPushEnabled) throw new Error('Development push is disabled');
  let state = { version: 1, stage: 'COMMITTED', sha: evidence?.sha, task: evidence?.checkpoint?.task?.id, remote: config.remote, remoteBranch: config.developmentBranch, policyDigest: digest(config), timestamp: now() };
  try {
    if (!evidence || evidence.version !== 1 || verifyCompleted(root, evidence.checkpoint, checks, git) !== evidence.sha) throw new Error('Invalid completion evidence');
    inspectGit(config, evidence.sha, git);
    git('fetch', '--no-tags', 'origin');
    const before = remoteSha(config, git);
    const base = before ?? remoteSha(config, git, config.productionBranch);
    if (!base || git('merge-base', base, evidence.sha) !== base) throw new Error('Remote divergence or missing trusted base');
    const scan = scanOutgoing(base, evidence.sha, config, git);
    inspectGit(config, evidence.sha, git); // Recheck after network/scan, before the external mutation.
    state = { ...state, stage: 'PUSHING', remoteBefore: before, scan, timestamp: now() };
    save(state); // Durable intent before the push; recovery always reconciles remote state.
    let pushFailed = false;
    if (before !== evidence.sha) {
      try { git('push', '--porcelain', '--no-follow-tags', 'origin', `${evidence.sha}:refs/heads/${config.developmentBranch}`); }
      catch { pushFailed = true; }
    }
    const remote = remoteSha(config, git);
    if (remote !== evidence.sha) throw new Error(pushFailed ? 'Push failed; remote SHA is not the intended revision' : 'Remote SHA verification failed');
    state = { ...state, stage: 'PUSHED', remoteSha: remote, timestamp: now(), reconciled: pushFailed || before === evidence.sha, nextAction: config.enabled ? 'Preview tracking requires milestone M2' : 'Development push verified; Production release remains disabled' };
    save(state);
    return state;
  } catch (error) {
    state = { ...state, stage: 'PUSH_FAILED', error: error.message, timestamp: now(), nextAction: 'Resolve the reported gate, then release-push the same SHA; do not force push' };
    save(state);
    throw error;
  }
}
