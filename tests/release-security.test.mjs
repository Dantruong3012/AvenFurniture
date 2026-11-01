import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { containsCredential, scanReleaseTree } from "../scripts/check-release-security.mjs";

test("credential scan detects realistic tokens without leaking their values", () => {
  for (const value of ["sb_" + "secret_" + "a".repeat(32), "github_" + "pat_" + "a".repeat(40), "-----BEGIN " + "PRIVATE KEY-----"]) assert.equal(containsCredential(value), true);
  assert.equal(containsCredential("sb_publishable_local_fixture_only"), false);
  const root = mkdtempSync(join(tmpdir(), "aven-secret-scan-"));
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(join(root, ".env.example"), "SAFE=\n");
  writeFileSync(join(root, "config.txt"), "gh" + "p_" + "a".repeat(32));
  writeFileSync(join(root, ".env.local"), "CONFIGURED=1\n");
  execFileSync("git", ["add", "--", ".env.example", "config.txt", ".env.local"], { cwd: root });
  assert.deepEqual(scanReleaseTree(root).failures.sort(), [".env.local", "config.txt"]);
});

test("only the established config fixture path/value is exempted", async () => {
  const { mkdirSync } = await import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "aven-secret-fixture-"));
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "tests"));
  const dummy = ["sb", "secret", "fixture", "only"].join("_");
  writeFileSync(join(root, "tests/supabase-config.test.mjs"), dummy);
  writeFileSync(join(root, "application.js"), dummy);
  execFileSync("git", ["add", "--", "tests/supabase-config.test.mjs", "application.js"], { cwd: root });
  assert.deepEqual(scanReleaseTree(root).failures, ["application.js"]);
  writeFileSync(join(root, "tests/supabase-config.test.mjs"), dummy + "\n" + "sb_" + "secret_" + "x".repeat(32));
  assert.deepEqual(scanReleaseTree(root).failures.sort(), ["application.js", "tests/supabase-config.test.mjs"]);
});
