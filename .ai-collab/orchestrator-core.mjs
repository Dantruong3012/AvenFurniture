import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['READY', 'READY_FOR_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'COMMIT_REQUESTED', 'BLOCKED'] },
    summary: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, details: { type: 'string' },
  }, required: ['status', 'summary', 'paths', 'details'],
};
export function validateResult(value, allowed) {
  if (!value || !allowed.includes(value.status) || typeof value.summary !== 'string' || !value.summary.trim() || typeof value.details !== 'string' || !Array.isArray(value.paths) || value.paths.some((p) => typeof p !== 'string')) throw new Error('Invalid agent structured result');
  return value;
}
export function atomicJSON(path, value) {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
export function gitAt(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Git ${args[0]} failed`);
  return result.stdout.trimEnd();
}
export function snapshot(root) {
  const paths = gitAt(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  return Object.fromEntries([...new Set(paths)].sort().map((path) => {
    const full = join(root, path);
    let stat;
    try { stat = lstatSync(full); } catch (error) { if (error.code === 'ENOENT') return [path, 'deleted']; throw error; }
    const content = stat.isSymbolicLink() ? readlinkSync(full) : stat.isFile() ? readFileSync(full) : 'directory';
    return [path, createHash('sha256').update(content).update(String(stat.mode)).digest('hex')];
  }));
}
export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function quotaFailure(output, observedAt = Date.now()) {
  if (!/RESOURCE_EXHAUSTED|Individual quota reached/i.test(output ?? '')) return null;
  const reset = String(output).match(/Resets in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  const seconds = reset ? Number(reset[1] ?? 0) * 3600 + Number(reset[2] ?? 0) * 60 + Number(reset[3] ?? 0) : 0;
  return { kind: 'RESOURCE_EXHAUSTED', observedAt: new Date(observedAt).toISOString(), retryAt: seconds > 0 ? new Date(observedAt + seconds * 1000).toISOString() : null };
}
export function assertNoSecrets(content, path) {
  if (/sb_secret_[A-Za-z0-9_-]{12,}|sbp_[a-f0-9]{40}|gh[pousr]_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(content)) throw new Error(`Potential secret in ${path}; value withheld`);
}
export function changes(before, after) { return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path]); }
export function assertScope(before, after, allowed) {
  const unexpected = changes(before, after).filter((p) => !allowed.includes(p));
  if (unexpected.length) throw new Error(`Unowned edits preserved: ${unexpected.join(', ')}`);
}
export function validatePaths(paths) {
  if (!paths.length || new Set(paths).size !== paths.length) throw new Error('Plan must own explicit unique paths');
  for (const path of paths) {
    if (!/^[A-Za-z0-9_./()[\]@-]+$/.test(path) || path.startsWith('/') || path.split('/').some((p) => ['..', '.', ''].includes(p)) || /(^|\/)(\.env[^/]*|\.git|\.vercel|\.codex|\.agents)(\/|$)/.test(path) || path.startsWith('.ai-collab/') || /\.(pem|key)$/.test(path)) throw new Error(`Unsafe plan path: ${path}`);
  }
  return paths;
}
export function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
export function acquireLock(path, resume = false) {
  if (existsSync(path)) {
    const ownerPath = join(path, 'owner.json');
    if (!existsSync(ownerPath)) throw new Error('Lock ownership unknown; inspect before recovery');
    const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
    if (alive(owner.pid) || alive(owner.childPid)) throw new Error('Another coordinator or child is still running');
    if (!resume) throw new Error('Stale lock found; use resume after inspecting status');
    rmSync(path, { recursive: true });
  }
  mkdirSync(path);
  atomicJSON(join(path, 'owner.json'), { pid: process.pid, childPid: null });
}
export async function execute(command, { root, timeoutMs, stopFile, log, onChild = () => {}, input } = {}) {
  if (!Array.isArray(command) || !command.length || command.some((arg) => typeof arg !== 'string') || command.some((arg) => /dangerously|danger-full-access/.test(arg))) throw new Error('Invalid or forbidden command');
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd: root, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '', reason = '', killTimer;
    const kill = (message) => {
      if (reason) return;
      reason = message;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
      killTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ } }, 2000);
    };
    onChild(child.pid);
    const timer = setTimeout(() => kill('TIMEOUT'), timeoutMs);
    const poll = setInterval(() => { if (stopFile && existsSync(stopFile)) kill('STOPPED'); }, 200);
    child.stdout.on('data', (chunk) => { output += chunk; if (output.length > 20 * 1024 * 1024) kill('OUTPUT_LIMIT'); });
    child.stderr.on('data', (chunk) => { errors += chunk; if (errors.length > 20 * 1024 * 1024) kill('OUTPUT_LIMIT'); });
    const cleanup = () => {
      clearTimeout(timer); clearTimeout(killTimer); clearInterval(poll);
      if (reason) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ } }
      onChild(null);
    };
    child.on('error', (error) => { cleanup(); reject(error); });
    child.on('close', (code) => {
      cleanup();
      if (log) writeFileSync(log, output + '\n--- stderr ---\n' + errors, { mode: 0o600 });
      if (reason || code !== 0) {
        const error = new Error(reason || `Process exited ${code}; inspect private log`);
        error.output = output + '\n' + errors;
        return reject(error);
      }
      resolve({ stdout: output, stderr: errors, code });
    });
    child.stdin.end(input ?? '');
  });
}
