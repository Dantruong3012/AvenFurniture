import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { archiveCompleted, gitRunner, pushCompleted, verifyCompleted, scanOutgoing } from './release-git.mjs';
import { afterCompleted, preflightAndPush, trackPreview } from './release.mjs';
import { createVercelClient, validateVercelConfig } from './release-vercel.mjs';
import { acquireLock, digest, releaseLock, snapshot } from './orchestrator-core.mjs';

const checks = [['node', 'verify.mjs']];
const policy = { enabled: true, releaseMode: 'manual', repository: 'Fixture/AvenFurniture', remote: 'origin', developmentBranch: 'dev/aven-autonomous-backlog', productionBranch: 'main', timeoutMs: 5000, maxOutgoingCommits: 100 };
const vercelPolicy = { ...policy, vercelProjectId: 'prj_fixture123', vercelTeamId: 'team_fixture123', previewTimeoutMs: 3000, previewPollIntervalMs: 100 };
const previewSha = 'a'.repeat(40);
const previewId = 'dpl_fixture123';
const previewBranch = policy.developmentBranch;
const preview = (readyState = 'READY', overrides = {}) => ({ id: previewId, projectId: vercelPolicy.vercelProjectId,
  target: 'preview', source: 'git', readyState, meta: { githubCommitSha: previewSha, githubCommitRef: previewBranch },
  url: 'aven-fixture.vercel.app', ...overrides });
const apiResponse = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => body });
function previewApi({ list = [preview()], detail = [preview()], projectBranch = 'main', onCall } = {}) {
  let nowMs = 0, details = 0;
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    onCall?.(url, options, requests.length);
    if (url.pathname.startsWith('/v9/projects/')) return apiResponse({ id: vercelPolicy.vercelProjectId, link: { type: 'github', productionBranch: projectBranch } });
    if (url.pathname === '/v7/deployments') return apiResponse({ deployments: list });
    if (url.pathname.startsWith('/v13/deployments/')) return apiResponse(detail[Math.min(details++, detail.length - 1)]);
    throw new Error('Unexpected Vercel endpoint');
  };
  const client = createVercelClient({ token: 'fixture-token', projectId: vercelPolicy.vercelProjectId,
    teamId: vercelPolicy.vercelTeamId, timeoutMs: 5000, fetchImpl,
    now: () => nowMs, sleep: async (ms) => { nowMs += ms; } });
  return { client, requests };
}
test('Preview policy requires exact project and bounded polling', () => {
  assert.equal(validateVercelConfig(vercelPolicy), vercelPolicy);
  assert.throws(() => validateVercelConfig({ ...vercelPolicy, vercelProjectId: '' }));
  assert.throws(() => validateVercelConfig({ ...vercelPolicy, previewTimeoutMs: Infinity }));
});
test('Vercel project branch and Preview identity are independently checked', async () => {
  const f = previewApi();
  assert.deepEqual(await f.client.verifyProjectConfiguration(), { projectId: vercelPolicy.vercelProjectId, productionBranch: 'main' });
  assert.equal((await f.client.getDeploymentByCommit(previewSha, previewBranch)).id, previewId);
  const listUrl = f.requests.find(({ url }) => url.pathname === '/v7/deployments').url;
  assert.equal(listUrl.searchParams.get('sha'), previewSha);
  assert.equal(listUrl.searchParams.get('branch'), previewBranch);
  assert.equal(listUrl.searchParams.get('target'), 'preview');
  assert.equal(listUrl.searchParams.get('teamId'), vercelPolicy.vercelTeamId);
  assert.ok(f.requests.every(({ options }) => options.method === 'GET'));
  await assert.rejects(previewApi({ projectBranch: 'dev' }).client.verifyProjectConfiguration(), /Production Branch/);
  for (const wrong of [{ meta: { githubCommitSha: 'b'.repeat(40), githubCommitRef: previewBranch } },
    { meta: { githubCommitSha: previewSha, githubCommitRef: 'other' } }, { target: 'production' },
    { target: 'staging' }, { customEnvironment: { id: 'env_fixture' } }, { source: 'cli' },
    { projectId: 'prj_other' }]) {
    assert.equal(await previewApi({ list: [preview('READY', wrong)] }).client.getDeploymentByCommit(previewSha, previewBranch), null);
    await assert.rejects(previewApi({ detail: [preview('READY', wrong)] }).client.waitForDeploymentReady(previewId,
      { sha: previewSha, branch: previewBranch, timeoutMs: 3000, pollIntervalMs: 100 }), /identity changed/);
  }
});
test('real Vercel Git Preview shape uses null target and uid in list; Production remains rejected', async () => {
  const list = [preview('ERROR', { id: undefined, uid: previewId, target: null })];
  const detail = [preview('ERROR', { target: null })];
  const f = previewApi({ list, detail });
  assert.equal((await f.client.getDeploymentByCommit(previewSha, previewBranch)).id, previewId);
  await assert.rejects(f.client.waitForDeploymentReady(previewId,
    { sha: previewSha, branch: previewBranch, timeoutMs: 3000, pollIntervalMs: 100 }), /ERROR/);
  assert.equal(await previewApi({ list: [preview('READY', { target: 'production' })] }).client.getDeploymentByCommit(previewSha, previewBranch), null);
});
test('Preview polling handles READY, ERROR, CANCELED, and timeout without deployment writes', async () => {
  const f = previewApi({ detail: [preview('BUILDING'), preview('READY')] });
  assert.equal((await f.client.findAndWaitForPreview(previewSha, previewBranch,
    { timeoutMs: 3000, pollIntervalMs: 100 })).stage, 'PREVIEW_READY');
  for (const state of ['ERROR', 'CANCELED', 'BLOCKED']) {
    await assert.rejects(previewApi({ detail: [preview(state)] }).client.waitForDeploymentReady(previewId,
      { sha: previewSha, branch: previewBranch, timeoutMs: 3000, pollIntervalMs: 100 }), new RegExp(state));
  }
  await assert.rejects(previewApi({ detail: [preview('BUILDING')] }).client.waitForDeploymentReady(previewId,
    { sha: previewSha, branch: previewBranch, timeoutMs: 1000, pollIntervalMs: 100 }), /timed out/);
});
test('HTTP 429 honors Retry-After and never exposes token or response body', async () => {
  let nowMs = 0, calls = 0;
  const fetchImpl = async () => ++calls === 1
    ? apiResponse({ secret: 'fixture-token' }, 429, { 'retry-after': '2' })
    : apiResponse({ id: vercelPolicy.vercelProjectId, link: { type: 'github', productionBranch: 'main' } });
  const client = createVercelClient({ token: 'fixture-token', projectId: vercelPolicy.vercelProjectId,
    timeoutMs: 5000, fetchImpl, now: () => nowMs, sleep: async (ms) => { nowMs += ms; } });
  assert.equal((await client.verifyProjectConfiguration()).productionBranch, 'main');
  assert.equal(nowMs, 2000);
  assert.equal(calls, 2);
  const failure = createVercelClient({ token: 'fixture-token', projectId: vercelPolicy.vercelProjectId,
    timeoutMs: 5000, fetchImpl: async () => apiResponse({ secret: 'fixture-token' }, 403) });
  await assert.rejects(failure.verifyProjectConfiguration(), (error) => !error.message.includes('fixture-token') && /HTTP 403/.test(error.message));
});
test('release Preview transition persists intent, exact READY proof, and sanitized failure', async () => {
  const states = [];
  const pushed = { stage: 'PUSHED', sha: previewSha, remoteSha: previewSha, task: 'fixture' };
  const result = await trackPreview({ config: vercelPolicy, pushed, client: previewApi().client,
    save: (state) => states.push(structuredClone(state)) });
  assert.equal(result.stage, 'PREVIEW_READY');
  assert.deepEqual(states.map((state) => state.stage), ['PREVIEW_DEPLOYING', 'PREVIEW_READY']);
  await assert.rejects(trackPreview({ config: vercelPolicy, pushed, client: previewApi({ detail: [preview('ERROR')] }).client,
    save: (state) => states.push(structuredClone(state)) }), /Preview verification failed/);
  assert.equal(states.at(-1).stage, 'DEPLOY_FAILED');
  assert.ok(!JSON.stringify(states).includes('fixture-token'));
  await assert.rejects(trackPreview({ config: vercelPolicy, pushed: { ...pushed, remoteSha: 'b'.repeat(40) },
    client: previewApi().client, save: () => {} }), /verified pushed SHA/);
});
test('secret scanner implementation does not trip its own outgoing scan', () => {
  const content = readFileSync(new URL('./release-git.mjs', import.meta.url), 'utf8');
  const oid = 'a'.repeat(40);
  const git = (...args) => {
    if (args[0] === 'rev-list') return oid;
    if (args[0] === 'ls-tree') return `100644 blob ${oid}\t.ai-collab/release-git.mjs\0`;
    if (args[1] === '-s') return String(Buffer.byteLength(content));
    if (args[1] === '-p') return content;
    throw new Error('Unexpected scanner operation');
  };
  assert.deepEqual(scanOutgoing('base', 'head', policy, git), { commits: 1, blobs: 1 });
});
for (const scenario of ['existing-fixture', 'wrong-path', 'arbitrary-secret']) test(`fixture exemption is exact: ${scenario}`, () => {
  const path = scenario === 'wrong-path' ? 'application.js' : 'tests/supabase-config.test.mjs';
  const content = scenario === 'arbitrary-secret' ? 'sb_secret_' + 'x'.repeat(32) : readFileSync(new URL('../tests/supabase-config.test.mjs', import.meta.url), 'utf8');
  const oid = 'a'.repeat(40);
  const git = (...args) => {
    if (args[0] === 'rev-list') return oid;
    if (args[0] === 'ls-tree') return `100644 blob ${oid}\t${path}\0`;
    if (args[1] === '-s') return String(Buffer.byteLength(content));
    if (args[1] === '-p') return content;
    throw new Error('Unexpected scanner operation');
  };
  if (scenario === 'existing-fixture') assert.deepEqual(scanOutgoing('base', 'head', policy, git), { commits: 1, blobs: 1 });
  else assert.throws(() => scanOutgoing('base', 'head', policy, git), /Potential secret/);
});
function fixture(releaseConfig = { ...policy, enabled: false }) {
  const dir = mkdtempSync(join(tmpdir(), 'aven-release-test-'));
  const root = join(dir, 'work'), remote = join(dir, 'remote.git'); mkdirSync(root);
  const init = (args, cwd = root) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  init(['init', '--bare', '-q', remote]); init(['init', '-q', '-b', 'main']);
  init(['config', 'user.name', 'Fixture']); init(['config', 'user.email', 'fixture@example.com']);
  mkdirSync(join(root, '.ai-collab/tasks/task1'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai-collab/.runtime/\n.ai-collab/.lock/\n');
  writeFileSync(join(root, '.ai-collab/release.config.json'), JSON.stringify(releaseConfig));
  writeFileSync(join(root, 'source.js'), 'baseline\n');
  init(['add', '.']); init(['commit', '-qm', 'baseline']); init(['remote', 'add', 'origin', remote]); init(['push', '-q', 'origin', 'main']);
  const realGit = gitRunner(root, 5000), baseHead = realGit('rev-parse', 'HEAD');
  init(['checkout', '-qb', policy.developmentBranch]);
  writeFileSync(join(root, 'source.js'), 'reviewed implementation\n');
  writeFileSync(join(root, '.ai-collab/tasks/task1/REVIEW.md'), 'Status: APPROVED\nReviewer: Antigravity CLI\n');
  init(['add', '.']); init(['commit', '-qm', 'feat(task1): implementation']);
  const commit = realGit('rev-parse', 'HEAD'), commitTree = realGit('rev-parse', 'HEAD^{tree}'), committedSnapshot = snapshot(root);
  writeFileSync(join(root, '.ai-collab/STATE.md'), 'completed metadata\n');
  init(['add', '.']); init(['commit', '-qm', 'docs: completed metadata']);
  const sha = realGit('rev-parse', 'HEAD');
  const checkpoint = { task: { id: 'task1' }, status: 'DONE', phase: 'COMMITTED', baseHead, commit, commitTree, metadataTree: realGit('rev-parse', 'HEAD^{tree}'), committedSnapshot, approvedDigest: digest(committedSnapshot), title: 'feat(task1): implementation', checks: checks.map(command => ({ command, exitCode: 0 })), reviewReceipt: { agent: 'antigravity', operation: 'review', exitCode: 0, result: { status: 'APPROVED' } }, commitRequest: { agent: 'codex', operation: 'commit', exitCode: 0, result: { status: 'COMMIT_REQUESTED', details: JSON.stringify({ parent: baseHead, tree: commitTree, message: 'feat(task1): implementation' }) } } };
  const calls = [], states = [];
  // Only the remote URL is mapped in the fixture; pushes and SHA reconciliation use a real bare Git repository.
  const git = (...args) => { calls.push(args); if (args[0] === 'remote' && args[1] === 'get-url') return `https://github.com/${policy.repository}.git`; return realGit(...args); };
  const evidence = archiveCompleted(root, checkpoint, checks, git);
  return { dir, root, remote, git, realGit, calls, states, checkpoint, evidence, sha, options: { root, config: policy, evidence, checks, git, save: state => states.push(structuredClone(state)) }, cleanup: () => rmSync(dir, { recursive: true }) };
}
test('approved completed task pushes exact SHA and reconciles a repeated push without duplication', () => {
  const f = fixture(); try {
    assert.equal(pushCompleted(f.options).stage, 'PUSHED');
    assert.match(f.realGit('ls-remote', '--heads', 'origin', policy.developmentBranch), new RegExp(f.sha));
    assert.equal(f.calls.filter(args => args[0] === 'push').length, 1);
    assert.equal(pushCompleted(f.options).reconciled, true);
    assert.equal(f.calls.filter(args => args[0] === 'push').length, 1);
    assert.equal(f.realGit('status', '--porcelain'), '');
    assert.ok(f.states.some(state => state.stage === 'PUSHING'));
  } finally { f.cleanup(); }
});
test('Vercel Production Branch mismatch prevents any Git push', async () => {
  const f = fixture(); try {
    await assert.rejects(preflightAndPush({ ...f.options, config: vercelPolicy,
      client: previewApi({ projectBranch: previewBranch }).client }), /Production Branch/);
    assert.equal(f.calls.filter(args => args[0] === 'push').length, 0);
    assert.equal(f.realGit('ls-remote', '--heads', 'origin', policy.developmentBranch), '');
  } finally { f.cleanup(); }
});
for (const scenario of ['wrong-remote', 'wrong-branch', 'dirty', 'staged', 'failed-check', 'unapproved', 'disabled']) test(`push rejects ${scenario} without mutation`, () => {
  const f = fixture(); try {
    if (scenario === 'wrong-remote') f.options.git = (...args) => args[0] === 'remote' ? 'https://github.com/Wrong/repo.git' : f.git(...args);
    if (scenario === 'wrong-branch') f.realGit('checkout', '-b', 'other');
    if (scenario === 'dirty' || scenario === 'staged') { writeFileSync(join(f.root, 'source.js'), 'keep changes\n'); if (scenario === 'staged') f.realGit('add', 'source.js'); }
    if (scenario === 'failed-check') f.evidence.checkpoint.checks[0].exitCode = 1;
    if (scenario === 'unapproved') f.evidence.checkpoint.reviewReceipt.result.status = 'CHANGES_REQUESTED';
    if (scenario === 'disabled') f.options.config = { ...policy, enabled: false };
    assert.throws(() => pushCompleted(f.options));
    assert.equal(f.calls.filter(args => args[0] === 'push').length, 0);
    assert.equal(f.realGit('ls-remote', '--heads', 'origin', policy.developmentBranch), '');
  } finally { f.cleanup(); }
});
test('remote divergence is rejected without rewriting history', () => {
  const f = fixture(); try {
    f.realGit('push', 'origin', `main:refs/heads/${policy.developmentBranch}`);
    const conflicting = f.realGit('commit-tree', `${f.sha}^{tree}`, '-p', f.checkpoint.baseHead, '-m', 'contributor change');
    f.realGit('push', 'origin', `${conflicting}:refs/heads/${policy.developmentBranch}`);
    assert.throws(() => pushCompleted(f.options), /divergence/);
    assert.equal(f.calls.filter(args => args[0] === 'push').length, 0);
    assert.match(f.realGit('ls-remote', '--heads', 'origin', policy.developmentBranch), new RegExp(conflicting));
  } finally { f.cleanup(); }
});
test('push failure saves failure state; ambiguous success is reconciled from the remote', () => {
  const f = fixture(); try {
    f.options.git = (...args) => { if (args[0] === 'push') throw new Error('simulated transport failure'); return f.git(...args); };
    assert.throws(() => pushCompleted(f.options), /Push failed/);
    assert.equal(f.states.at(-1).stage, 'PUSH_FAILED');
    f.options.git = (...args) => { const result = f.git(...args); if (args[0] === 'push') throw new Error('lost response after success'); return result; };
    const result = pushCompleted(f.options); assert.equal(result.stage, 'PUSHED'); assert.equal(result.reconciled, true);
  } finally { f.cleanup(); }
});
test('interruption after PUSHING can resume using durable intent and exact remote SHA', () => {
  const f = fixture(); try {
    f.options.save = state => { f.states.push(state); if (state.stage === 'PUSHED') throw new Error('interrupted before completion receipt'); };
    assert.throws(() => pushCompleted(f.options));
    f.options.save = state => f.states.push(state);
    assert.equal(pushCompleted(f.options).stage, 'PUSHED');
    assert.equal(f.calls.filter(args => args[0] === 'push').length, 1);
  } finally { f.cleanup(); }
});
test('outgoing scan rejects secrets from historical commits, without logging credential values', () => {
  const f = fixture(); try {
    const secret = 'sb_secret_' + 'x'.repeat(32);
    const git = (...args) => args[0] === 'cat-file' && args[1] === '-p' ? secret : f.git(...args);
    assert.throws(() => pushCompleted({ ...f.options, git }), error => { assert.ok(!error.message.includes(secret)); return /Potential secret/.test(error.message); });
    assert.equal(f.calls.filter(args => args[0] === 'push').length, 0);
  } finally { f.cleanup(); }
});
test('completion archive is immutable and legacy/incomplete checkpoint cannot authorize push', async () => {
  const f = fixture(); try {
    const path = join(f.root, '.ai-collab/.runtime/completed', `${f.sha}.json`);
    const before = readFileSync(path, 'utf8'); archiveCompleted(f.root, f.checkpoint, checks, f.git);
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.throws(() => verifyCompleted(f.root, { status: 'DONE' }, checks, f.git));
    assert.equal((await afterCompleted(f.root, { status: 'BLOCKED' }, checks)).ok, false);
    assert.equal(existsSync(join(f.root, '.ai-collab/.runtime/checkpoint.json')), false);
  } finally { f.cleanup(); }
});
test('dev-only handoff pushes and verifies exact remote SHA without Vercel or Production release', async () => {
  const f = fixture({ ...policy, enabled: false, developmentPushEnabled: true });
  try {
    const result = await afterCompleted(f.root, f.checkpoint, checks, { git: f.git });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.pushed, true);
    assert.equal(result.remoteBranch, policy.developmentBranch);
    assert.equal(result.remoteSha, f.sha);
    assert.equal(result.productionDeployment, false);
    assert.equal(result.automaticMerge, false);
    assert.equal(f.realGit('ls-remote', '--heads', 'origin', policy.developmentBranch).split(/\s+/)[0], f.sha);
    const receipt = JSON.parse(readFileSync(join(f.root, '.ai-collab/.runtime/releases', `${f.sha}.json`), 'utf8'));
    assert.equal(receipt.stage, 'PUSHED');
    assert.equal(receipt.remote, 'origin');
    assert.equal(receipt.remoteBranch, policy.developmentBranch);
    assert.equal(receipt.remoteSha, f.sha);
    assert.equal(f.states.length, 0);
  } finally { f.cleanup(); }
});
test('dev-only push policy rejects any other target branch and missing completion approval', () => {
  const f = fixture({ ...policy, enabled: false, developmentPushEnabled: true });
  try {
    assert.throws(() => pushCompleted({ ...f.options, config: { ...f.options.config, developmentPushEnabled: true, developmentBranch: 'dev/other' } }), /Invalid or unsupported release policy/);
    assert.throws(() => pushCompleted({ ...f.options, evidence: { ...f.options.evidence, checkpoint: { ...f.checkpoint, reviewReceipt: null } } }), /Invalid completion evidence|Missing genuine/);
    assert.equal(f.realGit('ls-remote', '--heads', 'origin', policy.developmentBranch), '');
  } finally { f.cleanup(); }
});
test('automatic coordinator handoff awaits Preview before returning success', async () => {
  const f = fixture({ ...vercelPolicy, enabled: true }); try {
    const lock = join(f.root, '.ai-collab/.lock');
    acquireLock(lock, true);
    let enteredResolve, finishResolve;
    const entered = new Promise((resolve) => { enteredResolve = resolve; });
    const finish = new Promise((resolve) => { finishResolve = resolve; });
    const client = { verifyProjectConfiguration: async () => ({ productionBranch: 'main' }),
      findAndWaitForPreview: async (sha, branch) => { enteredResolve(); await finish; return { stage: 'PREVIEW_READY', sha,
        branch, projectId: vercelPolicy.vercelProjectId, deploymentId: previewId, url: 'aven-fixture.vercel.app' }; } };
    const pending = afterCompleted(f.root, f.checkpoint, checks, { token: 'fixture-token', git: f.git,
      client, save: (state) => f.states.push(structuredClone(state)) });
    let timer;
    try { await Promise.race([entered, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Preview phase was not reached')), 2000); })]); }
    finally { clearTimeout(timer); }
    assert.ok(existsSync(join(lock, 'owner.json')));
    assert.equal(f.states.at(-1).stage, 'PREVIEW_DEPLOYING');
    finishResolve();
    const result = await pending;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.preview, 'PREVIEW_READY');
    assert.equal(f.realGit('ls-remote', '--heads', 'origin', policy.developmentBranch).split(/\s+/)[0], f.sha);
    assert.deepEqual(f.states.map((state) => state.stage), ['PUSHING', 'PUSHED', 'PREVIEW_DEPLOYING', 'PREVIEW_READY']);
    assert.ok(existsSync(join(f.root, '.ai-collab/.runtime/completed', `${f.sha}.json`)));
    assert.ok(existsSync(join(lock, 'owner.json')));
    releaseLock(lock);
  } finally { f.cleanup(); }
});
test('automatic coordinator handoff preserves DONE and stops before push on Vercel branch mismatch', async () => {
  const f = fixture({ ...vercelPolicy, enabled: true }); try {
    const result = await afterCompleted(f.root, f.checkpoint, checks, { token: 'fixture-token', git: f.git,
      client: previewApi({ projectBranch: previewBranch }).client, save: () => {} });
    assert.equal(result.ok, false);
    assert.match(result.error, /Production Branch/);
    assert.equal(f.realGit('ls-remote', '--heads', 'origin', policy.developmentBranch), '');
    assert.ok(existsSync(join(f.root, '.ai-collab/.runtime/completed', `${f.sha}.json`)));
  } finally { f.cleanup(); }
});
test('an unresolved external operation lock is never silently recovered or removed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aven-release-lock-')), lock = join(dir, '.lock');
  try {
    mkdirSync(lock); const owner = { pid: 99999999, childPid: null, externalOperation: 'push' };
    writeFileSync(join(lock, 'owner.json'), JSON.stringify(owner));
    assert.throws(() => acquireLock(lock, true), /Interrupted external Git operation/);
    releaseLock(lock); assert.ok(existsSync(join(lock, 'owner.json')));
  } finally { rmSync(dir, { recursive: true }); }
});
test('deterministic coordinator commit request satisfies completion verification', () => {
  const f = fixture(); try {
    const orchestratorCheckpoint = {
      ...f.checkpoint,
      commitRequest: {
        agent: 'orchestrator',
        operation: 'commit',
        exitCode: 0,
        result: {
          status: 'COMMIT_REQUESTED',
          details: JSON.stringify({ parent: f.checkpoint.baseHead, tree: f.checkpoint.commitTree, message: f.checkpoint.title }),
        },
      },
    };
    const sha = verifyCompleted(f.root, orchestratorCheckpoint, checks, f.git);
    assert.equal(sha, f.sha);
  } finally { f.cleanup(); }
});
test('successfully pushed DONE task reconciles cleanly when followed by legitimate backlog commits', async () => {
  const f = fixture({ ...policy, enabled: false, developmentPushEnabled: true });
  try {
    const initial = await afterCompleted(f.root, f.checkpoint, checks, { git: f.git });
    assert.equal(initial.ok, true, JSON.stringify(initial));
    assert.equal(initial.pushed, true);
    assert.equal(f.realGit('rev-parse', 'HEAD'), f.sha);

    // Legitimate backlog commit advances branch HEAD past the completed metadata commit
    writeFileSync(join(f.root, '.ai-collab/BACKLOG.md'), 'updated backlog content\n');
    f.realGit('add', '.ai-collab/BACKLOG.md');
    f.realGit('commit', '-qm', 'docs(backlog): approve wave 1 scope');
    const newHead = f.realGit('rev-parse', 'HEAD');
    assert.notEqual(newHead, f.sha);
    assert.equal(f.realGit('merge-base', f.sha, newHead), f.sha);

    // Reconciliation on restart must succeed without error or re-pushing
    const reconciled = await afterCompleted(f.root, f.checkpoint, checks, { git: f.git });
    assert.equal(reconciled.ok, true, JSON.stringify(reconciled));
    assert.equal(reconciled.sha, f.sha);
    assert.equal(reconciled.pushed, true);
    assert.equal(reconciled.remoteBranch, policy.developmentBranch);
    assert.equal(reconciled.remoteSha, f.sha);
    assert.equal(reconciled.productionDeployment, false);
    assert.equal(reconciled.automaticMerge, false);
    assert.equal(f.realGit('status', '--porcelain'), '');
  } finally { f.cleanup(); }
});
test('reconciliation after subsequent commits still rejects dirty tree or missing ancestry', async () => {
  const f = fixture({ ...policy, enabled: false, developmentPushEnabled: true });
  try {
    const initial = await afterCompleted(f.root, f.checkpoint, checks, { git: f.git });
    assert.equal(initial.ok, true, JSON.stringify(initial));

    // Subsequent commit
    writeFileSync(join(f.root, '.ai-collab/BACKLOG.md'), 'updated backlog content\n');
    f.realGit('add', '.ai-collab/BACKLOG.md');
    f.realGit('commit', '-qm', 'docs(backlog): approve wave 1 scope');

    // Unsafe dirty working tree must be rejected
    writeFileSync(join(f.root, 'dirty.txt'), 'dirty work\n');
    const dirtyResult = await afterCompleted(f.root, f.checkpoint, checks, { git: f.git });
    assert.equal(dirtyResult.ok, false);
    assert.match(dirtyResult.error, /Completed commit, metadata tree, or working tree changed/);
    rmSync(join(f.root, 'dirty.txt'));

    // Diverged branch without completion ancestry must be rejected
    f.realGit('checkout', '-qb', 'diverged', 'main');
    const divergedResult = await afterCompleted(f.root, f.checkpoint, checks, { git: f.git });
    assert.equal(divergedResult.ok, false);
    assert.match(divergedResult.error, /Completed commit, metadata tree, or working tree changed/);
  } finally { f.cleanup(); }
});


