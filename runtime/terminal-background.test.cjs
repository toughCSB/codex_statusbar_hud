'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {TerminalBackground}=require('./terminal-background.cjs');const {isLightTheme}=require('./hud-render.cjs');
test('terminal color is only observed after Codex asks and split replies are accepted',()=>{
 let values=[];const t=new TerminalBackground(x=>values.push(x));t.noteInput('\x1b]11;rgb:ffff/ffff/ffff\x07',1);assert.deepEqual(values,[]);
 t.noteOutput('\x1b]11;',2);t.noteOutput('?\x1b\\',3);t.noteInput('\x1b]11;rgb:ff',4);t.noteInput('ff/ffff/ffff\x07',5);assert.deepEqual(values,[true]);
 t.noteOutput('\x1b]11;?',6);t.noteInput('\x1b]11;rgb:00/00/00\x1b\\',7);assert.deepEqual(values,[true,false]);
 assert.equal(isLightTheme('',null,true),true);assert.equal(isLightTheme('dark','light',true),false);
});
test('expired replies and bracketed paste do not drive the palette',()=>{
 let calls=0;const t=new TerminalBackground(()=>calls++);t.noteOutput('\x1b]11;?',0);t.noteInput('\x1b]11;rgb:ff/ff/ff\x07',2001);t.noteOutput('\x1b]11;?',3000);t.noteInput('\x1b[200~\x1b]11;rgb:ff/ff/ff\x07',3001);assert.equal(calls,0);
});
