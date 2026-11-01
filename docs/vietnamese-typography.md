# Vietnamese typography and responsive UI

Owner scope: Codex-only font and UI/UX corrections across storefront and admin. No Antigravity or Orchestrator changes. Existing imagery, translations, routes, business logic, Auth/API and database behavior are preserved. Four deferred Email tasks remain deferred.

## Behavior

- Bundle Be Vietnam Pro UI weights 400/500/600/700 and Lora editorial variable 400–700 using `next/font/local`, with `display: swap` and metric-adjusted fallbacks. UI weights load on demand; the editorial face is preloaded. No runtime font provider or font download during build.
- Keep full font outlines/glyph sets. Five WOFF2 assets total 245,068 bytes. OFL licenses and pinned Google Fonts revision/conversion/hash provenance are in `app/fonts/`.
- Scale headings and spacing to leave room for Vietnamese accents; improve form/admin hierarchy, focus indicators and control heights. Correct footer wordmark/product-price wrapping under enlarged text without hiding horizontal page overflow.
- Use a mobile drawer below 1400px to leave room for navigation and the language selector. Closed navigation is inert; open navigation traps keyboard focus, closes with Escape and returns focus. Wishlist selection closes the drawer. Crossing into desktop layout closes it and releases scroll/focus handling.
- Put the protected-admin language selector in the toolbar flow; retain the separate selector on authentication pages. Honor reduced motion.

## Verification on 2026-11-01

Final verification and technical-review receipts are recorded in [implementation](../.ai-collab/tasks/vietnamese-typography/IMPLEMENTATION.md) and [Codex review](../.ai-collab/tasks/vietnamese-typography/REVIEW.md). Private local logs/screenshots are under `.ai-collab/.runtime/vietnamese-typography-20261101/` in the original checkout; they are excluded from commits.

Font hashes/sizes/WOFF2 signatures match `SOURCES.json`. An expanded fontTools probe checks 124 distinct codepoints: the Vietnamese precomposed set plus its NFD decomposition, including base letters and combining marks (the earlier 112-codepoint manifest probe was narrower). Browser tests exercise NFC/NFD at all UI weights; Chromium CDP verifies custom Be Vietnam Pro glyph rendering and the Lora heading instead of accepting fallback-based `document.fonts.check` alone.

Responsive tests cover 320–1920px and 200% base font size on catalog/contact/admin-auth pages, local font serving, focus traversal, Escape, menu navigation/resizing and reduced motion on Chromium, Firefox and mobile Chromium. Increasing the base font size models a text preference; it is not certification of every browser zoom/assistive-technology configuration.

Codex manually inspected the four existing screenshots: Vietnamese home at 1440px/390px, products at 1440px and admin login at 390px. Text/accents are legible without visible clipping or overlapping controls in those captures. The mobile hero source imagery is retained. These screenshots cover the prior paused revision; the subsequent changes only close the menu on wishlist selection/desktop resizing, verified by browser regressions. This is a Codex technical review, not independent human/Antigravity approval.

## Release and acceptance limits

This is a local UI implementation. Push/PR and later exact-HEAD/BASE merge/Production impact each need fresh owner authorization under the release runbook. Earlier PR2 authorization is consumed. No remote writes, deploy, migration, environment/secret/Auth/RLS change or paid service is part of this task.

Local mock-backed E2E does not certify protected-admin/MFA browser workflows, recovery-email delivery, alert delivery or real Production product detail/media acceptance. Prior inspection on Mac did not establish missing glyphs as the universal cause of the reported problem; this change removes device-font dependence and corrects the observed sizing/spacing/wrapping issues. Dependency audit still lists 16 existing moderate findings, with no high/critical findings, on unchanged dependencies.
