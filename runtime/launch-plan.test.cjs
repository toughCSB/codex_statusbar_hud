'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {plan,parseHelp}=require('./launch-plan.cjs');
const fs=require('node:fs');const path=require('node:path');
test('the official --yolo alias keeps the interactive HUD and preserves resume arguments',()=>{
 const args=['--yolo','resume','fixture-session'];
 const result=plan(args);assert.equal(result.kind,'hud');assert.equal(result.resuming,true);assert.deepEqual(result.args.slice(-args.length),args);
});
test('only the exact update command reaches the session-preserving updater',()=>{
 assert.deepEqual(plan(['update']),{kind:'updater',args:[]});
 assert.equal(plan(['update','--help']).kind,'direct');assert.equal(plan(['-c','x=y','update']).kind,'reject');assert.equal(plan(['update','--unknown']).kind,'reject');
 assert.equal(plan(['exec','update']).kind,'direct');assert.equal(plan(['--','update']).kind,'hud');assert.equal(plan(['-m','update','write']).kind,'hud');
});
test('the staged official 0.164.0 help is parsed without dropping commands',()=>{
 const help=fs.readFileSync(path.join(__dirname,'official-help.txt'),'utf8');const commands=parseHelp(help);
 assert.ok(commands?.has('migrate-nfs-db'));assert.ok(commands?.has('update'));assert.ok(commands?.has('agents'));
 assert.equal(plan(['migrate-nfs-db'],{commands}).kind,'direct');
});
test('ordinary interactive calls keep their arguments and session-resume behavior',()=>{
 const args=['-m','gpt-test','resume','한글 경로'];const p=plan(args);assert.equal(p.kind,'hud');assert.equal(p.resuming,true);assert.deepEqual(p.args.slice(-args.length),args);
 assert.equal(plan([]).kind,'hud');assert.equal(plan(['agents']).kind,'hud');assert.equal(plan(['fork','id']).resuming,true);
});
test('noninteractive, help, remote and uncertain flags use the official executable',()=>{
 for(const a of [['--version'],['exec','hello'],['app-server'],['login'],['--remote','ws://127.0.0.1:1'],['--future-flag','value']])assert.equal(plan(a).kind,'direct');
 assert.equal(plan([],{ttyIn:false,ttyOut:true}).kind,'direct');
});
test('ordinary calls preserve the user notification configuration and direct arguments',()=>{
 for(const args of [[],['exec','hello'],['--version'],['resume','fixture']]) {
  const result=plan(args);
  assert.ok(!result.args.includes('notify=[]'));
  if(result.kind==='direct')assert.deepEqual(result.args,args);
 }
});
test('new official commands are discovered from the installed release before routing',()=>{
 const text='Commands:\n  exec              Run\n  resume            Resume\n  update            Update\n  future-action     New command\n\nArguments:\n  [PROMPT]\n';
 const commands=parseHelp(text);assert.ok(commands?.has('future-action'));
 assert.equal(plan(['future-action'],{commands}).kind,'direct');assert.equal(plan(['some ordinary prompt'],{commands}).kind,'hud');
 assert.equal(parseHelp('unexpected output'),null);assert.equal(plan([],{helpVerified:false}).kind,'direct');
});
