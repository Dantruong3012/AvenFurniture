#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backlog } from './workflow.mjs';
import { agentEnvironment, atomicJSON, quotaFailure } from './orchestrator-core.mjs';
import { inspectLocal, inspectRights, assessAgentQuota, releasePrerequisites, orchestratorArgs, loadManagementCredentials } from './autopilot-core.mjs';

loadManagementCredentials();

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspace = join(root, '.ai-collab');
const config = JSON.parse(readFileSync(join(workspace, 'autopilot.config.json'), 'utf8'));
const action = process.argv[2] ?? 'run';
const quotaReady = process.argv.includes('--quota-ready');
const report = (value) => console.log(JSON.stringify(value));
const smokeReceipt = join(workspace, '.runtime/autopilot-smoke.json');
const failedSmokeReceipt = join(workspace, '.runtime/autopilot-smoke-failed.json');
const quotaReceipt = join(workspace, '.runtime/autopilot-quota.json');
const runnerFiles = ['autopilot.mjs', 'autopilot-core.mjs', 'orchestrator.mjs', 'orchestrator-core.mjs', 'workflow.mjs', 'dry-run.mjs', 'orchestrator.config.json'];
const runnerDigest = () => createHash('sha256').update(runnerFiles.map((name) => readFileSync(join(workspace, name))).reduce((all, file) => Buffer.concat([all, file]), Buffer.alloc(0))).digest('hex');
const smokeVerified = () => existsSync(smokeReceipt) && JSON.parse(readFileSync(smokeReceipt, 'utf8')).runnerDigest === runnerDigest();
const smokeFailed = () => !smokeVerified() && existsSync(failedSmokeReceipt) && JSON.parse(readFileSync(failedSmokeReceipt, 'utf8')).runnerDigest === runnerDigest();
const quota = () => existsSync(quotaReceipt) ? assessAgentQuota(
  JSON.parse(readFileSync(quotaReceipt, 'utf8')),
  quotaReady,
  Date.now(),
  existsSync(smokeReceipt) ? JSON.parse(readFileSync(smokeReceipt, 'utf8')) : null,
  runnerDigest(),
) : null;
const runChild = (file, args, env = process.env, capture = false) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file, ...args], { cwd: root, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  let output = '';
  if (capture) for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    output += chunk;
    if (output.length > 1024 * 1024) child.kill('SIGTERM');
  });
  const stop = () => child.kill('SIGINT');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('error', (error) => { process.off('SIGINT', stop); process.off('SIGTERM', stop); reject(error); });
  child.on('exit', (code, signal) => { process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve(capture ? { code: signal ? 130 : code ?? 1, output } : signal ? 130 : code ?? 1); });
});
function recordSmoke(result) {
  mkdirSync(join(workspace, '.runtime'), { recursive: true, mode: 0o700 });
  if (result.code === 0) {
    atomicJSON(smokeReceipt, { runnerDigest: runnerDigest(), verifiedAt: new Date().toISOString(), realCliFixture: true });
    report({ phase: 'SMOKE_PASSED', realCliFixture: true });
    return;
  }
  const quotaEvidence = quotaFailure(result.output);
  if (quotaEvidence) atomicJSON(quotaReceipt, { ...quotaEvidence, agent: 'antigravity', operation: 'autopilot-smoke' });
  atomicJSON(failedSmokeReceipt, { runnerDigest: runnerDigest(), exitCode: result.code, observedAt: new Date().toISOString(), reason: quotaEvidence ? 'PAUSED_QUOTA' : 'SMOKE_FAILED', nextAction: 'Inspect private proof fixture; retry only after issue is resolved' });
  report({ phase: quotaEvidence ? 'PAUSED_QUOTA' : 'SMOKE_FAILED', retryAt: quotaEvidence?.retryAt ?? null });
}

try {
  if (!['run', '--check', '--smoke'].includes(action) || process.argv.slice(3).some((value) => value !== '--quota-ready') || process.argv.length > 4) throw new Error('Usage: npm run ai:auto [-- --check|--smoke [--quota-ready]]');
  if (action === '--smoke') {
    const pause = quota();
    if (pause) { report(pause); process.exitCode = 3; }
    else if (smokeFailed() && !process.argv.includes('--quota-ready')) { report({ phase: 'BLOCKED', reason: 'Previous real CLI smoke failed; inspect private receipt before controlled retry' }); process.exitCode = 2; }
    else {
      report({ phase: 'SMOKE', scope: 'temporary Git fixture; no application data or provider writes' });
      const result = await runChild('.ai-collab/dry-run.mjs', [], agentEnvironment(), true);
      recordSmoke(result);
      process.exitCode = result.code;
    }
  } else {
    if (!/^v22\./.test(process.version)) throw new Error('Node 22 is required');
    const local = inspectLocal(root, backlog(), config, quotaReady);
    const rights = await inspectRights(config);
    const release = JSON.parse(readFileSync(join(workspace, 'release.config.json'), 'utf8'));
    const status = { phase: 'PREFLIGHT', local, rights, smokeVerified: smokeVerified(), smokeFailed: smokeFailed(), quota: quota(), developmentOnly: !release.enabled, developmentPushEnabled: release.developmentPushEnabled === true, automaticMerge: false, productionDeployment: false };
    report(status);
    if (action === '--check') process.exitCode = 0;
    else if (!['RUN', 'RESUME', 'COMPLETE'].includes(local.status)) process.exitCode = 2;
    else if (local.status === 'COMPLETE' && release.developmentPushEnabled !== true) report({ phase: 'COMPLETE', tasks: 'all approved backlog tasks done' });
    else {
      if (release.enabled && !releasePrerequisites(rights)) throw new Error('Release gate lacks verified provider identity or protected main branch');
      if (!existsSync(join(root, '.env.local'))) throw new Error('Expected local environment file is absent');
      if (!smokeVerified()) {
        if (quota()) { report(quota()); process.exitCode = 3; }
        else if (smokeFailed()) { report({ phase: 'BLOCKED', reason: 'Previous real CLI smoke failed; inspect private receipt' }); process.exitCode = 2; }
        else {
          report({ phase: 'SMOKE', scope: 'temporary Git fixture before autonomous work' });
          const smokeResult = await runChild('.ai-collab/dry-run.mjs', [], agentEnvironment(), true);
          recordSmoke(smokeResult);
          if (smokeResult.code !== 0) throw new Error('Real CLI smoke failed; task checkpoint has not been started');
        }
      }
      if (!process.exitCode) {
        mkdirSync(join(workspace, '.runtime'), { recursive: true, mode: 0o700 });
        atomicJSON(join(workspace, '.runtime/autopilot-status.json'), { phase: local.status, task: local.task, head: local.head, time: new Date().toISOString() });
        const code = await runChild('.ai-collab/orchestrator.mjs', orchestratorArgs(local, quotaReady));
        atomicJSON(join(workspace, '.runtime/autopilot-status.json'), { phase: code === 0 ? 'STOPPED' : 'BLOCKED', exitCode: code, time: new Date().toISOString() });
        process.exitCode = code;
      }
    }
  }
} catch (error) {
  report({ phase: 'BLOCKED', reason: error.message });
  process.exitCode = 2;
}
