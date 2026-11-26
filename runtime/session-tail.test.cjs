'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');const {SessionTail,findSession,findSessionByPrefix,readUsage}=require('./session-tail.cjs');
const root=path.join(__dirname,'test-sessions');fs.mkdirSync(root,{recursive:true});
const sample={info:{total_token_usage:{input_tokens:100,cached_input_tokens:80,output_tokens:5,total_tokens:105},last_token_usage:{total_tokens:105},model_context_window:258400},rate_limits:{limit_id:'codex',primary:{used_percent:36,window_minutes:10080},secondary:{used_percent:12,window_minutes:300}}};
test('seven-day usage can be primary; 5-hour and other buckets are never WEEK',()=>{
 assert.equal(readUsage(sample,null).weeklyPercent,36);
 assert.equal(readUsage({...sample,rate_limits:{primary:{used_percent:12,window_minutes:300}}},null).weeklyPercent,null);
 assert.equal(readUsage({...sample,rate_limits:{limit_id:'other',primary:{used_percent:99,window_minutes:10080}}},null).weeklyPercent,null);
});
test('tail reads only an identified session and tolerates partial JSON and truncation',async()=>{
 const id=randomUUID(),f=path.join(root,`fixture-${id}.jsonl`),wrongId=randomUUID(),wrongFile=path.join(root,`fixture-${wrongId}.jsonl`);
 fs.writeFileSync(f,JSON.stringify({type:'session_meta',payload:{id,cwd:'safe'}})+'\n',{flag:'wx'});
 fs.writeFileSync(wrongFile,JSON.stringify({type:'session_meta',payload:{id,cwd:'wrong'}})+'\n',{flag:'wx'});
 const tail=new SessionTail(f,id),wrong=new SessionTail(wrongFile,wrongId);
 try{
  await tail.poll();assert.equal(tail.state.verified,true);assert.equal(tail.state.usage,null);
  const event=JSON.stringify({type:'event_msg',payload:{type:'token_count',...sample}}),half=Math.floor(event.length/2);
  fs.appendFileSync(f,event.slice(0,half));await tail.poll();assert.equal(tail.state.usage,null);
  fs.appendFileSync(f,event.slice(half)+'\n');await tail.poll();assert.deepEqual([tail.state.usage.input,tail.state.usage.cached,tail.state.usage.output,tail.state.usage.weeklyPercent],[100,80,5,36]);
  fs.appendFileSync(f,JSON.stringify({type:'event_msg',payload:{type:'token_count',info:sample.info}})+'\n');await tail.poll();assert.equal(tail.state.usage.weeklyPercent,36);
  await wrong.poll();assert.equal(wrong.state.verified,false);assert.equal(wrong.state.rejected,true);assert.equal(wrong.state.usage,null);
  fs.writeFileSync(f,JSON.stringify({type:'session_meta',payload:{id,cwd:'reset'}})+'\n');await tail.poll();await tail.poll();assert.equal(tail.state.cwd,'reset');assert.equal(tail.state.usage,null);
 }finally{await tail.close();await wrong.close();fs.unlinkSync(f);fs.unlinkSync(wrongFile);}
});
test('constructor rejects a different ID in the file name',()=>assert.throws(()=>new SessionTail(path.join(root,'fixture-not-a-session.jsonl'),randomUUID()),/identity/i));
test('UUIDv7 lookup uses the creation-date directory and rejects duplicate IDs',async()=>{
 const id='01a17c45-322f-78e3-9d15-9f2e2f5b393f',base=fs.mkdtempSync(path.join(root,'lookup-'));
 const d1=path.join(base,'2026','10','27'),d2=path.join(base,'2026','10','26');fs.mkdirSync(d1,{recursive:true});fs.mkdirSync(d2,{recursive:true});
 const a=path.join(d1,`fixture-${id}.jsonl`),b=path.join(d2,`fixture-${id}.jsonl`);
 try{fs.writeFileSync(a,'{}\n');assert.equal(await findSession(base,id),a);assert.deepEqual(await findSessionByPrefix(base,id.slice(0,29)),{file:a,id});assert.equal(await findSessionByPrefix(base,id.slice(0,8)),null);fs.writeFileSync(b,'{}\n');assert.equal(await findSession(base,id),null);assert.equal(await findSessionByPrefix(base,id.slice(0,29)),null);}
 finally{fs.unlinkSync(a);fs.unlinkSync(b);for(const x of [d1,d2,path.dirname(d1),path.dirname(path.dirname(d1)),base])try{fs.rmdirSync(x)}catch{}}
});
