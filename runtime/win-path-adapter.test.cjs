'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {createAdapter}=require('./win-path-adapter.cjs');
test('PATH adapter sends exact preconditions without interpolating user text into a shell',async()=>{
 const original={exists:true,kind:'ExpandString',value:'C:\\사용자 경로;C:\\Tools'},desired={...original,value:'C:\\HUD;'+original.value};let seen;
 const run=(exe,args)=>{seen={exe,args};const body=args.includes('read')?original:{changed:true,broadcast:true};return {status:0,stdout:Buffer.from(JSON.stringify(body)).toString('base64')};};
 const a=createAdapter('fixture-script.ps1',{SystemRoot:'C:\\Windows'},run);assert.deepEqual(await a.read(),original);assert.deepEqual(await a.apply(original,desired),{changed:true,broadcast:true});
 const index=seen.args.indexOf('-ExpectedBase64');assert.deepEqual(JSON.parse(Buffer.from(seen.args[index+1],'base64').toString()),original);
 assert.ok(!seen.args.join(' ').includes('사용자 경로'));
});
test('failed or invalid PATH adapter responses are not treated as successful changes',async()=>{
 const a=createAdapter('fixture.ps1',{SystemRoot:'C:\\Windows'},()=>({status:1,stdout:''}));await assert.rejects(a.read(),/failed/i);
 const b=createAdapter('fixture.ps1',{SystemRoot:'C:\\Windows'},()=>({status:0,stdout:'bad'}));await assert.rejects(b.read(),/invalid/i);
});
