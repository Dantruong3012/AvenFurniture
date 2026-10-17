import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['READY', 'READY_FOR_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'COMMIT_REQUESTED', 'BLOCKED'] },
    summary: { type: 'string' }, paths: { type: 'array', description: 'For Planning, exact application source, test, and local migration paths only. Lifecycle artifacts under .ai-collab/ are coordinator-owned and must be omitted.', items: { type: 'string' } }, details: { type: 'string' },
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
export function quotaFailure(output, observedAt = Date.now(), agentHint = null) {
  const message = String(output ?? '');
  const antigravity = /RESOURCE_EXHAUSTED|Individual quota reached/i.test(message);
  const codexPattern = /(?:you(?:'|’)ve hit your usage limit|usage limit[^\n]{0,160}(?:purchase more credits|try again at))/i;
  const codexEvents = message.split('\n').flatMap((line) => {
    try { const event = JSON.parse(line); return event && typeof event === 'object' && typeof event.type === 'string' ? [event] : []; }
    catch { return []; }
  });
  // Ignore the same words when they merely appear in a file or command output
  // read by Codex. A structured failure event is authoritative when present.
  const failures = codexEvents.filter((event) => ['turn.failed', 'error'].includes(event.type));
  const codex = codexEvents.length
    ? failures.some((event) => codexPattern.test(String(event.error?.message ?? event.message ?? '')))
    : codexPattern.test(message);
  if (agentHint === 'codex' ? !codex : agentHint === 'antigravity' ? !antigravity : !antigravity && !codex) return null;
  const agent = agentHint ?? (codex ? 'codex' : 'antigravity');
  const reset = message.match(/Resets in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  const seconds = reset ? Number(reset[1] ?? 0) * 3600 + Number(reset[2] ?? 0) * 60 + Number(reset[3] ?? 0) : 0;
  // A bare "try again at 5:26 AM" has no date or timezone. Never infer a reset
  // from the host clock; require an operator-confirmed CLI proof before resume.
  return { kind: 'RESOURCE_EXHAUSTED', agent, observedAt: new Date(observedAt).toISOString(), retryAt: seconds > 0 && agent === 'antigravity' ? new Date(observedAt + seconds * 1000).toISOString() : null };
}
export function contextFailure(output) {
  if (quotaFailure(output)) return false;
  return /(?:context window (?:is )?(?:full|exceeded)|maximum context length|context[_ -]?length[_ -]?exceeded|prompt (?:is )?too long|input token limit exceeded|too many tokens for (?:the )?context)/i.test(String(output ?? ''));
}
export function agentTokenUsage(kind, output) {
  let usage;
  try {
    if (kind === 'antigravity') usage = JSON.parse(output).usage;
    else {
      const entries = output.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      usage = entries.findLast((entry) => entry.type === 'turn.completed')?.usage;
    }
  } catch { return null; }
  if (!usage || typeof usage !== 'object') return null;
  const input = usage.input_tokens ?? usage.inputTokens;
  const outputTokens = usage.output_tokens ?? usage.outputTokens;
  const total = usage.total_tokens ?? usage.totalTokens ?? (Number(input) + Number(outputTokens));
  if (![input, outputTokens, total].every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  return { inputTokens: input, outputTokens, totalTokens: total };
}
export function tokenWarning(usage) {
  if (!usage) return null;
  // A conservative per-turn warning, not a provider quota or context-remaining estimate.
  return usage.inputTokens >= 32000 || usage.outputTokens >= 8000 || usage.totalTokens >= 40000
    ? 'TOKEN_USAGE_HIGH' : null;
}
export function handoffMarkdown({ task, phase, status, branch, head, changedPaths = [], receipts = [], usage = null, reason, nextAction }) {
  const safe = (value) => String(value ?? '-').replace(/[\r\n|`]/g, ' ').slice(0, 300);
  const list = (values) => values.length ? values.map((value) => `- ${safe(value)}`).join('\n') : '- None';
  return `# AvenFurniture agent handoff\n\nGenerated: ${new Date().toISOString()}\nTask: ${safe(task)}\nPhase: ${safe(phase)}\nStatus: ${safe(status)}\nReason: ${safe(reason)}\nBranch: ${safe(branch)}\nHEAD: ${safe(head)}\nToken usage (last completed CLI turn): ${usage ? `${usage.inputTokens} input, ${usage.outputTokens} output, ${usage.totalTokens} total` : 'unavailable'}\n\n## Changed paths\n\n${list(changedPaths)}\n\n## Receipt files\n\n${list(receipts)}\n\n## Safe next action\n\n${safe(nextAction)}\n\nThis is a checkpoint summary, not an approval or a claim that tests passed. Inspect the saved checkpoint and real receipts before resuming. No credentials or raw model output are copied here.\n`;
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
    if (owner.externalOperation) throw new Error('Interrupted external Git operation; inspect child processes and remote SHA before operator lock recovery');
    if (!resume) throw new Error('Stale lock found; use resume after inspecting status');
    rmSync(path, { recursive: true });
  }
  mkdirSync(path);
  atomicJSON(join(path, 'owner.json'), { pid: process.pid, childPid: null });
}
export function releaseLock(path) {
  const owner = join(path, 'owner.json');
  if (existsSync(owner) && JSON.parse(readFileSync(owner, 'utf8')).externalOperation) return;
  rmSync(path, { recursive: true });
}
export function agentEnvironment(source = process.env) {
  const environment = { ...source };
  for (const name of Object.keys(environment)) {
    if (/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|ACCESS_KEY|PRIVATE_KEY|API_KEY)/i.test(name) || /^(?:DATABASE_URL|CLOUDINARY_URL|AWS_.*|STRIPE_.*)$/i.test(name)) delete environment[name];
  }
  return environment;
}
export function redactSensitive(output, source = process.env) {
  let redacted = String(output);
  for (const [name, value] of Object.entries(source)) {
    if (/(?:TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL)/i.test(name) && typeof value === 'string' && value.length >= 8) redacted = redacted.replaceAll(value, '[REDACTED]');
  }
  return redacted;
}
export async function execute(command, { root, timeoutMs, stopFile, log, onChild = () => {}, input, env = process.env } = {}) {
  if (!Array.isArray(command) || !command.length || command.some((arg) => typeof arg !== 'string') || command.some((arg) => /dangerously|danger-full-access/.test(arg))) throw new Error('Invalid or forbidden command');
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd: root, detached: true, stdio: ['pipe', 'pipe', 'pipe'], env });
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
      if (log) writeFileSync(log, redactSensitive(output + '\n--- stderr ---\n' + errors), { mode: 0o600 });
      if (reason || code !== 0) {
        const error = new Error(reason || `Process exited ${code}; inspect private log`);
        error.output = redactSensitive(output + '\n' + errors);
        return reject(error);
      }
      resolve({ stdout: redactSensitive(output), stderr: redactSensitive(errors), code });
    });
    child.stdin.end(input ?? '');
  });
}
