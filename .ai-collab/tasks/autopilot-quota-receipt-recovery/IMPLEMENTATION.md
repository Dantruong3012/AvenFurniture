# Autopilot quota receipt recovery

Status: READY_FOR_REVIEW
Implementer: Codex
Date: 2026-10-16

The real `npm run ai:auto -- --smoke --quota-ready` passed after the Antigravity account changed, but preflight still treated the older launcher 429 receipt as active. The new rule accepts a valid, newer real smoke receipt for the exact current runner digest as recovery proof. It retains the 429 receipt and never alters the admin checkpoint. A later 429 or a changed digest pauses again. Missing/invalid/future timestamps fail closed.

Verification: `node --test .ai-collab/autopilot.test.mjs` 10/10 PASS; `node --test .ai-collab/*.test.mjs` 81/81 PASS; `npm run lint` PASS; `npm run typecheck` PASS; `npm test` 71/71 PASS; `npm run build` PASS with dummy public build variables; `git diff --check` PASS. No application source, database, Production or secret change.

Antigravity review and local commit pending. After commit, the changed runner digest requires one new real-CLI smoke before the proof can supersede the historical quota receipt.
