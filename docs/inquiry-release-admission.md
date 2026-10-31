# Inquiry admission — release blocker correction

Status: LOCAL_IMPLEMENTED; remote CI/Preview and shared edge rate-limit activation pending. Only Codex is used. No Production Inquiry was submitted and no additional database change was made.

## Application changes

`POST /api/inquiries` reads at most **262,144 bytes (256 KiB)** before JSON parsing. An oversized Content-Length is rejected immediately; the stream is counted independently, including missing or false headers. Overflow cancels the stream and returns413 before RPC. Invalid JSON/UTF-8 returns400. A maximum validated 100-item cart with escaped/multibyte text still passes.

After input/source/honeypot validation, a process-local limiter admits **10 attempts per client per60 seconds**, then returns429 with Retry-After before persistence. Fresh submission keys and duplicate retries both consume attempts. Existing idempotency behavior remains intact for admitted retries. The map expires entries, caps active clients at1024 and rejects new clients at capacity without evicting active limits. Only ephemeral HMAC IP keys are held in memory; no raw IP is logged or stored in the database. Vercel's trusted header identifies clients on Vercel; outside Vercel or with missing/invalid headers, a shared conservative fallback applies. [Vercel request header contract](https://vercel.com/docs/headers/request-headers).

This limiter resets on cold starts and is separate in each process. It does **not** close the cross-instance spam finding by itself. Invalid requests are byte-bounded but need the edge rule below for shared request throttling. NAT users share a quota; IP rotation/botnets remain possible. No new migration, provider, dependency or secret was introduced.

## Minimal live configuration proposed for owner approval

Project `aven-furniture` / `prj_PyRDr0N6RUnKTeKWaum17vWfkmkY`, team `team_TNVd8B1HyqiU94SchwMOUvBO`:

- Add one active custom WAF rule named `Inquiry POST rate limit`.
- Match request method exactly `POST` AND request path exactly `/api/inquiries`, for all project hostnames, including immutable deployment URLs and Preview.
- Rate limit by source IP, Fixed Window, **10 requests / 60 seconds**, default429 enforcement. Do not use Log-only or a challenge that would break JSON clients.
- Preserve every existing rule, bypass, DDoS setting and unrelated route. Verify current state and plan capacity first; do not upgrade plans, accept new paid commitments, replace the complete config, or delete another rule to make room without owner approval.
- Review Changes / publish activates the rule immediately for matching existing deployments. It does not merge or deploy code and does not access Supabase. Rollback is limited to removing/disabling this new rule after separate approval; it must not disable the whole firewall.

The active-config GET with the existing scoped credential returned404 `Config not found`; project and deployment GETs succeeded. MCP separately returned403 for team scope. Thus no active custom rule or capacity has been certified, and no firewall write was attempted. Before execution, re-read the config; if still uninitialized, inspect the dashboard's proposed initialization and obtain approval for any additional defaults rather than guessing a full replacement payload. Dashboard: [project Firewall](https://vercel.com/dantruong/aven-furniture/firewall).

[Vercel WAF documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) supports this rule on Hobby within its one rate-limit-rule quota. Counters are **per region**, not a globally exact10/minute across all regions. Shared edge enforcement prevents instance cold-start resets within that region; it is not a complete bot defense. Review the displayed usage/pricing before saving; no billing change is authorized by this proposal.

## Verification and release sequence

Security tests exercise header/stream overflow, exact byte boundary, split UTF-8, malformed/disconnected streams, rate-window reset, independent clients, IPv6 normalization, untrusted/spoofed headers, bounded storage, fresh-key/retry throttling, no rejected RPC, and maximum valid cart acceptance. All run against local mocked transports only.

After local checks, record the full new commit SHA and obtain exact-SHA Development Push approval. Run the unchanged six required remote CI checks and verify a new READY Preview for that SHA. Activate the owner-approved WAF rule and verify its read-back before exposure. A live POST spam test can write inquiries until the limit is reached and is **not authorized** here; use a separately approved no-business-write check or obtain its own bounded test approval. Authenticated/MFA acceptance and alert delivery remain unverified. Only after those release conditions are resolved, request separate exact PR/head/base Merge + Production auto-deploy approval; do not reuse the old revision's green CI.
