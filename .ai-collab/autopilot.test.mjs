import test from 'node:test';
import assert from 'node:assert/strict';
import { assessQueue, inspectRights, assessAgentQuota, releasePrerequisites, orchestratorArgs, loadManagementCredentials } from './autopilot-core.mjs';
import { agentEnvironment, redactSensitive } from './orchestrator-core.mjs';
import { execute } from './orchestrator-core.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const task = (id, status, dependencies = [], lineNumber = 1, scopeApproval = 'APPROVED') => ({ id, status, dependencies, priority: 'P0', lineNumber, scopeApproval });
const safe = { checkpoint: null, tasks: [task('ready', 'READY')], blockedArtifacts: [], branch: 'dev/aven-autonomous-backlog', expectedBranch: 'dev/aven-autonomous-backlog', dirty: false, locked: false, roadmapApproved: true };

test('autopilot selects work and never repeats a completed task', () => {
  assert.deepEqual(assessQueue(safe), { status: 'RUN', task: 'ready' });
  assert.deepEqual(assessQueue({ ...safe, tasks: [task('ready', 'DONE')] }), { status: 'COMPLETE' });
  assert.deepEqual(assessQueue({ ...safe, tasks: [task('next', 'READY', ['old']), task('old', 'DONE')] }), { status: 'RUN', task: 'next' });
});
test('autopilot never selects a task without explicit scope approval', () => {
  for (const status of ['READY', 'BACKLOG']) {
    const unapproved = task('unapproved', status, [], 1, 'NEEDS_DECISION');
    assert.deepEqual(assessQueue({ ...safe, tasks: [unapproved, task('approved', 'READY', [], 2)] }), { status: 'RUN', task: 'approved' });
    assert.equal(assessQueue({ ...safe, tasks: [unapproved] }).status, 'BLOCKED');
    assert.equal(assessQueue({ ...safe, tasks: [{ ...unapproved, scopeApproval: undefined }] }).status, 'BLOCKED');
  }
  assert.match(assessQueue({ ...safe, checkpoint: { status: 'STOPPED', task: { id: 'ready' } }, tasks: [task('ready', 'READY', [], 1, 'NEEDS_DECISION')] }).reason, /scope approval/);
});
test('architectural blocker, unreviewed artifact and dirty workspace stop automatic work', () => {
  const checkpoint = { status: 'BLOCKED', task: { id: 'admin-inquiry-portal' } };
  assert.equal(assessQueue({ ...safe, checkpoint }).status, 'BLOCKED');
  assert.equal(assessQueue({ ...safe, blockedArtifacts: ['admin-inquiry-portal'] }).status, 'BLOCKED');
  assert.equal(assessQueue({ ...safe, dirty: true }).status, 'BLOCKED');
  assert.equal(assessQueue({ ...safe, locked: true }).status, 'BLOCKED');
  assert.equal(assessQueue({ ...safe, branch: 'main' }).status, 'BLOCKED');
  assert.equal(assessQueue({ ...safe, remoteMatches: false }).status, 'BLOCKED');
  assert.equal(assessQueue({ ...safe, credentialFileRisk: true }).status, 'BLOCKED');
  assert.equal(assessQueue({ ...safe, roadmapApproved: false }).status, 'BLOCKED');
});
test('quota retry time and interrupted task retain the same task identity', () => {
  const future = new Date(Date.now() + 300000).toISOString();
  const checkpoint = { status: 'PAUSED_QUOTA', task: { id: 'ready' }, quota: { retryAt: future } };
  assert.equal(assessQueue({ ...safe, checkpoint }).status, 'PAUSED_QUOTA');
  assert.deepEqual(assessQueue({ ...safe, checkpoint, quotaReady: true }), { status: 'RESUME', task: 'ready' });
  assert.deepEqual(assessQueue({ ...safe, checkpoint: { ...checkpoint, quota: { retryAt: null } }, quotaReady: true }), { status: 'RESUME', task: 'ready' });
  assert.equal(assessQueue({ ...safe, checkpoint: { ...checkpoint, quota: { retryAt: null } } }).status, 'PAUSED_QUOTA');
  assert.deepEqual(assessQueue({ ...safe, checkpoint: { ...checkpoint, quota: { retryAt: new Date(Date.now() - 1000).toISOString() } } }), { status: 'RESUME', task: 'ready' });
  assert.deepEqual(assessQueue({ ...safe, checkpoint: { status: 'STOPPED', task: { id: 'ready' } } }), { status: 'RESUME', task: 'ready' });
});
test('explicit quota-ready forwards only for a paused coordinator resume', () => {
  const paused = { status: 'RESUME', checkpoint: { status: 'PAUSED_QUOTA' } };
  assert.deepEqual(orchestratorArgs(paused, true), ['resume', '--quota-ready']);
  assert.deepEqual(orchestratorArgs(paused), ['resume']);
  assert.deepEqual(orchestratorArgs({ status: 'RESUME', checkpoint: { status: 'STOPPED' } }, true), ['resume']);
  assert.deepEqual(orchestratorArgs({ status: 'RUN' }, true), ['run']);
  assert.deepEqual(orchestratorArgs({ status: 'COMPLETE' }), ['run']);
  assert.throws(() => orchestratorArgs({ status: 'PAUSED_QUOTA' }, true));
});
test('quota-ready still enforces branch, remote, credential and lock guards', () => {
  const checkpoint = { status: 'PAUSED_QUOTA', task: { id: 'ready' }, quota: { retryAt: null } };
  for (const unsafe of [{ branch: 'main' }, { remoteMatches: false }, { credentialFileRisk: true }, { locked: true }, { roadmapApproved: false }]) {
    assert.equal(assessQueue({ ...safe, checkpoint, quotaReady: true, ...unsafe }).status, 'BLOCKED');
  }
});
test('dirty stopped or running task resumes only after launcher safety guards', () => {
  for (const status of ['STOPPED', 'RUNNING']) {
    const checkpoint = { status, task: { id: 'ready' } };
    assert.deepEqual(assessQueue({ ...safe, checkpoint, dirty: true }), { status: 'RESUME', task: 'ready' });
    assert.equal(assessQueue({ ...safe, checkpoint, dirty: true, credentialFileRisk: true }).status, 'BLOCKED');
    assert.equal(assessQueue({ ...safe, checkpoint, dirty: true, locked: true }).status, 'BLOCKED');
    assert.equal(assessQueue({ ...safe, checkpoint, dirty: true, blockedArtifacts: ['ready'] }).status, 'BLOCKED');
    assert.equal(assessQueue({ ...safe, checkpoint, dirty: true, branch: 'main' }).status, 'BLOCKED');
    assert.equal(assessQueue({ ...safe, checkpoint, dirty: true, remoteMatches: false }).status, 'BLOCKED');
  }
  for (const checkpoint of [null, { status: 'IDLE' }, { status: 'DONE' }, { status: 'UNKNOWN', task: { id: 'ready' } }]) {
    assert.equal(assessQueue({ ...safe, checkpoint, dirty: true }).status, 'BLOCKED');
  }
});
test('agent quota proof prevents repeated smoke until reset or explicit verification', () => {
  const receipt = { kind: 'RESOURCE_EXHAUSTED', retryAt: new Date(Date.now() + 300000).toISOString() };
  assert.equal(assessAgentQuota(receipt).status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota(receipt, true), null);
  assert.equal(assessAgentQuota({ ...receipt, retryAt: null }).status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota({ ...receipt, retryAt: new Date(Date.now() - 1000).toISOString() }), null);
});
test('newer real smoke for exact runner digest supersedes old quota receipt without deleting it', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  const receipt = { kind: 'RESOURCE_EXHAUSTED', observedAt: '2026-10-16T10:00:00.000Z', retryAt: '2026-10-17T10:00:00.000Z' };
  const proof = { realCliFixture: true, runnerDigest: 'exact', verifiedAt: '2026-10-16T11:00:00.000Z' };
  assert.equal(assessAgentQuota(receipt, false, now, proof, 'exact'), null);
  assert.equal(assessAgentQuota(receipt, false, now, proof, 'changed').status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota(receipt, false, now, { ...proof, realCliFixture: false }, 'exact').status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota(receipt, false, now, { ...proof, verifiedAt: 'invalid' }, 'exact').status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota({ ...receipt, observedAt: null }, false, now, proof, 'exact').status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota(receipt, false, now, { ...proof, verifiedAt: '2026-10-16T13:00:00.000Z' }, 'exact').status, 'PAUSED_QUOTA');
});
test('new 429 after successful smoke pauses the same runner again', () => {
  const now = Date.parse('2026-10-16T13:00:00.000Z');
  const proof = { realCliFixture: true, runnerDigest: 'exact', verifiedAt: '2026-10-16T11:00:00.000Z' };
  const newerQuota = { kind: 'RESOURCE_EXHAUSTED', observedAt: '2026-10-16T12:00:00.000Z', retryAt: '2026-10-17T12:00:00.000Z' };
  assert.equal(assessAgentQuota(newerQuota, false, now, proof, 'exact').status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota({ ...newerQuota, observedAt: proof.verifiedAt }, false, now, proof, 'exact').status, 'PAUSED_QUOTA');
});
test('provider preflight uses read-only GETs, reports exact projects, and never returns tokens', async () => {
  const requests = [];
  const config = { repository: 'Example/Repo', productionBranch: 'main', vercelProjectId: 'prj_exact', vercelTeamId: 'team_exact', supabaseProjectRef: 'refexact' };
  const token = 'fixture-super-secret-token';
  const fetcher = async (url, options) => {
    requests.push({ url, method: options.method ?? 'GET', auth: options.headers.Authorization });
    const body = url.includes('vercel') ? { id: 'prj_exact', link: { productionBranch: 'main' } } : url.includes('supabase') ? { id: 'refexact' } : { protected: false };
    return { status: 200, ok: true, json: async () => body };
  };
  const rights = await inspectRights(config, { VERCEL_TOKEN: token, SUPABASE_ACCESS_TOKEN: token }, fetcher);
  assert.equal(rights.vercel.projectMatch, true);
  assert.equal(rights.vercel.productionBranchMatch, true);
  assert.equal(rights.supabase.projectMatch, true);
  assert.equal(rights.github.mainProtected, false);
  assert.equal(releasePrerequisites(rights), false);
  assert.ok(requests.every((request) => request.method === 'GET'));
  assert.ok(!JSON.stringify(rights).includes(token));
  const missing = await inspectRights(config, {}, fetcher);
  assert.equal(missing.vercel.readStatus, 'MISSING_TOKEN');
  assert.equal(missing.supabase.readStatus, 'MISSING_TOKEN');
});
test('Supabase scoped token reads only its configured project and exactly matches the response id', async () => {
  const config = { repository: 'Example/Repo', productionBranch: 'main', vercelProjectId: 'prj_exact', vercelTeamId: 'team_exact', supabaseProjectRef: 'ref exact' };
  const requested = [];
  const fetcher = async (url) => {
    requested.push(url);
    return { status: 200, ok: true, json: async () => ({ id: 'other-project' }) };
  };
  const rights = await inspectRights(config, { SUPABASE_ACCESS_TOKEN: 'fixture-token' }, fetcher);
  assert.ok(requested.includes('https://api.supabase.com/v1/projects/ref%20exact'));
  assert.equal(rights.supabase.readStatus, 200);
  assert.equal(rights.supabase.projectMatch, false);
});
test('Supabase preflight distinguishes auth, permission, missing project and network failures without exposing response secrets', async () => {
  const config = { repository: 'Example/Repo', productionBranch: 'main', vercelProjectId: 'prj_exact', vercelTeamId: 'team_exact', supabaseProjectRef: 'refexact' };
  const token = 'fixture-supabase-secret-token';
  for (const [status, diagnostic] of [
    [401, 'Supabase rejected the token'],
    [403, 'Supabase denied access to this project'],
    [404, 'Supabase did not find this project'],
  ]) {
    const fetcher = async (url) => url.includes('supabase')
      ? { status, ok: false, json: async () => { throw new Error(`${token} provider-private-body`); } }
      : { status: 200, ok: true, json: async () => ({ protected: false }) };
    const rights = await inspectRights(config, { SUPABASE_ACCESS_TOKEN: token }, fetcher);
    assert.equal(rights.supabase.readStatus, status);
    assert.equal(rights.supabase.projectMatch, false);
    assert.match(rights.supabase.diagnostic, new RegExp(diagnostic));
    assert.equal(JSON.stringify(rights).includes(token), false);
    assert.equal(JSON.stringify(rights).includes('provider-private-body'), false);
  }
  let calls = 0;
  const networkRights = await inspectRights(config, { SUPABASE_ACCESS_TOKEN: token }, async (url) => {
    if (url.includes('supabase')) { calls++; throw new Error(`${token} private network details`); }
    return { status: 200, ok: true, json: async () => ({ protected: false }) };
  });
  assert.equal(networkRights.supabase.readStatus, 'NETWORK_ERROR');
  assert.equal(calls, 3);
  assert.match(networkRights.supabase.diagnostic, /could not be reached/);
  assert.equal(JSON.stringify(networkRights).includes(token), false);
  assert.equal(JSON.stringify(networkRights).includes('private network details'), false);
});
test('long provider Retry-After stops that stage without busy retries', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { status: 429, ok: false, headers: { get: () => '60' } }; };
  const config = { repository: 'Example/Repo', productionBranch: 'main', vercelProjectId: 'prj_exact', vercelTeamId: 'team_exact', supabaseProjectRef: 'refexact' };
  const rights = await inspectRights(config, { VERCEL_TOKEN: 'fake-token-for-test' }, fetcher);
  assert.equal(rights.vercel.readStatus, 429);
  assert.equal(calls, 2); // Vercel and public GitHub; Supabase needs a token and is skipped.
});
test('agents do not inherit provider management secrets and runtime logs redact values', () => {
  const token = 'fixture-super-secret-token';
  const env = { PATH: '/usr/bin', VERCEL_TOKEN: token, SUPABASE_ACCESS_TOKEN: token, GH_TOKEN: token, SUPABASE_SECRET_KEY: token, AWS_SECRET_ACCESS_KEY: token, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' };
  const child = agentEnvironment(env);
  assert.equal(child.PATH, '/usr/bin');
  assert.equal(child.NEXT_PUBLIC_SUPABASE_URL, 'https://example.supabase.co');
  assert.equal(Object.values(child).includes(token), false);
  assert.equal(redactSensitive(`output ${token}`, env), 'output [REDACTED]');
});
test('actual child execution strips management token and redacts private process log', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aven-agent-env-'));
  const token = 'fixture-super-secret-token';
  const prior = process.env.VERCEL_TOKEN;
  process.env.VERCEL_TOKEN = token;
  try {
    const log = join(dir, 'child.log');
    const result = await execute([process.execPath, '-e', 'process.stdout.write(String(process.env.VERCEL_TOKEN ?? "absent") + " " + process.argv[1])', token], { root: dir, timeoutMs: 3000, log, env: agentEnvironment(process.env) });
    assert.equal(result.stdout, 'absent [REDACTED]');
    assert.equal(readFileSync(log, 'utf8').includes(token), false);
  } finally {
    if (prior === undefined) delete process.env.VERCEL_TOKEN;
    else process.env.VERCEL_TOKEN = prior;
    rmSync(dir, { recursive: true, force: true });
  }
});
test('loadManagementCredentials safely loads external env file if present', () => {
  let loadedPath = null;
  const mockLoader = (p) => { loadedPath = p; };
  const res1 = loadManagementCredentials({ AVEN_MANAGEMENT_ENV: '/non/existent/path/management.env' }, mockLoader);
  assert.equal(res1.loaded, false);
  assert.equal(loadedPath, null);

  const res2 = loadManagementCredentials({ AVEN_MANAGEMENT_ENV: import.meta.filename }, mockLoader);
  assert.equal(res2.loaded, true);
  assert.equal(loadedPath, import.meta.filename);

  const throwingLoader = () => { throw new Error('EACCES'); };
  const res3 = loadManagementCredentials({ AVEN_MANAGEMENT_ENV: import.meta.filename }, throwingLoader);
  assert.equal(res3.loaded, false);
  assert.equal(res3.error, 'EACCES');
});

