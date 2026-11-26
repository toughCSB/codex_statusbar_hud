'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {parseStatus,parseStartupStatus}=require('./hud-status.cjs');
const id='01a17c50-fc1b-7472-8ea8-880133540c08';
test('the native footer yields identity, current model, permissions, state and context',()=>{
 const s=parseStatus(` ${id} · GPT-6.1-Sol high · weekly 64% left · Full Access · Ready · Context 49% used`);
 assert.deepEqual(s,{sessionId:id,model:'GPT-6.1-Sol',effort:'high',fast:false,permissions:'Full Access',status:'Ready',contextPercent:49,contextWindow:null,weeklyRemaining:64,badge:null,branch:null,pullRequest:null});
});
test('pull request identifier is parsed only from its explicit native label',()=>{
 const s=parseStatus(` ${id} · GPT-6.1-Sol high · PR #123 · Full Access`);assert.equal(s.pullRequest,123);
});
test('task progress keeps the native Tasks X/Y meaning',()=>{
 const s=parseStatus(` ${id} · GPT-6.1-Sol high · Tasks 2/4`);assert.equal(s.badge,'✦ Tasks 2/4');
});
test('an explicitly named custom permission profile is preserved',()=>{
 const s=parseStatus(` ${id} · GPT-6.1-Sol high · MyWorkspaceProfile · Ready`);assert.equal(s.permissions,'MyWorkspaceProfile');
});
test('the native compact context-window label retains its display value',()=>{
 const s=parseStatus(` ${id} · GPT-6.1-Sol xhigh fast · 1M window · Full Access · Ready`);assert.equal(s.contextWindow,1000000);
});
test('model effort remains identifiable when the official footer includes Fast mode',()=>{
 const s=parseStatus(` ${id} · GPT-6.1-Sol xhigh fast · weekly 40% left · Full Access · Ready`);
 assert.equal(s.model,'GPT-6.1-Sol');assert.equal(s.effort,'xhigh');assert.equal(s.fast,true);
});
test('all current built-in reasoning labels are accepted',()=>{
 for(const effort of ['none','minimal','low','medium','high','xhigh','max','ultra','persistent']){
  const s=parseStatus(` ${id} · GPT-6.1-Sol ${effort} · Ready`);assert.equal(s.model,'GPT-6.1-Sol');assert.equal(s.effort,effort);
 }
});
test('partial and unrelated rows never invent values or select a user-message ID',()=>{
 const s=parseStatus(` ${id} · GPT-6.1-Sol high · weekly 6…`);assert.equal(s.weeklyRemaining,null);
 assert.equal(parseStatus(`quoted ${id} · GPT-6.1-Sol high`),null);
 assert.equal(parseStatus(' 01a17c50-fc1b-7472-8ea8-88013354... · model high'),null);
});
test('full UUID truncated with ellipsis and extra agent suffix are handled safely',()=>{
 const s=parseStatus(` ${id} …`);assert.equal(s?.sessionId,id);assert.equal(s.model,null);
 const a=parseStatus(` ${id} · GPT-6.2-Astra xhigh fast · Full Access · Ready · Context 89% used · 475K window · weekly 83% left · Main [default]`);
 assert.equal(a?.permissions,'Full Access');assert.equal(a.weeklyRemaining,83);assert.equal(a.contextWindow,475000);
 const noPerm=parseStatus(` ${id} · GPT-6.2-Astra xhigh · Main [default]`);
 assert.equal(noPerm?.permissions,null);
});
test('startup status without UUID parses only when native status fields are present',()=>{
 const s=parseStartupStatus('  GPT-6.2-Astra default fast · Full Access · Ready · Context 0% used · 1M window');
 assert.equal(s?.sessionId,null);assert.equal(s.partial,true);assert.equal(s.model,'GPT-6.2-Astra');assert.equal(s.fast,true);assert.equal(s.permissions,'Full Access');
 const trunc=parseStartupStatus('  GPT-6.2-Astra default fast · Full Acc…');
 assert.equal(trunc?.sessionId,null);assert.equal(trunc.partial,true);assert.equal(trunc.model,'GPT-6.2-Astra');assert.equal(trunc.fast,true);
 assert.equal(parseStartupStatus('Some prose high · unrelated text'),null);
});
