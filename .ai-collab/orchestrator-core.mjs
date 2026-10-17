import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['READY', 'READY_FOR_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'COMMIT_REQUESTED', 'BLOCKED'] },
    summary: { type: 'string' }, paths: { type: 'array', description: 'For Planning, exact application source, test, and local migration paths only. Lifecycle artifacts under .ai-collab/ are coordinator-owned and must be omitted.', items: { type: 'string' } }, details: { type: 'string' },
    code: { type: 'string', description: 'Optional machine-readable error or blocker code, e.g. ALLOWLIST_EXCLUDED.' },
    requestedPaths: { type: 'array', description: 'Optional list of additional paths requested when blocked by allowlist.', items: { type: 'string' } },
  }, required: ['status', 'summary', 'paths', 'details', 'code', 'requestedPaths'],
};
export function validateResult(value, allowed) {
  if (!value || !allowed.includes(value.status) || typeof value.summary !== 'string' || !value.summary.trim() || typeof value.details !== 'string' || !Array.isArray(value.paths) || value.paths.some((p) => typeof p !== 'string')) throw new Error('Invalid agent structured result');
  if (value.code !== undefined && typeof value.code !== 'string') throw new Error('Invalid agent structured result code');
  if (value.requestedPaths !== undefined && (!Array.isArray(value.requestedPaths) || value.requestedPaths.some((p) => typeof p !== 'string'))) throw new Error('Invalid agent structured result requestedPaths');
  return value;
}
export function isAllowlistBlocker(structuredOrError) {
  if (!structuredOrError) return false;
  if (typeof structuredOrError === 'object' && structuredOrError.code === 'ALLOWLIST_EXCLUDED') return true;
  const text = typeof structuredOrError === 'string'
    ? structuredOrError
    : typeof structuredOrError.summary === 'string'
      ? structuredOrError.summary
      : typeof structuredOrError.message === 'string'
        ? structuredOrError.message
        : '';
  if (/incompatible with the existing database constraint/i.test(text)) return false;
  return /(?:exact path allowlist excludes|cannot be implemented within the authorized files|cannot pass within the file allowlist|file allowlist|allowlist excludes|outside (?:the )?authorized files)/i.test(text);
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
  const input = usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens;
  const outputTokens = usage.output_tokens ?? usage.outputTokens;
  const total = usage.total_tokens ?? usage.totalTokens ?? (Number(input) + Number(outputTokens));
  if (![input, outputTokens, total].every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  const cachedInputTokens = usage.cached_input_tokens ?? usage.cachedInputTokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0;
  const toolCalls = usage.tool_calls ?? usage.toolCalls ?? usage.tool_call_count ?? 0;
  return { inputTokens: input, cachedInputTokens: Number.isSafeInteger(cachedInputTokens) && cachedInputTokens >= 0 ? cachedInputTokens : 0, outputTokens, totalTokens: total, toolCalls: Number.isSafeInteger(toolCalls) && toolCalls >= 0 ? toolCalls : 0 };
}
export function evaluateBudget(telemetry, budgets = {}) {
  const phase = telemetry?.phase ?? telemetry?.operation ?? 'default';
  const budget = budgets[phase] ?? budgets.default ?? {};
  const metrics = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'totalTokens', 'toolCalls', 'shellOutputBytes', 'durationMs'];
  const exceeded = metrics.filter((key) => Number.isFinite(budget[key]) && Number(telemetry?.[key] ?? 0) > budget[key]);
  return { phase, exceeded, warning: exceeded.length ? 'PHASE_BUDGET_EXCEEDED' : null };
}
export function summarizeCheckOutput(output, command, logPath) {
  const lines = String(output ?? '').split(/\r?\n/);
  const useful = lines.filter((line) => /(?:\b(?:FAIL|FAILED|ERROR|Error:|AssertionError|Expected:|Received:|not ok\b|✖|×)\b|\b(?:at\s+)?[^\s:]+:\d+(?::\d+)?)/i.test(line))
    .map((line) => line.trim()).filter((line) => line && !/^\s*(?:npm (?:ERR!|error)|Node\.js|\s+at processTicksAndRejections)/i.test(line));
  const excerpts = [...new Set(useful)].slice(0, 30);
  return { command: Array.isArray(command) ? command.join(' ') : String(command ?? ''), exitCode: 1, failedTests: [...new Set(lines.map((line) => line.match(/(?:not ok\s+\d+\s+-\s+|✖\s+)([^\r\n(]+)/)?.[1]?.trim()).filter(Boolean))], excerpts, logPath: String(logPath ?? '') };
}
const mdSafe = (value) => String(value ?? '').replace(/[\r\n|]/g, ' ').slice(0, 1200).trim();
export function implementationBriefMarkdown(data) { return `# Implementation brief: ${mdSafe(data.task)}\n\n${mdSafe(data.objective)}\n\n## Authorized files\n\n${(data.paths ?? []).map((p) => `- ${mdSafe(p)}`).join('\n') || '- None'}\n\n## Requirements\n\n${mdSafe(data.requirements)}\n\n## Acceptance criteria\n\n${mdSafe(data.acceptanceCriteria)}\n`; }
export function implementationSummaryMarkdown(data) { return `# Implementation summary: ${mdSafe(data.task)}\n\n## Changed files\n\n${(data.paths ?? []).map((p) => `- ${mdSafe(p)}`).join('\n') || '- None'}\n\n## Behavior and evidence\n\n${mdSafe(data.summary)}\n\n${mdSafe(data.details)}\n\n## Limitations / review questions\n\n${mdSafe(data.limitations ?? 'None reported')}\n`; }
export function verifyReportMarkdown(data) { return `# Verification report: ${mdSafe(data.task)}\n\n${(data.checks ?? []).map((c) => `## ${mdSafe(c.command)} — ${c.exitCode === 0 ? 'PASS' : 'FAIL'}\n\n${c.logPath ? `Full log: ${mdSafe(c.logPath)}\n\n` : ''}${c.excerpts?.length ? c.excerpts.map((x) => `- ${mdSafe(x)}`).join('\n') : 'No failure excerpts.'}`).join('\n\n')}\n`; }
export function reworkMarkdown(data) { return `# Rework: ${mdSafe(data.task)}\n\nRound: ${data.round}\n\n## Root cause\n\n${mdSafe(data.rootCause)}\n\n## Required correction\n\n${mdSafe(data.correction)}\n\n## Files\n\n${(data.paths ?? []).map((p) => `- ${mdSafe(p)}`).join('\n') || '- Existing authorized files only'}\n`; }
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
