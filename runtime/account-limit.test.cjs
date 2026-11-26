'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');const {exactWeek,beginRead}=require('./account-limit.cjs');
test('only the verified current account and exact seven-day window are accepted',()=>{
 const result={accountId:'fixture-account',rateLimitsByLimitId:{codex:{primary:{windowDurationMins:10080,usedPercent:36},secondary:{windowDurationMins:300,usedPercent:2}}}};
 assert.equal(exactWeek(result,'fixture-account'),36);assert.equal(exactWeek(result,'different-account'),null);
 assert.equal(exactWeek({...result,rateLimitsByLimitId:{codex:{primary:{windowDurationMins:10079,usedPercent:36}}}},'fixture-account'),null);
 assert.equal(exactWeek({...result,rateLimitsByLimitId:{other:{primary:{windowDurationMins:10080,usedPercent:99}}}},'fixture-account'),null);
});
test('account read uses a private fixture, stops its child and rejects a different account',async()=>{
 const root=fs.mkdtempSync(path.join(__dirname,'test-account-'));const auth=path.join(root,'auth.json');fs.writeFileSync(auth,JSON.stringify({tokens:{account_id:'fixture-account'}}),{flag:'wx'});
 const fake=path.join(__dirname,'fake-account-server.cjs');let launched;
 const spawnFn=(_exe,_args,options)=>(launched=spawn(process.execPath,[fake],options));
 try{
  let earlyWeek=null,skills=null,config=null,cost=null;
  const yes=beginRead({exe:'ignored',cwd:root,home:root,env:{...process.env,FIXTURE_ACCOUNT:'fixture-account'},spawnFn,timeoutMs:3000,includeSkills:true,includeConfig:true,threadId:'fixture-thread',skillsDelayMs:10,onWeek:n=>earlyWeek=n,onSkills:n=>skills=n,onConfig:x=>config=x,onCost:n=>cost=n});assert.equal(await yes.promise,36);assert.equal(earlyWeek,36);assert.equal(skills,3);assert.equal(config.contextWindow,1000000);assert.equal(config.sandboxMode,'danger-full-access');assert.equal(cost,123456);assert.ok(launched.exitCode!==null||launched.signalCode!==null);
  cost=5;const wrongThread=beginRead({exe:'ignored',cwd:root,home:root,env:{...process.env,FIXTURE_ACCOUNT:'fixture-account',FIXTURE_THREAD:'another-thread'},spawnFn,timeoutMs:3000,includeWeek:false,threadId:'fixture-thread',onCost:n=>cost=n});await wrongThread.promise;assert.equal(cost,null);
  const no=beginRead({exe:'ignored',cwd:root,home:root,env:{...process.env,FIXTURE_ACCOUNT:'other'},spawnFn,timeoutMs:3000});assert.equal(await no.promise,null);assert.ok(launched.exitCode!==null||launched.signalCode!==null);
  const timeout=beginRead({exe:'ignored',cwd:root,home:root,env:{...process.env,FIXTURE_ACCOUNT:'fixture-account',FIXTURE_NO_RESPONSE:'1'},spawnFn,timeoutMs:100});assert.equal(await timeout.promise,null);assert.ok(launched.exitCode!==null||launched.signalCode!==null);
 }finally{fs.unlinkSync(auth);fs.rmdirSync(root);}
});
