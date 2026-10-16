import test from 'node:test';
import assert from 'node:assert/strict';
import { assessQueue, inspectRights, assessAgentQuota, releasePrerequisites } from './autopilot-core.mjs';
import { agentEnvironment, redactSensitive } from './orchestrator-core.mjs';
import { execute } from './orchestrator-core.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const task = (id, status, dependencies = [], lineNumber = 1) => ({ id, status, dependencies, priority: 'P0', lineNumber });
const safe = { checkpoint: null, tasks: [task('ready', 'READY')], blockedArtifacts: [], branch: 'dev/aven-autonomous-backlog', expectedBranch: 'dev/aven-autonomous-backlog', dirty: false, locked: false, roadmapApproved: true };

test('autopilot selects work and never repeats a completed task', () => {
  assert.deepEqual(assessQueue(safe), { status: 'RUN', task: 'ready' });
  assert.deepEqual(assessQueue({ ...safe, tasks: [task('ready', 'DONE')] }), { status: 'COMPLETE' });
  assert.deepEqual(assessQueue({ ...safe, tasks: [task('next', 'READY', ['old']), task('old', 'DONE')] }), { status: 'RUN', task: 'next' });
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
  assert.deepEqual(assessQueue({ ...safe, checkpoint: { ...checkpoint, quota: { retryAt: new Date(Date.now() - 1000).toISOString() } } }), { status: 'RESUME', task: 'ready' });
  assert.deepEqual(assessQueue({ ...safe, checkpoint: { status: 'STOPPED', task: { id: 'ready' } } }), { status: 'RESUME', task: 'ready' });
});
test('agent quota proof prevents repeated smoke until reset or explicit verification', () => {
  const receipt = { kind: 'RESOURCE_EXHAUSTED', retryAt: new Date(Date.now() + 300000).toISOString() };
  assert.equal(assessAgentQuota(receipt).status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota(receipt, true), null);
  assert.equal(assessAgentQuota({ ...receipt, retryAt: null }).status, 'PAUSED_QUOTA');
  assert.equal(assessAgentQuota({ ...receipt, retryAt: new Date(Date.now() - 1000).toISOString() }), null);
});
test('provider preflight uses read-only GETs, reports exact projects, and never returns tokens', async () => {
  const requests = [];
  const config = { repository: 'Example/Repo', productionBranch: 'main', vercelProjectId: 'prj_exact', vercelTeamId: 'team_exact', supabaseProjectRef: 'refexact' };
  const token = 'fixture-super-secret-token';
  const fetcher = async (url, options) => {
    requests.push({ url, method: options.method ?? 'GET', auth: options.headers.Authorization });
    const body = url.includes('vercel') ? { id: 'prj_exact', link: { productionBranch: 'main' } } : url.includes('supabase') ? [{ id: 'refexact' }] : { protected: false };
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
