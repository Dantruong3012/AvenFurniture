import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validateResult, validatePaths, assertScope, snapshot, acquireLock, atomicJSON, execute, quotaFailure } from './orchestrator-core.mjs';

test('classify quota separately from implementation and architecture failures', () => {
  const quota = quotaFailure('AGY_ERROR: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 30h29m49s.', Date.UTC(2026, 9, 16));
  assert.equal(quota.kind, 'RESOURCE_EXHAUSTED');
  assert.equal(Date.parse(quota.retryAt) - Date.parse(quota.observedAt), (30 * 3600 + 29 * 60 + 49) * 1000);
  assert.equal(quotaFailure('Architecture blocker: transaction needed'), null);
  assert.equal(quotaFailure('Process exited 3; inspect private log'), null);
  assert.equal(quotaFailure('RESOURCE_EXHAUSTED without reset time').retryAt, null);
});

test('reject false approval, malformed JSON contract, and unsafe owned paths', () => {
  assert.throws(() => validateResult({ status: 'PASS' }, ['APPROVED']));
  assert.throws(() => validateResult({ status: 'APPROVED', summary: '', paths: [], details: '' }, ['APPROVED']));
  for (const path of ['../outside', '/tmp/escape', '.env.local', '.git/config', '.ai-collab/orchestrator.mjs', 'a/../b', 'a b']) assert.throws(() => validatePaths([path]));
  assert.deepEqual(validatePaths(['lib/feature.ts']), ['lib/feature.ts']);
});
test('detect edits outside ownership and reject duplicate lock without deleting owner', () => {
  assert.throws(() => assertScope({ a: '1', b: '2' }, { a: '3', b: '4' }, ['a']));
  const dir = mkdtempSync(join(tmpdir(), 'aven-lock-')), lock = join(dir, 'lock');
  try {
    acquireLock(lock);
    assert.throws(() => acquireLock(lock, true), /still running/);
    atomicJSON(join(lock, 'owner.json'), { pid: 999999999, childPid: null });
    assert.throws(() => acquireLock(lock), /Stale lock/);
    acquireLock(lock, true);
  } finally { rmSync(dir, { recursive: true }); }
});
test('working snapshot sees tracked, untracked, deleted and ignored runtime correctly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aven-snapshot-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, '.gitignore'), '.runtime/\n');
    writeFileSync(join(dir, 'a'), 'original'); spawnSync('git', ['add', 'a'], { cwd: dir });
    const before = snapshot(dir);
    writeFileSync(join(dir, 'b'), 'new'); mkdirSync(join(dir, '.runtime')); writeFileSync(join(dir, '.runtime/log'), 'ignored');
    rmSync(join(dir, 'a'));
    const after = snapshot(dir);
    assert.equal(after.a, 'deleted'); assert.ok(after.b); assert.equal(after['.runtime/log'], undefined);
    assert.throws(() => assertScope(before, after, ['b']));
  } finally { rmSync(dir, { recursive: true }); }
});
test('child timeout, stop request, nonzero exit and forbidden flags fail closed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aven-process-'));
  try {
    await assert.rejects(execute([process.execPath, '-e', 'setInterval(()=>{},1000)'], { root: dir, timeoutMs: 100 }), /TIMEOUT/);
    const stopFile = join(dir, 'STOP'); writeFileSync(stopFile, 'stop');
    await assert.rejects(execute([process.execPath, '-e', 'setInterval(()=>{},1000)'], { root: dir, timeoutMs: 5000, stopFile }), /STOPPED/);
    await assert.rejects(execute([process.execPath, '-e', 'process.exit(2)'], { root: dir, timeoutMs: 5000 }), /exited 2/);
    await assert.rejects(execute(['codex', '--dangerously-bypass-approvals-and-sandbox'], { root: dir, timeoutMs: 1000 }), /forbidden/);
  } finally { rmSync(dir, { recursive: true }); }
});
