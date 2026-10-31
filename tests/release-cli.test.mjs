import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { loadModule } from "./helpers/load-module.mjs";
const { signMergeAuthorization } = loadModule("lib/github/controlled-merge.ts");
const head = "a".repeat(40), base = "b".repeat(40), merged = "c".repeat(40);
const required = ["lint", "typecheck", "unit-pglite-integration", "local-fixture-e2e", "build", "security"];

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "aven-release-cli-")), root = join(parent, "checkout");
  mkdirSync(root);
  for (const path of ["scripts/release.mts", "scripts/check-release-security.mjs", "lib/github/client.ts", "lib/github/types.ts", "lib/github/status-checks.ts", "lib/github/controlled-merge.ts", "lib/github/release-tracking.ts", "lib/vercel/deployment.ts", "lib/vercel/types.ts", ".ai-collab/orchestrator-core.mjs"]) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); copyFileSync(resolve(path), join(root, path));
  }
  writeFileSync(join(root, ".ai-collab/release.config.json"), JSON.stringify({ repository: "Dantruong3012/AvenFurniture", developmentBranch: "dev/aven-autonomous-backlog", productionBranch: "main", enabled: false, releaseMode: "manual", vercelProjectId: "prj_test", vercelTeamId: "team_test" }));
  writeFileSync(join(root, ".gitignore"), ".ai-collab/.runtime/\n.ai-collab/.lock/\n");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["remote", "add", "origin", "https://github.com/Dantruong3012/AvenFurniture.git"], { cwd: root });
  execFileSync("git", ["add", "--", "scripts", "lib", ".ai-collab", ".gitignore"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "test: fixture"], { cwd: root });
  const preload = join(parent, "fetch.cjs"), calls = join(parent, "calls.jsonl");
  writeFileSync(preload, `const fs=require("node:fs");
globalThis.fetch=async(url,init={})=>{
 const u=new URL(url); const method=init.method||"GET";
 fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({host:u.host,path:u.pathname,method})+"\\n");
 if(method!=="GET") throw Error("No writes allowed in observer/preflight test");
 const head=${JSON.stringify(head)},base=${JSON.stringify(base)},merged=${JSON.stringify(merged)},required=${JSON.stringify(required)};
 const pr={number:7,state:"open",draft:false,merged:process.env.FIXTURE_MERGED==="1",merge_commit_sha:merged,user:{login:"author"},head:{sha:head,ref:"dev/aven-autonomous-backlog",repo:{full_name:"Dantruong3012/AvenFurniture"}},base:{sha:base,ref:"main",repo:{full_name:"Dantruong3012/AvenFurniture"}},mergeable:true,mergeable_state:"clean"};
 if(u.host==="api.github.com") {
  if(u.pathname.endsWith("/protection")) return process.env.FIXTURE_PROTECTED==="1"?Response.json({enforce_admins:{enabled:true},allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},required_status_checks:{strict:true,contexts:required,checks:required.map(context=>({context,app_id:1}))},required_pull_request_reviews:{required_approving_review_count:1,dismiss_stale_reviews:true},required_conversation_resolution:{enabled:true}}):Response.json({},{status:403});
  if(u.pathname.endsWith("/check-runs")) return Response.json({check_runs:required.map((name,i)=>({id:i+1,name,status:"completed",conclusion:"success",app:{id:1,slug:"github-actions"}}))});
  if(u.pathname.endsWith("/statuses")) return Response.json([]);
  if(u.pathname.endsWith("/reviews")) return Response.json([{id:1,user:{login:"human",type:"User"},state:"APPROVED",commit_id:head}]);
  if(u.pathname.includes("/compare/")) return Response.json({behind_by:0,merge_base_commit:{sha:base}});
  if(u.pathname.endsWith("/pulls/7")) return Response.json(pr);
  if(u.pathname==="/repos/Dantruong3012/AvenFurniture") return Response.json({allow_auto_merge:false,allow_merge_commit:true});
 }
 if(u.host==="api.vercel.com") {
  const sha=process.env.FIXTURE_OLD_ALIAS==="1"?base:merged;
  const d=(sha,id)=>({id,projectId:"prj_test",target:"production",readyState:"READY",meta:{githubCommitSha:sha,githubCommitRef:"main",githubCommitOrg:"Dantruong3012",githubCommitRepo:"AvenFurniture"}});
  if(u.pathname.startsWith("/v9/projects/")) return Response.json({id:"prj_test",link:{type:"github",productionBranch:"main",org:"Dantruong3012",repo:"AvenFurniture"}});
  if(u.pathname==="/v7/deployments") return Response.json({deployments:[d(merged,"dpl_current")]});
  if(u.pathname.startsWith("/v4/aliases/")) return Response.json({projectId:"prj_test",alias:"aven-furniture.vercel.app",deploymentId:sha===base?"dpl_old":"dpl_current"});
  if(u.pathname==="/v13/deployments/dpl_old") return Response.json(d(base,"dpl_old"));
  return Response.json(d(merged,"dpl_current"));
 }
 if(u.host==="aven-furniture.vercel.app") return new Response("fixture page",{status:process.env.FIXTURE_HEALTH_FAILED==="1"?503:200});
 throw Error("Unexpected network request");
};`);
  return { root, parent, calls, run: (command, args = [], overrides = {}) => spawnSync(process.execPath, ["--experimental-strip-types", "scripts/release.mts", command, "--pr", "7", "--head", head, ...args], { cwd: root, encoding: "utf8", timeout: 15000, env: { ...process.env, NODE_OPTIONS: `--require=${preload}`, GH_TOKEN: "fixture-api-credential", GITHUB_TOKEN: "", VERCEL_TOKEN: "fixture-vercel-credential", AVEN_MERGE_AUTHORIZATION_SECRET: "fixture-signing-secret-at-least-32-characters", ...overrides } }) };
}

test("real CLI keeps CI success separate from merge permission and never sends a write", () => {
  const f = fixture(), r = f.run("merge-check");
  assert.equal(r.status, 1, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.stage, "CI Passed");
  assert.equal(output.mergeApproved, false);
  assert.ok(output.blockers.length);
  assert.doesNotMatch(r.stdout + r.stderr, /fixture-api-credential|fixture-vercel-credential/);
  assert.ok(readFileSync(f.calls, "utf8").trim().split("\n").every(line => JSON.parse(line).method === "GET"));
});

test("real CLI signed merge preflight passes without executing a merge", () => {
  const f = fixture(), file = join(f.parent, "authorization.txt"), now = Math.floor(Date.now() / 1000);
  writeFileSync(file, signMergeAuthorization({ actor: "Dantruong3012", repository: "Dantruong3012/AvenFurniture", pullRequest: 7, headSha: head, baseSha: base, baseBranch: "main", issuedAt: now, expiresAt: now + 300, productionImpactApproved: true }, "fixture-signing-secret-at-least-32-characters"), { mode: 0o600 });
  const r = f.run("merge-check", ["--authorization-file", file], { FIXTURE_PROTECTED: "1" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).stage, "Merge Approved");
  assert.ok(readFileSync(f.calls, "utf8").trim().split("\n").every(line => JSON.parse(line).method === "GET"));
});

test("real CLI observes deployment, health failure and proven rollback with durable evidence", () => {
  const f = fixture();
  const deployed = f.run("status", ["--evidence"], { FIXTURE_MERGED: "1" });
  assert.equal(deployed.status, 0, deployed.stderr);
  assert.equal(JSON.parse(deployed.stdout).stage, "Deployed");
  const failed = f.run("status", [], { FIXTURE_MERGED: "1", FIXTURE_HEALTH_FAILED: "1" });
  assert.equal(JSON.parse(failed.stdout).stage, "Deployment Failed");
  const known = join(f.parent, "known-good.json"); writeFileSync(known, JSON.stringify({ deploymentId: "dpl_old", sha: base }));
  const rolledBack = f.run("status", ["--evidence", "--known-good-file", known], { FIXTURE_MERGED: "1", FIXTURE_OLD_ALIAS: "1" });
  assert.equal(JSON.parse(rolledBack.stdout).stage, "Rolled Back");
  const dir = join(f.root, `.ai-collab/.runtime/release-observations/pr-7-${head}`);
  assert.equal(readFileSync(join(dir, "events.jsonl"), "utf8").trim().split("\n").length, 2);
});
