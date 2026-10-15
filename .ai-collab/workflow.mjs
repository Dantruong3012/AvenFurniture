#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = join(root, '.ai-collab');
const backlogPath = join(workspace, 'BACKLOG.md');
const statePath = join(workspace, 'STATE.md');
const lockPath = join(workspace, '.lock');
const statuses = new Set(['BACKLOG', 'PLANNING', 'READY', 'IN_PROGRESS', 'TESTING', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'COMMITTED', 'DONE', 'BLOCKED']);
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
    if (cells.length !== 7) fail(`Invalid BACKLOG row ${lineNumber + 1}`);
    const [id, priority, dependencies, owner, status, criteria, hash] = cells;
    if (!taskIdPattern.test(id) || !/^P[0-3]$/.test(priority) || !statuses.has(status) || !owner || !criteria || !hash) fail(`Invalid BACKLOG row ${lineNumber + 1}`);
    if (tasks.some((task) => task.id === id)) fail(`Duplicate task ${id}`);
    tasks.push({ id, priority, dependencies: dependencies === '-' ? [] : dependencies.split(',').map((dep) => dep.trim()), owner, status, criteria, hash, lineNumber, cells });
  }
  for (const task of tasks) for (const dep of task.dependencies) {
    if (!taskIdPattern.test(dep) || dep === task.id || !tasks.some((candidate) => candidate.id === dep)) fail(`Invalid dependency ${dep} on ${task.id}`);
  }
  return { content, lines, tasks };
}
function nextTask(tasks) {
  return tasks.filter((task) => task.status === 'READY' && task.dependencies.every((dep) => tasks.find((candidate) => candidate.id === dep)?.status === 'DONE'))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.lineNumber - b.lineNumber)[0] ?? null;
}
function setTaskRow(data, task, status, hash = task.hash) {
  const cells = [...task.cells];
  cells[4] = status;
  cells[6] = hash;
  data.lines[task.lineNumber] = `| ${cells.join(' | ')} |`;
  writeFileSync(backlogPath, data.lines.join('\n'));
}
function statusOf(path) { return field(read(path), 'Status'); }
function taskPath(id, filename) { return join(workspace, 'tasks', id, filename); }
function changedPaths(content) {
  const value = field(content, 'Changed paths');
  if (!value) fail('IMPLEMENTATION.md needs Changed paths: path, path');
  const paths = value.split(',').map((part) => part.trim());
  if (paths.some((path) => !path || path.startsWith('/') || path.includes('..') || path.startsWith('.env') || path.includes('\\') || path.includes('|'))) fail('Unsafe Changed paths manifest');
  return [...new Set(paths)];
}
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
    if (/sb_secret_[A-Za-z0-9_-]{12,}|sk_live_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(blob.stdout)) fail(`Potential secret in staged path: ${path}`);
  }
  command('git', ['diff', '--cached', '--check'], { capture: true });
}
function doctor() {
  const data = backlog();
  const approval = field(data.content, 'Roadmap approval');
  const state = read(statePath);
  for (const name of ['Active task', 'Current phase', 'Last completed task', 'Next task', 'Blockers', 'Last successful commit']) if (!field(state, name)) fail(`STATE.md missing ${name}`);
  const agy = spawnSync('agy', ['--version'], { encoding: 'utf8' });
  const codex = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  const next = nextTask(data.tasks);
  console.log(JSON.stringify({ backlogTasks: data.tasks.length, roadmapApproval: approval, nextReadyTask: next?.id ?? null, antigravityCli: agy.error ? 'missing' : agy.status === 0 ? 'available' : 'unverified', codexCli: codex.error ? 'missing' : codex.status === 0 ? 'available' : 'unverified' }, null, 2));
}
function complete(id) {
  if (!taskIdPattern.test(id ?? '')) fail('Provide a valid task ID');
  const data = backlog();
  const task = data.tasks.find((item) => item.id === id);
  if (!task || task.status !== 'APPROVED') fail(`Task ${id} is not APPROVED in BACKLOG.md`);
  if (task.dependencies.some((dep) => data.tasks.find((item) => item.id === dep)?.status !== 'DONE')) fail('Dependencies are not DONE');
  if (field(data.content, 'Roadmap approval') !== 'APPROVED') fail('Roadmap is not approved');
  const planPath = taskPath(id, 'PLAN.md');
  const implPath = taskPath(id, 'IMPLEMENTATION.md');
  const reviewPath = taskPath(id, 'REVIEW.md');
  for (const path of [planPath, implPath, reviewPath]) if (!existsSync(path)) fail(`Missing ${path}`);
  if (statusOf(planPath) !== 'APPROVED' || statusOf(implPath) !== 'READY_FOR_REVIEW' || statusOf(reviewPath) !== 'APPROVED') fail('Plan, implementation, or Antigravity review lacks approval');
  const impl = read(implPath);
  const title = field(impl, 'Commit');
  if (!/^(feat|fix|refactor|test|docs)\([a-z0-9-]+\): .{5,}$/.test(title ?? '')) fail('IMPLEMENTATION.md needs a conventional Commit: title');
  const owned = changedPaths(impl);
  const allowed = new Set([...owned, ...[planPath, implPath, reviewPath, backlogPath, statePath].map((path) => path.slice(root.length + 1))]);
  const existing = changedWorkingPaths();
  const unexpected = existing.filter((path) => !allowed.has(path));
  if (unexpected.length) fail(`Unowned working-tree changes: ${unexpected.join(', ')}`);
  if (git('diff', '--cached', '--name-only')) fail('Index already contains staged changes');
  if (!existing.length) fail('No task changes to commit');
  mkdirSync(lockPath); // atomic single-coordinator lock; never remove another process's lock
  try {
    for (const script of ['lint', 'typecheck', 'test', 'build']) command('npm', ['run', script]);
    command('git', ['add', '--', ...existing]);
    scanStaged();
    if (!git('diff', '--cached', '--name-only')) fail('Nothing was staged');
    command('git', ['var', 'GIT_AUTHOR_IDENT'], { capture: true });
    command('git', ['commit', '-m', title]);
    const hash = git('rev-parse', 'HEAD');
    writeFileSync(implPath, replaceField(impl, 'Commit hash', hash));
    setTaskRow(data, task, 'DONE', hash);
    let state = read(statePath);
    state = replaceField(state, 'Active task', '-');
    state = replaceField(state, 'Current phase', 'IDLE');
    state = replaceField(state, 'Last completed task', id);
    state = replaceField(state, 'Last successful commit', hash);
    state = replaceField(state, 'Next task', nextTask(data.tasks.map((item) => item.id === id ? { ...item, status: 'DONE' } : item))?.id ?? '-');
    writeFileSync(statePath, state);
    command('git', ['add', '--', implPath.slice(root.length + 1), backlogPath.slice(root.length + 1), statePath.slice(root.length + 1)]);
    scanStaged();
    command('git', ['commit', '-m', `docs(agents): record ${id} completion`]);
    console.log(JSON.stringify({ task: id, implementationCommit: hash, metadataCommit: git('rev-parse', 'HEAD'), nextTask: field(state, 'Next task') }, null, 2));
  } finally { rmSync(lockPath, { recursive: true }); }
}

try {
  const [action, id] = process.argv.slice(2);
  if (action === 'doctor') doctor();
  else if (action === 'next') { const task = nextTask(backlog().tasks); console.log(task?.id ?? '-'); }
  else if (action === 'complete') complete(id);
  else fail('Usage: node .ai-collab/workflow.mjs doctor|next|complete <task-id>');
} catch (error) { console.error(`Workflow stopped: ${error.message}`); process.exitCode = 1; }
