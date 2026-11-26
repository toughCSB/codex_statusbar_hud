'use strict';
const readline=require('node:readline');
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{
 let m;try{m=JSON.parse(line)}catch{return;}
 if(m.id===1)process.stdout.write(JSON.stringify({id:1,result:{}})+'\n');
 if(m.id===2&&!process.env.FIXTURE_NO_RESPONSE)process.stdout.write(JSON.stringify({id:2,result:{accountId:process.env.FIXTURE_ACCOUNT,rateLimitsByLimitId:{codex:{primary:{windowDurationMins:10080,usedPercent:36}}}}})+'\n');
 if((m.id===3||m.id===4)&&!process.env.FIXTURE_NO_RESPONSE)process.stdout.write(JSON.stringify({id:m.id,result:{data:[{cwd:m.params.cwds[0],skills:[{},{},{}]}]}})+'\n');
 if(m.id===5&&!process.env.FIXTURE_NO_RESPONSE)process.stdout.write(JSON.stringify({id:5,result:{config:{model_context_window:1000000,sandbox_mode:'danger-full-access'}}})+'\n');
 if(m.id===6&&!process.env.FIXTURE_NO_RESPONSE)process.stdout.write(JSON.stringify({id:6,result:{threadUsage:{threadId:process.env.FIXTURE_THREAD||m.params.threadId,estimatedUsageUsdMicros:123456}}})+'\n');
});
