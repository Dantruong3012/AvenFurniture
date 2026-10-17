#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, workspace, backlog, nextTask, hasBlocker, field, replaceField, setTaskRow, taskPath, changedWorkingPaths, scanStaged, git } from './workflow.mjs';
import { schema, validateResult, atomicJSON, snapshot, digest, changes, assertScope, validatePaths, acquireLock, releaseLock, execute, assertNoSecrets, quotaFailure, contextFailure, agentTokenUsage, tokenWarning, handoffMarkdown, redactSensitive, agentEnvironment, evaluateBudget, summarizeCheckOutput, implementationBriefMarkdown, implementationSummaryMarkdown, verifyReportMarkdown, reworkMarkdown } from './orchestrator-core.mjs';

const runtime = join(workspace, '.runtime');
const checkpointPath = join(runtime, 'checkpoint.json');
const stopFile = join(runtime, 'STOP');
const lock = join(workspace, '.lock');
const config = JSON.parse(readFileSync(join(workspace, 'orchestrator.config.json'), 'utf8'));
const quotaOptimization = config.quotaOptimization === true;
const configDigest = digest(config);
if (!Number.isInteger(config.maxRounds) || config.maxRounds < 1 || config.maxRounds > 3 || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 3600000 || !Array.isArray(config.checks) || config.checks.length < 1 || (config.deterministicCommit !== undefined && typeof config.deterministicCommit !== 'boolean') || (config.commitAgent !== undefined && !['codex', 'orchestrator'].includes(config.commitAgent)) || (config.quotaOptimization !== undefined && typeof config.quotaOptimization !== 'boolean') || (config.budgets !== undefined && (typeof config.budgets !== 'object' || Array.isArray(config.budgets) || Object.values(config.budgets).some((budget) => !budget || typeof budget !== 'object' || Array.isArray(budget) || Object.values(budget).some((limit) => !Number.isFinite(limit) || limit < 0))))) throw new Error('Invalid orchestration limits/checks/budgets');
for (const name of ['antigravity', 'codex', 'checks']) {
  const commands = name === 'checks' ? config.checks : [config[name]];
  for (const command of commands) if (!Array.isArray(command) || !command.length || command.some((v) => typeof v !== 'string' || /dangerously|danger-full-access/.test(v))) throw new Error('Invalid/unsafe CLI configuration');
}
const read = (path) => readFileSync(path, 'utf8');
const runnerReviewPath = '.ai-collab/tasks/orchestrator-quota-recovery/REVIEW.md';
const runnerUpgradePaths = new Set(['.ai-collab/orchestrator.mjs', '.ai-collab/orchestrator-core.mjs', '.ai-collab/workflow.mjs', '.ai-collab/orchestrator.integration.test.mjs', '.ai-collab/orchestrator.test.mjs', '.ai-collab/README.md', '.ai-collab/tasks/orchestrator-quota-recovery/IMPLEMENTATION.md', runnerReviewPath, 'AGENTS.md']);
const planRecoveryReviewPath = '.ai-collab/tasks/orchestrator-plan-path-recovery/REVIEW.md';
const planRecoveryPaths = new Set(['.ai-collab/orchestrator.mjs', '.ai-collab/orchestrator-core.mjs', '.ai-collab/orchestrator.integration.test.mjs', '.ai-collab/orchestrator.test.mjs', '.ai-collab/README.md', '.ai-collab/tasks/orchestrator-plan-path-recovery/IMPLEMENTATION.md', planRecoveryReviewPath]);
const replanReviewPath = '.ai-collab/tasks/orchestrator-replan-recovery/REVIEW.md';
const replanRunnerPaths = new Set(['.ai-collab/orchestrator.mjs', '.ai-collab/orchestrator-core.mjs', '.ai-collab/orchestrator.integration.test.mjs', '.ai-collab/orchestrator.test.mjs', '.ai-collab/README.md', '.ai-collab/tasks/orchestrator-replan-recovery/IMPLEMENTATION.md', replanReviewPath]);
const architectureReviewPath = '.ai-collab/tasks/orchestrator-architecture-recovery/REVIEW.md';
const architectureRunnerPaths = new Set(['.ai-collab/orchestrator.mjs', '.ai-collab/orchestrator.integration.test.mjs', '.ai-collab/README.md', '.ai-collab/tasks/orchestrator-architecture-recovery/PLAN.md', '.ai-collab/tasks/orchestrator-architecture-recovery/IMPLEMENTATION.md', architectureReviewPath]);
const architecturePlanReviewPath = '.ai-collab/tasks/orchestrator-architecture-plan-recovery/REVIEW.md';
const architecturePlanRunnerPaths = new Set(['.ai-collab/orchestrator.mjs', '.ai-collab/orchestrator.integration.test.mjs', '.ai-collab/README.md', '.ai-collab/tasks/orchestrator-architecture-plan-recovery/PLAN.md', '.ai-collab/tasks/orchestrator-architecture-plan-recovery/IMPLEMENTATION.md', architecturePlanReviewPath]);
const gitPermissionReviewPath = '.ai-collab/tasks/orchestrator-git-permission-recovery/REVIEW.md';
const gitPermissionRunnerPaths = new Set(['.ai-collab/orchestrator.mjs', '.ai-collab/orchestrator.integration.test.mjs', '.ai-collab/README.md', '.ai-collab/tasks/orchestrator-git-permission-recovery/PLAN.md', '.ai-collab/tasks/orchestrator-git-permission-recovery/IMPLEMENTATION.md', gitPermissionReviewPath]);
const stoppedPlanRecoveryTask = 'autopilot-checkpoint-resume';
const stoppedPlanProposalPath = `.ai-collab/tasks/${stoppedPlanRecoveryTask}/REVISED-CONSULTANT-PLAN.md`;
const stoppedPlanReviewPath = `.ai-collab/tasks/${stoppedPlanRecoveryTask}/REVIEW.md`;
const stoppedPlanRunnerPaths = new Set(['.ai-collab/autopilot-core.mjs', '.ai-collab/autopilot.test.mjs', '.ai-collab/orchestrator.mjs', '.ai-collab/orchestrator.integration.test.mjs', '.ai-collab/AUTOPILOT.md', '.ai-collab/README.md', `.ai-collab/tasks/${stoppedPlanRecoveryTask}/PLAN.md`, `.ai-collab/tasks/${stoppedPlanRecoveryTask}/IMPLEMENTATION.md`, stoppedPlanReviewPath, stoppedPlanProposalPath]);
const codexQuotaRunnerTask = 'orchestrator-codex-quota-recovery';
const codexQuotaReviewPath = `.ai-collab/tasks/${codexQuotaRunnerTask}/REVIEW.md`;
const codexQuotaRunnerPaths = new Set(['.ai-collab/orchestrator-core.mjs', '.ai-collab/orchestrator.mjs', '.ai-collab/orchestrator.test.mjs', '.ai-collab/orchestrator.integration.test.mjs', '.ai-collab/README.md', '.ai-collab/AUTOPILOT.md', `.ai-collab/tasks/${codexQuotaRunnerTask}/PLAN.md`, `.ai-collab/tasks/${codexQuotaRunnerTask}/IMPLEMENTATION.md`, codexQuotaReviewPath]);
const consultantRevisedPaths = ['components/layout/header.tsx', 'components/admin/catalog-shell.tsx', 'app/consultants/page.tsx', 'app/admin/(protected)/consultants/page.tsx', 'components/consultant/consultant-card.tsx', 'components/consultant/consultant-grid.tsx', 'components/consultant/zalo-contact-button.tsx', 'components/admin/consultant-form.tsx', 'components/admin/consultant-management.tsx', 'lib/consultants/actions.ts', 'lib/consultants/queries.ts', 'lib/repositories/supabaseConsultantRepository.ts', 'lib/validation/consultant.ts', 'tests/admin-consultant.test.mjs', 'tests/consultant.test.mjs'];
const architectureBlocker = 'codex: The approved plan requires statuses incompatible with the existing database constraint; resolution exceeds the authorized paths.';
const inquiryStatuses = ['new', 'consulting', 'completed', 'cancelled'];
const architecturePlanningError = 'Antigravity Planning changed approved inquiry-status semantics';
let checkpoint;
const save = () => atomicJSON(checkpointPath, checkpoint);
function writeHandoff(reason, nextAction = 'Inspect checkpoint and continue with the supported coordinator command.') {
  if (!checkpoint?.task?.id) return;
  // A private, ignored Markdown file stays usable even when an agent cannot answer.
  // Never copy raw prompts, logs, or arbitrary agent text into it.
  let branch = '-', head = '-', changedPaths = [];
  try {
    branch = git('branch', '--show-current');
    head = git('rev-parse', 'HEAD');
    changedPaths = changedWorkingPaths();
  } catch { /* Preserve the checkpoint even if Git inspection fails. */ }
  const receipts = existsSync(runtime)
    ? readdirSync(runtime).filter((name) => name.startsWith(`${checkpoint.task.id}-`) && name.endsWith('.receipt.json')).sort().slice(-8)
    : [];
  const content = handoffMarkdown({ task: checkpoint.task.id, phase: checkpoint.phase, status: checkpoint.status, branch, head, changedPaths, receipts, usage: checkpoint.lastTokenUsage ?? null, reason, nextAction });
  writeFileSync(join(runtime, 'HANDOFF.md'), redactSensitive(content), { mode: 0o600 });
}
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
  writeHandoff('LIFECYCLE_CHECKPOINT');
}
function artifact(name, content) {
  mkdirSync(join(workspace, 'tasks', checkpoint.task.id), { recursive: true });
  writeFileSync(taskPath(checkpoint.task.id, name), content);
}
function pauseQuota(quota) {
  const provider = quota.agent === 'codex' ? 'Codex' : 'Antigravity';
  checkpoint.quota = quota;
  checkpoint.status = 'PAUSED_QUOTA';
  checkpoint.error = `${provider} quota exhausted`;
  save();
  updateState('PAUSED_QUOTA', quota.retryAt ? `${provider} quota; retry after ${quota.retryAt}` : `${provider} quota; confirm availability before resume`);
  writeFileSync(join(workspace, 'STATE.md'), replaceField(read(join(workspace, 'STATE.md')), 'Next task', '-'));
  const data = backlog(), task = data.tasks.find((item) => item.id === checkpoint.task.id);
  setTaskRow(data, task, 'PAUSED_QUOTA');
  event('PAUSED_QUOTA', { agent: quota.agent ?? 'antigravity', retryAt: quota.retryAt });
  writeHandoff('RESOURCE_EXHAUSTED', quota.retryAt ? `After ${quota.retryAt}, inspect status and use resume; use --quota-ready earlier only after a successful CLI proof.` : `Verify ${provider} CLI availability, then use resume --quota-ready.`);
}
function restoreLegacyQuotaArtifact() {
  const path = taskPath(checkpoint.task.id, 'IMPLEMENTATION.md');
  if (!existsSync(path)) return;
  const current = read(path);
  if (!/^# Implementation: [a-z0-9-]+\n\nStatus: BLOCKED\n\nProcess exited \d+; inspect private log\n\nSee local checkpoint and logs; preserve all working changes\.\n$/.test(current)) {
    if (field(current, 'Status') === 'BLOCKED') throw new Error('Existing implementation has a non-quota blocker; preserve it');
    return;
  }
  const prior = git('show', `${checkpoint.baseHead}:.ai-collab/tasks/${checkpoint.task.id}/IMPLEMENTATION.md`);
  writeFileSync(join(runtime, `${checkpoint.task.id}-legacy-quota-implementation.md`), current, { mode: 0o600 });
  writeFileSync(path, `${prior}\n`);
}
function recoverQuota() {
  acquireLock(lock, true);
  try {
    if (!existsSync(checkpointPath)) throw new Error('No checkpoint to recover');
    checkpoint = JSON.parse(read(checkpointPath));
    if (checkpoint.status !== 'BLOCKED' || !['PLANNING', 'READY_FOR_REVIEW'].includes(checkpoint.phase) || !/^Process exited \d+; inspect private log$/.test(checkpoint.error ?? '') || !checkpoint.sequence) throw new Error('Only a legacy CLI-exit BLOCKED checkpoint can be reclassified');
    const operation = checkpoint.phase === 'PLANNING' ? 'plan' : 'review';
    const log = join(runtime, `${checkpoint.task.id}-${checkpoint.sequence}-${operation}.log`);
    if (!existsSync(log) || existsSync(log.replace(/\.log$/, '.receipt.json'))) throw new Error('Missing failed CLI log or a successful receipt exists');
    const quota = quotaFailure(read(log), statSync(log).mtimeMs);
    if (!quota) throw new Error('Log does not prove RESOURCE_EXHAUSTED');
    quota.logDigest = digest(read(log));
    if (checkpoint.phase === 'PLANNING') restoreLegacyQuotaArtifact();
    pauseQuota(quota);
  } finally { rmSync(lock, { recursive: true }); }
}
function adoptReviewedRunner() {
  const head = git('rev-parse', 'HEAD');
  if (head === checkpoint.baseHead) return null;
  if (checkpoint.phase !== 'PLANNING' || checkpoint.round !== 0 || git('merge-base', checkpoint.baseHead, head) !== checkpoint.baseHead) throw new Error('Checkpoint cannot adopt this Git history');
  const committed = git('diff', '--name-only', checkpoint.baseHead, head).split('\n').filter(Boolean);
  if (!committed.length || committed.some((path) => !runnerUpgradePaths.has(path))) throw new Error('Non-runner changes since checkpoint; inspect before recovery');
  if (!committed.includes(runnerReviewPath)) throw new Error('Runner upgrade requires a committed Antigravity review');
  const review = git('show', `${head}:${runnerReviewPath}`);
  if (field(review, 'Status') !== 'APPROVED' || !/^Reviewer: Antigravity\b/m.test(review)) throw new Error('Runner upgrade review is not APPROVED by Antigravity');
  const dirty = changedWorkingPaths();
  const metadata = new Set(['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', `.ai-collab/tasks/${checkpoint.task.id}/IMPLEMENTATION.md`]);
  if (dirty.some((path) => !metadata.has(path))) throw new Error('Uncommitted changes outside paused task metadata; commit reviewed runner first');
  const current = snapshot(root);
  const sourceChanged = changes(checkpoint.baseline, current).filter((path) => !metadata.has(path));
  if (sourceChanged.some((path) => !runnerUpgradePaths.has(path))) throw new Error('Task source changed since quota checkpoint');
  return { baseHead: head, baseline: current, runnerUpgrade: { from: checkpoint.baseHead, to: head, paths: committed } };
}
function recoverPlanPath() {
  acquireLock(lock, true);
  try {
    if (!existsSync(checkpointPath)) throw new Error('No checkpoint to recover');
    checkpoint = JSON.parse(read(checkpointPath));
    const id = checkpoint.task?.id;
    const artifactPath = `.ai-collab/tasks/${id}/IMPLEMENTATION.md`;
    if (checkpoint.status !== 'BLOCKED' || checkpoint.phase !== 'PLANNING' || checkpoint.round !== 0 || checkpoint.error !== `Unsafe plan path: ${artifactPath}` || !checkpoint.sequence || checkpoint.planReceipt || checkpoint.paths?.length) throw new Error('Checkpoint is not the known Planning artifact-path failure');
    if (checkpoint.configDigest !== configDigest) throw new Error('Configuration changed since checkpoint');
    const receiptPath = join(runtime, `${id}-${checkpoint.sequence}-plan.receipt.json`);
    if (!existsSync(receiptPath)) throw new Error('Missing saved Planning receipt');
    const receipt = JSON.parse(read(receiptPath));
    if (receipt.agent !== 'antigravity' || receipt.operation !== 'plan' || receipt.sequence !== checkpoint.sequence || receipt.exitCode !== 0 || receipt.status !== 'READY' || receipt.result?.status !== 'READY' || !receipt.inputDigest || receipt.outputDigest !== receipt.inputDigest) throw new Error('Planning receipt is not a successful read-only invocation');
    validateResult(receipt.result, ['READY']);
    const originalPaths = receipt.result.paths;
    if (originalPaths.filter((path) => path === artifactPath).length !== 1) throw new Error('Planning receipt does not contain the exact lifecycle artifact');
    const paths = validatePaths(originalPaths.filter((path) => path !== artifactPath));
    const blockedArtifact = `# Implementation: ${id}\n\nStatus: BLOCKED\n\n${checkpoint.error}\n\nSee local checkpoint and logs; preserve all working changes.\n`;
    const currentArtifact = taskPath(id, 'IMPLEMENTATION.md');
    const planArtifact = taskPath(id, 'PLAN.md');
    if (existsSync(planArtifact) && field(read(planArtifact), 'Status') !== 'APPROVED') throw new Error('Existing task plan is not APPROVED');
    if (read(currentArtifact) !== blockedArtifact) throw new Error('Implementation artifact changed; preserve it for inspection');
    if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes before Planning recovery');
    const head = git('rev-parse', 'HEAD');
    const previousHead = checkpoint.baseHead;
    if (git('merge-base', checkpoint.baseHead, head) !== checkpoint.baseHead) throw new Error('Checkpoint cannot adopt this Git history');
    const committed = git('diff', '--name-only', checkpoint.baseHead, head).split('\n').filter(Boolean);
    if (!committed.length || committed.some((path) => !planRecoveryPaths.has(path)) || !committed.includes(planRecoveryReviewPath)) throw new Error('Planning recovery requires only reviewed runner changes');
    const review = git('show', `${head}:${planRecoveryReviewPath}`);
    if (field(review, 'Status') !== 'APPROVED' || !/^Reviewer: Antigravity\b/m.test(review)) throw new Error('Planning recovery review is not APPROVED by Antigravity');
    const metadata = new Set(['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', artifactPath]);
    if (changedWorkingPaths().some((path) => !metadata.has(path))) throw new Error('Uncommitted changes outside blocked task metadata');
    const current = snapshot(root);
    if (changes(checkpoint.baseline, current).some((path) => !metadata.has(path) && !planRecoveryPaths.has(path))) throw new Error('Task source changed since Planning checkpoint');
    const prior = git('show', `${checkpoint.baseHead}:${artifactPath}`);
    const savedArtifact = join(runtime, `${id}-${checkpoint.sequence}-blocked-implementation.md`);
    if (existsSync(savedArtifact)) throw new Error('Archived blocked artifact already exists; inspect before retry');
    writeFileSync(savedArtifact, blockedArtifact, { mode: 0o600 });
    writeFileSync(currentArtifact, `${prior}\n`);
    if (!existsSync(planArtifact)) artifact('PLAN.md', `# Plan: ${id}\n\nStatus: APPROVED\n\n${receipt.result.details}\n\nOwned paths: ${paths.join(', ')}\n`);
    checkpoint.paths = paths;
    checkpoint.planReceipt = receipt;
    checkpoint.baseHead = head;
    checkpoint.baseline = snapshot(root);
    checkpoint.runnerUpgrade = { from: previousHead, to: head, paths: committed };
    checkpoint.error = null;
    transition('READY');
    event('PLAN_PATH_RECOVERED', { receipt: checkpoint.sequence, paths });
  } finally { rmSync(lock, { recursive: true }); }
}
function planningContext(plan) {
  const files = git('ls-files', '--', 'app', 'components', 'lib', 'tests').split('\n').filter(Boolean);
  const index = files.join('\n');
  if (index.length > 16000) throw new Error('Planning file index exceeds bounded context; split the task');
  const referenced = [...new Set([...plan.matchAll(/`([A-Za-z0-9_./()[\]@-]+\.(?:tsx?|mjs|css))`/g)].map((match) => match[1]))]
    .filter((path) => files.includes(path)).slice(0, 10);
  const excerpts = referenced.map((path) => {
    const content = read(join(root, path)).slice(0, 1400);
    assertNoSecrets(content, path);
    return `FILE ${path}\n${content}`;
  }).join('\n\n');
  return `Existing tracked application and test paths (exact repository paths, not proposed ownership):\n${index}\n\nRelevant existing file excerpts:\n${excerpts || '(none identified in plan)'}`;
}
function replan() {
  acquireLock(lock, true);
  try {
    if (!existsSync(checkpointPath)) throw new Error('No checkpoint to replan');
    checkpoint = JSON.parse(read(checkpointPath));
    const id = checkpoint.task?.id;
    const data = backlog();
    const task = data.tasks.find((item) => item.id === id);
    if (!id || checkpoint.status !== 'BLOCKED' || checkpoint.phase !== 'IN_PROGRESS' || !task || task.status !== 'BLOCKED' || !/^codex: .*exact path allowlist excludes/i.test(checkpoint.error ?? '')) throw new Error('Only the current blocked allowlist task can be replanned');
    const state = read(join(workspace, 'STATE.md'));
    if (field(state, 'Active task') !== id || field(state, 'Current phase') !== 'BLOCKED') throw new Error('Workflow state does not match blocked checkpoint');
    if (field(data.content, 'Roadmap approval') !== 'APPROVED' || checkpoint.configDigest !== configDigest || checkpoint.scriptsDigest !== digest(requiredScripts())) throw new Error('Approved roadmap or runner configuration changed');
    if (!checkpoint.planReceipt || checkpoint.planReceipt.agent !== 'antigravity' || checkpoint.planReceipt.result?.status !== 'READY' || JSON.stringify(checkpoint.paths) !== JSON.stringify(checkpoint.planReceipt.result.paths)) throw new Error('Original Planning receipt does not match checkpoint ownership');
    const planPath = `.ai-collab/tasks/${id}/PLAN.md`;
    const implPath = `.ai-collab/tasks/${id}/IMPLEMENTATION.md`;
    if (!existsSync(taskPath(id, 'PLAN.md')) || !existsSync(taskPath(id, 'IMPLEMENTATION.md'))) throw new Error('Task artifacts missing');
    const plan = read(taskPath(id, 'PLAN.md'));
    const impl = read(taskPath(id, 'IMPLEMENTATION.md'));
    if (field(plan, 'Status') !== 'APPROVED' || !plan.startsWith(`# Plan: ${id}\n`) || field(impl, 'Status') !== 'BLOCKED' || !impl.includes(checkpoint.error)) throw new Error('Approved revised plan or matching blocker artifact missing');
    const owned = plan.match(/^Owned paths: (.+)$/m)?.[1]?.split(',').map((path) => path.trim());
    if (!owned) throw new Error('Approved plan lacks exact Owned paths');
    validatePaths(owned);
    if (JSON.stringify(owned) === JSON.stringify(checkpoint.paths)) throw new Error('Approved plan has not revised source ownership');
    if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes before replan');
    const head = git('rev-parse', 'HEAD');
    if (git('merge-base', checkpoint.baseHead, head) !== checkpoint.baseHead) throw new Error('Checkpoint cannot adopt this Git history');
    const committed = git('diff', '--name-only', checkpoint.baseHead, head).split('\n').filter(Boolean);
    if (!committed.length || committed.some((path) => !replanRunnerPaths.has(path)) || !committed.includes(replanReviewPath)) throw new Error('Replan requires a reviewed runner-only commit');
    const review = git('show', `${head}:${replanReviewPath}`);
    if (field(review, 'Status') !== 'APPROVED' || !/^Reviewer: Antigravity\b/m.test(review)) throw new Error('Replan runner review is not APPROVED by Antigravity');
    const metadata = new Set(['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', planPath, implPath]);
    if (changedWorkingPaths().some((path) => !metadata.has(path))) throw new Error('Uncommitted changes outside blocked task metadata');
    const current = snapshot(root);
    if (current[planPath] === checkpoint.baseline?.[planPath]) throw new Error('Task plan has not changed since checkpoint');
    if (changes(checkpoint.baseline, current).some((path) => !metadata.has(path) && !replanRunnerPaths.has(path))) throw new Error('Application source changed since blocked checkpoint');
    if (existsSync(join(runtime, `${id}-${checkpoint.sequence}-replan-blocker.md`))) throw new Error('Blocker archive already exists; inspect before retry');
    planningContext(plan); // Validate bounded, secret-free context before changing the checkpoint.
    const original = { phase: checkpoint.phase, round: checkpoint.round, error: checkpoint.error, paths: checkpoint.paths, planReceipt: checkpoint.planReceipt, implementation: checkpoint.implementation ?? null, implementationArtifactDigest: digest(impl), baseHead: checkpoint.baseHead };
    writeFileSync(join(runtime, `${id}-${checkpoint.sequence}-replan-blocker.md`), impl, { mode: 0o600 });
    artifact('IMPLEMENTATION.md', `# Implementation: ${id}\n\nStatus: NOT_STARTED\n\nReplanning after approved architecture revision. Prior blocker and implementation artifact are preserved in the private checkpoint history and archive.\n`);
    checkpoint.replanHistory = [...(checkpoint.replanHistory ?? []), original];
    checkpoint.paths = [];
    checkpoint.approvedReplanPaths = owned;
    checkpoint.planReceipt = null;
    checkpoint.implementation = null;
    checkpoint.feedback = null;
    checkpoint.error = null;
    checkpoint.round = 0;
    checkpoint.baseHead = head;
    checkpoint.baseline = snapshot(root);
    checkpoint.runnerUpgrade = { from: original.baseHead, to: head, paths: committed };
    transition('PLANNING');
    event('REPLAN_READY', { previousSequence: checkpoint.sequence, reviewedPaths: committed });
  } finally { rmSync(lock, { recursive: true }); }
}
function recoverStoppedPlan() {
  acquireLock(lock, true);
  try {
    if (!existsSync(checkpointPath)) throw new Error('No checkpoint to recover');
    checkpoint = JSON.parse(read(checkpointPath));
    const id = checkpoint.task?.id;
    if (id !== 'storefront-consultant-zalo' || checkpoint.status !== 'STOPPED' || checkpoint.phase !== 'IN_PROGRESS' || checkpoint.round !== 1 || checkpoint.error !== 'STOPPED' || !checkpoint.planReceipt || checkpoint.paths?.length !== 16) throw new Error('Only the saved stopped consultant checkpoint can use this recovery');
    const planPath = `.ai-collab/tasks/${id}/PLAN.md`;
    const data = backlog();
    const state = read(join(workspace, 'STATE.md'));
    if (data.tasks.find((task) => task.id === id)?.status !== 'IN_PROGRESS' || field(data.content, 'Roadmap approval') !== 'APPROVED' || field(state, 'Active task') !== id || field(state, 'Current phase') !== 'IN_PROGRESS') throw new Error('Workflow state differs from stopped task');
    if (checkpoint.configDigest !== configDigest || checkpoint.scriptsDigest !== digest(requiredScripts())) throw new Error('Runner configuration or required checks changed');
    const receipt = checkpoint.planReceipt;
    const receiptPath = join(runtime, `${id}-${receipt.sequence}-plan.receipt.json`);
    if (!existsSync(receiptPath) || digest(JSON.parse(read(receiptPath))) !== digest(receipt) || receipt.agent !== 'antigravity' || receipt.operation !== 'plan' || receipt.exitCode !== 0 || receipt.status !== 'READY' || receipt.result?.status !== 'READY' || receipt.inputDigest !== receipt.outputDigest || JSON.stringify(validatePaths(receipt.result.paths)) !== JSON.stringify(checkpoint.paths)) throw new Error('Original Antigravity Planning receipt is missing or changed');
    if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes before stopped-plan recovery');
    const head = git('rev-parse', 'HEAD');
    if (git('rev-parse', `${head}^`) !== checkpoint.baseHead) throw new Error('Recovery requires exactly one reviewed runner commit after the stopped checkpoint');
    const committed = git('diff', '--name-only', checkpoint.baseHead, head).split('\n').filter(Boolean);
    if (!committed.includes('.ai-collab/orchestrator.mjs') || !committed.includes(stoppedPlanReviewPath) || !committed.includes(stoppedPlanProposalPath) || committed.some((path) => !stoppedPlanRunnerPaths.has(path))) throw new Error('Runner upgrade contains unreviewed or missing paths');
    const proposal = git('show', `${head}:${stoppedPlanProposalPath}`);
    const review = git('show', `${head}:${stoppedPlanReviewPath}`);
    if (!proposal.startsWith(`# Plan: ${id}\n`) || field(proposal, 'Status') !== 'APPROVED' || !/^Planner: Antigravity\b/m.test(proposal) || field(proposal, 'Task') !== id || field(review, 'Status') !== 'APPROVED' || !/^Reviewer: Antigravity\b/m.test(review) || field(review, 'Reviewed stopped HEAD') !== checkpoint.baseHead || field(review, 'Reviewed task') !== id || field(review, 'Approved consultant plan digest') !== digest(`${proposal}\n`)) throw new Error('Matching Antigravity plan and review are required');
    const owned = proposal.match(/^Owned paths: (.+)$/m)?.[1]?.split(',').map((path) => path.trim());
    if (!owned || JSON.stringify(validatePaths(owned)) !== JSON.stringify(consultantRevisedPaths)) throw new Error('Revised consultant ownership is not the reviewed schema-compatible set');
    const requiredFacts = ['admin_profiles.user_id', 'enabled', 'false', 'list_public_consultants', 'No live database writes'];
    if (!requiredFacts.every((fact) => proposal.toLowerCase().includes(fact.toLowerCase())) || !proposal.includes('Do not claim biography or specialty fields exist')) throw new Error('Revised plan does not preserve existing-schema constraints');
    const originalPlan = read(taskPath(id, 'PLAN.md'));
    if (!originalPlan.startsWith(`# Plan: ${id}\n`) || field(originalPlan, 'Status') !== 'APPROVED' || !originalPlan.includes('specialties, bios') || !originalPlan.includes(`Owned paths: ${checkpoint.paths.join(', ')}`)) throw new Error('Original plan differs from saved stopped Planning evidence');
    if (existsSync(taskPath(id, 'IMPLEMENTATION.md'))) throw new Error('Interrupted implementation artifact needs inspection before recovery');
    const metadata = new Set(['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', planPath]);
    if (changedWorkingPaths().some((path) => !metadata.has(path))) throw new Error('Uncommitted changes outside stopped task metadata');
    const current = snapshot(root);
    if (changes(checkpoint.baseline, current).some((path) => !metadata.has(path) && !stoppedPlanRunnerPaths.has(path))) throw new Error('Application source changed since stopped checkpoint');
    planningContext(proposal);
    const archive = join(runtime, `${id}-${checkpoint.sequence}-stopped-original-plan.md`);
    if (existsSync(archive)) throw new Error('Original plan archive already exists');
    const original = { status: checkpoint.status, phase: checkpoint.phase, round: checkpoint.round, error: checkpoint.error, paths: checkpoint.paths, planReceipt: receipt, sequence: checkpoint.sequence, baseHead: checkpoint.baseHead, originalPlanDigest: digest(originalPlan) };
    writeFileSync(archive, originalPlan, { mode: 0o600 });
    artifact('PLAN.md', `${proposal}\n`);
    artifact('IMPLEMENTATION.md', `# Implementation: ${id}\n\nStatus: NOT_STARTED\n\nReplanning under the reviewed existing-schema consultant plan. Previous Planning receipt and interrupted-turn evidence remain in the checkpoint history and private archive.\n`);
    checkpoint.replanHistory = [...(checkpoint.replanHistory ?? []), original];
    checkpoint.paths = [];
    checkpoint.approvedReplanPaths = owned;
    checkpoint.planReceipt = null;
    checkpoint.implementation = null;
    checkpoint.feedback = null;
    checkpoint.error = null;
    checkpoint.round = 0;
    checkpoint.baseHead = head;
    checkpoint.baseline = snapshot(root);
    checkpoint.runnerUpgrade = { from: original.baseHead, to: head, paths: committed };
    transition('PLANNING');
    event('STOPPED_PLAN_RECOVERY_READY', { previousSequence: original.sequence, reviewedCommit: head });
  } finally { releaseLock(lock); }
}
function recoverArchitecture() {
  acquireLock(lock, true);
  try {
    if (!existsSync(checkpointPath)) throw new Error('No checkpoint to recover');
    checkpoint = JSON.parse(read(checkpointPath));
    const id = checkpoint.task?.id;
    const data = backlog();
    const task = data.tasks.find((item) => item.id === id);
    if (!id || checkpoint.status !== 'BLOCKED' || checkpoint.phase !== 'IN_PROGRESS' || checkpoint.round !== 1 || checkpoint.error !== architectureBlocker || !task || task.status !== 'BLOCKED') throw new Error('Only the current blocked inquiry-status architecture task can be recovered');
    const state = read(join(workspace, 'STATE.md'));
    if (field(state, 'Active task') !== id || field(state, 'Current phase') !== 'BLOCKED' || field(data.content, 'Roadmap approval') !== 'APPROVED') throw new Error('Workflow state or roadmap does not match blocked checkpoint');
    if (checkpoint.configDigest !== configDigest || !checkpoint.planReceipt || checkpoint.planReceipt.agent !== 'antigravity' || checkpoint.planReceipt.operation !== 'plan' || checkpoint.planReceipt.result?.status !== 'READY' || JSON.stringify(checkpoint.paths) !== JSON.stringify(checkpoint.planReceipt.result.paths)) throw new Error('Original approved Planning receipt or configuration does not match checkpoint');
    const receiptPath = join(runtime, `${id}-${checkpoint.planReceipt.sequence}-plan.receipt.json`);
    if (!existsSync(receiptPath) || JSON.stringify(JSON.parse(read(receiptPath))) !== JSON.stringify(checkpoint.planReceipt)) throw new Error('Original Planning receipt has changed');
    if (!['in_progress', 'resolved', 'archived'].every((status) => checkpoint.planReceipt.result.details.includes(status))) throw new Error('Original Planning receipt does not prove the status conflict');

    const planPath = `.ai-collab/tasks/${id}/PLAN.md`;
    const implPath = `.ai-collab/tasks/${id}/IMPLEMENTATION.md`;
    if (!existsSync(taskPath(id, 'PLAN.md')) || !existsSync(taskPath(id, 'IMPLEMENTATION.md'))) throw new Error('Task artifacts missing');
    const plan = read(taskPath(id, 'PLAN.md'));
    const implementationText = read(taskPath(id, 'IMPLEMENTATION.md'));
    const owned = plan.match(/^Owned paths: (.+)$/m)?.[1]?.split(',').map((path) => path.trim());
    if (field(plan, 'Status') !== 'APPROVED' || !plan.startsWith(`# Plan: ${id}\n`) || !owned || JSON.stringify(validatePaths(owned)) !== JSON.stringify(checkpoint.paths)) throw new Error('Revised approved plan must preserve exact source ownership');
    if (!inquiryStatuses.every((status) => plan.includes(`- \`${status}\`: `)) || !plan.includes('existing production schema')) throw new Error('Revised plan does not use the approved database statuses');
    const expectedBlocker = `# Implementation: ${id}\n\nStatus: BLOCKED\n\n${architectureBlocker}\n\nSee local checkpoint and logs; preserve all working changes.\n`;
    if (implementationText !== expectedBlocker) throw new Error('Blocked implementation artifact has changed');
    if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes before architecture recovery');
    const metadata = new Set(['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', planPath, implPath]);
    if (changedWorkingPaths().some((path) => !metadata.has(path))) throw new Error('Uncommitted changes outside blocked task metadata');

    const head = git('rev-parse', 'HEAD');
    if (git('merge-base', checkpoint.baseHead, head) !== checkpoint.baseHead) throw new Error('Checkpoint cannot adopt this Git history');
    const parent = git('rev-parse', `${head}^`);
    const committedRunnerPaths = git('diff', '--name-only', parent, head).split('\n').filter(Boolean);
    if (!committedRunnerPaths.includes(architectureReviewPath) || !committedRunnerPaths.includes('.ai-collab/orchestrator.mjs') || committedRunnerPaths.some((path) => !architectureRunnerPaths.has(path))) throw new Error('Architecture recovery requires a reviewed runner-only final commit');
    const review = git('show', `${head}:${architectureReviewPath}`);
    const runnerPlan = git('show', `${head}:.ai-collab/tasks/orchestrator-architecture-recovery/PLAN.md`);
    if (field(review, 'Status') !== 'APPROVED' || !/^Reviewer: Antigravity\b/m.test(review) || field(runnerPlan, 'Status') !== 'APPROVED' || !/^Planner: Antigravity\b/m.test(runnerPlan)) throw new Error('Architecture runner plan/review is not approved by Antigravity');
    if (field(review, 'Approved admin plan digest') !== digest(plan)) throw new Error('Admin plan differs from the reviewed revision');
    const historyField = field(review, 'Reviewed history');
    if (!historyField) throw new Error('Architecture review lacks the exact reviewed history');
    const reviewedHistory = historyField.split(',').map((value) => value.trim()).filter(Boolean);
    const actualHistory = git('rev-list', '--reverse', `${checkpoint.baseHead}..${parent}`).split('\n').filter(Boolean);
    if (!actualHistory.length || reviewedHistory.some((sha) => !/^[a-f0-9]{40}$/.test(sha)) || JSON.stringify(reviewedHistory) !== JSON.stringify(actualHistory)) throw new Error('Intervening history differs from Antigravity-reviewed commits');
    if (git('diff', '--name-only', checkpoint.baseHead, head, '--', ...checkpoint.paths)) throw new Error('Admin-owned source changed since blocked checkpoint');

    let originalScripts = {};
    try { originalScripts = JSON.parse(git('show', `${checkpoint.baseHead}:package.json`)).scripts ?? {}; }
    catch { if (existsSync(join(root, 'package.json'))) throw new Error('Original package scripts cannot be verified'); }
    const currentScripts = requiredScripts();
    if (digest(originalScripts) !== checkpoint.scriptsDigest || Object.entries(originalScripts).some(([name, value]) => currentScripts[name] !== value) || Object.keys(currentScripts).some((name) => !(name in originalScripts) && !['test:e2e', 'ai:auto'].includes(name))) throw new Error('Required package scripts changed outside reviewed additive commands');
    if (existsSync(join(root, 'package.json')) && JSON.stringify(currentScripts) !== JSON.stringify(JSON.parse(git('show', `${head}:package.json`)).scripts ?? {})) throw new Error('Working package scripts differ from committed history');
    for (const command of config.checks) if (command[0] === 'npm' && command[1] === 'run' && (!originalScripts[command[2]] || currentScripts[command[2]] !== originalScripts[command[2]])) throw new Error('A required check script changed');
    if (existsSync(join(runtime, `${id}-${checkpoint.sequence}-architecture-blocker.md`))) throw new Error('Blocker archive already exists; inspect before retry');
    planningContext(plan); // Check bounded, secret-free Planning input before mutating state.

    const original = { phase: checkpoint.phase, round: checkpoint.round, error: checkpoint.error, paths: checkpoint.paths, planReceipt: checkpoint.planReceipt, implementation: checkpoint.implementation ?? null, implementationArtifactDigest: digest(implementationText), baseHead: checkpoint.baseHead, scriptsDigest: checkpoint.scriptsDigest };
    writeFileSync(join(runtime, `${id}-${checkpoint.sequence}-architecture-blocker.md`), implementationText, { mode: 0o600 });
    artifact('IMPLEMENTATION.md', `# Implementation: ${id}\n\nStatus: NOT_STARTED\n\nReplanning after the reviewed inquiry-status architecture recovery. Earlier blocker and receipt are preserved in private checkpoint history.\n`);
    checkpoint.replanHistory = [...(checkpoint.replanHistory ?? []), original];
    checkpoint.paths = [];
    checkpoint.approvedReplanPaths = owned;
    checkpoint.approvedArchitecturePlanDigest = digest(plan);
    checkpoint.planReceipt = null;
    checkpoint.implementation = null;
    checkpoint.feedback = null;
    checkpoint.error = null;
    checkpoint.round = 0;
    checkpoint.baseHead = head;
    checkpoint.baseline = snapshot(root);
    checkpoint.scriptsDigest = digest(currentScripts);
    checkpoint.runnerUpgrade = { from: original.baseHead, to: head, paths: committedRunnerPaths, reviewedHistory };
    transition('PLANNING');
    event('ARCHITECTURE_RECOVERY_READY', { previousSequence: checkpoint.sequence, reviewedCommits: reviewedHistory.length });
  } finally { rmSync(lock, { recursive: true }); }
}
function hasApprovedInquiryStatuses(details) {
  if (typeof details !== 'string') return false;
  const lines = details.split(/\r?\n/);
  const heading = lines.findIndex((line) => /\b(?:use exactly these statuses|supported inquiry statuses):\s*$/i.test(line));
  if (heading < 0) return false;
  const declared = [];
  for (let i = heading + 1; i < lines.length; i++) {
    const match = lines[i].match(/^\s*-\s*`([a-z_]+)`\s*$/);
    if (!match) break;
    declared.push(match[1]);
  }
  if (JSON.stringify(declared) !== JSON.stringify(inquiryStatuses)) return false;
  return !lines.some((line) => /\b(?:in_progress|resolved|archived)\b/.test(line) && !/\b(?:do not|never|avoid|deprecated|obsolete|prior|previous|old)\b/i.test(line));
}
function recoverArchitecturePlan() {
  acquireLock(lock, true);
  try {
    if (!existsSync(checkpointPath)) throw new Error('No checkpoint to recover');
    checkpoint = JSON.parse(read(checkpointPath));
    const id = checkpoint.task?.id;
    const data = backlog();
    const task = data.tasks.find((item) => item.id === id);
    if (!id || checkpoint.status !== 'BLOCKED' || checkpoint.phase !== 'PLANNING' || checkpoint.round !== 0 || checkpoint.error !== architecturePlanningError || !task || task.status !== 'BLOCKED' || checkpoint.paths?.length || checkpoint.planReceipt || !checkpoint.approvedReplanPaths?.length || !checkpoint.approvedArchitecturePlanDigest) throw new Error('Only the saved architecture Planning validator failure can be recovered');
    const state = read(join(workspace, 'STATE.md'));
    if (field(state, 'Active task') !== id || field(state, 'Current phase') !== 'BLOCKED' || field(data.content, 'Roadmap approval') !== 'APPROVED' || checkpoint.configDigest !== configDigest || checkpoint.scriptsDigest !== digest(requiredScripts())) throw new Error('Workflow state, configuration, or checks changed since Planning');
    const planPath = `.ai-collab/tasks/${id}/PLAN.md`;
    const implPath = `.ai-collab/tasks/${id}/IMPLEMENTATION.md`;
    const plan = read(taskPath(id, 'PLAN.md'));
    const blocked = read(taskPath(id, 'IMPLEMENTATION.md'));
    if (digest(plan) !== checkpoint.approvedArchitecturePlanDigest || field(plan, 'Status') !== 'APPROVED') throw new Error('Approved admin plan changed since Planning');
    if (blocked !== `# Implementation: ${id}\n\nStatus: BLOCKED\n\n${architecturePlanningError}\n\nSee local checkpoint and logs; preserve all working changes.\n`) throw new Error('Planning blocker artifact changed');
    const receiptPath = join(runtime, `${id}-${checkpoint.sequence}-plan.receipt.json`);
    if (!existsSync(receiptPath)) throw new Error('Successful Planning receipt is missing');
    const receipt = JSON.parse(read(receiptPath));
    if (receipt.agent !== 'antigravity' || receipt.operation !== 'plan' || receipt.sequence !== checkpoint.sequence || receipt.exitCode !== 0 || receipt.status !== 'READY' || receipt.result?.status !== 'READY' || receipt.inputDigest !== receipt.outputDigest) throw new Error('Saved Planning receipt is not a successful read-only invocation');
    const paths = validatePaths(receipt.result.paths);
    if (JSON.stringify(paths) !== JSON.stringify(checkpoint.approvedReplanPaths) || !hasApprovedInquiryStatuses(receipt.result.details)) throw new Error('Saved Planning receipt differs from approved paths or statuses');
    if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes before Planning recovery');
    const metadata = new Set(['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', planPath, implPath]);
    if (changedWorkingPaths().some((path) => !metadata.has(path))) throw new Error('Uncommitted changes outside blocked task metadata');
    const head = git('rev-parse', 'HEAD');
    if (git('rev-parse', `${head}^`) !== checkpoint.baseHead) throw new Error('Planning recovery requires one reviewed runner commit after the checkpoint');
    const committed = git('diff', '--name-only', checkpoint.baseHead, head).split('\n').filter(Boolean);
    if (!committed.includes('.ai-collab/orchestrator.mjs') || !committed.includes(architecturePlanReviewPath) || committed.some((path) => !architecturePlanRunnerPaths.has(path))) throw new Error('Planning recovery commit contains unreviewed paths');
    const review = git('show', `${head}:${architecturePlanReviewPath}`);
    const runnerPlan = git('show', `${head}:.ai-collab/tasks/orchestrator-architecture-plan-recovery/PLAN.md`);
    if (field(review, 'Status') !== 'APPROVED' || !/^Reviewer: Antigravity\b/m.test(review) || field(runnerPlan, 'Status') !== 'APPROVED' || !/^Planner: Antigravity\b/m.test(runnerPlan) || field(review, 'Reviewed runner base') !== checkpoint.baseHead || field(review, 'Approved admin plan digest') !== digest(plan) || field(review, 'Approved planning receipt digest') !== digest(receipt)) throw new Error('Planning recovery lacks matching Antigravity review');
    const current = snapshot(root);
    if (changes(checkpoint.baseline, current).some((path) => !metadata.has(path) && !architecturePlanRunnerPaths.has(path))) throw new Error('Task source changed since successful Planning');
    const archive = join(runtime, `${id}-${checkpoint.sequence}-architecture-planning-blocker.md`);
    if (existsSync(archive)) throw new Error('Planning blocker archive already exists; inspect before retry');

    const original = { phase: checkpoint.phase, round: checkpoint.round, status: checkpoint.status, error: checkpoint.error, sequence: checkpoint.sequence, implementationArtifactDigest: digest(blocked), baseHead: checkpoint.baseHead };
    writeFileSync(archive, blocked, { mode: 0o600 });
    checkpoint.architecturePlanningHistory = [...(checkpoint.architecturePlanningHistory ?? []), original];
    checkpoint.paths = paths;
    checkpoint.planReceipt = receipt;
    checkpoint.error = null;
    checkpoint.baseHead = head;
    artifact('PLAN.md', `# Plan: ${id}\n\nStatus: APPROVED\n\n${receipt.result.details}\n\nOwned paths: ${paths.join(', ')}\n`);
    artifact('IMPLEMENTATION.md', `# Implementation: ${id}\n\nStatus: NOT_STARTED\n\nRecovered the actual Antigravity Planning receipt after the reviewed validator fix. Previous blocker and receipt remain in private history.\n`);
    checkpoint.baseline = snapshot(root);
    checkpoint.runnerUpgrade = { from: original.baseHead, to: head, paths: committed };
    transition('READY');
    event('ARCHITECTURE_PLAN_RECOVERED', { receipt: receipt.sequence, paths });
  } finally { rmSync(lock, { recursive: true }); }
}
function recoverGitPermission() {
  acquireLock(lock, true);
  try {
    if (!existsSync(checkpointPath)) throw new Error('No checkpoint to recover');
    checkpoint = JSON.parse(read(checkpointPath));
    const id = checkpoint.task?.id;
    const data = backlog();
    const task = data.tasks.find((item) => item.id === id);
    if (!id || checkpoint.status !== 'BLOCKED' || checkpoint.phase !== 'IN_PROGRESS' || checkpoint.error !== 'git write-tree failed (128)' || !task || task.status !== 'BLOCKED' || !checkpoint.planReceipt || !checkpoint.paths?.length || checkpoint.round !== 1) throw new Error('Only the saved Git index permission blocker can be recovered');
    if (checkpoint.configDigest !== configDigest || checkpoint.scriptsDigest !== digest(requiredScripts())) throw new Error('Runner configuration or required checks changed');
    const state = read(join(workspace, 'STATE.md'));
    if (field(state, 'Active task') !== id || field(state, 'Current phase') !== 'BLOCKED' || field(data.content, 'Roadmap approval') !== 'APPROVED') throw new Error('Workflow state does not match the blocked task');
    const planPath = `.ai-collab/tasks/${id}/PLAN.md`;
    const implementationPath = `.ai-collab/tasks/${id}/IMPLEMENTATION.md`;
    const plan = read(taskPath(id, 'PLAN.md'));
    const blocked = `# Implementation: ${id}\n\nStatus: BLOCKED\n\ngit write-tree failed (128)\n\nSee local checkpoint and logs; preserve all working changes.\n`;
    if (field(plan, 'Status') !== 'APPROVED' || !plan.startsWith(`# Plan: ${id}\n`) || read(taskPath(id, 'IMPLEMENTATION.md')) !== blocked) throw new Error('Approved plan or exact blocker artifact missing');
    const receiptPath = join(runtime, `${id}-${checkpoint.planReceipt.sequence}-plan.receipt.json`);
    if (!existsSync(receiptPath) || digest(JSON.parse(read(receiptPath))) !== digest(checkpoint.planReceipt) || checkpoint.planReceipt.agent !== 'antigravity' || checkpoint.planReceipt.operation !== 'plan' || checkpoint.planReceipt.exitCode !== 0 || checkpoint.planReceipt.status !== 'READY' || checkpoint.planReceipt.result?.status !== 'READY' || JSON.stringify(validatePaths(checkpoint.planReceipt.result.paths)) !== JSON.stringify(checkpoint.paths)) throw new Error('Saved Antigravity Planning receipt differs from approved source paths');
    if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes');
    const head = git('rev-parse', 'HEAD');
    if (git('rev-parse', `${head}^`) !== checkpoint.baseHead) throw new Error('Recovery requires one reviewed runner commit after the blocked checkpoint');
    const committed = git('diff', '--name-only', checkpoint.baseHead, head).split('\n').filter(Boolean);
    if (!committed.includes('.ai-collab/orchestrator.mjs') || !committed.includes(gitPermissionReviewPath) || committed.some((path) => !gitPermissionRunnerPaths.has(path))) throw new Error('Recovery commit contains unreviewed or missing runner paths');
    const review = git('show', `${head}:${gitPermissionReviewPath}`);
    if (field(review, 'Status') !== 'APPROVED' || !/^Reviewer: Antigravity\b/m.test(review) || field(review, 'Reviewed blocked HEAD') !== checkpoint.baseHead || field(review, 'Reviewed task') !== id) throw new Error('Matching Antigravity runner review is missing');
    const allowed = new Set([...committed, ...checkpoint.paths, '.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', planPath, implementationPath]);
    if (changes(checkpoint.baseline, snapshot(root)).some((path) => !allowed.has(path))) throw new Error('Source outside the task or runner upgrade changed');
    if (changedWorkingPaths().some((path) => !new Set([...checkpoint.paths, '.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', planPath, implementationPath]).has(path))) throw new Error('Uncommitted changes outside the blocked task');
    // This must succeed before any checkpoint mutation. It also proves the
    // original index permission failure is no longer present.
    git('write-tree');
    const archive = join(runtime, `${id}-${checkpoint.sequence}-git-permission-blocker.md`);
    if (existsSync(archive)) throw new Error('Blocker archive already exists');
    const prior = { status: checkpoint.status, phase: checkpoint.phase, round: checkpoint.round, error: checkpoint.error, baseHead: checkpoint.baseHead, sequence: checkpoint.sequence, blockerDigest: digest(blocked) };
    writeFileSync(archive, blocked, { mode: 0o600 });
    checkpoint.gitPermissionRecoveryHistory = [...(checkpoint.gitPermissionRecoveryHistory ?? []), prior];
    checkpoint.baseHead = head;
    const current = snapshot(root);
    const originalBaseline = checkpoint.baseline;
    checkpoint.baseline = { ...current };
    for (const path of checkpoint.paths) {
      if (Object.hasOwn(originalBaseline, path)) checkpoint.baseline[path] = originalBaseline[path];
      else delete checkpoint.baseline[path];
    }
    checkpoint.error = null;
    artifact('IMPLEMENTATION.md', `# Implementation: ${id}\n\nStatus: IN_PROGRESS\n\nResuming the approved implementation after a verified Git index permission recovery. The original blocker and Planning receipt are preserved in the private checkpoint history.\n`);
    transition('IN_PROGRESS');
    event('GIT_PERMISSION_RECOVERED', { reviewedCommit: head, blockedSequence: prior.sequence });
  } finally { releaseLock(lock); }
}
const boundary = 'Read AGENTS.md. Work only on this task. Never push, deploy, access external Production services, run a Production migration, change credentials/secrets, or modify another task. Do not use MCP services or bypass permission checks. Never change Git HEAD/index unless this prompt explicitly requests the commit phase. Do not modify orchestrator code/config or test commands. Do not write status artifacts; the coordinator persists your structured response.';
function recoverCodexQuota() {
  acquireLock(lock, true);
  try {
    if (!existsSync(checkpointPath)) throw new Error('No checkpoint to recover');
    checkpoint = JSON.parse(read(checkpointPath));
    const id = checkpoint.task?.id;
    const errorText = 'Process exited 1; inspect private log';
    if (id !== 'storefront-consultant-zalo' || checkpoint.status !== 'BLOCKED' || checkpoint.phase !== 'IN_PROGRESS' || checkpoint.round !== 1 || checkpoint.error !== errorText || checkpoint.sequence !== 4 || !checkpoint.planReceipt || !checkpoint.paths?.length) throw new Error('Only the saved Codex usage-limit checkpoint can be recovered');
    if (checkpoint.configDigest !== configDigest || checkpoint.scriptsDigest !== digest(requiredScripts())) throw new Error('Runner configuration or required checks changed');
    const data = backlog();
    const state = read(join(workspace, 'STATE.md'));
    if (data.tasks.find((task) => task.id === id)?.status !== 'BLOCKED' || field(data.content, 'Roadmap approval') !== 'APPROVED' || field(state, 'Active task') !== id || field(state, 'Current phase') !== 'BLOCKED') throw new Error('Workflow state differs from blocked checkpoint');
    const receipt = checkpoint.planReceipt;
    const receiptPath = join(runtime, `${id}-${receipt.sequence}-plan.receipt.json`);
    if (!existsSync(receiptPath) || digest(JSON.parse(read(receiptPath))) !== digest(receipt) || receipt.agent !== 'antigravity' || receipt.operation !== 'plan' || receipt.exitCode !== 0 || receipt.status !== 'READY' || receipt.result?.status !== 'READY' || receipt.inputDigest !== receipt.outputDigest || JSON.stringify(validatePaths(receipt.result.paths)) !== JSON.stringify(checkpoint.paths)) throw new Error('Saved Antigravity Planning receipt differs from source ownership');
    const failedLog = join(runtime, `${id}-${checkpoint.sequence}-implement.log`);
    if (!existsSync(failedLog) || existsSync(failedLog.replace(/\.log$/, '.receipt.json'))) throw new Error('Missing failed Codex log or an implementation receipt already exists');
    const logText = read(failedLog);
    const quota = quotaFailure(logText, statSync(failedLog).mtimeMs, 'codex');
    if (quota?.agent !== 'codex' || !/"type":"turn.failed"/.test(logText)) throw new Error('Saved Codex log does not prove usage-limit exhaustion');
    quota.logDigest = digest(logText);
    const blocked = `# Implementation: ${id}\n\nStatus: BLOCKED\n\n${errorText}\n\nSee local checkpoint and logs; preserve all working changes.\n`;
    if (read(taskPath(id, 'IMPLEMENTATION.md')) !== blocked || field(read(taskPath(id, 'PLAN.md')), 'Status') !== 'APPROVED') throw new Error('Original blocker artifact or approved task plan differs');
    if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes before Codex quota recovery');
    const head = git('rev-parse', 'HEAD');
    if (git('rev-parse', `${head}^`) !== checkpoint.baseHead) throw new Error('Recovery requires exactly one reviewed runner commit');
    const committed = git('diff', '--name-only', checkpoint.baseHead, head).split('\n').filter(Boolean);
    if (!committed.includes('.ai-collab/orchestrator.mjs') || !committed.includes(codexQuotaReviewPath) || committed.some((path) => !codexQuotaRunnerPaths.has(path))) throw new Error('Codex quota runner upgrade contains unreviewed paths');
    const review = git('show', `${head}:${codexQuotaReviewPath}`);
    const runnerPlan = git('show', `${head}:.ai-collab/tasks/${codexQuotaRunnerTask}/PLAN.md`);
    if (field(review, 'Status') !== 'APPROVED' || !/^Reviewer: Antigravity\b/m.test(review) || field(runnerPlan, 'Status') !== 'APPROVED' || !/^Planner: Antigravity\b/m.test(runnerPlan) || field(review, 'Reviewed blocked HEAD') !== checkpoint.baseHead || field(review, 'Reviewed task') !== id || field(review, 'Reviewed failed log digest') !== quota.logDigest) throw new Error('Matching Antigravity runner review and log digest are required');
    const metadata = new Set(['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', `.ai-collab/tasks/${id}/PLAN.md`, `.ai-collab/tasks/${id}/IMPLEMENTATION.md`]);
    const allowedDirty = new Set([...metadata, ...checkpoint.paths]);
    if (changedWorkingPaths().some((path) => !allowedDirty.has(path))) throw new Error('Uncommitted changes outside task ownership');
    const current = snapshot(root);
    if (changes(checkpoint.baseline, current).some((path) => !allowedDirty.has(path) && !codexQuotaRunnerPaths.has(path))) throw new Error('Source outside task or reviewed runner changed since Planning');
    const archive = join(runtime, `${id}-${checkpoint.sequence}-codex-quota-blocker.md`);
    if (existsSync(archive)) throw new Error('Codex quota blocker archive already exists');
    writeFileSync(archive, blocked, { mode: 0o600 });
    artifact('IMPLEMENTATION.md', `# Implementation: ${id}\n\nStatus: PAUSED_QUOTA\n\nCodex CLI usage limit interrupted implementation. Partial task-owned source and original failed log are preserved. Verify CLI availability before resume --quota-ready.\n`);
    checkpoint.codexQuotaRecoveryHistory = [...(checkpoint.codexQuotaRecoveryHistory ?? []), { status: 'BLOCKED', phase: checkpoint.phase, round: checkpoint.round, error: checkpoint.error, sequence: checkpoint.sequence, baseHead: checkpoint.baseHead, blockedArtifactDigest: digest(blocked), failedLogDigest: quota.logDigest }];
    const priorBaseline = checkpoint.baseline;
    const rebased = snapshot(root);
    for (const path of checkpoint.paths) {
      if (Object.hasOwn(priorBaseline, path)) rebased[path] = priorBaseline[path];
      else delete rebased[path];
    }
    checkpoint.baseline = rebased;
    checkpoint.runnerUpgrade = { from: checkpoint.baseHead, to: head, paths: committed };
    checkpoint.baseHead = head;
    pauseQuota(quota);
    event('CODEX_QUOTA_RECOVERED', { failedSequence: 4, reviewedCommit: head });
  } finally { releaseLock(lock); }
}
function reviewContext() {
  const tracked = new Set(git('ls-tree', '-r', '--name-only', checkpoint.baseHead).split('\n'));
  const newFiles = checkpoint.paths.filter((path) => !tracked.has(path) && existsSync(join(root, path))).map((path) => {
    const text = read(join(root, path));
    assertNoSecrets(text, path);
    return `FILE ${path}\n${text}`;
  }).join('\n\n');
  const diff = git('diff', checkpoint.baseHead, '--', ...checkpoint.paths);
  const summaryPath = taskPath(checkpoint.task.id, 'IMPLEMENTATION_SUMMARY.md');
  const verifyPath = taskPath(checkpoint.task.id, 'VERIFY_REPORT.md');
  const context = `PLAN\n${read(taskPath(checkpoint.task.id, 'PLAN.md'))}\nIMPLEMENTATION SUMMARY\n${existsSync(summaryPath) ? read(summaryPath) : read(taskPath(checkpoint.task.id, 'IMPLEMENTATION.md'))}\nVERIFY REPORT\n${existsSync(verifyPath) ? read(verifyPath) : '(not generated)'}\nTRACKED FILE DIFF\n${diff}\nNEW FILES\n${newFiles}`;
  if (context.length > 60000) throw new Error('Review context exceeds bounded input; split the task');
  assertNoSecrets(context, 'review context');
  return context;
}
async function agent(kind, phase, prompt, statuses, transientAttempt = 0) {
  const startedAt = Date.now();
  const seq = checkpoint.sequence = (checkpoint.sequence ?? 0) + 1; save();
  const prefix = join(runtime, `${checkpoint.task.id}-${seq}-${phase}`);
  const schemaFile = `${prefix}.schema.json`, resultFile = `${prefix}.result.json`;
  atomicJSON(schemaFile, schema);
  const rules = read(join(root, 'AGENTS.md')).split('# AvenFurniture multi-agent development')[1] ?? '';
  const args = kind === 'antigravity'
    ? [...config.antigravity, '-p', `Use only the supplied task context. Do not call tools, shell commands, or read/write files. Return structured JSON only. If context is insufficient return BLOCKED.\nTask rules:\n${rules}\n${prompt}`, '--mode', 'plan', '--sandbox', '--effort', phase === 'review' ? 'medium' : 'low', '--output-format', 'json', '--json-schema', schemaFile, '--print-timeout', `${Math.ceil(config.timeoutMs / 1000)}s`]
    : [...config.codex, 'exec', '--sandbox', phase === 'commit' ? 'read-only' : 'workspace-write', '-c', 'approval_policy="never"', '-C', root, '--json', '--output-schema', schemaFile, '-o', resultFile, '-'];
  const before = snapshot(root), head = git('rev-parse', 'HEAD'), index = git('write-tree');
  event('CLI_STARTED', { agent: kind, operation: phase, sequence: seq });
  let result;
  // Antigravity receives the bounded prompt and JSON schema, but no repository
  // working directory. This prevents workspace discovery from consuming tokens
  // or prompting for an unavailable headless shell permission.
  const isolatedCwd = kind === 'antigravity' ? mkdtempSync(join(tmpdir(), 'aven-agy-context-')) : null;
  try {
    result = await execute(args, { root: isolatedCwd ?? root, timeoutMs: config.timeoutMs, stopFile, log: `${prefix}.log`, input: kind === 'codex' ? `${boundary}\n${prompt}` : undefined, env: agentEnvironment(),
      onChild: (pid) => atomicJSON(join(lock, 'owner.json'), { pid: process.pid, childPid: pid }) });
  } catch (error) {
    error.quota = quotaFailure(error.output, Date.now(), kind);
    error.context = contextFailure(error.output);
    if (error.context) error.message = `${kind === 'codex' ? 'Codex' : 'Antigravity'} context limit reached; split or reduce task context before retry`;
    throw error;
  } finally {
    if (isolatedCwd) rmSync(isolatedCwd, { recursive: true, force: true });
  }
  const durationMs = Date.now() - startedAt;
  const usage = agentTokenUsage(kind, result.stdout);
  if (usage) {
    checkpoint.lastTokenUsage = { ...usage, durationMs, shellOutputBytes: Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr), agent: kind, operation: phase, sequence: seq };
    checkpoint.telemetry = [...(checkpoint.telemetry ?? []), checkpoint.lastTokenUsage];
    atomicJSON(join(runtime, 'telemetry.json'), { task: checkpoint.task.id, records: checkpoint.telemetry, totals: checkpoint.telemetry.reduce((totals, item) => { for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'totalTokens', 'toolCalls', 'shellOutputBytes', 'durationMs']) totals[key] = (totals[key] ?? 0) + (item[key] ?? 0); return totals; }, {}) });
    save();
    const budgetResult = evaluateBudget({ ...checkpoint.lastTokenUsage, phase }, config.budgets);
    if (tokenWarning(usage) || budgetResult.warning) {
      event('TOKEN_WARNING', { agent: kind, operation: phase, sequence: seq, usage: checkpoint.lastTokenUsage, budget: budgetResult });
      writeHandoff('TOKEN_USAGE_HIGH', 'Inspect the bounded task context and saved receipts before the next model call; split the task if necessary.');
    }
  }
  let structured;
  if (kind === 'antigravity') {
    const envelope = JSON.parse(result.stdout);
    if (envelope.status !== 'SUCCESS') {
      if (transientAttempt === 0 && /stream was interrupted/i.test(String(envelope.error ?? '')) && !envelope.denied_actions?.length && !quotaFailure(result.stdout + result.stderr)) {
        if (git('rev-parse', 'HEAD') !== head || git('write-tree') !== index) throw new Error('Git changed during failed Antigravity invocation');
        assertScope(before, snapshot(root), []);
        event('CLI_TRANSIENT_RETRY', { agent: kind, operation: phase, sequence: seq, retry: 1 });
        writeHandoff('TRANSIENT_STREAM_ERROR', 'The coordinator will retry this read-only Antigravity turn once after a short delay.');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return agent(kind, phase, prompt, statuses, 1);
      }
      const error = new Error('Antigravity JSON envelope failed; inspect private log');
      error.quota = quotaFailure(`${result.stdout}\n${result.stderr}`);
      throw error;
    }
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
  writeHandoff('CLI_COMPLETED');
  if (structured.status === 'BLOCKED') throw new Error(`${kind}: ${structured.summary}`);
  return receipt;
}
function select() {
  const data = backlog();
  if (field(data.content, 'Roadmap approval') !== 'APPROVED') throw new Error('Roadmap is not APPROVED');
  return nextTask(data.tasks) ?? data.tasks.filter((t) => t.status === 'BACKLOG' && !hasBlocker(t) && t.dependencies.every((id) => data.tasks.some((dep) => dep.id === id && dep.status === 'DONE' && !hasBlocker(dep)))).sort((a, b) => a.priority.localeCompare(b.priority) || a.lineNumber - b.lineNumber)[0];
}
function assertTaskScope(baseline = checkpoint.baseline) {
  assertScope(baseline, snapshot(root), [...checkpoint.paths, '.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', ...['PLAN.md', 'IMPLEMENTATION.md', 'REVIEW.md', 'IMPLEMENTATION_BRIEF.md', 'IMPLEMENTATION_SUMMARY.md', 'VERIFY_REPORT.md', 'REWORK.md'].map((name) => `.ai-collab/tasks/${checkpoint.task.id}/${name}`)]);
}
function sourceDigest() {
  const ignored = ['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', ...['PLAN.md', 'IMPLEMENTATION.md', 'REVIEW.md', 'IMPLEMENTATION_BRIEF.md', 'IMPLEMENTATION_SUMMARY.md', 'VERIFY_REPORT.md', 'REWORK.md'].map((name) => `.ai-collab/tasks/${checkpoint.task.id}/${name}`)];
  return digest(Object.fromEntries(Object.entries(snapshot(root)).filter(([path]) => !ignored.includes(path))));
}
function requiredScripts() {
  return existsSync(join(root, 'package.json')) ? JSON.parse(read(join(root, 'package.json'))).scripts ?? {} : {};
}
async function verify() {
  if (digest(requiredScripts()) !== checkpoint.scriptsDigest) throw new Error('Package check commands changed; separate approval required before trusting tests');
  const before = snapshot(root), head = git('rev-parse', 'HEAD'), index = git('write-tree');
  checkpoint.checks = []; save();
  const recordCheckTelemetry = (shellOutputBytes, durationMs) => {
    const record = { agent: 'orchestrator', operation: 'check', phase: 'checks', inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, toolCalls: 0, shellOutputBytes, durationMs };
    checkpoint.telemetry = [...(checkpoint.telemetry ?? []), record];
    const totals = checkpoint.telemetry.reduce((sum, item) => { for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'totalTokens', 'toolCalls', 'shellOutputBytes', 'durationMs']) sum[key] = (sum[key] ?? 0) + (item[key] ?? 0); return sum; }, {});
    atomicJSON(join(runtime, 'telemetry.json'), { task: checkpoint.task.id, records: checkpoint.telemetry, totals });
    const budgetResult = evaluateBudget(record, config.budgets);
    if (budgetResult.warning) event('TOKEN_WARNING', { agent: 'orchestrator', operation: 'check', budget: budgetResult, telemetry: record });
  };
  for (let i = 0; i < config.checks.length; i++) {
    const command = config.checks[i];
    const logPath = join(runtime, `${checkpoint.task.id}-round-${checkpoint.round}-check-${i}.log`);
    const checkStartedAt = Date.now();
    try {
      const result = await execute(command, { root, timeoutMs: config.timeoutMs, stopFile, log: logPath, onChild: (pid) => atomicJSON(join(lock, 'owner.json'), { pid: process.pid, childPid: pid }) });
      const shellOutputBytes = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
      recordCheckTelemetry(shellOutputBytes, Date.now() - checkStartedAt);
      checkpoint.checks.push({ command, exitCode: 0, logPath: `.ai-collab/.runtime/${checkpoint.task.id}-round-${checkpoint.round}-check-${i}.log`, shellOutputBytes }); save();
    } catch (error) {
      recordCheckTelemetry(Buffer.byteLength(error.output ?? ''), Date.now() - checkStartedAt);
      const report = summarizeCheckOutput(error.output ?? (existsSync(logPath) ? read(logPath) : ''), command, `.ai-collab/.runtime/${checkpoint.task.id}-round-${checkpoint.round}-check-${i}.log`);
      checkpoint.checks.push({ ...report, shellOutputBytes: Buffer.byteLength(error.output ?? '') }); save();
      if (error.message === 'STOPPED') throw error;
      checkpoint.feedback = `Required check failed: ${command.join(' ')}. Filtered evidence: ${report.excerpts.join(' | ') || 'no concise excerpts'}; full log: ${report.logPath}.`;
      if (quotaOptimization) artifact('VERIFY_REPORT.md', verifyReportMarkdown({ task: checkpoint.task.id, checks: checkpoint.checks }));
      return false;
    }
  }
  if (git('rev-parse', 'HEAD') !== head || git('write-tree') !== index) throw new Error('Checks changed Git state');
  assertScope(before, snapshot(root), []);
  checkpoint.verifiedDigest = sourceDigest(); save();
  if (quotaOptimization) artifact('VERIFY_REPORT.md', verifyReportMarkdown({ task: checkpoint.task.id, checks: checkpoint.checks }));
  return true;
}
function implementation(status) {
  artifact('IMPLEMENTATION.md', `# Implementation: ${checkpoint.task.id}\n\nStatus: ${status}\nChanged paths: ${checkpoint.paths.join(', ')}\nCommit: ${checkpoint.title}\nCommit hash: ${checkpoint.commit ?? '-'}\n\n${checkpoint.implementation?.summary ?? ''}\n\n${checkpoint.implementation?.details ?? ''}\n\n## Independent checks\n\n${(checkpoint.checks ?? []).map((c) => `- ${Array.isArray(c.command) ? c.command.join(' ') : c.command}: ${c.exitCode === 0 ? 'PASS' : 'FAIL'}`).join('\n')}\n`);
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
      if (checkpoint.approvedArchitecturePlanDigest && digest(prior) !== checkpoint.approvedArchitecturePlanDigest) throw new Error('Reviewed architecture plan changed before Planning');
      const architectureNote = checkpoint.approvedArchitecturePlanDigest ? 'This is a reviewed inquiry-status architecture recovery. Keep exactly the approved existing statuses new, consulting, completed, cancelled; include all four in details and do not propose in_progress, resolved, or archived. Keep the approved exact source paths.' : '';
      const receipt = await agent('antigravity', 'plan', `Plan task ${checkpoint.task.id}. Approved acceptance criteria: ${checkpoint.task.criteria}. Existing task plan: ${prior || '(none)'}. ${architectureNote} ${planningContext(prior)} Return READY only if feasible without Production actions; otherwise BLOCKED. Use the supplied real repository file index: identify existing integration files, new modules, and test files by exact path. Do not assume a src/ directory or invent component names; do not use wildcards. The paths JSON array is the exact source ownership allowlist for Codex: include only application source, tests, and local migration files that Codex may edit. Never include any .ai-collab/ path, including PLAN.md, IMPLEMENTATION.md, REVIEW.md, BACKLOG.md or STATE.md. The coordinator writes lifecycle artifacts separately from paths. If the existing plan assigns IMPLEMENTATION.md to Codex, treat that as lifecycle evidence owned by the coordinator, not a source path. Return the complete implementation plan with acceptance criteria in details. Do not edit files. Do not expand scope or remove existing blockers.`, ['READY']);
      const plannedPaths = validatePaths(receipt.result.paths);
      if (checkpoint.approvedReplanPaths && (plannedPaths.length !== checkpoint.approvedReplanPaths.length || plannedPaths.some((path) => !checkpoint.approvedReplanPaths.includes(path)))) throw new Error('Antigravity Planning paths differ from the approved revised plan');
      if (checkpoint.approvedArchitecturePlanDigest && !hasApprovedInquiryStatuses(receipt.result.details)) throw new Error(architecturePlanningError);
      checkpoint.paths = plannedPaths; checkpoint.planReceipt = receipt;
      artifact('PLAN.md', `# Plan: ${checkpoint.task.id}\n\nStatus: APPROVED\n\n${receipt.result.details}\n\nOwned paths: ${checkpoint.paths.join(', ')}\n`);
      if (quotaOptimization) artifact('IMPLEMENTATION_BRIEF.md', implementationBriefMarkdown({ task: checkpoint.task.id, objective: checkpoint.task.criteria, paths: checkpoint.paths, requirements: receipt.result.details, acceptanceCriteria: checkpoint.task.criteria }));
      transition('READY');
    } else if (checkpoint.phase === 'READY' || checkpoint.phase === 'CHANGES_REQUESTED') {
      if (checkpoint.round >= config.maxRounds) throw new Error('Maximum three implementation/review rounds reached');
      if (quotaOptimization && checkpoint.phase === 'CHANGES_REQUESTED') artifact('REWORK.md', reworkMarkdown({ task: checkpoint.task.id, round: checkpoint.round + 1, rootCause: checkpoint.feedback ?? 'Review identified an unmet acceptance criterion.', correction: checkpoint.feedback ?? 'Address the review feedback within the approved plan.', paths: checkpoint.paths }));
      checkpoint.round++; transition('IN_PROGRESS');
    } else if (checkpoint.phase === 'IN_PROGRESS') {
      const handoff = quotaOptimization && checkpoint.round > 1 && existsSync(taskPath(checkpoint.task.id, 'REWORK.md')) ? 'REWORK.md' : quotaOptimization ? 'IMPLEMENTATION_BRIEF.md' : 'PLAN.md';
      const handoffPath = taskPath(checkpoint.task.id, handoff);
      const handoffText = existsSync(handoffPath) ? read(handoffPath) : read(taskPath(checkpoint.task.id, 'PLAN.md'));
      const receipt = await agent('codex', 'implement', `Implement task ${checkpoint.task.id} using this compact ${handoff} handoff:\n${handoffText}\nOnly modify these exact paths: ${checkpoint.paths.join(', ')}. Do not stage/commit or edit coordinator artifacts. Feedback: ${checkpoint.feedback ?? 'Initial implementation'}. Return READY_FOR_REVIEW with actual changed paths and evidence, or BLOCKED.`, ['READY_FOR_REVIEW']);
      checkpoint.implementation = receipt.result;
      if (!changes(checkpoint.baseline, snapshot(root)).some((path) => checkpoint.paths.includes(path))) throw new Error('Implementation produced no task change');
      if (quotaOptimization) artifact('IMPLEMENTATION_SUMMARY.md', implementationSummaryMarkdown({ task: checkpoint.task.id, paths: receipt.result.paths, summary: receipt.result.summary, details: receipt.result.details }));
      implementation('IN_PROGRESS'); transition('TESTING');
    } else if (checkpoint.phase === 'TESTING') {
      if (!await verify()) {
        if (quotaOptimization) {
          const report = read(taskPath(checkpoint.task.id, 'VERIFY_REPORT.md'));
          const diagnosis = await agent('antigravity', 'diagnose', `Diagnose check failure for ${checkpoint.task.id}. Use only this filtered verification report; do not request raw logs or run tools. Identify root cause and the smallest correction within the approved source allowlist. Return CHANGES_REQUESTED with actionable details.\n${report}`, ['CHANGES_REQUESTED']);
          checkpoint.diagnosisReceipt = diagnosis;
          checkpoint.feedback = diagnosis.result.details;
          save();
        }
        implementation('IN_PROGRESS'); transition('CHANGES_REQUESTED'); continue;
      }
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
      if (config.deterministicCommit === true && config.commitAgent !== 'codex') {
        checkpoint.commitRequest = { agent: 'orchestrator', operation: 'commit', result: { status: 'COMMIT_REQUESTED' } }; save();
      } else {
        const receipt = await agent('codex', 'commit', `Antigravity approved this task; coordinator independently passed checks, scanned and staged exact task files. You are in read-only mode. Do not run write commands, stage, commit, edit, amend, reset, push, or deploy. Request the coordinator's narrow Git executor to create ONE local commit. Return status COMMIT_REQUESTED and details as a JSON string encoding exactly {"parent":"${checkpoint.baseHead}","tree":"${checkpoint.commitTree}","message":${JSON.stringify(checkpoint.title)}}. Verify supplied review/check evidence: ${JSON.stringify(checkpoint.checks)}; reviewer summary: ${checkpoint.reviewReceipt.result.summary}. Return BLOCKED if not appropriate.`, ['COMMIT_REQUESTED']);
        const request = JSON.parse(receipt.result.details);
        if (request.parent !== checkpoint.baseHead || request.tree !== checkpoint.commitTree || request.message !== checkpoint.title) throw new Error('Codex commit request does not match approved Git state');
        checkpoint.commitRequest = receipt; save();
      }
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
      const metadataPaths = ['.ai-collab/BACKLOG.md', '.ai-collab/STATE.md', ...['IMPLEMENTATION.md', 'IMPLEMENTATION_BRIEF.md', 'IMPLEMENTATION_SUMMARY.md', 'VERIFY_REPORT.md', 'REWORK.md'].map((name) => `.ai-collab/tasks/${checkpoint.task.id}/${name}`)];
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
  let quotaResume = false;
  try {
    if (resume) {
      if (!existsSync(checkpointPath)) throw new Error('No checkpoint to resume');
      checkpoint = JSON.parse(read(checkpointPath));
      if (checkpoint.status === 'BLOCKED') throw new Error('BLOCKED checkpoint requires investigation; it cannot be silently resumed');
      if (checkpoint.status === 'PAUSED_QUOTA') {
        const quotaReady = process.argv.slice(3).includes('--quota-ready');
        if (checkpoint.quota?.retryAt && Date.now() < Date.parse(checkpoint.quota.retryAt) && !quotaReady) throw new Error(`Antigravity quota pause remains until ${checkpoint.quota.retryAt}; use --quota-ready only after verifying CLI availability`);
        if (!checkpoint.quota?.retryAt && !quotaReady) throw new Error('Quota reset time unknown; use resume --quota-ready only after confirming availability');
        if (checkpoint.configDigest !== configDigest) throw new Error('Configuration changed since checkpoint');
        if (hasBlocker({ ...checkpoint.task, status: 'READY' })) throw new Error('Task artifact is BLOCKED; operator/planner decision required');
        if (git('diff', '--cached', '--name-only')) throw new Error('Unexpected staged changes before quota resume');
        const upgrade = adoptReviewedRunner();
        assertTaskScope(upgrade?.baseline ?? checkpoint.baseline);
        if (upgrade) Object.assign(checkpoint, upgrade);
        quotaResume = true;
        checkpoint.status = 'RUNNING'; save();
        if (upgrade) event('RUNNER_UPGRADE_ADOPTED', { paths: upgrade.runnerUpgrade.paths });
      }
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
      writeHandoff('TASK_DONE', 'Task is committed and complete. Inspect the next approved backlog task before another run.');
      if (existsSync(join(workspace, 'release.config.json'))) {
        const { afterCompleted } = await import('./release.mjs');
        const released = await afterCompleted(root, checkpoint, config.checks);
        event('RELEASE_HANDOFF', released);
        if (!released.ok) { process.exitCode = 1; return; } // Preserve the completed development checkpoint.
      }
      if (quotaResume) { event('QUOTA_RECOVERY_TASK_DONE'); return; }
      // Continue the next eligible task without an IDE-to-IDE message.
    }
  } catch (error) {
    if (checkpoint?.task && !['BLOCKED', 'PAUSED_QUOTA', 'DONE'].includes(checkpoint.status)) {
      if (error.quota) {
        pauseQuota(error.quota);
        const provider = error.quota.agent === 'codex' ? 'Codex' : 'Antigravity';
        throw new Error(error.quota.retryAt ? `${provider} quota exhausted; paused until ${error.quota.retryAt}` : `${provider} quota exhausted; paused until availability is confirmed`);
      }
      checkpoint.status = error.message === 'STOPPED' ? 'STOPPED' : 'BLOCKED'; checkpoint.error = error.message; save();
      if (checkpoint.status === 'BLOCKED') {
        artifact('IMPLEMENTATION.md', `# Implementation: ${checkpoint.task.id}\n\nStatus: BLOCKED\n\n${error.message}\n\nSee local checkpoint and logs; preserve all working changes.\n`);
        updateState('BLOCKED', error.message);
        const data = backlog(), task = data.tasks.find((t) => t.id === checkpoint.task.id); setTaskRow(data, task, 'BLOCKED');
      }
      event(checkpoint.status, { reason: error.message });
      writeHandoff(error.context ? 'CONTEXT_EXHAUSTED' : checkpoint.status === 'STOPPED' ? 'STOPPED' : 'BLOCKED', error.context ? 'Reduce the approved task context or split the task, obtain review for any scope change, then use the supported recovery path.' : checkpoint.status === 'STOPPED' ? 'Inspect checkpoint and use resume when ready.' : 'Inspect the blocker and obtain the required plan/review before supported recovery.');
    }
    throw error;
  } finally { releaseLock(lock); process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}

const action = process.argv[2];
try {
  if (action === 'run' || action === 'resume') await run(action === 'resume');
  else if (action === 'recover-quota') recoverQuota();
  else if (action === 'recover-plan-path') recoverPlanPath();
  else if (action === 'replan') replan();
  else if (action === 'recover-stopped-plan') recoverStoppedPlan();
  else if (action === 'recover-architecture') recoverArchitecture();
  else if (action === 'recover-architecture-plan') recoverArchitecturePlan();
  else if (action === 'recover-git-permission') recoverGitPermission();
  else if (action === 'recover-codex-quota') recoverCodexQuota();
  else if (['release-status', 'release-push', 'doctor'].includes(action)) {
    const { releaseCommand } = await import('./release.mjs');
    await releaseCommand(root, action);
  }
  else if (action === 'status') {
    const state = existsSync(checkpointPath) ? JSON.parse(read(checkpointPath)) : null;
    const tasks = backlog().tasks;
    console.log(JSON.stringify({ checkpoint: state ? { task: state.task?.id ?? null, status: state.status, phase: state.phase, round: state.round, error: state.error, quota: state.quota ?? null, lastTokenUsage: state.lastTokenUsage ?? null } : null, handoff: existsSync(join(runtime, 'HANDOFF.md')) ? '.ai-collab/.runtime/HANDOFF.md' : null, next: select()?.id ?? null, paused: tasks.filter((task) => task.status === 'PAUSED_QUOTA').map((task) => task.id), blocked: tasks.filter((task) => task.status !== 'PAUSED_QUOTA' && hasBlocker(task)).map((task) => task.id), lock: existsSync(join(lock, 'owner.json')) ? JSON.parse(read(join(lock, 'owner.json'))) : null, receipts: existsSync(runtime) ? readdirSync(runtime).filter((name) => name.endsWith('.receipt.json')).length : 0 }, null, 2));
  }
  else if (action === 'stop') { mkdirSync(runtime, { recursive: true }); writeFileSync(stopFile, 'stop\n'); console.log('Stop requested; active child will be terminated and checkpoint preserved.'); }
  else throw new Error('Usage: node .ai-collab/orchestrator.mjs run|resume [--quota-ready]|recover-quota|recover-plan-path|replan|recover-stopped-plan|recover-architecture|recover-architecture-plan|recover-git-permission|recover-codex-quota|status|stop|doctor|release-status|release-push');
} catch (error) { console.error(`Orchestrator stopped: ${error.message}`); process.exitCode = 1; }
