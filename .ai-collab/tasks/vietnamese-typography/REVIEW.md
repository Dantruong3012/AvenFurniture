# Codex technical review: vietnamese-typography

Status: APPROVED (Codex technical review under owner-approved Solo workflow)
Reviewer: Codex, the implementing agent. This is not independent human/Antigravity approval and is not a GitHub review or release authorization.
Date: 2026-11-01, Asia/Ho_Chi_Minh.
Base:60985d55de639c7f154947d574737e44f0305eff.
Source/test/font manifest digest:`16a500c3f3c6baf4a2a3cfee5192de185617b0a213e75355e533b9bfdc670a87`.

## Findings and resolution

1. Wishlist selection in the mobile drawer did not close it. Added the close handler; the browser regression navigates to wishlist, verifies closed/inert dialog and released body scroll.
2. Resizing an open drawer into the desktop breakpoint could hide it while leaving body scroll locked and focus trapped. A cleaned-up matchMedia listener closes it at1400px; regression checks aria-expanded, dialog removal, released scrolling and desktop keyboard traversal, then reopens it on mobile.
3. Reviewed final tracked diff plus new font config/CSS/provenance/licenses/browser tests. Changes stay within the UI plan; no backend/data/Auth/Orchestrator paths changed. Existing admin harness assertions remain and render the real language control.

## Visual evidence

Opened and inspected home-vi-desktop.png, home-vi-mobile.png, products-vi-desktop.png and admin-login-vi-mobile.png from the private runtime folder. Vietnamese accents and line spacing are legible, headings/buttons remain inside the displayed layouts, and language/header/auth controls do not visibly overlap. Palette and source imagery are preserved. Geometry report shows viewport/page widths match. These are the pre-pause resting-layout screenshots; later fixes only affect drawer-close events. Browser regressions cover those events on the final source.

This visual sample does not cover every route, protected-admin screen, device or assistive technology. No complete protected-admin/MFA or live-product media acceptance is claimed.

## Verification and decision

258 application/SQL,167 runner fixtures and69 local Playwright tests PASS; production build, lint (two existing warnings), typegen/TypeScript and tracked security checks PASS. Expanded fontTools check verifies124 precomposed/NFD codepoints per file with matching asset hashes/sizes. Dependencies are unchanged; earlier gate reported16 moderate and zero high/critical findings. Exact evidence and the corrected hidden-control test assertion are in IMPLEMENTATION.md.

One trailing space in the upstream Lora OFL text was removed after checks; license wording, font binaries and tested application/test code are unchanged. The final manifest digest above includes that whitespace correction. No unresolved finding in the scoped implementation. Approve the local implementation under the owner-confirmed Solo exception, contingent on clean final owned/staged secret/whitespace scans and unchanged tested source digest before commit. Secret scanning must include new files and staged blobs;548-file tracked scan alone is insufficient. Git identity and explicit owned paths must be verified. No other agent was invoked and no independent review is represented.

Remote CI/Preview and owner release approval remain separate gates. Production, Auth/RLS, secrets/environment, migrations, paid services and the four deferred Email tasks are outside this review.
