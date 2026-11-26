'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {TitleFilter,parseMetadata}=require('./title-filter.cjs');
const meta='01a17c76-dd67-7143-a859-9235d... | 01a17c76-dd67-7143-a859-9235d7bf60f8 | fixture-model default | Ready | Context 0% used | codex | codex | isolated-workspace';
test('metadata is captured while the original title is restored',()=>{
 const p=parseMetadata(meta);assert.equal(p.meta.sessionPrefix,'01a17c76-dd67-7143-a859-9235d');assert.equal(p.meta.sessionId,'01a17c76-dd67-7143-a859-9235d7bf60f8');assert.equal(p.meta.model,'fixture-model');assert.equal(p.originalTitle,'isolated-workspace');
 let seen;const f=new TitleFilter(x=>seen=x);const out=f.feed('hello\x1b]2;'+meta.slice(0,20))+f.feed(meta.slice(20)+'\x07world');
 assert.equal(out,'hello\x1b]2;isolated-workspace\x07world');assert.equal(seen.status,'Ready');
});
test('clipboard OSC, user titles and nested DCS contents pass through unchanged',()=>{
 const f=new TitleFilter();for(const s of ['\x1b]52;c;SGVsbG8=\x07','\x1b]2;User title\x1b\\','\x1bPvalue\x1b]2;not-a-title\x07\x1b\\'])assert.equal(f.feed(s),s);
});
test('a spinner-led original title keeps the native separator',()=>{
 const p=parseMetadata('01a17c76-dd67-7143-a859-9235d... | Named thread | GPT-6.1-Sol xhigh fast | codex | codex ⠋ project');
 assert.equal(p.originalTitle,'⠋ project');assert.equal(p.meta.fast,true);
 const q=parseMetadata('01a17c76-dd67-7143-a859-9235d... | Named thread | GPT-6.1-Sol xhigh | codex | codex ⠋ project | branch');assert.equal(q.originalTitle,'⠋ project | branch');
});
test('a named thread containing separators does not become the model',()=>{
 const p=parseMetadata('01a17c76-dd67-7143-a859-9235d... | AGY task | codex_statusbar_hud | GPT-6.1-Sol xhigh fast | Ready | codex | codex | AGY task | codex_statusbar_hud');
 assert.equal(p.meta.model,'GPT-6.1-Sol');assert.equal(p.meta.sessionId,null);assert.equal(p.originalTitle,'AGY task | codex_statusbar_hud');
});
test('startup before a session ID never leaks HUD metadata into the title',()=>{
 let observed;const f=new TitleFilter(meta=>observed=meta);const raw='\x1b]2;fixture-model default | Ready | Context 0% used | codex | codex | isolated-workspace\x07';
 assert.equal(f.feed(raw),'\x1b]2;isolated-workspace\x07');assert.equal(observed.sessionPrefix,null);assert.equal(observed.model,'fixture-model');
});
test('action-required titles retain the original notification and user title',()=>{
 for(const notice of ['[ ! ] Action Required','[ . ] Action Required']){
  const value=`${notice} | 01a17c76-dd67-7143-a859-9235d... | Named thread | GPT-6.1-Sol xhigh | Context 0% used | codex | codex | Named thread | project`;
  const p=parseMetadata(value);assert.equal(p.originalTitle,`${notice} | Named thread | project`);assert.equal(p.meta.model,'GPT-6.1-Sol');
 }
});
test('live task progress is recognized without leaking metadata',()=>{
 const s='01a17c76-dd67-7143-a859-9235d... | Named thread | GPT-6.1-Sol xhigh | Working | Tasks 2/4 | codex | codex | project';
 const p=parseMetadata(s);assert.equal(p.meta.badge,'✦ Tasks 2/4');assert.equal(p.originalTitle,'project');
});
test('unknown or ambiguous titles pass through without guessing',()=>{
 let invalidated=false;const f=new TitleFilter(()=>{},()=>invalidated=true);const s='\x1b]2;unrelated | codex | untouched\x07';assert.equal(f.feed(s),s);assert.equal(invalidated,true);
});
