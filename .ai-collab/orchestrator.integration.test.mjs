import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const source = dirname(fileURLToPath(import.meta.url));
function fixture(mode = 'success', second = false) {
  const dir = mkdtempSync(join(tmpdir(), 'aven-runner-test-'));
  const collab = join(dir, '.ai-collab'); mkdirSync(collab);
  for (const name of ['workflow.mjs', 'orchestrator.mjs', 'orchestrator-core.mjs', '.gitignore']) copyFileSync(join(source, name), join(collab, name));
  writeFileSync(join(dir, 'AGENTS.md'), 'Isolated deterministic coordinator test.');
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify({ mode }));
  writeFileSync(join(dir, 'verify.mjs'), `import {readFileSync,readdirSync} from 'node:fs'; import assert from 'node:assert/strict'; const files=readdirSync('.').filter(p=>/^t[12]\\.txt$/.test(p)); assert.ok(files.length); for(const f of files)assert.equal(readFileSync(f,'utf8'),'verified'); if(JSON.parse(readFileSync('scenario.json')).mode==='fail-check') process.exit(2);`);
  writeFileSync(join(dir, 'fake.mjs'), `import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const args=process.argv.slice(2), mode=JSON.parse(readFileSync('scenario.json')).mode;
const agy=args.includes('-p'); let prompt=agy?args[args.indexOf('-p')+1]:await new Promise(resolve=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>resolve(s));});
const phase=agy?(prompt.includes('Plan task')?'plan':'review'):(prompt.includes('Request the coordinator')?'commit':'implement');
const id=(prompt.match(/(?:Plan task|Review task|Implement task) (t[12])/i)||[])[1] || 't1';
if(agy&&phase==='plan'&&prompt.includes('Repository tracked files'))process.exit(7);
if(agy&&phase==='review'&&(!prompt.includes('NEW FILES')||!prompt.includes('verified')||prompt.includes('CURRENT FILES')))process.exit(7);
const result={status:'READY',summary:'Fixture evidence',paths:[id+'.txt'],details:'Implement the exact proof file.'};
if(phase==='implement') {
  if(mode==='stop-resume'&&!existsSync('.ai-collab/.runtime/delayed')){writeFileSync('.ai-collab/.runtime/delayed','yes');await new Promise(r=>setTimeout(r,2500));}
  writeFileSync(id+'.txt','verified'); result.status='READY_FOR_REVIEW';
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
if(agy)console.log(JSON.stringify({status:'SUCCESS',structured_output:result}));else {writeFileSync(args[args.indexOf('-o')+1],JSON.stringify(result));console.log(JSON.stringify({type:'turn.completed'}));}
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
function reviewedUpgrade(dir,status='APPROVED'){
 const review=join(dir,'.ai-collab/tasks/orchestrator-quota-recovery/REVIEW.md');mkdirSync(dirname(review),{recursive:true});
 writeFileSync(review,`# Review: orchestrator-quota-recovery\n\nStatus: ${status}\nReviewer: Antigravity\n\nReviewed runner change.\n`);
 const docs=join(dir,'AGENTS.md');writeFileSync(docs,readFileSync(docs,'utf8')+'\nRunner instructions updated.\n');
 return review;
}
function checkpoint(dir) {return JSON.parse(readFileSync(join(dir,'.ai-collab/.runtime/checkpoint.json')));}
function events(dir) {return readFileSync(join(dir,'.ai-collab/.runtime/events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);}
async function waitFor(dir, operation) {
  for(let i=0;i<200;i++) {const path=join(dir,'.ai-collab/.runtime/events.jsonl');if(existsSync(path)&&events(dir).some(e=>e.phase==='CLI_STARTED'&&e.operation===operation)){await new Promise(r=>setTimeout(r,200));return;}await new Promise(r=>setTimeout(r,25));}throw new Error('Missing phase');
}
test('two tasks complete with actual Git trees and dependency order',async()=>{
 const dir=fixture('success',true);try {const r=await run(dir);assert.equal(r.code,0,r.output);const done=events(dir).filter(e=>e.phase==='DONE');assert.deepEqual(done.map(e=>e.task),['t1','t2']);assert.equal(spawnSync('git',['rev-list','--count','HEAD'],{cwd:dir,encoding:'utf8'}).stdout.trim(),'5');assert.equal(spawnSync('git',['status','--porcelain'],{cwd:dir,encoding:'utf8'}).stdout,'');}finally{rmSync(dir,{recursive:true});}
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
