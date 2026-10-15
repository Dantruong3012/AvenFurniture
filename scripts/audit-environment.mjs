import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

let failed = false;
function report(name, ok) { console.log(`${ok ? "PASS" : "FAIL"}: ${name}`); if (!ok) failed = true; }
try {
  const env = process.env;
  const needed = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  for (const name of needed) report(`${name} configured`, Boolean(env[name]));
  report("correct Supabase project", env.NEXT_PUBLIC_SUPABASE_URL === "https://eofdtqnnqgxaoykcbfrv.supabase.co");
  report("publishable browser key", env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_"));
  const site = new URL(env.NEXT_PUBLIC_SITE_URL);
  report("site URL valid", ["http:", "https:"].includes(site.protocol) && !site.username && !site.password && !site.search && !site.hash);
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  report("env not tracked", !tracked.includes(".env.local"));
  report("env mode 600", (statSync(".env.local").mode & 0o777) === 0o600);
  report("env ignored", execFileSync("git", ["check-ignore", ".env.local"], { encoding: "utf8" }).trim() === ".env.local");
  report("env example values empty", readFileSync(".env.example", "utf8").split("\n").filter((line) => /^[A-Z_]+=/.test(line)).every((line) => line.endsWith("=")));
  const secrets = [env.SUPABASE_SECRET_KEY, env.CLOUDINARY_API_SECRET, env.SUPABASE_ACCESS_TOKEN].filter(Boolean).map((value) => Buffer.from(value));
  const publicFiles = [];
  const visit = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`; if (entry.isDirectory()) visit(file); else publicFiles.push(file);
  } };
  visit(".next/static");
  report("no configured secrets in client build or tracked files", [...new Set([...publicFiles, ...tracked])].every((file) => {
    try { const contents = readFileSync(file); return secrets.every((secret) => !contents.includes(secret)); } catch { return true; }
  }));
  report("no obsolete test credential file", !readdirSync(".").includes(".env.staff-test.json"));
} catch { console.error("FAIL: environment audit could not complete; values omitted."); failed = true; }
if (failed) process.exitCode = 1;
