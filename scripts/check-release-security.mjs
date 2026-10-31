import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function containsCredential(content) {
  return /sb_secret_[A-Za-z0-9_-]{12,}|sbp_[a-f0-9]{40}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(content);
}

export function scanReleaseTree(root = process.cwd()) {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const failures = [];
  for (const path of paths) {
    const envFile = /(^|\/)\.env(?:\.|$)/.test(path);
    if ((envFile && path !== ".env.example") || /\.(pem|key)$/.test(path)) {
      failures.push(path); continue;
    }
    let content;
    try { content = readFileSync(resolve(root, path), "utf8"); }
    catch { failures.push(path); continue; }
    // Same exact test-only value/path exemption as the existing release Git
    // scanner. Any other token in this file is still detected.
    const scanned = path === "tests/supabase-config.test.mjs" ? content.replaceAll(["sb", "secret", "fixture", "only"].join("_"), "DUMMY_TEST_VALUE") : content;
    if (containsCredential(scanned)) failures.push(path);
    if (path === ".env.example" && content.split("\n").some(line => /^[A-Z_]+=.+/.test(line))) failures.push(path);
  }
  return { scanned: paths.length, failures: [...new Set(failures)] };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = scanReleaseTree();
  console.log(`Scanned ${result.scanned} tracked files for credentials and unsafe environment files; values withheld.`);
  if (result.failures.length) {
    console.error(`Security scan failed: ${result.failures.join(", ")}`);
    process.exitCode = 1;
  }
}
