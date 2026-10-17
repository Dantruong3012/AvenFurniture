#!/usr/bin/env node
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const source = dirname(fileURLToPath(import.meta.url));

function createFixture(optimized = false) {
  const dir = mkdtempSync(join(tmpdir(), `aven-bench-${optimized ? 'opt' : 'legacy'}-`));
  const collab = join(dir, '.ai-collab');
  mkdirSync(collab);
  for (const name of ['workflow.mjs', 'orchestrator.mjs', 'orchestrator-core.mjs', 'release.mjs', 'release-git.mjs', 'release.config.json', '.gitignore']) {
    copyFileSync(join(source, name), join(collab, name));
  }
  writeFileSync(join(dir, 'AGENTS.md'), 'Benchmark test fixture.');
  writeFileSync(join(dir, 'verify.mjs'), `import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict'; assert.equal(readFileSync('t1.txt','utf8'),'verified');`);

  // Fake CLI that simulates realistic token usage for AGY and Codex
  writeFileSync(join(dir, 'fake.mjs'), `import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname} from 'node:path'; import {fileURLToPath} from 'node:url';
const args = process.argv.slice(2);
const agy = args.includes('-p');
let prompt = agy ? args[args.indexOf('-p') + 1] : await new Promise(resolve => { let s = ''; process.stdin.on('data', c => s += c); process.stdin.on('end', () => resolve(s)); });
const phase = agy ? (prompt.includes('Plan task') ? 'plan' : prompt.includes('Diagnose check') ? 'diagnose' : 'review') : (prompt.includes('Request the coordinator') ? 'commit' : 'implement');
const result = { status: 'READY', summary: 'Benchmark evidence', paths: ['t1.txt'], details: 'Implement the benchmark file.' };

if (phase === 'implement') {
  writeFileSync('t1.txt', 'verified');
  result.status = 'READY_FOR_REVIEW';
  writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify(result));
  console.log(JSON.stringify({
    type: 'turn.completed',
    usage: {
      input_tokens: 3200,
      prompt_tokens_details: { cached_tokens: 1280 },
      output_tokens: 480,
      total_tokens: 3680,
      tool_calls: 3
    }
  }));
} else if (phase === 'commit') {
  result.status = 'COMMIT_REQUESTED';
  result.details = prompt.match(/encoding exactly (\\{.*?\\})\\./)[1];
  writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify(result));
  console.log(JSON.stringify({
    type: 'turn.completed',
    usage: {
      input_tokens: 2100,
      prompt_tokens_details: { cached_tokens: 1050 },
      output_tokens: 120,
      total_tokens: 2220,
      tool_calls: 1
    }
  }));
} else {
  // agy: plan or review
  if (phase === 'review') result.status = 'APPROVED';
  console.log(JSON.stringify({
    status: 'SUCCESS',
    structured_output: result,
    usage: {
      input_tokens: phase === 'plan' ? 4500 : 3800,
      output_tokens: phase === 'plan' ? 620 : 340,
      total_tokens: phase === 'plan' ? 5120 : 4140
    }
  }));
}
`);

  const config = {
    antigravity: [process.execPath, join(dir, 'fake.mjs')],
    codex: [process.execPath, join(dir, 'fake.mjs')],
    timeoutMs: 10000,
    maxRounds: 3,
    checks: [[process.execPath, 'verify.mjs']]
  };

  if (optimized) {
    config.deterministicCommit = true;
    config.quotaOptimization = true;
    config.budgets = {
      plan: { inputTokens: 24000, outputTokens: 6000 },
      implement: { inputTokens: 32000, outputTokens: 8000 },
      review: { inputTokens: 32000, outputTokens: 8000 }
    };
  }

  writeFileSync(join(collab, 'orchestrator.config.json'), JSON.stringify(config, null, 2));
  writeFileSync(join(collab, 'BACKLOG.md'), '# Backlog\nRoadmap approval: APPROVED\n\n| Task ID | Priority | Dependencies | Owner | Status | Acceptance criteria | Commit hash |\n| --- | --- | --- | --- | --- | --- | --- |\n| t1 | P0 | - | Codex | READY | Create t1.txt | - |\n');
  writeFileSync(join(collab, 'STATE.md'), 'Active task: -\nCurrent phase: IDLE\nLast completed task: -\nNext task: t1\nBlockers: -\nLast successful commit: -\n');
  mkdirSync(join(collab, 'tasks/t1'), { recursive: true });
  writeFileSync(join(collab, 'tasks/t1/IMPLEMENTATION.md'), '# Implementation: t1\n\nStatus: NOT_STARTED\n');

  for (const args of [['init', '-q'], ['config', 'user.name', 'Benchmark'], ['config', 'user.email', 'benchmark@example.com'], ['add', '.'], ['commit', '-qm', 'Benchmark baseline']]) {
    spawnSync('git', args, { cwd: dir });
  }

  return dir;
}

function runFixture(dir) {
  const start = Date.now();
  const res = spawnSync(process.execPath, ['.ai-collab/orchestrator.mjs', 'run'], { cwd: dir, encoding: 'utf8' });
  const durationMs = Date.now() - start;
  return { code: res.status, output: res.stdout + res.stderr, durationMs };
}

function collectMetrics(dir, durationMs) {
  const runtime = join(dir, '.ai-collab/.runtime');
  const events = existsSync(join(runtime, 'events.jsonl'))
    ? readFileSync(join(runtime, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    : [];

  const telemetryPath = join(runtime, 'telemetry.json');
  let telemetry = null;
  if (existsSync(telemetryPath)) {
    telemetry = JSON.parse(readFileSync(telemetryPath, 'utf8'));
  }

  const receipts = existsSync(runtime)
    ? requireReceipts(runtime)
    : [];

  let codexInput = 0, codexCached = 0, codexOutput = 0, codexToolCalls = 0, codexTurns = 0;
  let agyInput = 0, agyCached = 0, agyOutput = 0, agyToolCalls = 0, agyTurns = 0;
  let shellOutputBytes = 0;

  for (const r of receipts) {
    const usage = r.usage;
    if (r.agent === 'codex') {
      codexTurns++;
      codexInput += usage.inputTokens ?? 0;
      codexCached += usage.cachedInputTokens ?? 0;
      codexOutput += usage.outputTokens ?? 0;
      codexToolCalls += usage.toolCalls ?? 0;
    } else if (r.agent === 'antigravity') {
      agyTurns++;
      agyInput += usage.inputTokens ?? 0;
      agyCached += usage.cachedInputTokens ?? 0;
      agyOutput += usage.outputTokens ?? 0;
      agyToolCalls += usage.toolCalls ?? 0;
    }
  }

  if (telemetry?.records) {
    for (const rec of telemetry.records) {
      if (rec.agent === 'orchestrator') {
        shellOutputBytes += rec.shellOutputBytes ?? 0;
      }
    }
  }

  const checkpoint = JSON.parse(readFileSync(join(runtime, 'checkpoint.json'), 'utf8'));
  const reworkRounds = checkpoint.round ?? 0;
  const taskDone = events.some(e => e.phase === 'DONE');

  return {
    success: taskDone && ['DONE', 'IDLE'].includes(checkpoint.status),
    durationMs,
    codex: {
      turns: codexTurns,
      inputTokens: codexInput,
      cachedInputTokens: codexCached,
      uncachedInputTokens: codexInput - codexCached,
      outputTokens: codexOutput,
      totalTokens: codexInput + codexOutput,
      toolCalls: codexToolCalls
    },
    antigravity: {
      turns: agyTurns,
      inputTokens: agyInput,
      cachedInputTokens: agyCached,
      outputTokens: agyOutput,
      totalTokens: agyInput + agyOutput,
      toolCalls: agyToolCalls
    },
    orchestrator: {
      shellOutputBytes,
      reworkRounds
    }
  };
}

function requireReceipts(runtime) {
  return readdirSync(runtime)
    .filter(f => f.endsWith('.receipt.json'))
    .map(f => {
      const data = JSON.parse(readFileSync(join(runtime, f), 'utf8'));
      const logFile = join(runtime, f.replace(/\.receipt\.json$/, '.log'));
      let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, toolCalls: 0 };
      if (existsSync(logFile)) {
        const text = readFileSync(logFile, 'utf8');
        try {
          if (data.agent === 'antigravity') {
            const parsed = JSON.parse(text.split('\n--- stderr ---')[0]);
            usage = { inputTokens: parsed.usage?.input_tokens ?? 0, cachedInputTokens: 0, outputTokens: parsed.usage?.output_tokens ?? 0, toolCalls: 0 };
          } else {
            const lines = text.split('\n--- stderr ---')[0].split('\n').filter(Boolean);
            const entry = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).findLast(e => e?.type === 'turn.completed');
            if (entry?.usage) {
              const u = entry.usage;
              usage = {
                inputTokens: u.input_tokens ?? 0,
                cachedInputTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
                outputTokens: u.output_tokens ?? 0,
                toolCalls: u.tool_calls ?? 0
              };
            }
          }
        } catch {}
      }
      return { ...data, usage };
    });
}

// Run benchmark
console.log('Running benchmark comparing previous (legacy) and new (optimized) workflow on representative mock task...');
const legacyDir = createFixture(false);
const optDir = createFixture(true);

try {
  const legacyRun = runFixture(legacyDir);
  const legacyMetrics = collectMetrics(legacyDir, legacyRun.durationMs);

  const optRun = runFixture(optDir);
  const optMetrics = collectMetrics(optDir, optRun.durationMs);

  const report = {
    task: 't1 (representative mock implementation)',
    legacy: legacyMetrics,
    optimized: optMetrics,
    comparison: {
      codexInvocationsSaved: legacyMetrics.codex.turns - optMetrics.codex.turns,
      codexInvocationsPercentReduction: ((legacyMetrics.codex.turns - optMetrics.codex.turns) / legacyMetrics.codex.turns * 100).toFixed(1) + '%',
      codexInputTokensSaved: legacyMetrics.codex.inputTokens - optMetrics.codex.inputTokens,
      codexInputTokensPercentReduction: ((legacyMetrics.codex.inputTokens - optMetrics.codex.inputTokens) / legacyMetrics.codex.inputTokens * 100).toFixed(1) + '%',
      codexOutputTokensSaved: legacyMetrics.codex.outputTokens - optMetrics.codex.outputTokens,
      codexOutputTokensPercentReduction: ((legacyMetrics.codex.outputTokens - optMetrics.codex.outputTokens) / legacyMetrics.codex.outputTokens * 100).toFixed(1) + '%',
      codexTotalTokensSaved: legacyMetrics.codex.totalTokens - optMetrics.codex.totalTokens,
      codexTotalTokensPercentReduction: ((legacyMetrics.codex.totalTokens - optMetrics.codex.totalTokens) / legacyMetrics.codex.totalTokens * 100).toFixed(1) + '%',
      codexToolCallsSaved: legacyMetrics.codex.toolCalls - optMetrics.codex.toolCalls
    }
  };

  console.log(JSON.stringify(report, null, 2));
  writeFileSync(join(source, 'benchmark-results.json'), JSON.stringify(report, null, 2));
} finally {
  rmSync(legacyDir, { recursive: true, force: true });
  rmSync(optDir, { recursive: true, force: true });
}
