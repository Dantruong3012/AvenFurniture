#!/usr/bin/env node
// Real CLI/commit integration, confined to a new repository without application code or credentials.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { snapshot, digest } from './orchestrator-core.mjs';

const source = dirname(fileURLToPath(import.meta.url)), root = dirname(source);
const before = digest(snapshot(root));
const fixture = mkdtempSync(join(tmpdir(), 'aven-orchestrator-proof-'));
mkdirSync(join(fixture, '.ai-collab'));
for (const name of ['workflow.mjs', 'orchestrator.mjs', 'orchestrator-core.mjs', 'orchestrator.config.json', 'release.mjs', 'release-git.mjs', 'release.config.json', '.gitignore']) copyFileSync(join(source, name), join(fixture, '.ai-collab', name));
const releasePolicy = JSON.parse(readFileSync(join(fixture, '.ai-collab/release.config.json'), 'utf8'));
writeFileSync(join(fixture, '.ai-collab/release.config.json'), JSON.stringify({ ...releasePolicy, enabled: false, releaseMode: 'manual' }));
writeFileSync(join(fixture, 'AGENTS.md'), '# Safe orchestrator proof\nThe user authorizes only the proof JSON task in this temporary repository. Follow the coordinator prompts. Antigravity plans/reviews; Codex implements and commits after real review. No network tools, secrets, Production actions or application source. Do not alter verify.mjs, package.json, or .ai-collab.\n');
writeFileSync(join(fixture, '.gitignore'), '.build/\n');
writeFileSync(join(fixture, 'package.json'), JSON.stringify({ private: true, scripts: { lint: 'node --check verify.mjs', typecheck: 'node verify.mjs types', test: 'node verify.mjs test', build: 'node verify.mjs build' } }, null, 2));
writeFileSync(join(fixture, 'verify.mjs'), `import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const data = JSON.parse(readFileSync('proof.json', 'utf8'));
assert.equal(typeof data.message, 'string');
assert.deepEqual(Object.keys(data), ['message']);
if (process.argv[2] !== 'types') assert.equal(data.message, 'AvenFurniture orchestration verified');
if (process.argv[2] === 'build') { mkdirSync('.build', { recursive: true }); writeFileSync('.build/proof.json', JSON.stringify(data)); }
console.log('Verified ' + process.argv[2]);
`);
writeFileSync(join(fixture, '.ai-collab', 'BACKLOG.md'), '# Proof backlog\n\nRoadmap approval: APPROVED\n\n| Task ID | Priority | Dependencies | Owner | Status | Acceptance criteria | Commit hash |\n| --- | --- | --- | --- | --- | --- | --- |\n| safe-proof | P0 | - | Codex | READY | Create only proof.json containing exactly {"message":"AvenFurniture orchestration verified"}; run existing npm checks; do not modify verification or configuration files | - |\n');
writeFileSync(join(fixture, '.ai-collab', 'STATE.md'), '# State\n\nActive task: -\nCurrent phase: IDLE\nLast completed task: -\nNext task: safe-proof\nBlockers: -\nLast successful commit: -\n');
const identity = spawnSync('git', ['log', '-1', '--format=%an%n%ae'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n');
if (identity.length !== 2 || identity[1].endsWith('.local')) throw new Error('Need approved repository Git identity');
for (const args of [['init', '-q'], ['config', 'user.name', identity[0]], ['config', 'user.email', identity[1]], ['add', '--', 'AGENTS.md', '.gitignore', 'package.json', 'verify.mjs', '.ai-collab'], ['commit', '-qm', 'docs(agents): initialize isolated proof']]) {
  const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Fixture Git failed: ${args[0]}`);
}
console.log(JSON.stringify({ fixture, applicationSourceCopied: false, realAgents: true }));
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['.ai-collab/orchestrator.mjs', 'run'], { cwd: fixture, stdio: 'inherit' });
  child.on('error', reject); child.on('exit', resolve);
});
if (digest(snapshot(root)) !== before) throw new Error('Original repository changed during proof; inspect before proceeding');
if (code !== 0) throw new Error(`Proof stopped; inspect ${fixture}/.ai-collab/.runtime`);
const events = readFileSync(join(fixture, '.ai-collab/.runtime/events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
for (const [agent, operation] of [['antigravity', 'plan'], ['codex', 'implement'], ['antigravity', 'review']]) {
  if (!events.some((e) => e.phase === 'CLI_COMPLETED' && e.agent === agent && e.operation === operation)) throw new Error(`Missing real handoff ${agent}/${operation}`);
}
if (events.some((e) => e.phase === 'CLI_COMPLETED' && e.operation === 'commit')) throw new Error('Deterministic commit unexpectedly invoked an agent');
const done = events.find((e) => e.phase === 'DONE');
if (!done) throw new Error('No independently verified DONE event');
console.log(JSON.stringify({ proof: 'PASS', fixture, commit: done.commit, metadataCommit: done.metadataCommit, originalRepositoryUnchanged: true }));
