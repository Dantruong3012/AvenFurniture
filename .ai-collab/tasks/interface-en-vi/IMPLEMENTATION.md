# Implementation: interface-en-vi

Status: VERIFIED_LOCAL / RELEASE_AUTHORIZATION_PENDING
Implementer: Codex, under the owner's explicit Solo / Codex-only instruction.

Implemented persistent EN/VI selection across public, Auth/MFA and admin UI; translated metadata/accessibility labels, validation, status feedback and confirmations; localized date/price display. English remains the default. Product/editorial/customer data stays as entered. No route, API, database, authorization or role contract changed. No dependency, migration, secret/environment/provider change or paid service. Email tasks remain deferred.

Next.js 16 bundled internationalization, cookies and loading/streaming documentation read before implementation. Cookie-aware async root layout/metadata intentionally render UI per request. Existing streaming behavior still requires JavaScript to reveal deferred UI; SSR evidence checks actual returned HTML, not a no-JavaScript usability claim.

Tests: application/SQL258 PASS, runner167 PASS, Playwright57 PASS (Chromium, Firefox, mobile Chromium). Build performed by the Playwright webServer. Lint zero errors/two existing warnings, typegen/typecheck PASS, security scan/dependency gate PASS (16 existing moderate, zero high/critical). Full command logs are private local artifacts in `.ai-collab/.runtime/admin-localization-20261101/` of the original checkout; no credentials in these receipts.

The unit TSX harnesses now supply request/context locale boundaries using the real translator. Async Server Components use React streaming rendering. Existing authorization, XSS, data-contract and repository assertions remain. New coverage catches missing literal/validation translations, placeholder drift, prototype inheritance, unsupported locales, accidental translation of identifiers/form values and Vietnamese admin status selection. E2E covers persistence, form/cart preservation, URL/query/hash, SSR/metadata, anonymous admin redirect and narrow/desktop layouts, with no shared database writes.

Review: see REVIEW.md. Feature commit is identified by Git history for this task; a following documentation receipt records its full SHA. Local approval does not authorize Push/Merge/Production. Baseline main/Production SHA75565b2f1e4267a4beb462fc051c231f2cc4ed4b verified read-only; the previous one-release merge exception is consumed. Fresh CI/Preview and exact-SHA owner release approval are required for this source revision.

Separately authorized admin password update completed against the existing confirmed/active super_admin account. Verified sign-in, server role RPC and revocation of the verification session; password/key never stored in source or receipts. No duplicate account, email delivery, MFA configuration change or other-account update. Private operation evidence is outside this branch; the account password is not part of a source deployment.
