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
const result={status:'READY',summary:'Fixture evidence',paths:[id+'.txt'],details:'Implement the exact proof file.'};
if(phase==='implement') {
  if(mode==='stop-resume'&&!existsSync('.ai-collab/.runtime/delayed')){writeFileSync('.ai-collab/.runtime/delayed','yes');await new Promise(r=>setTimeout(r,2500));}
  writeFileSync(id+'.txt','verified'); result.status='READY_FOR_REVIEW';
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
  for(const args of [['init','-q'],['config','user.name','Fixture'],['config','user.email','fixture@example.com'],['add','.'],['commit','-qm','Fixture baseline']]) assert.equal(spawnSync('git',args,{cwd:dir}).status,0);
  return dir;
}
function run(dir, action='run') {
  return new Promise(resolve=>{const child=spawn(process.execPath,['.ai-collab/orchestrator.mjs',action],{cwd:dir});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.on('close',code=>resolve({code,output}));});
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
