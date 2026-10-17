#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoSecrets } from './orchestrator-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = join(root, '.ai-collab');
const backlogPath = join(workspace, 'BACKLOG.md');
const statePath = join(workspace, 'STATE.md');
const statuses = new Set(['BACKLOG', 'PLANNING', 'READY', 'IN_PROGRESS', 'TESTING', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'COMMITTED', 'DONE', 'BLOCKED', 'PAUSED_QUOTA']);
const scopeApprovals = new Set(['APPROVED', 'NEEDS_DECISION']);
const taskIdPattern = /^[a-z0-9][a-z0-9-]*$/;

function fail(message) { throw new Error(message); }
function command(bin, args, { capture = false } = {}) {
  const result = spawnSync(bin, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) fail(`${bin}: ${result.error.message}`);
  if (result.status !== 0) fail(`${bin} ${args[0] ?? ''} failed (${result.status})`);
  return result.stdout ?? '';
}
function git(...args) { return command('git', args, { capture: true }).trim(); }
function read(path) { return readFileSync(path, 'utf8'); }
function field(content, name) {
  const found = content.match(new RegExp(`^${name}: (.+)$`, 'm'));
  return found?.[1]?.trim() ?? null;
}
function replaceField(content, name, value) {
  const pattern = new RegExp(`^${name}: .+$`, 'm');
  if (!pattern.test(content)) fail(`Missing ${name} field`);
  return content.replace(pattern, `${name}: ${value}`);
}
function backlog() {
  const content = read(backlogPath);
  const tasks = [];
  const lines = content.split('\n');
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];
    if (!line.startsWith('| ') || line.includes('| ---') || line.startsWith('| Task ID ')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 8) fail(`Invalid BACKLOG row ${lineNumber + 1}`);
    const [id, priority, dependencies, owner, status, scopeApproval, criteria, hash] = cells;
    if (!taskIdPattern.test(id) || !/^P[0-3]$/.test(priority) || !statuses.has(status) || !scopeApprovals.has(scopeApproval) || !owner || !criteria || !hash) fail(`Invalid BACKLOG row ${lineNumber + 1}`);
    if (tasks.some((task) => task.id === id)) fail(`Duplicate task ${id}`);
    tasks.push({ id, priority, dependencies: dependencies === '-' ? [] : dependencies.split(',').map((dep) => dep.trim()), owner, status, scopeApproval, criteria, hash, lineNumber, cells });
  }
  for (const task of tasks) for (const dep of task.dependencies) {
    if (!taskIdPattern.test(dep) || dep === task.id || !tasks.some((candidate) => candidate.id === dep)) fail(`Invalid dependency ${dep} on ${task.id}`);
  }
  return { content, lines, tasks };
}
function hasBlocker(task) {
  return ['BLOCKED', 'PAUSED_QUOTA'].includes(task.status) || ['PLAN.md', 'IMPLEMENTATION.md', 'REVIEW.md'].some((name) => {
    const path = taskPath(task.id, name);
    return existsSync(path) && (statusOf(path) === 'BLOCKED' || (name === 'PLAN.md' && statusOf(path) === 'REVISED'));
  });
}
function nextTask(tasks) {
  return tasks.filter((task) => task.scopeApproval === 'APPROVED' && ['READY', 'BACKLOG'].includes(task.status) && !hasBlocker(task) && task.dependencies.every((dep) => tasks.some((candidate) => candidate.id === dep && candidate.status === 'DONE' && !hasBlocker(candidate))))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.lineNumber - b.lineNumber)[0] ?? null;
}
function setTaskRow(data, task, status, hash = task.hash) {
  const cells = [...task.cells];
  cells[4] = status;
  cells[7] = hash;
  data.lines[task.lineNumber] = `| ${cells.join(' | ')} |`;
  writeFileSync(backlogPath, data.lines.join('\n'));
}
function statusOf(path) { return field(read(path), 'Status'); }
function taskPath(id, filename) { return join(workspace, 'tasks', id, filename); }
function changedWorkingPaths() {
  const output = command('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { capture: true });
  const entries = output.split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    paths.push(entry.slice(3));
    if (entry[0] === 'R' || entry[1] === 'R' || entry[0] === 'C' || entry[1] === 'C') paths.push(entries[++index]);
  }
  return paths;
}
function scanStaged() {
  const paths = command('git', ['diff', '--cached', '--name-only', '-z'], { capture: true }).split('\0').filter(Boolean);
  for (const path of paths) {
    if (/(^|\/)\.env|\.pem$|\.key$|credentials|secret/i.test(path)) fail(`Sensitive staged path: ${path}`);
    const blob = spawnSync('git', ['show', `:${path}`], { cwd: root, encoding: 'utf8' });
    if (blob.status !== 0) continue; // deleted path
    assertNoSecrets(blob.stdout, path);
  }
  command('git', ['diff', '--cached', '--check'], { capture: true });
}
function doctor() {
  const data = backlog();
  const approval = field(data.content, 'Roadmap approval');
  const state = read(statePath);
  for (const name of ['Active task', 'Current phase', 'Last completed task', 'Next task', 'Blockers', 'Last successful commit']) if (!field(state, name)) fail(`STATE.md missing ${name}`);
  const agy = spawnSync('agy', ['--help'], { encoding: 'utf8' });
  const codex = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  const next = nextTask(data.tasks);
  console.log(JSON.stringify({ backlogTasks: data.tasks.length, roadmapApproval: approval, nextReadyTask: next?.id ?? null, antigravityCli: agy.error ? 'missing' : agy.status === 0 ? 'available' : 'unverified', codexCli: codex.error ? 'missing' : codex.status === 0 ? 'available' : 'unverified' }, null, 2));
}
function complete(id) {
  if (!taskIdPattern.test(id ?? '')) fail('Provide a valid task ID');
  const checkpointPath = join(workspace, '.runtime', 'checkpoint.json');
  if (!existsSync(checkpointPath)) fail('No coordinator receipts. Start orchestrator.mjs run; Markdown approval alone cannot authorize automatic commit');
  const checkpoint = JSON.parse(read(checkpointPath));
  if (checkpoint.task?.id !== id || !['APPROVED', 'COMMITTED'].includes(checkpoint.phase) || checkpoint.status === 'BLOCKED') fail('Task has no resumable approved coordinator checkpoint');
  const result = spawnSync(process.execPath, [join(workspace, 'orchestrator.mjs'), 'resume'], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) fail('Coordinator did not complete; inspect orchestrator status');
}

export { root, workspace, backlog, nextTask, hasBlocker, field, replaceField, setTaskRow, taskPath, statusOf, changedWorkingPaths, scanStaged, git };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  const [action, id] = process.argv.slice(2);
  if (action === 'doctor') doctor();
  else if (action === 'next') { const task = nextTask(backlog().tasks); console.log(task?.id ?? '-'); }
  else if (action === 'complete') complete(id);
  else fail('Usage: node .ai-collab/workflow.mjs doctor|next|complete <task-id>');
} catch (error) { console.error(`Workflow stopped: ${error.message}`); process.exitCode = 1; }
