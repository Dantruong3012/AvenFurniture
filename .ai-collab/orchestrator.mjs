#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, workspace, backlog, nextTask, hasBlocker, field, replaceField, setTaskRow, taskPath, changedWorkingPaths, scanStaged, git } from './workflow.mjs';
import { schema, validateResult, atomicJSON, snapshot, digest, changes, assertScope, validatePaths, acquireLock, execute, assertNoSecrets } from './orchestrator-core.mjs';

const runtime = join(workspace, '.runtime');
const checkpointPath = join(runtime, 'checkpoint.json');
const stopFile = join(runtime, 'STOP');
const lock = join(workspace, '.lock');
const config = JSON.parse(readFileSync(join(workspace, 'orchestrator.config.json'), 'utf8'));
const configDigest = digest(config);
if (!Number.isInteger(config.maxRounds) || config.maxRounds < 1 || config.maxRounds > 3 || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 3600000 || !Array.isArray(config.checks) || config.checks.length < 1) throw new Error('Invalid orchestration limits/checks');
for (const name of ['antigravity', 'codex', 'checks']) {
  const commands = name === 'checks' ? config.checks : [config[name]];
  for (const command of commands) if (!Array.isArray(command) || !command.length || command.some((v) => typeof v !== 'string' || /dangerously|danger-full-access/.test(v))) throw new Error('Invalid/unsafe CLI configuration');
}
const read = (path) => readFileSync(path, 'utf8');
let checkpoint;
const save = () => atomicJSON(checkpointPath, checkpoint);
function event(phase, extra = {}) {
  const record = { time: new Date().toISOString(), task: checkpoint?.task?.id ?? null, phase, ...extra };
  const path = join(runtime, 'events.jsonl');
  writeFileSync(path, `${JSON.stringify(record)}\n`, { flag: 'a', mode: 0o600 });
  console.log(JSON.stringify(record));
}
function updateState(phase, blocker = '-') {
  let state = read(join(workspace, 'STATE.md'));
  for (const [name, value] of Object.entries({ 'Active task': checkpoint.task?.id ?? '-', 'Current phase': phase, Blockers: blocker.replace(/[\r\n|]/g, ' ') })) state = replaceField(state, name, value);
  writeFileSync(join(workspace, 'STATE.md'), state);
}
function transition(phase) {
  checkpoint.phase = phase; checkpoint.status = 'RUNNING'; save();
  updateState(phase);
  const data = backlog(), task = data.tasks.find((t) => t.id === checkpoint.task.id);
  setTaskRow(data, task, phase);
  event(phase);
}
function artifact(name, content) {
  mkdirSync(join(workspace, 'tasks', checkpoint.task.id), { recursive: true });
  writeFileSync(taskPath(checkpoint.task.id, name), content);
}
const boundary = 'Read AGENTS.md. Work only on this task. Never push, deploy, access external Production services, run a Production migration, change credentials/secrets, or modify another task. Do not use MCP services or bypass permission checks. Never change Git HEAD/index unless this prompt explicitly requests the commit phase. Do not modify orchestrator code/config or test commands. Do not write status artifacts; the coordinator persists your structured response.';
function reviewContext() {
  const content = checkpoint.paths.map((path) => {
    const text = existsSync(join(root, path)) ? read(join(root, path)) : '(deleted)';
    assertNoSecrets(text, path);
    return `FILE ${path}\n${text}`;
  }).join('\n\n');
  if (content.length > 100000) throw new Error('Review context exceeds bounded input; split the task');
  return `PLAN\n${read(taskPath(checkpoint.task.id, 'PLAN.md'))}\nIMPLEMENTATION\n${read(taskPath(checkpoint.task.id, 'IMPLEMENTATION.md'))}\nDIFF\n${git('diff', checkpoint.baseHead, '--', ...checkpoint.paths)}\nCURRENT FILES\n${content}`;
}
async function agent(kind, phase, prompt, statuses) {
  const seq = checkpoint.sequence = (checkpoint.sequence ?? 0) + 1; save();
  const prefix = join(runtime, `${checkpoint.task.id}-${seq}-${phase}`);
  const schemaFile = `${prefix}.schema.json`, resultFile = `${prefix}.result.json`;
  atomicJSON(schemaFile, schema);
  const args = kind === 'antigravity'
    ? [...config.antigravity, '-p', `Use only the supplied context. Do not call tools, shell commands, or read/write files. Return structured JSON only. If context is insufficient return BLOCKED.\nRepository instructions:\n${read(join(root, 'AGENTS.md'))}\n${prompt}`, '--mode', 'plan', '--sandbox', '--output-format', 'json', '--json-schema', schemaFile, '--print-timeout', `${Math.ceil(config.timeoutMs / 1000)}s`]
    : [...config.codex, 'exec', '--sandbox', phase === 'commit' ? 'read-only' : 'workspace-write', '-c', 'approval_policy="never"', '-C', root, '--json', '--output-schema', schemaFile, '-o', resultFile, '-'];
  const before = snapshot(root), head = git('rev-parse', 'HEAD'), index = git('write-tree');
  event('CLI_STARTED', { agent: kind, operation: phase, sequence: seq });
  const result = await execute(args, { root, timeoutMs: config.timeoutMs, stopFile, log: `${prefix}.log`, input: kind === 'codex' ? `${boundary}\n${prompt}` : undefined,
    onChild: (pid) => atomicJSON(join(lock, 'owner.json'), { pid: process.pid, childPid: pid }) });
  let structured;
  if (kind === 'antigravity') {
    const envelope = JSON.parse(result.stdout);
    if (envelope.status !== 'SUCCESS' || !envelope.structured_output || envelope.denied_actions?.length) throw new Error('Antigravity JSON envelope failed or tools were denied');
    structured = envelope.structured_output;
  } else {
    const events = result.stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (!events.some((entry) => entry.type === 'turn.completed') || events.some((entry) => ['turn.failed', 'error'].includes(entry.type))) throw new Error('Codex execution did not complete successfully');
    structured = JSON.parse(read(resultFile));
  }
  validateResult(structured, [...statuses, 'BLOCKED']);
  if (git('rev-parse', 'HEAD') !== head || git('write-tree') !== index) throw new Error('Agent changed Git HEAD/index outside coordinator');
  assertScope(before, snapshot(root), phase === 'implement' ? checkpoint.paths : []);
  const receipt = { agent: kind, operation: phase, sequence: seq, exitCode: result.code, status: structured.status, result: structured, inputDigest: digest(before), outputDigest: digest(snapshot(root)) };
  atomicJSON(`${prefix}.receipt.json`, receipt);
  event('CLI_COMPLETED', { agent: kind, operation: phase, sequence: seq, status: structured.status });
  if (structured.status === 'BLOCKED') throw new Error(`${kind}: ${structured.summary}`);
  return receipt;
}
function select() {
  const data = backlog();
  if (field(data.content, 'Roadmap approval') !== 'APPROVED') throw new Error('Roadmap is not APPROVED');
  return nextTask(data.tasks) ?? data.tasks.filter((t) => t.status === 'BACKLOG' && !hasBlocker(t) && t.dependencies.every((id) => data.tasks.some((dep) => dep.id === id && dep.status === 'DONE' && !hasBlocker(dep)))).sort((a, b) => a.priority.localeCompare(b.priority) || a.lineNumber - b.lineNumber)[0];
}
function assertTaskScope() {
  assertScope(checkpoint.baseline, snapshot(root), [...checkpoint.paths, '.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', ...['PLAN.md', 'IMPLEMENTATION.md', 'REVIEW.md'].map((name) => `.ai-collab/tasks/${checkpoint.task.id}/${name}`)]);
}
function sourceDigest() {
  const ignored = ['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', ...['PLAN.md', 'IMPLEMENTATION.md', 'REVIEW.md'].map((name) => `.ai-collab/tasks/${checkpoint.task.id}/${name}`)];
  return digest(Object.fromEntries(Object.entries(snapshot(root)).filter(([path]) => !ignored.includes(path))));
}
function requiredScripts() {
  return existsSync(join(root, 'package.json')) ? JSON.parse(read(join(root, 'package.json'))).scripts ?? {} : {};
}
async function verify() {
  if (digest(requiredScripts()) !== checkpoint.scriptsDigest) throw new Error('Package check commands changed; separate approval required before trusting tests');
  const before = snapshot(root), head = git('rev-parse', 'HEAD'), index = git('write-tree');
  checkpoint.checks = []; save();
  for (let i = 0; i < config.checks.length; i++) {
    const command = config.checks[i];
    try {
      await execute(command, { root, timeoutMs: config.timeoutMs, stopFile, log: join(runtime, `${checkpoint.task.id}-round-${checkpoint.round}-check-${i}.log`), onChild: (pid) => atomicJSON(join(lock, 'owner.json'), { pid: process.pid, childPid: pid }) });
      checkpoint.checks.push({ command, exitCode: 0 }); save();
    } catch (error) {
      checkpoint.checks.push({ command, exitCode: 1 }); save();
      if (error.message === 'STOPPED') throw error;
      checkpoint.feedback = `Required check failed: ${command.join(' ')}. Inspect the private check log and fix within the plan.`;
      return false;
    }
  }
  if (git('rev-parse', 'HEAD') !== head || git('write-tree') !== index) throw new Error('Checks changed Git state');
  assertScope(before, snapshot(root), []);
  checkpoint.verifiedDigest = sourceDigest(); save();
  return true;
}
function implementation(status) {
  artifact('IMPLEMENTATION.md', `# Implementation: ${checkpoint.task.id}\n\nStatus: ${status}\nChanged paths: ${checkpoint.paths.join(', ')}\nCommit: ${checkpoint.title}\nCommit hash: ${checkpoint.commit ?? '-'}\n\n${checkpoint.implementation?.summary ?? ''}\n\n${checkpoint.implementation?.details ?? ''}\n\n## Independent checks\n\n${(checkpoint.checks ?? []).map((c) => `- ${c.command.join(' ')}: ${c.exitCode === 0 ? 'PASS' : 'FAIL'}`).join('\n')}\n`);
}
function verifyCommit() {
  const head = git('rev-parse', 'HEAD');
  if (head === checkpoint.baseHead) return false;
  if (!checkpoint.commitRequest || checkpoint.commitRequest.result.status !== 'COMMIT_REQUESTED') throw new Error('Commit lacks a persisted Codex request receipt');
  if (git('rev-parse', `${head}^`) !== checkpoint.baseHead || git('rev-parse', `${head}^{tree}`) !== checkpoint.commitTree || git('status', '--porcelain')) throw new Error('Unexpected commit/tree or remaining edits; preserved for inspection');
  checkpoint.commit = head; checkpoint.committedSnapshot = snapshot(root); save(); return true;
}
async function taskLoop() {
  while (true) {
    if (existsSync(stopFile)) throw new Error('STOPPED');
    if (checkpoint.configDigest !== configDigest) throw new Error('Configuration changed since checkpoint');
    if (hasBlocker({ ...checkpoint.task, status: 'READY' })) throw new Error('Task artifact is BLOCKED; operator/planner decision required');
    assertTaskScope();
    if (checkpoint.phase !== 'COMMITTED' && checkpoint.phase !== 'APPROVED' && git('rev-parse', 'HEAD') !== checkpoint.baseHead) throw new Error('Git HEAD changed unexpectedly');
    if (checkpoint.phase === 'PLANNING') {
      const prior = existsSync(taskPath(checkpoint.task.id, 'PLAN.md')) ? read(taskPath(checkpoint.task.id, 'PLAN.md')) : '';
      const receipt = await agent('antigravity', 'plan', `Plan task ${checkpoint.task.id}. Approved acceptance criteria: ${checkpoint.task.criteria}. Existing plan: ${prior || '(none)'}. Repository tracked files: ${git('ls-files')}. Return READY only if feasible without Production actions; otherwise BLOCKED. Return explicit relative implementation file paths in paths, and the complete implementation plan with acceptance criteria in details. Do not edit files. Do not expand scope or remove existing blockers.`, ['READY']);
      checkpoint.paths = validatePaths(receipt.result.paths); checkpoint.planReceipt = receipt;
      artifact('PLAN.md', `# Plan: ${checkpoint.task.id}\n\nStatus: APPROVED\n\n${receipt.result.details}\n\nOwned paths: ${checkpoint.paths.join(', ')}\n`);
      transition('READY');
    } else if (checkpoint.phase === 'READY' || checkpoint.phase === 'CHANGES_REQUESTED') {
      if (checkpoint.round >= config.maxRounds) throw new Error('Maximum three implementation/review rounds reached');
      checkpoint.round++; transition('IN_PROGRESS');
    } else if (checkpoint.phase === 'IN_PROGRESS') {
      const receipt = await agent('codex', 'implement', `Implement task ${checkpoint.task.id}. Read .ai-collab/tasks/${checkpoint.task.id}/PLAN.md. Only modify these exact paths: ${checkpoint.paths.join(', ')}. Run relevant tests. Do not stage/commit or edit artifacts. Feedback: ${checkpoint.feedback ?? 'Initial implementation'}. Return READY_FOR_REVIEW with actual changed paths and detailed evidence, or BLOCKED. Required checks run independently by coordinator: ${JSON.stringify(config.checks)}.`, ['READY_FOR_REVIEW']);
      checkpoint.implementation = receipt.result;
      if (!changes(checkpoint.baseline, snapshot(root)).some((path) => checkpoint.paths.includes(path))) throw new Error('Implementation produced no task change');
      implementation('IN_PROGRESS'); transition('TESTING');
    } else if (checkpoint.phase === 'TESTING') {
      if (!await verify()) { implementation('IN_PROGRESS'); transition('CHANGES_REQUESTED'); continue; }
      implementation('READY_FOR_REVIEW'); transition('READY_FOR_REVIEW');
    } else if (checkpoint.phase === 'READY_FOR_REVIEW') {
      if (checkpoint.verifiedDigest !== sourceDigest()) throw new Error('Source changed since tests; re-verification required');
      const receipt = await agent('antigravity', 'review', `Review task ${checkpoint.task.id} against the actual source, diff and evidence supplied below. Return APPROVED only when all acceptance criteria are met; otherwise CHANGES_REQUESTED with actionable feedback, or BLOCKED. Required checks executed by coordinator: ${JSON.stringify(checkpoint.checks)}. Do not approve just because the implementer says PASS.\n${reviewContext()}`, ['APPROVED', 'CHANGES_REQUESTED']);
      checkpoint.reviewReceipt = receipt;
      artifact('REVIEW.md', `# Antigravity review: ${checkpoint.task.id}\n\nStatus: ${receipt.result.status}\nReviewer: Antigravity CLI\nInvocation: ${receipt.sequence}\n\n${receipt.result.summary}\n\n${receipt.result.details}\n`);
      if (receipt.result.status === 'CHANGES_REQUESTED') { checkpoint.feedback = receipt.result.details; transition('CHANGES_REQUESTED'); }
      else {
        transition('APPROVED');
        checkpoint.approvedDigest = digest(snapshot(root)); save();
      }
    } else if (checkpoint.phase === 'APPROVED') {
      if (!checkpoint.reviewReceipt || checkpoint.reviewReceipt.result.status !== 'APPROVED' || checkpoint.checks.length !== config.checks.length || checkpoint.checks.some((c) => c.exitCode !== 0)) throw new Error('Missing verified review/check receipts');
      if (checkpoint.commitTree && verifyCommit()) { transition('COMMITTED'); continue; }
      if (checkpoint.verifiedDigest !== sourceDigest()) throw new Error('Source changed since verified tests');
      if (checkpoint.approvedDigest !== digest(snapshot(root))) throw new Error('Files changed after review; fresh review required');
      if (!checkpoint.commitTree) {
        if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes');
        const paths = changedWorkingPaths();
        git('add', '--', ...paths); scanStaged();
        checkpoint.commitTree = git('write-tree'); save();
      } else if (git('write-tree') !== checkpoint.commitTree) throw new Error('Index changed since commit checkpoint');
      const identity = checkpoint.identity;
      const receipt = await agent('codex', 'commit', `Antigravity approved this task; coordinator independently passed checks, scanned and staged exact task files. You are in read-only mode. Do not run write commands, stage, commit, edit, amend, reset, push, or deploy. Request the coordinator's narrow Git executor to create ONE local commit. Return status COMMIT_REQUESTED and details as a JSON string encoding exactly {"parent":"${checkpoint.baseHead}","tree":"${checkpoint.commitTree}","message":${JSON.stringify(checkpoint.title)}}. Verify supplied review/check evidence: ${JSON.stringify(checkpoint.checks)}; reviewer summary: ${checkpoint.reviewReceipt.result.summary}. Return BLOCKED if not appropriate.`, ['COMMIT_REQUESTED']);
      const request = JSON.parse(receipt.result.details);
      if (request.parent !== checkpoint.baseHead || request.tree !== checkpoint.commitTree || request.message !== checkpoint.title) throw new Error('Codex commit request does not match approved Git state');
      checkpoint.commitRequest = receipt; save();
      if (checkpoint.approvedDigest !== digest(snapshot(root)) || git('write-tree') !== checkpoint.commitTree || git('rev-parse', 'HEAD') !== checkpoint.baseHead) throw new Error('Git state changed before fixed commit execution');
      git('-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`, 'commit', '-m', checkpoint.title);
      if (!verifyCommit()) throw new Error('Fixed commit execution did not create the expected commit');
      transition('COMMITTED');
    } else if (checkpoint.phase === 'COMMITTED') {
      // Metadata cannot contain its own commit hash. Persist the implementation hash in a second, scoped commit.
      if (git('rev-parse', 'HEAD') !== checkpoint.commit) {
        if (checkpoint.metadataTree && git('rev-parse', 'HEAD^') === checkpoint.commit && git('rev-parse', 'HEAD^{tree}') === checkpoint.metadataTree && !git('status', '--porcelain')) return;
        throw new Error('Unexpected HEAD during metadata recovery');
      }
      const metadataPaths = ['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', `.ai-collab/tasks/${checkpoint.task.id}/IMPLEMENTATION.md`];
      assertScope(checkpoint.committedSnapshot, snapshot(root), metadataPaths);
      implementation('READY_FOR_REVIEW');
      const data = backlog(), task = data.tasks.find((t) => t.id === checkpoint.task.id);
      setTaskRow(data, task, 'DONE', checkpoint.commit);
      let state = read(join(workspace, 'STATE.md'));
      for (const [key, value] of Object.entries({ 'Active task': '-', 'Current phase': 'IDLE', 'Last completed task': task.id, 'Next task': nextTask(backlog().tasks)?.id ?? '-', Blockers: '-', 'Last successful commit': checkpoint.commit })) state = replaceField(state, key, value);
      writeFileSync(join(workspace, 'STATE.md'), state);
      git('add', '--', '.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', `.ai-collab/tasks/${task.id}/IMPLEMENTATION.md`); scanStaged();
      checkpoint.metadataTree = git('write-tree'); save();
      git('-c', `user.name=${checkpoint.identity.name}`, '-c', `user.email=${checkpoint.identity.email}`, 'commit', '-m', `docs(agents): record ${task.id} completion`);
      if (git('rev-parse', 'HEAD^') !== checkpoint.commit || git('rev-parse', 'HEAD^{tree}') !== checkpoint.metadataTree || git('status', '--porcelain')) throw new Error('Metadata commit verification failed; inspect preserved workspace');
      return;
    } else throw new Error(`Cannot resume phase ${checkpoint.phase}`);
  }
}
async function run(resume) {
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  acquireLock(lock, resume);
  const stop = () => writeFileSync(stopFile, 'stop\n');
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    if (resume) {
      if (!existsSync(checkpointPath)) throw new Error('No checkpoint to resume');
      checkpoint = JSON.parse(read(checkpointPath));
      if (checkpoint.status === 'BLOCKED') throw new Error('BLOCKED checkpoint requires investigation; it cannot be silently resumed');
      rmSync(stopFile, { force: true });
    } else {
      if (existsSync(checkpointPath) && !['DONE', 'IDLE'].includes(JSON.parse(read(checkpointPath)).status)) throw new Error('Unfinished checkpoint; use status/resume');
      if (git('status', '--porcelain')) throw new Error('Dirty working tree preserved. Run from a clean dedicated checkout; do not reset/stash other work');
      rmSync(stopFile, { force: true });
    }
    while (true) {
      if (!checkpoint?.task || ['DONE', 'IDLE'].includes(checkpoint.status)) {
        const task = select();
        if (!task) { checkpoint = { status: 'IDLE', phase: 'IDLE', configDigest }; save(); event('NO_ELIGIBLE_TASK', { blockedTasks: backlog().tasks.filter(hasBlocker).map((t) => t.id) }); return; }
        if (git('status', '--porcelain')) throw new Error('Working tree is not clean before next task');
        const identity = { name: git('log', '-1', '--format=%an'), email: git('log', '-1', '--format=%ae') };
        if (!identity.name || !identity.email.includes('@') || /\.local$/.test(identity.email)) throw new Error('Configure an approved Git identity first');
        checkpoint = { task, status: 'RUNNING', phase: 'PLANNING', paths: [], round: 0, baseHead: git('rev-parse', 'HEAD'), baseline: snapshot(root), identity, configDigest, scriptsDigest: digest(requiredScripts()), title: `feat(${task.id}): implement approved task` };
        transition('PLANNING');
      }
      await taskLoop();
      checkpoint.status = 'DONE'; save(); event('DONE', { commit: checkpoint.commit, metadataCommit: git('rev-parse', 'HEAD') });
      // Continue the next eligible task without an IDE-to-IDE message.
    }
  } catch (error) {
    if (checkpoint?.task && checkpoint.status !== 'BLOCKED') {
      checkpoint.status = error.message === 'STOPPED' ? 'STOPPED' : 'BLOCKED'; checkpoint.error = error.message; save();
      if (checkpoint.status === 'BLOCKED') {
        artifact('IMPLEMENTATION.md', `# Implementation: ${checkpoint.task.id}\n\nStatus: BLOCKED\n\n${error.message}\n\nSee local checkpoint and logs; preserve all working changes.\n`);
        updateState('BLOCKED', error.message);
        const data = backlog(), task = data.tasks.find((t) => t.id === checkpoint.task.id); setTaskRow(data, task, 'BLOCKED');
      }
      event(checkpoint.status, { reason: error.message });
    }
    throw error;
  } finally { rmSync(lock, { recursive: true }); process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}

const action = process.argv[2];
try {
  if (action === 'run' || action === 'resume') await run(action === 'resume');
  else if (action === 'status') console.log(JSON.stringify({ checkpoint: existsSync(checkpointPath) ? JSON.parse(read(checkpointPath)) : null, next: select()?.id ?? null, blocked: backlog().tasks.filter(hasBlocker).map((t) => t.id), lock: existsSync(join(lock, 'owner.json')) ? JSON.parse(read(join(lock, 'owner.json'))) : null, receipts: existsSync(runtime) ? readdirSync(runtime).filter((name) => name.endsWith('.receipt.json')).length : 0 }, null, 2));
  else if (action === 'stop') { mkdirSync(runtime, { recursive: true }); writeFileSync(stopFile, 'stop\n'); console.log('Stop requested; active child will be terminated and checkpoint preserved.'); }
  else throw new Error('Usage: node .ai-collab/orchestrator.mjs run|resume|status|stop');
} catch (error) { console.error(`Orchestrator stopped: ${error.message}`); process.exitCode = 1; }
