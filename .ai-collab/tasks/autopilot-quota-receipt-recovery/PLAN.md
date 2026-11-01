# Autopilot quota receipt recovery

Status: APPROVED
Planner: Antigravity CLI
Date: 2026-10-16
Planning receipts: `07f16230-aeb3-470d-84da-baab9355da54`, `1d2ded4f-646c-422b-9193-e56194b2f420`

The one-command launcher retains a quota receipt from an older Antigravity account even after an operator has verified a new login and the real two-agent smoke fixture passes. Preserve both receipts and all checkpoints. A later real smoke for the exact runner digest may supersede the old launcher quota only when its valid `verifiedAt` is strictly after the quota `observedAt` and no later than now. `retryAt` remains the no-proof wait boundary. A later 429 pauses again. Missing timestamps or mismatched digest fail closed. Test these cases, document the recovery, and run required checks. Owned code paths: `.ai-collab/autopilot.mjs`, `.ai-collab/autopilot-core.mjs`, `.ai-collab/autopilot.test.mjs`, `.ai-collab/AUTOPILOT.md`. Lifecycle artifacts use this task directory. No application, database or Production change.
