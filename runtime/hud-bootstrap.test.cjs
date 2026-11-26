'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {titleChannel}=require('./hud-bootstrap.cjs');
test('metadata title keeps the exact configured original title items',()=>{
 const s=titleChannel([],{titleItems:['activity','thread-name','project-name']},'0.164.0');
 const items=JSON.parse(s.slice(s.indexOf('=')+1));assert.deepEqual(items.slice(-3),['activity','thread-name','project-name']);
 const disabled=titleChannel([],{titleItems:[]},'0.164.0');assert.equal(JSON.parse(disabled.slice(disabled.indexOf('=')+1)).at(-1),'app-name');
});
test('future releases keep the original title items while explicit overrides are preserved',()=>{
 for(const a of [['-p','custom'],['-c','tui.terminal_title=["project"]'],['--config=tui.terminal_title=[]']])assert.equal(titleChannel(a,{titleItems:null},'0.164.0'),null);
 assert.ok(titleChannel([],{titleItems:null},'0.165.0'));
 assert.ok(titleChannel([],{titleItems:null},'0.166.0'));
 assert.equal(titleChannel([],{titleItems:null},'invalid-version'),null);
});
