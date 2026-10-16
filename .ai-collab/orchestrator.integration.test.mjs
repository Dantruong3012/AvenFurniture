import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = dirname(fileURLToPath(import.meta.url));
function fixture(mode = 'success', second = false) {
  const dir = mkdtempSync(join(tmpdir(), 'aven-runner-test-'));
  const collab = join(dir, '.ai-collab'); mkdirSync(collab);
  for (const name of ['workflow.mjs', 'orchestrator.mjs', 'orchestrator-core.mjs', 'release.mjs', 'release-git.mjs', 'release.config.json', '.gitignore']) copyFileSync(join(source, name), join(collab, name));
  writeFileSync(join(dir, 'AGENTS.md'), 'Isolated deterministic coordinator test.');
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify({ mode }));
  if (mode === 'architecture-block') writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint', test: 'node --test' } }));
  writeFileSync(join(dir, 'verify.mjs'), `import {readFileSync,readdirSync} from 'node:fs'; import assert from 'node:assert/strict'; const files=readdirSync('.').filter(p=>/^t[12]\\.txt$/.test(p)); assert.ok(files.length); for(const f of files)assert.equal(readFileSync(f,'utf8'),'verified'); if(JSON.parse(readFileSync('scenario.json')).mode==='fail-check') process.exit(2);`);
  writeFileSync(join(dir, 'fake.mjs'), `import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname} from 'node:path'; import {fileURLToPath} from 'node:url';
const invocationCwd=process.cwd();
process.chdir(dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2), mode=JSON.parse(readFileSync('scenario.json')).mode;
const agy=args.includes('-p'); let prompt=agy?args[args.indexOf('-p')+1]:await new Promise(resolve=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>resolve(s));});
if(agy&&invocationCwd===process.cwd())process.exit(9);
const phase=agy?(prompt.includes('Plan task')?'plan':'review'):(prompt.includes('Request the coordinator')?'commit':'implement');
const id=(prompt.match(/(?:Plan task|Review task|Implement task) (t[12])/i)||[])[1] || 't1';
if(agy&&phase==='plan'&&prompt.includes('Repository tracked files'))process.exit(7);
if(agy&&phase==='review'&&(!prompt.includes('NEW FILES')||!prompt.includes('verified')||prompt.includes('CURRENT FILES')))process.exit(7);
const result={status:'READY',summary:'Fixture evidence',paths:[id+'.txt'],details:'Implement the exact proof file.'};
if(agy&&phase==='plan'&&mode==='architecture-block') {
  const recovering=prompt.includes('reviewed inquiry-status architecture recovery');
  const tick=String.fromCharCode(96);
  result.details=recovering&&!existsSync('.ai-collab/.runtime/wrong-architecture-statuses')?'Supported inquiry statuses:\\n- '+tick+'new'+tick+'\\n- '+tick+'consulting'+tick+'\\n- '+tick+'completed'+tick+'\\n- '+tick+'cancelled'+tick+'\\nDo not propose or introduce in_progress, resolved, or archived.':'Supported inquiry statuses:\\n- '+tick+'new'+tick+'\\n- '+tick+'in_progress'+tick+'\\n- '+tick+'resolved'+tick+'\\n- '+tick+'archived'+tick;
  if(recovering&&existsSync('.ai-collab/.runtime/wrong-architecture-paths'))result.paths=['unexpected.txt'];
}
if(agy&&phase==='plan'&&mode==='unsafe-plan-artifact')result.paths.push('.ai-collab/tasks/'+id+'/IMPLEMENTATION.md');
if(agy&&phase==='plan'&&mode==='replan-block'&&prompt.includes('Revised fixture ownership')){
  if(!prompt.includes('app/cart/page.tsx')||!prompt.includes('Existing tracked application and test paths'))process.exit(7);
  result.paths=existsSync('.ai-collab/.runtime/wrong-replan-paths')?['src/cart/page.tsx']:['t1.txt','app/cart/page.tsx','components/forms/contact-form.tsx'];
}
if(phase==='implement') {
  if(mode==='architecture-block'&&!existsSync('.ai-collab/.runtime/architecture-once')){
    writeFileSync('.ai-collab/.runtime/architecture-once','yes');
    result.status='BLOCKED';result.summary='The approved plan requires statuses incompatible with the existing database constraint; resolution exceeds the authorized paths.';
  } else
  if(mode==='replan-block'&&!existsSync('.ai-collab/.runtime/replan-once')){
    writeFileSync('.ai-collab/.runtime/replan-once','yes');
    result.status='BLOCKED';result.summary='The exact path allowlist excludes the existing cart and product integration points. No files changed.';
  } else {
  if(mode==='stop-resume'&&!existsSync('.ai-collab/.runtime/delayed')){writeFileSync('.ai-collab/.runtime/delayed','yes');await new Promise(r=>setTimeout(r,2500));}
  writeFileSync(id+'.txt','verified'); result.status='READY_FOR_REVIEW';
  }
}
if(agy && (((mode==='quota-plan'&&phase==='plan')||(mode==='quota-review'&&phase==='review')) && !existsSync('.ai-collab/.runtime/quota-seen') || (mode==='quota-always'&&phase==='plan'))) {
  writeFileSync('.ai-collab/.runtime/quota-seen','yes');
  console.error('AGY_ERROR: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 30h29m49s.');
  process.exit(3);
}
if(phase==='review') {
  result.status=mode==='reject-review'?'CHANGES_REQUESTED':'APPROVED';
  if(mode==='mutate-review')writeFileSync('verify.mjs','unexpected');
}
if(phase==='commit') {
  if(mode==='stale-review'&&!existsSync('.ai-collab/.runtime/delayed-commit')){writeFileSync('.ai-collab/.runtime/delayed-commit','yes');await new Promise(r=>setTimeout(r,2500));}
  result.status='COMMIT_REQUESTED'; result.details=prompt.match(/encoding exactly (\\{.*?\\})\\./)[1];
  if(mode==='false-commit')result.details='{"parent":"false","tree":"false","message":"false"}';
}
if(agy&&['stream-interrupt','stream-always'].includes(mode)&&phase==='review'&&(mode==='stream-always'||!existsSync('.ai-collab/.runtime/stream-interrupted'))){writeFileSync('.ai-collab/.runtime/stream-interrupted','yes');console.log(JSON.stringify({status:'ERROR',error:'The stream was interrupted. Please continue the task you were working on.',structured_output:result,usage:{input_tokens:35000,output_tokens:100,total_tokens:35100}}));process.exit(0);}
if(agy)console.log(JSON.stringify({status:'SUCCESS',structured_output:result,usage:{input_tokens:35000,output_tokens:100,total_tokens:35100}}));else {writeFileSync(args[args.indexOf('-o')+1],JSON.stringify(result));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:120,output_tokens:45,total_tokens:165}}));}
`);
  writeFileSync(join(collab, 'orchestrator.config.json'), JSON.stringify({ antigravity: [process.execPath, join(dir, 'fake.mjs')], codex: [process.execPath, join(dir, 'fake.mjs')], timeoutMs: 10000, maxRounds: 3, checks: [[process.execPath, 'verify.mjs']] }));
  writeFileSync(join(collab, 'BACKLOG.md'), '# Backlog\nRoadmap approval: APPROVED\n\n| Task ID | Priority | Dependencies | Owner | Status | Acceptance criteria | Commit hash |\n| --- | --- | --- | --- | --- | --- | --- |\n| t1 | P0 | - | Codex | READY | Create t1.txt | - |\n'+(second?'| t2 | P0 | t1 | Codex | READY | Create t2.txt | - |\n':''));
  writeFileSync(join(collab, 'STATE.md'), 'Active task: -\nCurrent phase: IDLE\nLast completed task: -\nNext task: t1\nBlockers: -\nLast successful commit: -\n');
  mkdirSync(join(collab,'tasks/t1'),{recursive:true});writeFileSync(join(collab,'tasks/t1/IMPLEMENTATION.md'),'# Implementation: t1\n\nStatus: NOT_STARTED\n');
  for(const args of [['init','-q'],['config','user.name','Fixture'],['config','user.email','fixture@example.com'],['add','.'],['commit','-qm','Fixture baseline']]) assert.equal(spawnSync('git',args,{cwd:dir}).status,0);
  return dir;
}
function run(dir, action='run', ...args) {
  return new Promise(resolve=>{const child=spawn(process.execPath,['.ai-collab/orchestrator.mjs',action,...args],{cwd:dir});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.on('close',code=>resolve({code,output}));});
}
function gitCall(dir,...args){const result=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
test('release module failure preserves completed development checkpoint and artifacts', async () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, '.ai-collab/release.mjs'), 'throw new Error("fixture release load failure");\n');
    gitCall(dir, 'add', '.ai-collab/release.mjs');
    gitCall(dir, 'commit', '-qm', 'fixture failing release module');
    const result = await run(dir);
    assert.equal(result.code, 1);
    assert.match(result.output, /fixture release load failure/);
    const c = JSON.parse(readFileSync(join(dir, '.ai-collab/.runtime/checkpoint.json'), 'utf8'));
    assert.equal(c.status, 'DONE');
    assert.equal(c.phase, 'COMMITTED');
    assert.equal(gitCall(dir, 'status', '--porcelain'), '');
    assert.match(readFileSync(join(dir, '.ai-collab/BACKLOG.md'), 'utf8'), /DONE/);
  } finally { rmSync(dir, { recursive: true }); }
});
function reviewedUpgrade(dir,status='APPROVED'){
 const review=join(dir,'.ai-collab/tasks/orchestrator-quota-recovery/REVIEW.md');mkdirSync(dirname(review),{recursive:true});
 writeFileSync(review,`# Review: orchestrator-quota-recovery\n\nStatus: ${status}\nReviewer: Antigravity\n\nReviewed runner change.\n`);
 const docs=join(dir,'AGENTS.md');writeFileSync(docs,readFileSync(docs,'utf8')+'\nRunner instructions updated.\n');
 return review;
}
function reviewedPlanRecovery(dir,status='APPROVED'){
 const review=join(dir,'.ai-collab/tasks/orchestrator-plan-path-recovery/REVIEW.md');mkdirSync(dirname(review),{recursive:true});
 writeFileSync(review,`# Review: orchestrator-plan-path-recovery\n\nStatus: ${status}\nReviewer: Antigravity\n\nReviewed Planning contract and recovery.\n`);
 const runner=join(dir,'.ai-collab/orchestrator.mjs');writeFileSync(runner,readFileSync(runner,'utf8')+'\n// reviewed fixture change\n');
 return review;
}
function reviewedReplan(dir,status='APPROVED'){
 const review=join(dir,'.ai-collab/tasks/orchestrator-replan-recovery/REVIEW.md');mkdirSync(dirname(review),{recursive:true});
 writeFileSync(review,`# Review: orchestrator-replan-recovery\n\nStatus: ${status}\nReviewer: Antigravity\n\nReviewed replan runner.\n`);
 const runner=join(dir,'.ai-collab/orchestrator.mjs');writeFileSync(runner,readFileSync(runner,'utf8')+'\n// reviewed replan fixture change\n');
}
async function blockedReplanFixture(){
 const dir=fixture('replan-block');
 const cart=join(dir,'app/cart/page.tsx');mkdirSync(dirname(cart),{recursive:true});writeFileSync(cart,'export const cart = true;\n');
 gitCall(dir,'add','app/cart/page.tsx');gitCall(dir,'commit','-qm','Add existing cart integration');
 const failed=await run(dir);assert.equal(failed.code,1,failed.output);assert.equal(checkpoint(dir).status,'BLOCKED');
 return dir;
}
function revisedFixturePlan(dir,status='APPROVED'){
 const path=join(dir,'.ai-collab/tasks/t1/PLAN.md');
 writeFileSync(path,`# Plan: t1\n\nStatus: ${status}\n\nRevised fixture ownership. Existing integration: app/cart/page.tsx. New module: components/forms/contact-form.tsx.\n\nOwned paths: t1.txt, app/cart/page.tsx, components/forms/contact-form.tsx\n`);
}
function checkpoint(dir) {return JSON.parse(readFileSync(join(dir,'.ai-collab/.runtime/checkpoint.json')));}
function events(dir) {return readFileSync(join(dir,'.ai-collab/.runtime/events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);}
async function waitFor(dir, operation) {
  for(let i=0;i<200;i++) {const path=join(dir,'.ai-collab/.runtime/events.jsonl');if(existsSync(path)&&events(dir).some(e=>e.phase==='CLI_STARTED'&&e.operation===operation)){await new Promise(r=>setTimeout(r,200));return;}await new Promise(r=>setTimeout(r,25));}throw new Error('Missing phase');
}
test('two tasks complete with actual Git trees and dependency order',async()=>{
 const dir=fixture('success',true);try {const r=await run(dir);assert.equal(r.code,0,r.output);const done=events(dir).filter(e=>e.phase==='DONE');assert.deepEqual(done.map(e=>e.task),['t1','t2']);assert.equal(spawnSync('git',['rev-list','--count','HEAD'],{cwd:dir,encoding:'utf8'}).stdout.trim(),'5');assert.equal(spawnSync('git',['status','--porcelain'],{cwd:dir,encoding:'utf8'}).stdout,'');const handoff=readFileSync(join(dir,'.ai-collab/.runtime/HANDOFF.md'),'utf8');assert.match(handoff,/Task: t2/);assert.match(handoff,/Reason: TASK_DONE/);assert.ok(events(dir).some(e=>e.phase==='TOKEN_WARNING'));}finally{rmSync(dir,{recursive:true});}
});
test('interrupted review envelope is never treated as approval and retries once with a new receipt',async()=>{
 const dir=fixture('stream-interrupt');try{const r=await run(dir);assert.equal(r.code,0,r.output);const entries=events(dir);assert.equal(entries.filter(e=>e.phase==='CLI_TRANSIENT_RETRY'&&e.operation==='review').length,1);assert.equal(entries.filter(e=>e.phase==='CLI_COMPLETED'&&e.operation==='review').length,1);assert.equal(entries.filter(e=>e.phase==='DONE').length,1);assert.equal(entries.find(e=>e.phase==='CLI_COMPLETED'&&e.operation==='review').sequence,4);}finally{rmSync(dir,{recursive:true});}
});
test('repeated interrupted review blocks without a commit or false approval',async()=>{
 const dir=fixture('stream-always');try{const r=await run(dir);assert.equal(r.code,1);assert.equal(checkpoint(dir).status,'BLOCKED');assert.equal(events(dir).filter(e=>e.phase==='CLI_TRANSIENT_RETRY').length,1);assert.equal(events(dir).filter(e=>e.phase==='DONE').length,0);assert.equal(gitCall(dir,'rev-list','--count','HEAD'),'1');}finally{rmSync(dir,{recursive:true});}
});
for(const mode of ['reject-review','fail-check','false-commit','mutate-review'])test(mode+' is BLOCKED without completing a task',async()=>{
 const dir=fixture(mode);try{const r=await run(dir);assert.equal(r.code,1);assert.equal(checkpoint(dir).status,'BLOCKED');assert.equal(events(dir).filter(e=>e.phase==='DONE').length,0);assert.equal(spawnSync('git',['rev-list','--count','HEAD'],{cwd:dir,encoding:'utf8'}).stdout.trim(),'1');if(['reject-review','fail-check'].includes(mode))assert.equal(checkpoint(dir).round,3);}finally{rmSync(dir,{recursive:true});}
});
test('stop and resume preserves partial work and finishes without duplicate commit',async()=>{
 const dir=fixture('stop-resume');try{const active=run(dir);await waitFor(dir,'implement');await run(dir,'stop');assert.equal((await active).code,1);assert.equal(checkpoint(dir).status,'STOPPED');const result=await run(dir,'resume');assert.equal(result.code,0,result.output);assert.equal(events(dir).filter(e=>e.phase==='DONE').length,1);}finally{rmSync(dir,{recursive:true});}
});
test('modification after approved review blocks a resumed commit',async()=>{
 const dir=fixture('stale-review');try{const active=run(dir);await waitFor(dir,'commit');await run(dir,'stop');assert.equal((await active).code,1);writeFileSync(join(dir,'t1.txt'),'changed after approval');const result=await run(dir,'resume');assert.equal(result.code,1);assert.equal(checkpoint(dir).status,'BLOCKED');assert.equal(spawnSync('git',['rev-list','--count','HEAD'],{cwd:dir,encoding:'utf8'}).stdout.trim(),'1');}finally{rmSync(dir,{recursive:true});}
});
test('dirty tree and preexisting BLOCKED artifact are never executed or discarded',async()=>{
 const dir=fixture();try{writeFileSync(join(dir,'unrelated.txt'),'keep');const result=await run(dir);assert.equal(result.code,1);assert.equal(readFileSync(join(dir,'unrelated.txt'),'utf8'),'keep');rmSync(join(dir,'unrelated.txt'));mkdirSync(join(dir,'.ai-collab/tasks/t1'),{recursive:true});writeFileSync(join(dir,'.ai-collab/tasks/t1/IMPLEMENTATION.md'),'Status: BLOCKED\nArchitecture decision required.\n');spawnSync('git',['add','.ai-collab/tasks'],{cwd:dir});spawnSync('git',['commit','-qm','Record blocker'],{cwd:dir});const next=await run(dir);assert.equal(next.code,0,next.output);assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED').length,0);}finally{rmSync(dir,{recursive:true});}
});
for(const [mode,phase] of [['quota-plan','PLANNING'],['quota-review','READY_FOR_REVIEW']])test(mode+' pauses without retry, then resumes the same task after reset',async()=>{
 const dir=fixture(mode,true);try {
  const first=await run(dir);assert.equal(first.code,1,first.output);
  const paused=checkpoint(dir);assert.equal(paused.status,'PAUSED_QUOTA');assert.equal(paused.phase,phase);
  const handoff=readFileSync(join(dir,'.ai-collab/.runtime/HANDOFF.md'),'utf8');assert.match(handoff,/Reason: RESOURCE_EXHAUSTED/);assert.match(handoff,/Task: t1/);
  assert.equal(paused.round,phase==='PLANNING'?0:1);
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED'&&e.agent==='antigravity').length,phase==='PLANNING'?1:2);
  assert.equal(events(dir).filter(e=>e.phase==='DONE').length,0);
  assert.equal(spawnSync('git',['rev-list','--count','HEAD'],{cwd:dir,encoding:'utf8'}).stdout.trim(),'1');
  const before=events(dir).filter(e=>e.phase==='CLI_STARTED').length;
  assert.equal((await run(dir,'resume')).code,1);
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED').length,before);
  const path=join(dir,'.ai-collab/.runtime/checkpoint.json');paused.quota.retryAt=new Date(Date.now()-1000).toISOString();writeFileSync(path,JSON.stringify(paused));
  const resumed=await run(dir,'resume');assert.equal(resumed.code,0,resumed.output);
  assert.deepEqual(events(dir).filter(e=>e.phase==='DONE').map(e=>e.task),['t1']);
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED'&&e.task==='t2').length,0);
  assert.equal(checkpoint(dir).status,'DONE');
 }finally{rmSync(dir,{recursive:true});}
});
test('legacy quota BLOCKED checkpoint recovers only with its failed log and preserves evidence',async()=>{
 const dir=fixture('quota-plan');try {
  assert.equal((await run(dir)).code,1);
  const path=join(dir,'.ai-collab/.runtime/checkpoint.json'),state=checkpoint(dir);
  state.status='BLOCKED';state.error='Process exited 3; inspect private log';delete state.quota;writeFileSync(path,JSON.stringify(state));
  const impl=join(dir,'.ai-collab/tasks/t1/IMPLEMENTATION.md');writeFileSync(impl,'# Implementation: t1\n\nStatus: BLOCKED\n\nProcess exited 3; inspect private log\n\nSee local checkpoint and logs; preserve all working changes.\n');
  const backlog=join(dir,'.ai-collab/BACKLOG.md');writeFileSync(backlog,readFileSync(backlog,'utf8').replace('PAUSED_QUOTA','BLOCKED'));
  assert.equal((await run(dir,'resume')).code,1);
  assert.equal(checkpoint(dir).status,'BLOCKED');
  const recovered=await run(dir,'recover-quota');assert.equal(recovered.code,0,recovered.output);
  assert.equal(checkpoint(dir).status,'PAUSED_QUOTA');
  assert.equal(readFileSync(impl,'utf8'),'# Implementation: t1\n\nStatus: NOT_STARTED\n');
  assert.ok(existsSync(join(dir,'.ai-collab/.runtime/t1-legacy-quota-implementation.md')));
  assert.ok(existsSync(join(dir,'.ai-collab/.runtime/t1-1-plan.log')));
  assert.equal((await run(dir,'recover-quota')).code,1);
  assert.equal(events(dir).filter(e=>e.phase==='DONE').length,0);
 }finally{rmSync(dir,{recursive:true});}
});
test('quota resume adopts only a committed runner upgrade, then finishes one task',async()=>{
 const dir=fixture('quota-plan');try {
  assert.equal((await run(dir)).code,1);
  reviewedUpgrade(dir);
  const checkpointPath=join(dir,'.ai-collab/.runtime/checkpoint.json'),paused=checkpoint(dir);paused.quota.retryAt=new Date(Date.now()-1000).toISOString();writeFileSync(checkpointPath,JSON.stringify(paused));
  const dirty=await run(dir,'resume');assert.equal(dirty.code,1);assert.equal(checkpoint(dir).status,'PAUSED_QUOTA');
  gitCall(dir,'add','AGENTS.md','.ai-collab/tasks/orchestrator-quota-recovery/REVIEW.md');
  gitCall(dir,'commit','-qm','docs(agents): update reviewed runner instructions');
  const finished=await run(dir,'resume');assert.equal(finished.code,0,finished.output);
  assert.equal(events(dir).filter(e=>e.phase==='RUNNER_UPGRADE_ADOPTED').length,1);
  assert.equal(checkpoint(dir).status,'DONE');
 }finally{rmSync(dir,{recursive:true});}
});
test('early quota resume requires --quota-ready and preserves checkpoint when refused',async()=>{
 const dir=fixture('quota-plan',true);try {
  assert.equal((await run(dir)).code,1);
  const path=join(dir,'.ai-collab/.runtime/checkpoint.json'),saved=readFileSync(path,'utf8');
  const before=events(dir).filter(e=>e.phase==='CLI_STARTED').length;
  const refused=await run(dir,'resume');assert.equal(refused.code,1);assert.match(refused.output,/quota pause remains/);
  assert.equal(readFileSync(path,'utf8'),saved);
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED').length,before);
  const resumed=await run(dir,'resume','--quota-ready');assert.equal(resumed.code,0,resumed.output);
  assert.equal(checkpoint(dir).quota.retryAt,JSON.parse(saved).quota.retryAt);
  assert.deepEqual(events(dir).filter(e=>e.phase==='DONE').map(e=>e.task),['t1']);
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED'&&e.task==='t2').length,0);
 }finally{rmSync(dir,{recursive:true});}
});
test('early quota retry that returns 429 pauses again without a commit',async()=>{
 const dir=fixture('quota-always');try {
  assert.equal((await run(dir)).code,1);
  const first=checkpoint(dir),before=events(dir).filter(e=>e.phase==='CLI_STARTED').length;
  const again=await run(dir,'resume','--quota-ready');assert.equal(again.code,1);assert.match(again.output,/quota exhausted/);
  const second=checkpoint(dir);assert.equal(second.status,'PAUSED_QUOTA');assert.equal(second.phase,'PLANNING');assert.equal(second.round,0);
  assert.ok(Date.parse(second.quota.retryAt)>=Date.parse(first.quota.retryAt));
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED').length,before+1);
  assert.equal(events(dir).filter(e=>e.phase==='DONE').length,0);
  assert.equal(gitCall(dir,'rev-list','--count','HEAD'),'1');
 }finally{rmSync(dir,{recursive:true});}
});
test('unknown quota reset time requires explicit --quota-ready',async()=>{
 const dir=fixture('quota-plan');try {
  assert.equal((await run(dir)).code,1);
  const path=join(dir,'.ai-collab/.runtime/checkpoint.json'),paused=checkpoint(dir);
  paused.quota.retryAt=null;writeFileSync(path,JSON.stringify(paused));
  const saved=readFileSync(path,'utf8');
  const refused=await run(dir,'resume');assert.equal(refused.code,1);assert.match(refused.output,/reset time unknown/);
  assert.equal(readFileSync(path,'utf8'),saved);
  const resumed=await run(dir,'resume','--quota-ready');assert.equal(resumed.code,0,resumed.output);
  assert.equal(events(dir).filter(e=>e.phase==='DONE').length,1);
 }finally{rmSync(dir,{recursive:true});}
});
test('runner upgrade requires committed APPROVED review; rejected review preserves checkpoint',async()=>{
 const dir=fixture('quota-plan');try {
  assert.equal((await run(dir)).code,1);reviewedUpgrade(dir,'CHANGES_REQUESTED');
  gitCall(dir,'add','AGENTS.md','.ai-collab/tasks/orchestrator-quota-recovery/REVIEW.md');
  gitCall(dir,'commit','-qm','docs(agents): record requested changes');
  const path=join(dir,'.ai-collab/.runtime/checkpoint.json'),saved=readFileSync(path,'utf8');
  const before=events(dir).filter(e=>e.phase==='CLI_STARTED').length;
  const result=await run(dir,'resume','--quota-ready');assert.equal(result.code,1);assert.match(result.output,/review is not APPROVED/);
  assert.equal(readFileSync(path,'utf8'),saved);
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED').length,before);
 }finally{rmSync(dir,{recursive:true});}
});
test('Planning contract excludes lifecycle artifacts and preserves strict validation',async()=>{
 const dir=fixture('unsafe-plan-artifact');try {
  const failed=await run(dir);assert.equal(failed.code,1,failed.output);
  assert.match(failed.output,/Unsafe plan path/);
  const saved=checkpoint(dir);assert.equal(saved.status,'BLOCKED');assert.equal(saved.phase,'PLANNING');
  const receipt=JSON.parse(readFileSync(join(dir,'.ai-collab/.runtime/t1-1-plan.receipt.json'),'utf8'));
  assert.deepEqual(receipt.result.paths,['t1.txt','.ai-collab/tasks/t1/IMPLEMENTATION.md']);
  assert.match(readFileSync(join(dir,'.ai-collab/orchestrator.mjs'),'utf8'),/Never include any \.ai-collab\/ path/);
  assert.equal((await run(dir,'resume')).code,1);
  assert.equal(checkpoint(dir).status,'BLOCKED');
 }finally{rmSync(dir,{recursive:true});}
});
test('reviewed Planning recovery adopts saved receipt and can resume without repeating plan',async()=>{
 const dir=fixture('unsafe-plan-artifact');try {
  const existingPlan='# Plan: t1\n\nStatus: APPROVED\n\nOriginal approved details.\n';
  writeFileSync(join(dir,'.ai-collab/tasks/t1/PLAN.md'),existingPlan);
  gitCall(dir,'add','.ai-collab/tasks/t1/PLAN.md');gitCall(dir,'commit','-qm','docs: record approved fixture plan');
  assert.equal((await run(dir)).code,1);
  const savedReceipt=readFileSync(join(dir,'.ai-collab/.runtime/t1-1-plan.receipt.json'),'utf8');
  reviewedPlanRecovery(dir);
  const beforeCommit=readFileSync(join(dir,'.ai-collab/.runtime/checkpoint.json'),'utf8');
  assert.equal((await run(dir,'recover-plan-path')).code,1);
  assert.equal(readFileSync(join(dir,'.ai-collab/.runtime/checkpoint.json'),'utf8'),beforeCommit);
  gitCall(dir,'add','.ai-collab/orchestrator.mjs','.ai-collab/tasks/orchestrator-plan-path-recovery/REVIEW.md');
  gitCall(dir,'commit','-qm','fix(orchestrator): review planning recovery');
  const recovered=await run(dir,'recover-plan-path');assert.equal(recovered.code,0,recovered.output);
  assert.equal(checkpoint(dir).phase,'READY');assert.deepEqual(checkpoint(dir).paths,['t1.txt']);
  assert.equal(checkpoint(dir).planReceipt.result.status,'READY');
  assert.equal(readFileSync(join(dir,'.ai-collab/tasks/t1/PLAN.md'),'utf8'),existingPlan);
  assert.equal(readFileSync(join(dir,'.ai-collab/.runtime/t1-1-plan.receipt.json'),'utf8'),savedReceipt);
  assert.ok(existsSync(join(dir,'.ai-collab/.runtime/t1-1-blocked-implementation.md')));
  assert.equal(readFileSync(join(dir,'.ai-collab/tasks/t1/IMPLEMENTATION.md'),'utf8'),'# Implementation: t1\n\nStatus: NOT_STARTED\n');
  assert.equal((await run(dir,'recover-plan-path')).code,1);
  const resumed=await run(dir,'resume');assert.equal(resumed.code,0,resumed.output);
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED'&&e.operation==='plan').length,1);
  assert.deepEqual(events(dir).filter(e=>e.phase==='DONE').map(e=>e.task),['t1']);
 }finally{rmSync(dir,{recursive:true});}
});
for(const mode of ['unapproved','committed-source','dirty-source','modified-artifact'])test('Planning recovery rejects '+mode+' without changing checkpoint',async()=>{
 const dir=fixture('unsafe-plan-artifact');try {
  assert.equal((await run(dir)).code,1);
  reviewedPlanRecovery(dir,mode==='unapproved'?'CHANGES_REQUESTED':'APPROVED');
  if(mode==='committed-source')writeFileSync(join(dir,'app.js'),'unexpected source\n');
  gitCall(dir,'add','.ai-collab/orchestrator.mjs','.ai-collab/tasks/orchestrator-plan-path-recovery/REVIEW.md');
  if(mode==='committed-source')gitCall(dir,'add','app.js');
  gitCall(dir,'commit','-qm','fix(orchestrator): candidate recovery');
  if(mode==='dirty-source')writeFileSync(join(dir,'app.js'),'unexpected dirty source\n');
  if(mode==='modified-artifact')writeFileSync(join(dir,'.ai-collab/tasks/t1/IMPLEMENTATION.md'),'Status: BLOCKED\nManual blocker\n');
  const path=join(dir,'.ai-collab/.runtime/checkpoint.json'),saved=readFileSync(path,'utf8');
  const result=await run(dir,'recover-plan-path');assert.equal(result.code,1,result.output);
  assert.equal(readFileSync(path,'utf8'),saved);
  assert.ok(!existsSync(join(dir,'.ai-collab/.runtime/t1-1-blocked-implementation.md')));
 }finally{rmSync(dir,{recursive:true});}
});
for(const extra of ['backlog-state','application-commit','application-dirty'])test('runner adoption rejects '+extra+' without altering checkpoint',async()=>{
 const dir=fixture('quota-plan');try {
  assert.equal((await run(dir)).code,1);reviewedUpgrade(dir);
  gitCall(dir,'add','AGENTS.md','.ai-collab/tasks/orchestrator-quota-recovery/REVIEW.md');
  if(extra==='backlog-state')gitCall(dir,'add','.ai-collab/BACKLOG.md','.ai-collab/STATE.md');
  if(extra==='application-commit'){writeFileSync(join(dir,'app.js'),'application change\n');gitCall(dir,'add','app.js');}
  gitCall(dir,'commit','-qm','docs(agents): reviewed runner with scope scenario');
  if(extra==='application-dirty')writeFileSync(join(dir,'app.js'),'uncommitted application change\n');
  const path=join(dir,'.ai-collab/.runtime/checkpoint.json'),saved=readFileSync(path,'utf8');
  const before=events(dir).filter(e=>e.phase==='CLI_STARTED').length;
  const result=await run(dir,'resume','--quota-ready');assert.equal(result.code,1,result.output);
  assert.equal(readFileSync(path,'utf8'),saved);
  assert.equal(events(dir).filter(e=>e.phase==='CLI_STARTED').length,before);
  assert.equal(events(dir).filter(e=>e.phase==='DONE').length,0);
 }finally{rmSync(dir,{recursive:true});}
});
test('reviewed replan preserves old evidence and resume invokes fresh Antigravity Planning',async()=>{
 const dir=await blockedReplanFixture();try {
  const old=checkpoint(dir),oldReceipt=readFileSync(join(dir,'.ai-collab/.runtime/t1-1-plan.receipt.json'),'utf8');
  const oldImplementation=readFileSync(join(dir,'.ai-collab/tasks/t1/IMPLEMENTATION.md'),'utf8');
  revisedFixturePlan(dir);reviewedReplan(dir);
  gitCall(dir,'add','.ai-collab/orchestrator.mjs','.ai-collab/tasks/orchestrator-replan-recovery/REVIEW.md');gitCall(dir,'commit','-qm','fix(orchestrator): reviewed replan runner');
  const recovered=await run(dir,'replan');assert.equal(recovered.code,0,recovered.output);
  const ready=checkpoint(dir);assert.equal(ready.phase,'PLANNING');assert.equal(ready.status,'RUNNING');assert.deepEqual(ready.paths,[]);
  assert.equal(ready.replanHistory[0].error,old.error);assert.deepEqual(ready.replanHistory[0].planReceipt,old.planReceipt);
  assert.equal(readFileSync(join(dir,'.ai-collab/.runtime/t1-1-plan.receipt.json'),'utf8'),oldReceipt);
  assert.equal(readFileSync(join(dir,'.ai-collab/.runtime/t1-2-replan-blocker.md'),'utf8'),oldImplementation);
  assert.equal((await run(dir,'replan')).code,1);
  const resumed=await run(dir,'resume');assert.equal(resumed.code,0,resumed.output);
  const replanned=events(dir).filter(e=>e.phase==='CLI_STARTED'&&e.agent==='antigravity'&&e.operation==='plan');
  assert.equal(replanned.length,2);
  assert.deepEqual(replanned.map(e=>e.sequence),[1,3]);
  const receipt=JSON.parse(readFileSync(join(dir,'.ai-collab/.runtime/t1-3-plan.receipt.json'),'utf8'));
  assert.deepEqual(receipt.result.paths,['t1.txt','app/cart/page.tsx','components/forms/contact-form.tsx']);
  assert.deepEqual(events(dir).filter(e=>e.phase==='DONE').map(e=>e.task),['t1']);
 }finally{rmSync(dir,{recursive:true});}
});
for(const reason of ['unapproved-plan','unchanged-plan','unapproved-review','uncommitted-review','dirty-source','committed-source','staged'])test('replan refuses '+reason+' and preserves checkpoint',async()=>{
 const dir=await blockedReplanFixture();try {
  revisedFixturePlan(dir,reason==='unapproved-plan'?'DRAFT':'APPROVED');reviewedReplan(dir,reason==='unapproved-review'?'CHANGES_REQUESTED':'APPROVED');
  if(reason==='unchanged-plan')writeFileSync(join(dir,'.ai-collab/tasks/t1/PLAN.md'),readFileSync(join(dir,'.ai-collab/tasks/t1/PLAN.md'),'utf8').replace('Owned paths: t1.txt, app/cart/page.tsx, components/forms/contact-form.tsx','Owned paths: t1.txt'));
  if(reason==='committed-source')writeFileSync(join(dir,'app/cart/page.tsx'),'changed source\n');
  if(reason!=='uncommitted-review'){
    gitCall(dir,'add','.ai-collab/orchestrator.mjs','.ai-collab/tasks/orchestrator-replan-recovery/REVIEW.md');
    if(reason==='committed-source')gitCall(dir,'add','app/cart/page.tsx');
    gitCall(dir,'commit','-qm','fix(orchestrator): candidate replan');
  }
  if(reason==='dirty-source')writeFileSync(join(dir,'app/cart/page.tsx'),'dirty source\n');
  if(reason==='staged'){writeFileSync(join(dir,'app/cart/page.tsx'),'staged source\n');gitCall(dir,'add','app/cart/page.tsx');}
  const before=readFileSync(join(dir,'.ai-collab/.runtime/checkpoint.json'),'utf8');
  const originalImpl=readFileSync(join(dir,'.ai-collab/tasks/t1/IMPLEMENTATION.md'),'utf8');
  const result=await run(dir,'replan');assert.equal(result.code,1,result.output);
  assert.equal(readFileSync(join(dir,'.ai-collab/.runtime/checkpoint.json'),'utf8'),before);
  assert.equal(readFileSync(join(dir,'.ai-collab/tasks/t1/IMPLEMENTATION.md'),'utf8'),originalImpl);
  assert.ok(!existsSync(join(dir,'.ai-collab/.runtime/t1-2-replan-blocker.md')));
 }finally{rmSync(dir,{recursive:true});}
});
test('replan refuses a task that is not BLOCKED',async()=>{
 const dir=fixture();try{const before=gitCall(dir,'rev-parse','HEAD');const result=await run(dir,'replan');assert.equal(result.code,1);assert.equal(gitCall(dir,'rev-parse','HEAD'),before);assert.ok(!existsSync(join(dir,'.ai-collab/.runtime/checkpoint.json')));}finally{rmSync(dir,{recursive:true});}
});
test('fresh Planning cannot expand or replace approved replan ownership',async()=>{
 const dir=await blockedReplanFixture();try{
  revisedFixturePlan(dir);reviewedReplan(dir);
  gitCall(dir,'add','.ai-collab/orchestrator.mjs','.ai-collab/tasks/orchestrator-replan-recovery/REVIEW.md');gitCall(dir,'commit','-qm','fix(orchestrator): reviewed replan runner');
  assert.equal((await run(dir,'replan')).code,0);
  writeFileSync(join(dir,'.ai-collab/.runtime/wrong-replan-paths'),'yes');
  const result=await run(dir,'resume');assert.equal(result.code,1,result.output);assert.match(result.output,/differ from the approved revised plan/);
  assert.equal(checkpoint(dir).status,'BLOCKED');assert.deepEqual(checkpoint(dir).paths,[]);
  assert.equal(events(dir).filter(e=>e.phase==='DONE').length,0);
 }finally{rmSync(dir,{recursive:true});}
});

async function blockedArchitectureFixture(reason = 'valid') {
  const dir = fixture('architecture-block');
  const failed = await run(dir);
  assert.equal(failed.code, 1, failed.output);
  assert.equal(checkpoint(dir).status, 'BLOCKED');
  const adminPlan = join(dir, '.ai-collab/tasks/t1/PLAN.md');
  writeFileSync(adminPlan, `# Plan: t1\n\nStatus: ${reason === 'unapproved-plan' ? 'DRAFT' : 'APPROVED'}\n\nThis revised plan aligns with the existing production schema.\n- \`new\`: awaiting triage\n- \`consulting\`: active\n- \`completed\`: resolved\n- \`cancelled\`: closed\n\nOwned paths: t1.txt\n`);
  const historyFile = join(dir, 'reviewed-history.md');
  writeFileSync(historyFile, 'Prior reviewed fixture setup.\n');
  if (reason === 'committed-source') writeFileSync(join(dir, 't1.txt'), 'changed before recovery\n');
  if (reason === 'changed-script') {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    pkg.scripts.lint = 'different';
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  } else {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    pkg.scripts['test:e2e'] = 'playwright test';
    pkg.scripts['ai:auto'] = 'node .ai-collab/autopilot.mjs';
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  }
  gitCall(dir, 'add', 'reviewed-history.md', 'package.json');
  if (reason === 'committed-source') gitCall(dir, 'add', 't1.txt');
  gitCall(dir, 'commit', '-qm', 'test: reviewed fixture history');
  const priorHistory = gitCall(dir, 'rev-list', '--reverse', `${checkpoint(dir).baseHead}..HEAD`).split('\n');
  const repairPlan = join(dir, '.ai-collab/tasks/orchestrator-architecture-recovery/PLAN.md');
  mkdirSync(dirname(repairPlan), { recursive: true });
  writeFileSync(repairPlan, '# Plan: orchestrator-architecture-recovery\n\nStatus: APPROVED\nPlanner: Antigravity\n');
  const review = join(dir, '.ai-collab/tasks/orchestrator-architecture-recovery/REVIEW.md');
  const planDigest = createHash('sha256').update(JSON.stringify(readFileSync(adminPlan, 'utf8'))).digest('hex');
  writeFileSync(review, `# Review: orchestrator-architecture-recovery\n\nStatus: ${reason === 'unapproved-review' ? 'CHANGES_REQUESTED' : 'APPROVED'}\nReviewer: Antigravity\nApproved admin plan digest: ${reason === 'wrong-plan-digest' ? '0'.repeat(64) : planDigest}\nReviewed history: ${reason === 'wrong-history' ? '0'.repeat(40) : priorHistory.join(', ')}\n`);
  const runner = join(dir, '.ai-collab/orchestrator.mjs');
  writeFileSync(runner, readFileSync(runner, 'utf8') + '\n// architecture recovery fixture\n');
  gitCall(dir, 'add', '.ai-collab/orchestrator.mjs', '.ai-collab/tasks/orchestrator-architecture-recovery/PLAN.md', '.ai-collab/tasks/orchestrator-architecture-recovery/REVIEW.md');
  gitCall(dir, 'commit', '-qm', 'fix(orchestrator): reviewed architecture recovery');
  if (reason === 'dirty-source') writeFileSync(join(dir, 'unexpected.txt'), 'unowned edit\n');
  if (reason === 'staged') { writeFileSync(join(dir, 'unexpected.txt'), 'staged edit\n'); gitCall(dir, 'add', 'unexpected.txt'); }
  if (reason === 'changed-admin-plan') writeFileSync(adminPlan, readFileSync(adminPlan, 'utf8') + '\nUnreviewed plan edit.\n');
  if (reason === 'missing-receipt') rmSync(join(dir, `.ai-collab/.runtime/t1-${checkpoint(dir).planReceipt.sequence}-plan.receipt.json`));
  return dir;
}
test('reviewed architecture recovery preserves evidence and reruns actual Planning', async () => {
  const dir = await blockedArchitectureFixture();
  try {
    const old = checkpoint(dir);
    const receiptPath = join(dir, `.ai-collab/.runtime/t1-${old.planReceipt.sequence}-plan.receipt.json`);
    const receipt = readFileSync(receiptPath, 'utf8');
    const blockedImplementation = readFileSync(join(dir, '.ai-collab/tasks/t1/IMPLEMENTATION.md'), 'utf8');
    const recovered = await run(dir, 'recover-architecture');
    assert.equal(recovered.code, 0, recovered.output);
    const ready = checkpoint(dir);
    assert.equal(ready.phase, 'PLANNING');
    assert.equal(ready.status, 'RUNNING');
    assert.deepEqual(ready.paths, []);
    assert.deepEqual(ready.approvedReplanPaths, ['t1.txt']);
    assert.deepEqual(ready.replanHistory[0].planReceipt, old.planReceipt);
    assert.equal(readFileSync(receiptPath, 'utf8'), receipt);
    assert.equal(readFileSync(join(dir, `.ai-collab/.runtime/t1-${old.sequence}-architecture-blocker.md`), 'utf8'), blockedImplementation);
    assert.equal((await run(dir, 'recover-architecture')).code, 1);
    const resumed = await run(dir, 'resume');
    assert.equal(resumed.code, 0, resumed.output);
    assert.equal(events(dir).filter((entry) => entry.phase === 'CLI_STARTED' && entry.agent === 'antigravity' && entry.operation === 'plan').length, 2);
    assert.deepEqual(events(dir).filter((entry) => entry.phase === 'DONE').map((entry) => entry.task), ['t1']);
  } finally { rmSync(dir, { recursive: true }); }
});
for (const deviation of ['wrong-architecture-statuses', 'wrong-architecture-paths']) test(`recovered Planning rejects ${deviation} before implementation`, async () => {
  const dir = await blockedArchitectureFixture();
  try {
    assert.equal((await run(dir, 'recover-architecture')).code, 0);
    writeFileSync(join(dir, `.ai-collab/.runtime/${deviation}`), 'yes');
    const result = await run(dir, 'resume');
    assert.equal(result.code, 1, result.output);
    assert.equal(checkpoint(dir).status, 'BLOCKED');
    assert.equal(events(dir).filter((entry) => entry.phase === 'DONE').length, 0);
    assert.ok(!existsSync(join(dir, 't1.txt')));
  } finally { rmSync(dir, { recursive: true }); }
});
for (const reason of ['unapproved-plan', 'unapproved-review', 'wrong-history', 'wrong-plan-digest', 'committed-source', 'changed-script', 'dirty-source', 'staged', 'changed-admin-plan', 'missing-receipt']) test(`architecture recovery rejects ${reason} without changing checkpoint`, async () => {
  const dir = await blockedArchitectureFixture(reason);
  try {
    const checkpointPath = join(dir, '.ai-collab/.runtime/checkpoint.json');
    const saved = readFileSync(checkpointPath, 'utf8');
    const implementationPath = join(dir, '.ai-collab/tasks/t1/IMPLEMENTATION.md');
    const implementation = readFileSync(implementationPath, 'utf8');
    const result = await run(dir, 'recover-architecture');
    assert.equal(result.code, 1, result.output);
    assert.equal(readFileSync(checkpointPath, 'utf8'), saved);
    assert.equal(readFileSync(implementationPath, 'utf8'), implementation);
    assert.ok(!existsSync(join(dir, `.ai-collab/.runtime/t1-${checkpoint(dir).sequence}-architecture-blocker.md`)));
  } finally { rmSync(dir, { recursive: true }); }
});

async function blockedArchitecturePlanningFixture(reason = 'valid') {
  const dir = await blockedArchitectureFixture();
  assert.equal((await run(dir, 'recover-architecture')).code, 0);
  const path = join(dir, '.ai-collab/.runtime/checkpoint.json');
  const saved = checkpoint(dir);
  const tick = '`';
  const statuses = reason === 'wrong-statuses' ? ['new', 'in_progress', 'completed', 'cancelled'] : ['new', 'consulting', 'completed', 'cancelled'];
  const details = `# Replanned inquiry portal\n\nSupported inquiry statuses:\n${statuses.map(status => `- ${tick}${status}${tick}`).join('\n')}\nDo not propose or introduce in_progress, resolved, or archived.\n`;
  const receipt = { agent: 'antigravity', operation: 'plan', sequence: saved.sequence + 1, exitCode: 0, status: 'READY', result: { status: 'READY', summary: 'Approved fixture plan', paths: reason === 'wrong-paths' ? ['unexpected.txt'] : saved.approvedReplanPaths, details }, inputDigest: 'a'.repeat(64), outputDigest: 'a'.repeat(64) };
  writeFileSync(join(dir, `.ai-collab/.runtime/t1-${receipt.sequence}-plan.receipt.json`), JSON.stringify(receipt));
  saved.sequence = receipt.sequence;
  saved.status = 'BLOCKED';
  saved.error = 'Antigravity Planning changed approved inquiry-status semantics';
  writeFileSync(path, JSON.stringify(saved));
  const blocker = `# Implementation: t1\n\nStatus: BLOCKED\n\n${saved.error}\n\nSee local checkpoint and logs; preserve all working changes.\n`;
  writeFileSync(join(dir, '.ai-collab/tasks/t1/IMPLEMENTATION.md'), blocker);
  const backlogPath = join(dir, '.ai-collab/BACKLOG.md');
  writeFileSync(backlogPath, readFileSync(backlogPath, 'utf8').replace('| PLANNING |', '| BLOCKED |'));
  const statePath = join(dir, '.ai-collab/STATE.md');
  writeFileSync(statePath, readFileSync(statePath, 'utf8').replace('Current phase: PLANNING', 'Current phase: BLOCKED'));
  const repairPlan = join(dir, '.ai-collab/tasks/orchestrator-architecture-plan-recovery/PLAN.md');
  mkdirSync(dirname(repairPlan), { recursive: true });
  writeFileSync(repairPlan, '# Plan: orchestrator-architecture-plan-recovery\n\nStatus: APPROVED\nPlanner: Antigravity\n');
  const review = join(dir, '.ai-collab/tasks/orchestrator-architecture-plan-recovery/REVIEW.md');
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  writeFileSync(review, `# Review: orchestrator-architecture-plan-recovery\n\nStatus: ${reason === 'unapproved-review' ? 'CHANGES_REQUESTED' : 'APPROVED'}\nReviewer: Antigravity\nReviewed runner base: ${saved.baseHead}\nApproved admin plan digest: ${reason === 'wrong-plan-digest' ? '0'.repeat(64) : hash(readFileSync(join(dir, '.ai-collab/tasks/t1/PLAN.md'), 'utf8'))}\nApproved planning receipt digest: ${hash(receipt)}\n`);
  const runner = join(dir, '.ai-collab/orchestrator.mjs');
  writeFileSync(runner, readFileSync(runner, 'utf8') + '\n// reviewed Planning recovery fixture\n');
  if (reason === 'extra-history') { writeFileSync(join(dir, 'unrelated.md'), 'extra commit\n'); gitCall(dir, 'add', 'unrelated.md'); gitCall(dir, 'commit', '-qm', 'unreviewed history'); }
  gitCall(dir, 'add', '.ai-collab/orchestrator.mjs', '.ai-collab/tasks/orchestrator-architecture-plan-recovery/PLAN.md', '.ai-collab/tasks/orchestrator-architecture-plan-recovery/REVIEW.md');
  gitCall(dir, 'commit', '-qm', 'fix(orchestrator): reviewed Planning receipt recovery');
  if (reason === 'tampered-receipt') writeFileSync(join(dir, `.ai-collab/.runtime/t1-${receipt.sequence}-plan.receipt.json`), JSON.stringify({ ...receipt, result: { ...receipt.result, summary: 'tampered' } }));
  if (reason === 'missing-receipt') rmSync(join(dir, `.ai-collab/.runtime/t1-${receipt.sequence}-plan.receipt.json`));
  if (reason === 'dirty-source') writeFileSync(join(dir, 'unowned.txt'), 'dirty\n');
  if (reason === 'staged') { writeFileSync(join(dir, 'unowned.txt'), 'staged\n'); gitCall(dir, 'add', 'unowned.txt'); }
  return dir;
}
test('reviewed Planning receipt recovery adopts immutable receipt and resumes implementation', async () => {
  const dir = await blockedArchitecturePlanningFixture();
  try {
    const before = checkpoint(dir);
    const receiptPath = join(dir, `.ai-collab/.runtime/t1-${before.sequence}-plan.receipt.json`);
    const receiptText = readFileSync(receiptPath, 'utf8');
    const blocker = readFileSync(join(dir, '.ai-collab/tasks/t1/IMPLEMENTATION.md'), 'utf8');
    const recovered = await run(dir, 'recover-architecture-plan');
    assert.equal(recovered.code, 0, recovered.output);
    const ready = checkpoint(dir);
    assert.equal(ready.status, 'RUNNING');
    assert.equal(ready.phase, 'READY');
    assert.deepEqual(ready.paths, ['t1.txt']);
    assert.equal(ready.planReceipt.sequence, before.sequence);
    assert.equal(readFileSync(receiptPath, 'utf8'), receiptText);
    assert.equal(readFileSync(join(dir, `.ai-collab/.runtime/t1-${before.sequence}-architecture-planning-blocker.md`), 'utf8'), blocker);
    const finished = await run(dir, 'resume');
    assert.equal(finished.code, 0, finished.output);
    assert.deepEqual(events(dir).filter(entry => entry.phase === 'DONE').map(entry => entry.task), ['t1']);
  } finally { rmSync(dir, { recursive: true }); }
});
for (const reason of ['wrong-statuses', 'wrong-paths', 'unapproved-review', 'wrong-plan-digest', 'extra-history', 'tampered-receipt', 'missing-receipt', 'dirty-source', 'staged']) test(`Planning receipt recovery rejects ${reason} and preserves checkpoint`, async () => {
  const dir = await blockedArchitecturePlanningFixture(reason);
  try {
    const path = join(dir, '.ai-collab/.runtime/checkpoint.json');
    const before = readFileSync(path, 'utf8');
    const implementationPath = join(dir, '.ai-collab/tasks/t1/IMPLEMENTATION.md');
    const blocker = readFileSync(implementationPath, 'utf8');
    const result = await run(dir, 'recover-architecture-plan');
    assert.equal(result.code, 1, result.output);
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.equal(readFileSync(implementationPath, 'utf8'), blocker);
    assert.ok(!existsSync(join(dir, `.ai-collab/.runtime/t1-${checkpoint(dir).sequence}-architecture-planning-blocker.md`)));
  } finally { rmSync(dir, { recursive: true }); }
});
