# Implementation summary: orchestrator-quota-optimization

Status: Implemented; awaiting independent Antigravity review.

## Files changed

- `.ai-collab/orchestrator-core.mjs`
- `.ai-collab/orchestrator.mjs`
- `.ai-collab/orchestrator.config.json`
- `.ai-collab/orchestrator.test.mjs`
- `.ai-collab/orchestrator.integration.test.mjs`
- `.ai-collab/dry-run.mjs`
- `.ai-collab/README.md`
- `.ai-collab/AUTOPILOT.md`

## Behavior implemented

- Token usage parses cached input and tool-call metrics; budget evaluation supports phase-specific limits.
- Check failures retain private full logs while structured verification reports include deduplicated excerpts, failed test names, commands, and log references. In optimized mode, Antigravity diagnoses the filtered report and Codex receives the resulting bounded `REWORK.md`; round three still blocks.
- Optimized mode writes compact implementation brief, implementation summary, verification report, and targeted rework handoffs.
- Checkpoint telemetry persists model and orchestrator check metrics, including input/cached/output/total tokens, tool calls, shell output bytes, and duration.
- The configured deterministic commit path uses the existing fixed coordinator Git executor after checks and genuine review; older configurations without the opt-in setting retain the legacy Codex commit request flow.
- The three-round limit and existing quota pause/recovery behavior remain enforced.

## Verification

- Added unit coverage for cached-token extraction, tool-call extraction, budget thresholds, output summarization, and all handoff formatters.
- Added an integration fixture proving handoff artifacts, telemetry output, budget warnings, and absence of a Codex commit invocation in deterministic mode.
- Existing retry, quota recovery, checkpoint recovery, approval-gate, and release tests remain in the requested suite.

## Review notes

The integration benchmark checks invocation count: optimized mode uses three model turns (plan, implement, review) versus the legacy four-turn path that also asks Codex to request the commit, a 25% reduction in model invocations for the fixture. It does not claim measured provider-token savings. No real CLI smoke was run as part of this isolated fake-process test suite.
